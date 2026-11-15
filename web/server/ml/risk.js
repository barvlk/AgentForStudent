// نموذج التنبؤ بالتعثر: "ما احتمال أن تقل درجة الطالب عن 75 في مقرر قادم من هذا المجال؟"
// - الخصائص تُحسب من الترمات السابقة فقط (منع تسرّب البيانات Data Leakage).
// - التقييم بتقسيم حسب الطالب (Group split) حتى لا يظهر الطالب نفسه في التدريب والاختبار.
import { RandomForest, rocAuc, prf } from './forest.js';
import { Random } from './rng.js';

export const FEATURES = ['prev_avg_score', 'prev_gpa', 'domain_prior_avg', 'domain_prior_count', 'prev_fail_count', 'credits', 'term_no'];
export const DEFAULT_CREDITS = 3;

const mean = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);

function historyFeatures(history, domain) {
  const graded = history.filter((r) => r.credits > 0);
  const hours = graded.reduce((a, r) => a + r.credits, 0);
  const prevAvg = hours ? graded.reduce((a, r) => a + r.score * r.credits, 0) / hours : mean(history.map((r) => r.score));
  const prevGpa = hours ? graded.reduce((a, r) => a + r.points * r.credits, 0) / hours : 0;
  const inDomain = history.filter((r) => r.domain === domain);
  return [
    prevAvg,
    prevGpa,
    inDomain.length ? mean(inDomain.map((r) => r.score)) : prevAvg,
    inDomain.length,
    history.filter((r) => r.points === 0).length,
  ];
}

export function buildFeatureTable(records, threshold = 75) {
  const byStudent = new Map();
  for (const r of records) {
    if (r.score == null) continue;
    if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, []);
    byStudent.get(r.student_id).push(r);
  }
  const X = [], y = [], groups = [];
  for (const [sid, rows] of byStudent) {
    const terms = [...new Set(rows.map((r) => r.term_no))].sort((a, b) => a - b);
    for (const term of terms) {
      const history = rows.filter((r) => r.term_no < term);
      if (!history.length) continue;
      for (const c of rows.filter((r) => r.term_no === term)) {
        X.push([...historyFeatures(history, c.domain), c.credits, term]);
        y.push(c.score < threshold ? 1 : 0);
        groups.push(sid);
      }
    }
  }
  return { X, y, groups };
}

export class RiskModel {
  constructor(threshold = 75, seed = 42) {
    this.threshold = threshold;
    this.seed = seed;
    this.forest = null;
    this.metrics = null;
  }

  fit(records) {
    const { X, y, groups } = buildFeatureTable(records, this.threshold);
    if (X.length < 30 || new Set(y).size < 2) throw new Error('البيانات غير كافية لتدريب نموذج التنبؤ.');
    // تقسيم 80/20 حسب الطالب
    const rng = new Random(this.seed);
    const ids = [...new Set(groups)];
    for (let i = ids.length - 1; i > 0; i--) { const j = rng.int(0, i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const testIds = new Set(ids.slice(0, Math.max(1, Math.round(ids.length * 0.2))));
    const tr = [], te = [];
    groups.forEach((g, i) => (testIds.has(g) ? te : tr).push(i));
    const pick = (arr, ix) => ix.map((i) => arr[i]);
    const evalForest = new RandomForest({ seed: this.seed }).fit(pick(X, tr), pick(y, tr));
    const proba = pick(X, te).map((x) => evalForest.predictProba(x));
    const yTest = pick(y, te);
    const m = prf(yTest, proba.map((p) => (p >= 0.5 ? 1 : 0)));
    const r3 = (v) => Math.round(v * 1000) / 1000;
    this.metrics = {
      roc_auc: r3(rocAuc(yTest, proba)), f1: r3(m.f1), precision: r3(m.precision), recall: r3(m.recall),
      positive_rate: r3(y.reduce((a, b) => a + b, 0) / y.length), n_train: tr.length, n_test: te.length,
    };
    this.forest = new RandomForest({ seed: this.seed }).fit(X, y); // إعادة تدريب على كل البيانات
    return this;
  }

  featureImportance() {
    return Object.fromEntries(
      FEATURES.map((f, i) => [f, Math.round(this.forest.importance[i] * 1000) / 1000]).sort((a, b) => b[1] - a[1]),
    );
  }

  predictDomainRisk(transcript, domains) {
    const history = transcript.filter((r) => r.score != null);
    if (!history.length) return {};
    const nextTerm = Math.max(...history.map((r) => r.term_no)) + 1;
    return Object.fromEntries(domains.map((d) => [
      d,
      Math.round(this.forest.predictProba([...historyFeatures(history, d), DEFAULT_CREDITS, nextTerm]) * 1000) / 1000,
    ]));
  }
}
