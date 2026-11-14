import inspect
from datetime import date, timedelta

import pytest

from agentforstudent.agent.knowledge_base import KnowledgeBase, normalize_arabic
from agentforstudent.agent.safe_calc import UnsafeExpressionError, safe_calculate
from agentforstudent.agent.scheduler import schedule, urgency
from agentforstudent.agent.study_planner import build_weekly_plan
from agentforstudent.analytics.bkt import MasteryEstimate
from agentforstudent.data.tasks_repository import Task

TODAY = date(2026, 11, 14)


def _task(i, priority, days=None, hours=None):
    due = TODAY + timedelta(days=days) if days is not None else None
    return Task(i, 1, "مادة", f"مهمة {i}", priority, due, hours, False)


# ---------- الجدولة ----------
def test_urgency_monotonic():
    assert urgency(-1) == urgency(0) == 1.0
    assert urgency(1) > urgency(7) > urgency(30)


def test_close_deadline_beats_importance():
    tasks = [_task(1, "عالية", days=30), _task(2, "متوسطة", days=0)]
    assert [s.task.id for s in schedule(tasks, TODAY)] == [2, 1]


def test_sjf_tiebreak():
    tasks = [_task(1, "عالية", 3, hours=5), _task(2, "عالية", 3, hours=1)]
    assert [s.task.id for s in schedule(tasks, TODAY)] == [2, 1]


# ---------- البحث المعرفي ----------
def test_normalize_arabic():
    assert normalize_arabic("أَحمد إلى مدرسة") == "احمد الي مدرسه"


def test_search_finds_relevant_note():
    kb = KnowledgeBase()
    hits = kb.search("وش هي شجرة البحث الثنائية؟")
    assert hits and "BST" in hits[0].text
    assert "SJF" in kb.search("خوارزمية الجدولة SJF")[0].text


def test_search_irrelevant_returns_nothing():
    assert KnowledgeBase(min_score=0.3).search("كرة القدم والطبخ") == []


# ---------- الحاسبة الآمنة ----------
@pytest.mark.parametrize("expr,result", [("2+3*4", 14), ("(3*4 + 3*3.5)/6", 3.75), ("2**10", 1024), ("-5+2", -3)])
def test_safe_calc(expr, result):
    assert safe_calculate(expr) == pytest.approx(result)


@pytest.mark.parametrize("expr", ["__import__('os').system('dir')", "open('x')", "a+1", "9**9999", "1/0", "[1,2]"])
def test_safe_calc_rejects_code(expr):
    with pytest.raises(UnsafeExpressionError):
        safe_calculate(expr)


# ---------- خطة المذاكرة ----------
def test_weekly_plan_prioritises_weak_domain():
    mastery = {
        "Math": MasteryEstimate("Math", 0.2, 3, ()),
        "AI": MasteryEstimate("AI", 0.95, 3, ()),
    }
    plan = build_weekly_plan(mastery, {"Math": 0.8, "AI": 0.1}, [], weekly_hours=10)
    assert plan.focus[0].domain == "Math"
    assert plan.focus[0].hours > plan.focus[1].hours
    assert sum(f.hours for f in plan.focus) == pytest.approx(10, abs=1)


# ---------- الأدوات مربوطة بالطالب ----------
def test_tools_take_no_student_id(records, db):
    """الأمان: لا توجد أداة تقبل رقماً جامعياً من النموذج."""
    from agentforstudent.agent.tools import build_tools

    class FakeServices:
        pass

    for tool in build_tools(FakeServices(), 441000000):
        params = inspect.signature(tool).parameters
        assert "student_id" not in params, tool.__name__
        assert tool.__doc__, f"{tool.__name__} needs a docstring for Gemini"
