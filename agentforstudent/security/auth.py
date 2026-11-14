"""المصادقة وإدارة كلمات المرور.

قبل التحسين: أي شخص يعرف رقماً جامعياً يقدر يدخل على حساب صاحبه ويشوف درجاته.
بعد التحسين:
- كلمة مرور لكل طالب، تُخزَّن كـ hash عبر bcrypt (دالة بطيئة عمداً مع salt عشوائي)،
  فحتى لو سُرقت قاعدة البيانات لا يمكن استرجاع كلمات المرور.
- قفل الحساب مؤقتاً بعد عدد من المحاولات الفاشلة (حماية من التخمين Brute Force).
- رسالة خطأ موحّدة لا تكشف هل الرقم الجامعي موجود أم لا (منع User Enumeration).
- كلمات مرور مؤقتة يُجبر الطالب على تغييرها في أول دخول.
- تسجيل كل عمليات الدخول في سجل تدقيق (Audit Log).
"""

from __future__ import annotations

import logging
import secrets
import string
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum

import bcrypt

from agentforstudent.data.database import Database
from agentforstudent.security.masking import mask_student_id

log = logging.getLogger(__name__)

BCRYPT_ROUNDS = 12
_BCRYPT_MAX_BYTES = 72
# hash ثابت يُستخدم عند عدم وجود المستخدم، حتى يكون زمن الاستجابة متقارباً (منع Timing Attack)
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password-for-timing", bcrypt.gensalt(BCRYPT_ROUNDS))


class LoginStatus(str, Enum):
    OK = "ok"
    INVALID = "invalid"
    LOCKED = "locked"


@dataclass(frozen=True)
class LoginResult:
    status: LoginStatus
    must_change_password: bool = False
    locked_minutes_left: int = 0

    @property
    def ok(self) -> bool:
        return self.status is LoginStatus.OK


class PasswordPolicyError(ValueError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def validate_password(password: str, min_length: int = 8) -> None:
    """سياسة كلمة المرور: طول أدنى + حرف + رقم + ألا تتجاوز حد bcrypt."""
    if len(password) < min_length:
        raise PasswordPolicyError(f"كلمة المرور يجب ألا تقل عن {min_length} خانات.")
    if not any(ch.isalpha() for ch in password):
        raise PasswordPolicyError("كلمة المرور يجب أن تحتوي على حرف واحد على الأقل.")
    if not any(ch.isdigit() for ch in password):
        raise PasswordPolicyError("كلمة المرور يجب أن تحتوي على رقم واحد على الأقل.")
    if len(password.encode("utf-8")) > _BCRYPT_MAX_BYTES:
        raise PasswordPolicyError("كلمة المرور طويلة جداً.")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(BCRYPT_ROUNDS)).decode("ascii")


def verify_password(password: str, password_hash: str | bytes) -> bool:
    encoded = password.encode("utf-8")
    if len(encoded) > _BCRYPT_MAX_BYTES:
        return False
    hashed = password_hash.encode("ascii") if isinstance(password_hash, str) else password_hash
    try:
        return bcrypt.checkpw(encoded, hashed)
    except ValueError:
        return False


def generate_temp_password(length: int = 12) -> str:
    """كلمة مرور مؤقتة عشوائية آمنة تشفيرياً (secrets وليس random)."""
    alphabet = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.isdigit() for c in pw) and any(c.isalpha() for c in pw):
            return pw


