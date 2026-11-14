"""مخطط المذاكرة الأسبوعي — حلقة الوكيل (ReAct) بشكل فعلي.

النسخة الأولى من ``ReActAgent`` كانت تطبع "Send weekly plan" فقط بدون أي خطة.
هنا الوكيل ينفّذ الدورة كاملة ويخرج خطة حقيقية:

  Thought  → أحتاج أعرف وضع الطالب.
  Action   → قراءة السجل + حساب الإتقان (BKT) + التنبؤ بالتعثر (Random Forest) + جدولة المهام.
  Observe  → درجة احتياج لكل مجال = 0.6 × خطر التعثر + 0.4 × (1 − الإتقان).
  Act      → توزيع ساعات المذاكرة الأسبوعية على المجالات حسب الاحتياج،
             وإضافة أهم المهام القادمة.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from agentforstudent.analytics.bkt import MasteryEstimate
from agentforstudent.agent.scheduler import ScheduledTask

DOMAIN_LABELS = {
    "AI": "الذكاء الاصطناعي",
    "Math": "الرياضيات",
    "Programming": "البرمجة وهندسة البرمجيات",
    "Systems": "الأنظمة والشبكات والأمن",
}
W_RISK = 0.6
W_GAP = 0.4
MIN_BLOCK_HOURS = 0.5


@dataclass(frozen=True)
class DomainFocus:
    domain: str
    mastery: float
    risk: float
    need: float
    hours: float

    @property
    def label(self) -> str:
        return DOMAIN_LABELS.get(self.domain, self.domain)


@dataclass(frozen=True)
class WeeklyPlan:
    weekly_hours: float
    focus: list[DomainFocus]
    top_tasks: list[ScheduledTask]
    trace: list[str] = field(default_factory=list)

    def to_text(self) -> str:
        lines = [f"خطة المذاكرة الأسبوعية ({self.weekly_hours:g} ساعة):"]
        for f in self.focus:
            if f.hours > 0:
                lines.append(
                    f"- {f.label}: {f.hours:g} ساعة (الإتقان {f.mastery:.0%}، خطر التعثر {f.risk:.0%})"
                )
        if self.top_tasks:
            lines.append("أهم المهام القادمة:")
            lines += [f"- {s.task.course}: {s.task.title} ({s.due_label})" for s in self.top_tasks]
        return "\n".join(lines)


def _round_half(x: float) -> float:
    return round(x * 2) / 2


def build_weekly_plan(
    mastery: dict[str, MasteryEstimate],
    risk: dict[str, float],
    scheduled_tasks: list[ScheduledTask],
    weekly_hours: float = 10.0,
) -> WeeklyPlan:
    trace = ["Thought: بداية أسبوع جديد، أراجع وضع الطالب الأكاديمي أولاً."]
    trace.append("Action: bkt_mastery() + predict_domain_risk() + schedule_tasks()")

    focus_raw = []
    for domain, est in mastery.items():
        if not est.has_data and domain not in risk:
            continue
        r = risk.get(domain, 0.5)
        need = W_RISK * r + W_GAP * (1 - est.probability)
        focus_raw.append((domain, est.probability, r, need))
    trace.append(
        "Observation: " + ", ".join(f"{d}: إتقان={m:.2f}, خطر={r:.2f}" for d, m, r, _ in focus_raw)
    )

    total_need = sum(n for *_, n in focus_raw) or 1.0
    focus = []
    for domain, m, r, need in sorted(focus_raw, key=lambda x: -x[3]):
        hours = _round_half(weekly_hours * need / total_need)
        focus.append(DomainFocus(domain, m, r, round(need, 3), hours if hours >= MIN_BLOCK_HOURS else 0.0))

    top = scheduled_tasks[:3]
    if focus:
        trace.append(f"Thought: المجال الأكثر احتياجاً هو {focus[0].label}، أعطيه الحصة الأكبر.")
    trace.append("Final: إرسال الخطة الأسبوعية والتوصيات للطالب.")
    return WeeklyPlan(weekly_hours, focus, top, trace)
