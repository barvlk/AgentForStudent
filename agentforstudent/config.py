"""إعدادات النظام.

كل الأسرار (مفتاح Gemini ومفتاح التشفير) تُقرأ من متغيرات البيئة أو من ملف ``.env``
ولا تُكتب داخل الكود أبداً. ملف ``.env`` مُستثنى من git عبر ``.gitignore``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent


class ConfigError(RuntimeError):
    """خطأ في الإعدادات، مثل غياب متغير بيئة إلزامي."""


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ConfigError(f"قيمة المتغير {name} يجب أن تكون رقماً: {raw!r}") from exc


def _env_int(name: str, default: int) -> int:
    return int(_env_float(name, default))


def _env_path(name: str, default: Path) -> Path:
    raw = os.getenv(name)
    path = Path(raw) if raw else default
    return path if path.is_absolute() else PROJECT_ROOT / path


@dataclass(frozen=True)
class Settings:
    """إعدادات التطبيق. الكائن غير قابل للتعديل (frozen) لمنع تغيير الإعدادات أثناء التشغيل."""

    # --- الذكاء الاصطناعي ---
    gemini_api_key: str | None
    model_name: str
    temperature: float

    # --- التشفير ---
    data_encryption_key: str | None

    # --- المسارات ---
    data_dir: Path
    students_file: Path
    db_file: Path
    log_dir: Path
    backup_dir: Path

    # --- الأمان ---
    max_login_attempts: int
    lockout_minutes: int
    session_timeout_minutes: int
    min_password_length: int

    # --- حساب العرض التجريبي (اختياري) ---
    demo_student_id: int | None = None
    demo_password: str | None = None
    demo_name: str = "عبدالمجيد"
    # وضع العرض العام (للنشر على الإنترنت): يولّد بيانات وهمية تلقائياً ويعرض بيانات الحساب التجريبي
    public_demo: bool = False

    # --- التحليلات ---
    at_risk_threshold: float = 75.0
    mastery_threshold: float = 80.0
    domains: tuple[str, ...] = field(default=("AI", "Math", "Programming", "Systems"))

    def require_api_key(self) -> str:
        if not self.gemini_api_key:
            raise ConfigError(
                "مفتاح Gemini غير موجود. أضف GEMINI_API_KEY إلى ملف .env (انظر .env.example)."
            )
        return self.gemini_api_key

    def require_encryption_key(self) -> str:
        if not self.data_encryption_key:
            raise ConfigError(
                "مفتاح التشفير غير موجود. شغّل: python main.py keygen ثم أضفه إلى .env"
            )
        return self.data_encryption_key


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """تحميل الإعدادات مرة واحدة فقط (Singleton عبر lru_cache)."""
    load_dotenv(PROJECT_ROOT / ".env")
    data_dir = _env_path("AFS_DATA_DIR", PROJECT_ROOT / "data")
    return Settings(
        gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
        model_name=os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
        temperature=_env_float("GEMINI_TEMPERATURE", 0.3),
        data_encryption_key=os.getenv("DATA_ENCRYPTION_KEY") or None,
        data_dir=data_dir,
        students_file=_env_path("AFS_STUDENTS_FILE", data_dir / "students.xlsx.enc"),
        db_file=_env_path("AFS_DB_FILE", data_dir / "app.db"),
        log_dir=_env_path("AFS_LOG_DIR", PROJECT_ROOT / "logs"),
        backup_dir=_env_path("AFS_BACKUP_DIR", PROJECT_ROOT / "backups"),
        max_login_attempts=_env_int("AFS_MAX_LOGIN_ATTEMPTS", 5),
        lockout_minutes=_env_int("AFS_LOCKOUT_MINUTES", 15),
        session_timeout_minutes=_env_int("AFS_SESSION_TIMEOUT_MINUTES", 30),
        min_password_length=_env_int("AFS_MIN_PASSWORD_LENGTH", 8),
        demo_student_id=_env_int("AFS_DEMO_STUDENT_ID", 0) or None,
        demo_password=os.getenv("AFS_DEMO_PASSWORD") or None,
        demo_name=os.getenv("AFS_DEMO_NAME") or "عبدالمجيد",
        public_demo=os.getenv("AFS_PUBLIC_DEMO", "").strip().lower() in {"1", "true", "yes"},
    )
