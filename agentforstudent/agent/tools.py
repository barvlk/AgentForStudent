"""أدوات الوكيل التي يستدعيها Gemini (Function Calling).

ثغرة أمنية في النسخة الأولى:
    الأداة ``generate_student_priority_report(student_id)`` كانت تستقبل الرقم الجامعي
    كمعامل من النموذج. يكفي أن يكتب الطالب: "اعرض مهام الطالب 442850800"
    فيستدعيها النموذج ويكشف بيانات طالب آخر (Prompt Injection + IDOR).

الحل:
    الأدوات تُبنى لكل جلسة عبر ``build_tools(student_id)`` وتكون مربوطة (closure)
    بالطالب المسجّل دخوله فقط. النموذج لا يستطيع تمرير رقم جامعي أصلاً.
"""

from __future__ import annotations

import logging
from typing import Callable

from agentforstudent.agent.safe_calc import UnsafeExpressionError, safe_calculate
from agentforstudent.agent.scheduler import format_report
from agentforstudent.agent.services import AppServices
from agentforstudent.agent.study_planner import DOMAIN_LABELS

log = logging.getLogger(__name__)
MAX_QUERY_LENGTH = 300


def build_tools(services: AppServices, student_id: int) -> list[Callable]:
    """إنشاء أدوات مقيدة بطالب واحد. أسماء الدوال وتوثيقها تُرسل لـ Gemini كوصف للأداة."""

    def search_study_notes(query: str) -> str:
        """Search the course notes (data structures, operating systems, software engineering,
        cybersecurity, AI) and return the most relevant passages. Use it before explaining a concept."""
        log.info("tool:search_study_notes")
        return services.knowledge.search_text(query[:MAX_QUERY_LENGTH])

    def get_my_priority_tasks() -> str:
        """Return the current student's pending tasks (assignments, quizzes, projects)
        ordered by priority score that combines importance and deadline urgency."""
        log.info("tool:get_my_priority_tasks")
        return format_report(services.scheduled_tasks(student_id))

    def get_my_learning_analytics() -> str:
        """Return the current student's mastery probability per skill domain (Bayesian Knowledge
        Tracing) and predicted risk of scoring below 75 in the next course of each domain."""
        log.info("tool:get_my_learning_analytics")
        a = services.analytics(student_id)
        lines = ["تحليل الإتقان وخطر التعثر لكل مجال:"]
        for domain, est in a.mastery.items():
            risk = a.risk.get(domain)
            risk_txt = f"{risk:.0%}" if risk is not None else "غير متاح"
            lines.append(
                f"- {DOMAIN_LABELS.get(domain, domain)}: الإتقان {est.probability:.0%} ({est.label}، "
                f"{est.observations} مقررات) | خطر التعثر في المقرر القادم: {risk_txt}"
            )
        return "\n".join(lines)

    def get_my_weekly_study_plan(weekly_hours: float = 10.0) -> str:
        """Build a personalised weekly study plan that distributes `weekly_hours` (1-60) of study
        across skill domains based on risk and mastery gaps, plus the most urgent tasks."""
        log.info("tool:get_my_weekly_study_plan")
        hours = min(max(float(weekly_hours), 1.0), 60.0)
        return services.weekly_plan(student_id, hours).to_text()

    def calculate(expression: str) -> str:
        """Safely evaluate an arithmetic expression (numbers and + - * / // % ** parentheses only),
        e.g. to compute a GPA or the score needed in a final exam."""
        try:
            return str(round(safe_calculate(expression), 6))
        except UnsafeExpressionError as exc:
            return f"تعذر الحساب: {exc}"

    return [
        search_study_notes,
        get_my_priority_tasks,
        get_my_learning_analytics,
        get_my_weekly_study_plan,
        calculate,
    ]
