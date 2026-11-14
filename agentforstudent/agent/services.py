"""طبقة الخدمات: تجمع البيانات والتحليلات في مكان واحد.

الواجهة (Streamlit) ولوحة التحكم (CLI) تستخدمان هذه الطبقة نفسها،
فلا يتكرر منطق العمل في مكانين كما كان في النسخة الأولى.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from functools import cached_property

import pandas as pd

from agentforstudent.analytics.bkt import BKTModel, MasteryEstimate
from agentforstudent.analytics.risk_model import RiskModel
from agentforstudent.agent.knowledge_base import KnowledgeBase
from agentforstudent.agent.scheduler import ScheduledTask, schedule
from agentforstudent.agent.study_planner import WeeklyPlan, build_weekly_plan
from agentforstudent.config import Settings
from agentforstudent.data.academic_records import AcademicRepository, StudentProfile
from agentforstudent.data.database import Database
from agentforstudent.data.sample_data import DEMO_TASKS, demo_student_rows, generate_students, generate_tasks
from agentforstudent.data.tasks_repository import TaskRepository
from agentforstudent.security.auth import AuthService
from agentforstudent.security.crypto import read_encrypted, write_encrypted

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class StudentAnalytics:
    mastery: dict[str, MasteryEstimate]
    risk: dict[str, float]


class AppServices:
    """حاوية الخدمات (Dependency Container). تُنشأ مرة واحدة وتُشارك بين الصفحات."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.db = Database(settings.db_file)
        self.auth = AuthService(
            self.db,
            max_attempts=settings.max_login_attempts,
            lockout_minutes=settings.lockout_minutes,
            min_password_length=settings.min_password_length,
        )
        self.tasks = TaskRepository(self.db)
        self.knowledge = KnowledgeBase()
        self.bkt = BKTModel(mastery_threshold=settings.mastery_threshold)

    @cached_property
    def records(self) -> AcademicRepository:
        return AcademicRepository.from_file(self.settings.students_file, self.settings.data_encryption_key)

    @cached_property
    def risk_model(self) -> RiskModel | None:
        try:
            return RiskModel(self.settings.at_risk_threshold).fit(self.records.records)
        except ValueError as exc:
            log.warning("Risk model unavailable: %s", exc)
            return None

    # ---------- حساب العرض التجريبي ----------
    def _append_records(self, new_rows: pd.DataFrame) -> None:
        """إضافة صفوف لملف السجلات مع الحفاظ على تشفيره."""
        path, key = self.settings.students_file, self.settings.data_encryption_key
        if path.suffix == ".enc":
            raw = pd.read_excel(io.BytesIO(read_encrypted(path, self.settings.require_encryption_key())))
        else:
            raw = pd.read_excel(path)
        merged = pd.concat([raw, new_rows], ignore_index=True)
        buffer = io.BytesIO()
        merged.to_excel(buffer, index=False)
        if path.suffix == ".enc":
            write_encrypted(path, buffer.getvalue(), key)
        else:
            path.write_bytes(buffer.getvalue())
        # إعادة تحميل البيانات والنموذج عند الاستخدام القادم
        self.__dict__.pop("records", None)
        self.__dict__.pop("risk_model", None)

    def bootstrap_public_demo(self) -> bool:
        """في وضع العرض العام: إذا ما فيه بيانات، نولّد بيانات وهمية مشفّرة ومهام. يرجع True إذا ولّد."""
        if not self.settings.public_demo or self.settings.students_file.exists():
            return False
        key = self.settings.require_encryption_key()
        students = generate_students(100, seed=7)
        buffer = io.BytesIO()
        students.to_excel(buffer, index=False)
        write_encrypted(self.settings.students_file, buffer.getvalue(), key)
        self.tasks.import_dataframe(generate_tasks(students, seed=7))
        self.__dict__.pop("records", None)
        self.__dict__.pop("risk_model", None)
        log.info("Public demo data generated")
        return True

    def ensure_demo_account(self) -> int | None:
        """يضمن وجود حساب العرض (AFS_DEMO_STUDENT_ID) دائماً: سجل أكاديمي + كلمة مرور + مهام."""
        sid, password = self.settings.demo_student_id, self.settings.demo_password
        if not sid or not password:
            return None
        if not self.records.exists(sid):
            self._append_records(demo_student_rows(sid, self.settings.demo_name))
            log.info("Demo academic record created")
        self.auth.ensure_fixed_password(sid, password)
        if not self.tasks.list(sid, include_done=True):
            for course, title, priority, days, hours in DEMO_TASKS:
                self.tasks.add(sid, course, title, priority, date.today() + timedelta(days=days), hours)
        return sid

    def profile(self, student_id: int) -> StudentProfile | None:
        return self.records.profile(student_id)

    def analytics(self, student_id: int) -> StudentAnalytics:
        transcript = self.records.transcript(student_id)
        mastery = self.bkt.estimate_all(transcript, self.settings.domains)
        risk = self.risk_model.predict_domain_risk(transcript, self.settings.domains) if self.risk_model else {}
        return StudentAnalytics(mastery, risk)

    def scheduled_tasks(self, student_id: int) -> list[ScheduledTask]:
        return schedule(self.tasks.list(student_id))

    def weekly_plan(self, student_id: int, weekly_hours: float = 10.0) -> WeeklyPlan:
        a = self.analytics(student_id)
        return build_weekly_plan(a.mastery, a.risk, self.scheduled_tasks(student_id), weekly_hours)
