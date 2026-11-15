// مخطط المذاكرة الأسبوعي (حلقة ReAct): Thought → Action → Observation → Final
//   الاحتياج = 0.6 × خطر التعثر + 0.4 × (1 − الإتقان)
//   ساعات المجال = الساعات الأسبوعية × (احتياجه / مجموع الاحتياجات) مقرّبة لأقرب نصف ساعة.
export const DOMAIN_LABELS = {
  AI: 'الذكاء الاصطناعي',
  Math: 'الرياضيات',
  Programming: 'البرمجة وهندسة البرمجيات',
  Systems: 'الأنظمة والشبكات والأمن',
};
const W_RISK = 0.6, W_GAP = 0.4, MIN_BLOCK = 0.5;
const roundHalf = (x) => Math.round(x * 2) / 2;

export function buildWeeklyPlan(mastery, risk, scheduled, weeklyHours = 10) {
  const trace = [
    'Thought: بداية أسبوع جديد، أراجع وضع الطالب الأكاديمي أولاً.',
    'Action: bkt_mastery() + predict_domain_risk() + schedule_tasks()',
  ];
  const raw = [];
  for (const [domain, est] of Object.entries(mastery)) {
    if (!est.observations && !(domain in risk)) continue;
    const r = risk[domain] ?? 0.5;
    raw.push({ domain, mastery: est.probability, risk: r, need: W_RISK * r + W_GAP * (1 - est.probability) });
  }
  trace.push('Observation: ' + raw.map((d) => `${d.domain}: إتقان=${d.mastery.toFixed(2)}, خطر=${d.risk.toFixed(2)}`).join(', '));
  const total = raw.reduce((a, d) => a + d.need, 0) || 1;
  const focus = raw.sort((a, b) => b.need - a.need).map((d) => {
    const h = roundHalf((weeklyHours * d.need) / total);
    return { ...d, need: Math.round(d.need * 1000) / 1000, label: DOMAIN_LABELS[d.domain] ?? d.domain, hours: h >= MIN_BLOCK ? h : 0 };
  });
  if (focus.length) trace.push(`Thought: المجال الأكثر احتياجاً هو ${focus[0].label}، أعطيه الحصة الأكبر.`);
  trace.push('Final: إرسال الخطة الأسبوعية والتوصيات للطالب.');
  return { weekly_hours: weeklyHours, focus, top_tasks: scheduled.slice(0, 3), trace };
}

export function planToText(plan) {
  const lines = [`خطة المذاكرة الأسبوعية (${plan.weekly_hours} ساعة):`];
  for (const f of plan.focus) {
    if (f.hours > 0) lines.push(`- ${f.label}: ${f.hours} ساعة (الإتقان ${Math.round(f.mastery * 100)}%، خطر التعثر ${Math.round(f.risk * 100)}%)`);
  }
  if (plan.top_tasks.length) {
    lines.push('أهم المهام القادمة:');
    plan.top_tasks.forEach((s) => lines.push(`- ${s.task.course}: ${s.task.title} (${s.due_label})`));
  }
  return lines.join('\n');
}