class AuthService:
    def __init__(
        self,
        db: Database,
        max_attempts: int = 5,
        lockout_minutes: int = 15,
        min_password_length: int = 8,
    ):
        self.db = db
        self.max_attempts = max_attempts
        self.lockout = timedelta(minutes=lockout_minutes)
        self.min_password_length = min_password_length

    # ---------- سجل التدقيق ----------
    def audit(self, event: str, student_id: int | None = None, detail: str = "") -> None:
        subject = mask_student_id(student_id) if student_id is not None else None
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO audit_log (ts, event, subject, detail) VALUES (?, ?, ?, ?)",
                (_now().isoformat(timespec="seconds"), event, subject, detail),
            )

    def recent_audit(self, limit: int = 50) -> list[dict]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT ts, event, subject, detail FROM audit_log ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    # ---------- إدارة الحسابات ----------
    def user_exists(self, student_id: int) -> bool:
        with self.db.connect() as conn:
            row = conn.execute("SELECT 1 FROM users WHERE student_id = ?", (student_id,)).fetchone()
        return row is not None

    def set_password(
        self, student_id: int, password: str, must_change: bool = False, enforce_policy: bool = True
    ) -> None:
        """``enforce_policy=False`` مخصص لحساب العرض التجريبي فقط (يضبطه المسؤول عن قصد)."""
        if enforce_policy:
            validate_password(password, self.min_password_length)
        elif not password or len(password.encode("utf-8")) > _BCRYPT_MAX_BYTES:
            raise PasswordPolicyError("كلمة المرور فارغة أو طويلة جداً.")
        pw_hash = hash_password(password)
        with self.db.connect() as conn:
            conn.execute(
                """
                INSERT INTO users (student_id, password_hash, must_change, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(student_id) DO UPDATE SET
                    password_hash = excluded.password_hash,
                    must_change = excluded.must_change,
                    failed_attempts = 0,
                    locked_until = NULL
                """,
                (student_id, pw_hash, int(must_change), _now().isoformat(timespec="seconds")),
            )
        detail = "temporary" if must_change else ("demo_policy_bypass" if not enforce_policy else "")
        self.audit("password_set", student_id, detail)

    def change_password(self, student_id: int, old_password: str, new_password: str) -> bool:
        if old_password == new_password:
            raise PasswordPolicyError("كلمة المرور الجديدة يجب أن تختلف عن القديمة.")
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT password_hash FROM users WHERE student_id = ?", (student_id,)
            ).fetchone()
        if row is None or not verify_password(old_password, row["password_hash"]):
            return False
        self.set_password(student_id, new_password, must_change=False)
        return True

    def provision(self, student_ids: list[int], overwrite: bool = False) -> dict[int, str]:
        """إنشاء كلمات مرور مؤقتة لمجموعة طلاب. تُعاد مرة واحدة فقط ولا تُخزن إلا كـ hash."""
        created: dict[int, str] = {}
        for sid in student_ids:
            if not overwrite and self.user_exists(sid):
                continue
            temp = generate_temp_password()
            self.set_password(sid, temp, must_change=True)
            created[sid] = temp
        return created

    def ensure_fixed_password(self, student_id: int, password: str) -> None:
        """لحساب العرض: يضمن أن الحساب موجود بكلمة المرور المحددة وغير مقفول."""
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT password_hash, must_change, failed_attempts, locked_until FROM users WHERE student_id = ?",
                (student_id,),
            ).fetchone()
        if row is None or row["must_change"] or not verify_password(password, row["password_hash"]):
            self.set_password(student_id, password, must_change=False, enforce_policy=False)
        elif row["failed_attempts"] or row["locked_until"]:
            self.unlock(student_id)

    def unlock(self, student_id: int) -> None:
        with self.db.connect() as conn:
            conn.execute(
                "UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE student_id = ?",
                (student_id,),
            )
        self.audit("account_unlocked", student_id)

    # ---------- تسجيل الدخول ----------
    def authenticate(self, student_id: int, password: str) -> LoginResult:
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT password_hash, must_change, failed_attempts, locked_until "
                "FROM users WHERE student_id = ?",
                (student_id,),
            ).fetchone()

        if row is None:
            verify_password(password, _DUMMY_HASH)  # نفس الزمن تقريباً سواء وُجد المستخدم أم لا
            self.audit("login_failed", student_id, "unknown_user")
            return LoginResult(LoginStatus.INVALID)

        if row["locked_until"]:
            locked_until = datetime.fromisoformat(row["locked_until"])
            if locked_until > _now():
                minutes = max(1, int((locked_until - _now()).total_seconds() // 60) + 1)
                self.audit("login_blocked", student_id, "locked")
                return LoginResult(LoginStatus.LOCKED, locked_minutes_left=minutes)

        if not verify_password(password, row["password_hash"]):
            attempts = row["failed_attempts"] + 1
            locked_until = None
            if attempts >= self.max_attempts:
                locked_until = (_now() + self.lockout).isoformat(timespec="seconds")
                attempts = 0
                log.warning("Account locked after repeated failures: %s", mask_student_id(student_id))
            with self.db.connect() as conn:
                conn.execute(
                    "UPDATE users SET failed_attempts = ?, locked_until = ? WHERE student_id = ?",
                    (attempts, locked_until, student_id),
                )
            self.audit("login_failed", student_id, "locked" if locked_until else "bad_password")
            if locked_until:
                return LoginResult(LoginStatus.LOCKED, locked_minutes_left=int(self.lockout.total_seconds() // 60))
            return LoginResult(LoginStatus.INVALID)

        with self.db.connect() as conn:
            conn.execute(
                "UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = ? "
                "WHERE student_id = ?",
                (_now().isoformat(timespec="seconds"), student_id),
            )
        self.audit("login_success", student_id)
        return LoginResult(LoginStatus.OK, must_change_password=bool(row["must_change"]))
