// غابة عشوائية (Random Forest) مكتوبة من الصفر: أشجار قرار CART + Bagging + اختيار خصائص عشوائي.
//  - الشجرة تقسّم البيانات بالعتبة التي تقلّل شوائب جيني (Gini impurity) أكثر.
//  - كل شجرة تتدرب على عينة bootstrap (سحب مع إرجاع) وعلى مجموعة جزئية من الخصائص عند كل عقدة.
//  - التنبؤ = متوسط احتمالات الأشجار (تصويت ناعم). وأوزان الفئات متوازنة (class_weight=balanced).
import { Random } from './rng.js';

function gini(w0, w1) {
  const t = w0 + w1;
  if (t === 0) return 0;
  const p = w1 / t;
  return 2 * p * (1 - p);
}

function buildTree(X, y, w, idx, depth, opts, rng, importance) {
  let w0 = 0, w1 = 0;
  for (const i of idx) { if (y[i]) w1 += w[i]; else w0 += w[i]; }
  const leaf = () => ({ p: w1 / ((w0 + w1) || 1) });
  if (depth >= opts.maxDepth || idx.length < 2 * opts.minLeaf || w0 === 0 || w1 === 0) return leaf();

  const nFeat = X[0].length;
  const feats = [...Array(nFeat).keys()];
  for (let i = feats.length - 1; i > 0; i--) { const j = rng.int(0, i + 1); [feats[i], feats[j]] = [feats[j], feats[i]]; }
  const candidates = feats.slice(0, opts.mtry);

  const parentImpurity = gini(w0, w1);
  const total = w0 + w1;
  let best = null;
  for (const f of candidates) {
    const order = [...idx].sort((a, b) => X[a][f] - X[b][f]);
    let l0 = 0, l1 = 0;
    for (let k = 0; k < order.length - 1; k++) {
      const i = order[k];
      if (y[i]) l1 += w[i]; else l0 += w[i];
      const nL = k + 1, nR = order.length - nL;
      if (X[order[k + 1]][f] === X[i][f] || nL < opts.minLeaf || nR < opts.minLeaf) continue;
      const r0 = w0 - l0, r1 = w1 - l1;
      const gain = parentImpurity - ((l0 + l1) / total) * gini(l0, l1) - ((r0 + r1) / total) * gini(r0, r1);
      if (!best || gain > best.gain) best = { f, thr: (X[i][f] + X[order[k + 1]][f]) / 2, gain };
    }
  }
  if (!best || best.gain <= 1e-9) return leaf();
  importance[best.f] += best.gain * total;
  const L = idx.filter((i) => X[i][best.f] <= best.thr);
  const R = idx.filter((i) => X[i][best.f] > best.thr);
  return {
    f: best.f, thr: best.thr,
    l: buildTree(X, y, w, L, depth + 1, opts, rng, importance),
    r: buildTree(X, y, w, R, depth + 1, opts, rng, importance),
  };
}

function predictTree(node, x) {
  while (node.f !== undefined) node = x[node.f] <= node.thr ? node.l : node.r;
  return node.p;
}

export class RandomForest {
  constructor({ nTrees = 100, maxDepth = 6, minLeaf = 5, seed = 42 } = {}) {
    Object.assign(this, { nTrees, maxDepth, minLeaf, seed });
    this.trees = [];
    this.importance = [];
  }

  fit(X, y) {
    const rng = new Random(this.seed);
    const n = X.length, nFeat = X[0].length;
    const pos = y.reduce((a, b) => a + b, 0);
    // class_weight="balanced": وزن الفئة = n / (2 * عدد أفرادها)
    const cw = [n / (2 * (n - pos || 1)), n / (2 * (pos || 1))];
    const w = y.map((v) => cw[v]);
    const opts = { maxDepth: this.maxDepth, minLeaf: this.minLeaf, mtry: Math.max(1, Math.round(Math.sqrt(nFeat))) };
    this.importance = new Array(nFeat).fill(0);
    this.trees = [];
    for (let t = 0; t < this.nTrees; t++) {
      const idx = Array.from({ length: n }, () => rng.int(0, n)); // bootstrap
      this.trees.push(buildTree(X, y, w, idx, 0, opts, rng, this.importance));
    }
    const s = this.importance.reduce((a, b) => a + b, 0) || 1;
    this.importance = this.importance.map((v) => v / s);
    return this;
  }

  predictProba(x) {
    let s = 0;
    for (const t of this.trees) s += predictTree(t, x);
    return s / this.trees.length;
  }
}

// ---------- مقاييس التقييم ----------
// ROC-AUC بطريقة الرتب (Mann–Whitney): احتمال أن يُرتَّب موجب عشوائي فوق سالب عشوائي.
export function rocAuc(yTrue, scores) {
  const pairs = yTrue.map((y, i) => [scores[i], y]).sort((a, b) => a[0] - b[0]);
  let rankSumPos = 0, nPos = 0;
  for (let i = 0; i < pairs.length;) {
    let j = i;
    while (j < pairs.length && pairs[j][0] === pairs[i][0]) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) if (pairs[k][1]) { rankSumPos += avgRank; nPos++; }
    i = j;
  }
  const nNeg = pairs.length - nPos;
  return nPos && nNeg ? (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg) : NaN;
}

export function prf(yTrue, pred) {
  let tp = 0, fp = 0, fn = 0;
  yTrue.forEach((y, i) => { if (pred[i] && y) tp++; else if (pred[i] && !y) fp++; else if (!pred[i] && y) fn++; });
  const precision = tp / ((tp + fp) || 1), recall = tp / ((tp + fn) || 1);
  return { precision, recall, f1: (2 * precision * recall) / ((precision + recall) || 1) };
}
