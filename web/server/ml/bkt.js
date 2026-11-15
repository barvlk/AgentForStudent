// تتبع المعرفة البايزي (Bayesian Knowledge Tracing)
// لكل مجال نحتفظ باحتمال P(L) أن الطالب "أتقن" المهارة ونحدّثه بعد كل مقرر بقاعدة بايز:
//   نجح : P(L|صح)  = P(L)(1-S) / [P(L)(1-S) + (1-P(L))G]
//   أخفق: P(L|خطأ) = P(L)S     / [P(L)S     + (1-P(L))(1-G)]
//   ثم التعلّم: P(L) = P(L|obs) + (1 - P(L|obs)) * T
export const DEFAULT_PARAMS = {
  AI: { L0: 0.6, T: 0.02, G: 0.2, S: 0.15 },
  Math: { L0: 0.3, T: 0.15, G: 0.2, S: 0.2 },
  Programming: { L0: 0.7, T: 0.02, G: 0.2, S: 0.2 },
  Systems: { L0: 0.5, T: 0.02, G: 0.3, S: 0.2 },
};

export function bktUpdate(p, correct, { T, G, S }) {
  const num = correct ? p * (1 - S) : p * S;
  const den = correct ? num + (1 - p) * G : num + (1 - p) * (1 - G);
  const posterior = den > 0 ? num / den : p;
  return posterior + (1 - posterior) * T;
}

export function masteryLabel(p, hasData) {
  if (!hasData) return 'لا توجد بيانات';
  if (p >= 0.8) return 'متقن';
  if (p >= 0.5) return 'في طور الإتقان';
  return 'يحتاج تقوية';
}

export function estimateMastery(transcript, domain, threshold = 80) {
  const params = DEFAULT_PARAMS[domain] ?? DEFAULT_PARAMS.Math;
  let p = params.L0;
  const history = [p];
  const rows = transcript.filter((r) => r.domain === domain && r.score != null).sort((a, b) => a.term_no - b.term_no);
  for (const r of rows) {
    p = bktUpdate(p, r.score >= threshold, params);
    history.push(p);
  }
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  return { domain, probability: r4(p), observations: rows.length, history: history.map(r4), label: masteryLabel(p, rows.length > 0) };
}

export function estimateAll(transcript, domains, threshold = 80) {
  return Object.fromEntries(domains.map((d) => [d, estimateMastery(transcript, d, threshold)]));
}
