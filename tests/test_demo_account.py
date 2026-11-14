import io
from dataclasses import replace

from agentforstudent.agent.services import AppServices
from agentforstudent.config import get_settings
from agentforstudent.data.sample_data import generate_students
from agentforstudent.security import crypto

DEMO_ID = 446006609


def _settings(tmp_path):
    key = crypto.generate_key()
    buf = io.BytesIO()
    generate_students(15, seed=3).to_excel(buf, index=False)
    students = tmp_path / "students.xlsx.enc"
    crypto.write_encrypted(students, buf.getvalue(), key)
    return replace(
        get_settings(),
        data_encryption_key=key,
        data_dir=tmp_path,
        students_file=students,
        db_file=tmp_path / "app.db",
        demo_student_id=DEMO_ID,
        demo_password="1234567",
    )


def test_demo_account_is_created_and_idempotent(tmp_path):
    settings = _settings(tmp_path)
    svc = AppServices(settings)
    assert svc.ensure_demo_account() == DEMO_ID

    login = svc.auth.authenticate(DEMO_ID, "1234567")
    assert login.ok and not login.must_change_password
    assert svc.profile(DEMO_ID).courses_count > 0
    assert svc.tasks.list(DEMO_ID)

    # تشغيل ثانٍ لا يكرر السجل ولا المهام، والملف يبقى مشفّراً
    again = AppServices(settings)
    again.ensure_demo_account()
    assert len(again.records.transcript(DEMO_ID)) == len(svc.records.transcript(DEMO_ID))
    assert len(again.tasks.list(DEMO_ID)) == len(svc.tasks.list(DEMO_ID))
    assert settings.students_file.read_bytes()[:4] != b"PK\x03\x04"  # ليس ملف xlsx مكشوف


def test_demo_account_recovers_after_lockout(tmp_path):
    svc = AppServices(_settings(tmp_path))
    svc.ensure_demo_account()
    for _ in range(5):
        svc.auth.authenticate(DEMO_ID, "wrong")
    assert not svc.auth.authenticate(DEMO_ID, "1234567").ok
    svc.ensure_demo_account()
    assert svc.auth.authenticate(DEMO_ID, "1234567").ok
