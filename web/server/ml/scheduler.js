// جدولة المهام حسب الأولوية: score = 100 * (0.55*importance + 0.45*urgency)
//   importance: عالية=1.0، متوسطة=0.6، عادية=0.3
//   urgency   : 1 / (1 + days_left/3)  (=1 للمتأخرة، و0.15 لمن بلا موعد)
// وعند التساوي: الأقصر وقتاً أولاً (SJF — Shortest Job First) ثم الأقدم إدخالاً.
export const PRIORITIES = ['عالية', 'متوسطة', 'عادية'];
const IMPORTANCE = { 'عالية': 1.0, 'متوسطة': 0.6, 'عادية': 0.3 };
const NO_DEADLINE_URGENCY = 0.15, W_IMPORTANCE = 0.55, W_URGENCY = 0.45;

export const urgency = (d) => (d == null ? NO_DEADLINE_URGENCY : d <= 0 ? 1 : 1 / (1 + d / 3));

export function daysBetween(isoDate, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = isoDate.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d) - t) / 86400000);
}

export function dueLabel(d) {
  if (d == null) return 'بدون موعد';
  if (d < 0) return `متأخرة ${Math.abs(d)} يوم`;
  if (d === 0) return 'اليوم';
  if (d === 1) return 'بكرة';
  return `بعد ${d} أيام`;
}

export function schedule(tasks, today = new Date()) {
  return tasks.filter((t) => !t.done).map((t) => {
    const days = t.due_date ? daysBetween(t.due_date, today) : null;
    const score = Math.round(100 * (W_IMPORTANCE * (IMPORTANCE[t.priority] ?? 0.3) + W_URGENCY * urgency(days)) * 10) / 10;
    return { task: t, score, days_left: days, overdue: days != null && days < 0, due_label: dueLabel(days) };
  }).sort((a, b) => b.score - a.score
    || (a.task.est_hours ?? Infinity) - (b.task.est_hours ?? Infinity)
    || a.task.id - b.task.id);
}

export function formatReport(items) {
  if (!items.length) return 'لا توجد مهام معلقة حالياً.';
  return ['المهام مرتبة حسب الأولوية (الأعلى أولاً):', ...items.map((s, i) =>
    `${i + 1}. ${s.task.course} — ${s.task.title} | الأهمية: ${s.task.priority} | الموعد: ${s.due_label} | درجة الأولوية: ${s.score}/100`
    + (s.task.est_hours ? ` | الوقت المتوقع: ${s.task.est_hours} ساعة` : ''))].join('\n');
}
