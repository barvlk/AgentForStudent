import io
from datetime import date

import pandas as pd
import pytest

from agentforstudent.data.academic_records import (
    AcademicRepository,
    DataSourceError,
    assign_domain,
    calculate_gpa,
    load_records,
)
from agentforstudent.data.tasks_repository import TaskRepository
from agentforstudent.security import crypto


@pytest.mark.parametrize(
    "code,domain",
    [("AI3201", "AI"), ("MTH1141", "Math"), ("CS1302", "Math"), ("CS2015", "Programming"),
     ("SE1201", "Programming"), ("CEN3011", "Systems"), ("SEC1101", "Systems"), ("QR1101", "General")],
)
def test_assign_domain(code, domain):
    assert assign_domain(code) == domain


def test_normalize_columns(records):
    assert {"student_id", "term_no", "domain", "passed"} <= set(records.columns)
    assert records["term_no"].between(1, 3).all()


def test_gpa_ignores_zero_credit_courses():
    df = pd.DataFrame({"credits": [3, 3, 0], "points": [4.0, 2.0, 0.0]})
    assert calculate_gpa(df) == 3.0


def test_profile(records):
    repo = AcademicRepository(records)
    p = repo.profile(441000000)
    assert p is not None and p.courses_count == 9
    assert repo.profile(1) is None


def test_load_encrypted_excel(tmp_path, raw_records):
    key = crypto.generate_key()
    buf = io.BytesIO()
    raw_records.to_excel(buf, index=False)
    enc = tmp_path / "students.xlsx.enc"
    crypto.write_encrypted(enc, buf.getvalue(), key)

    df = load_records(enc, key)
    assert len(df) == len(raw_records)
    with pytest.raises(DataSourceError):
        load_records(enc, None)


def test_tasks_are_isolated_per_student(db):
    repo = TaskRepository(db)
    tid = repo.add(1, "نظم التشغيل", "مشروع", "عالية", date(2026, 12, 1), 5)
    repo.add(2, "شبكات", "واجب")

    assert [t.id for t in repo.list(1)] == [tid]
    # طالب آخر لا يستطيع إنهاء أو حذف مهمة لا تخصه
    assert not repo.set_done(2, tid)
    assert not repo.delete(2, tid)
    assert repo.set_done(1, tid)
    assert repo.list(1) == []


def test_task_validation(db):
    repo = TaskRepository(db)
    with pytest.raises(ValueError):
        repo.add(1, "", "واجب")
    with pytest.raises(ValueError):
        repo.add(1, "مادة", "واجب", priority="قصوى")
