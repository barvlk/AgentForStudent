import numpy as np
import pandas as pd
import pytest

from agentforstudent.data.academic_records import normalize_records
from agentforstudent.data.database import Database

COURSES = [
    ("CS1011", "برمجة 1", 3), ("MTH1141", "تفاضل 1", 3), ("AI2001", "مقدمة ذكاء", 3),
    ("SEC1101", "أمن", 3), ("CS2015", "هياكل بيانات", 4), ("MTH1441", "جبر خطي", 3),
    ("AI3201", "تعلم آلة", 3), ("CEN3011", "شبكات", 3), ("CUR1101", "مهارات جامعية", 0),
]


def _letter(score: float) -> tuple[str, float]:
    for cut, letter, pts in [(95, "A+", 4), (90, "A", 3.75), (85, "B+", 3.5), (80, "B", 3),
                             (75, "C+", 2.5), (70, "C", 2), (65, "D+", 1.5), (60, "D", 1)]:
        if score >= cut:
            return letter, pts
    return "F", 0.0


@pytest.fixture(scope="session")
def raw_records() -> pd.DataFrame:
    """بيانات اصطناعية بنفس أعمدة ملف الجامعة العربية."""
    rng = np.random.default_rng(0)
    rows = []
    for i in range(60):
        sid = 441000000 + i
        ability = rng.normal(80, 8)
        for idx, (code, name, cr) in enumerate(COURSES):
            score = float(np.clip(rng.normal(ability, 6), 40, 100).round())
            letter, pts = _letter(score)
            rows.append({
                "الرقم الجامعي": sid, "اسم الطالب": f"طالب {i}", "المستوى الدراسي الحالي": "المستوى 3",
                "ترم المادة": f"الترم {idx // 3 + 1}", "رمز المقرر": code, "اسم المقرر": name,
                "الساعات": cr, "الدرجة": score, "التقدير": letter, "النقاط": pts,
            })
    return pd.DataFrame(rows)


@pytest.fixture(scope="session")
def records(raw_records) -> pd.DataFrame:
    return normalize_records(raw_records)


@pytest.fixture
def db(tmp_path) -> Database:
    return Database(tmp_path / "test.db")
