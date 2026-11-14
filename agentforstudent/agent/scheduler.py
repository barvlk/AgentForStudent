"""جدولة المهام حسب الأولوية.

النسخة الأولى كانت تعتمد على الأهمية فقط، وتضيف ``index * 10`` (ترتيب الصف في الإكسل)
للوزن، وهذا رقم عشوائي لا معنى له.

النسخة الحالية تحسب درجة أولوية من 0 إلى 100 تجمع عاملين:

    score = 100 * (w_imp * importance + w_urg * urgency)

- importance: عالية = 1.0، متوسطة = 0.6، عادية = 0.3
- urgency   : تقترب من 1 كلما اقترب الموعد، وتساوي 1 للمهام المتأخرة:
              urgency = 1 / (1 + days_left / 3)
  (المهام بلا موعد تأخذ urgency منخفضة ثابتة)

وعند التساوي تُقدَّم المهمة الأقصر وقتاً (مبدأ SJF من نظم التشغيل)
لأن إنجاز المهام القصيرة أولاً يقلل متوسط وقت الانتظار.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from agentforstudent.data.tasks_repository import Task

IMPORTANCE = {"عالية": 1.0, "متوسطة": 0.6, "عادية": 0.3}
NO_DEADLINE_URGENCY = 0.15
W_IMPORTANCE = 0.55
W_URGENCY = 0.45


@dataclass(frozen=True)
class ScheduledTask:
    task: Task
    score: float
    days_left: int | None

    @property
    def overdue(self) -> bool:
        return self.days_left is not None and self.days_left < 0

    @property
    def due_label(self) -> str:
        if self.days_left is None:
            return "بدون موعد"
        if self.days_left < 0:
            return f"متأخرة {abs(self.days_left)} يوم"
        if self.days_left == 0:
            return "اليوم"
        if self.days_left == 1:
            return "بكرة"
        return f"بعد {self.days_left} أيام"


def urgency(days_left: int | None) -> float:
    if days_left is None:
        return NO_DEADLINE_URGENCY
    if days_left <= 0:
        return 1.0
    return 1.0 / (1.0 + days_left / 3.0)


def priority_score(task: Task, today: date) -> tuple[float, int | None]:
    days_left = (task.due_date - today).days if task.due_date else None
    importance = IMPORTANCE.get(task.priority, IMPORTANCE["عادية"])
    score = 100 * (W_IMPORTANCE * importance + W_URGENCY * urgency(days_left))
    return round(score, 1), days_left


def schedule(tasks: list[Task], today: date | None = None) -> list[ScheduledTask]:
    today = today or date.today()
    scheduled = [ScheduledTask(t, *priority_score(t, today)) for t in tasks if not t.done]
    return sorted(
        scheduled,
        key=lambda s: (-s.score, s.task.est_hours if s.task.est_hours is not None else float("inf"), s.task.id),
    )


def format_report(scheduled: list[ScheduledTask]) -> str:
    if not scheduled:
        return "لا توجد مهام معلقة حالياً."
    lines = ["المهام مرتبة حسب الأولوية (الأعلى أولاً):"]
    for i, s in enumerate(scheduled, 1):
        hours = f" | الوقت المتوقع: {s.task.est_hours:g} ساعة" if s.task.est_hours else ""
        lines.append(
            f"{i}. {s.task.course} — {s.task.title} | الأهمية: {s.task.priority} | "
            f"الموعد: {s.due_label} | درجة الأولوية: {s.score}/100{hours}"
        )
    return "\n".join(lines)
