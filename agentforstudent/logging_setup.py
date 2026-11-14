"""نظام السجلات الموحد.

- ملف سجل واحد بترميز UTF-8 (السجلات القديمة كانت تُكتب بترميز ويندوز فتظهر العربية رموزاً).
- تدوير تلقائي للملف (RotatingFileHandler) حتى لا يكبر بلا حدود.
- فلتر يُخفي الأرقام الجامعية ومفاتيح API قبل كتابتها في السجل.
"""

from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler

from agentforstudent.config import get_settings
from agentforstudent.security.masking import redact_text

_CONFIGURED = False


class RedactingFilter(logging.Filter):
    """يمر على كل رسالة سجل ويخفي البيانات الحساسة قبل كتابتها."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact_text(record.getMessage())
        record.args = ()
        return True


def setup_logging(level: int = logging.INFO) -> None:
    """تهيئة السجلات مرة واحدة لكل العملية."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    settings = get_settings()
    settings.log_dir.mkdir(parents=True, exist_ok=True)

    handler = RotatingFileHandler(
        settings.log_dir / "agentforstudent.log",
        maxBytes=1_000_000,
        backupCount=5,
        encoding="utf-8",
    )
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    handler.addFilter(RedactingFilter())

    root = logging.getLogger()
    root.setLevel(level)
    root.addHandler(handler)

    # مكتبات الشبكة تكتب تفاصيل كثيرة؛ نكتفي بالتحذيرات منها
    for noisy in ("httpx", "httpcore", "google_genai", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    _CONFIGURED = True
