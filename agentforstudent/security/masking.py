"""إخفاء البيانات الحساسة (Data Masking) قبل كتابتها في السجلات أو عرضها."""

from __future__ import annotations

import re

# الرقم الجامعي في أم القرى 9 أرقام (مثال: 441126225)
_STUDENT_ID_RE = re.compile(r"(?<!\d)(\d{2})\d{5}(\d{2})(?!\d)")
# مفاتيح Google API تبدأ عادة بـ AIza أو AQ.
_API_KEY_RE = re.compile(r"(AIza[0-9A-Za-z_\-]{20,}|AQ\.[0-9A-Za-z_\-]{20,})")


def mask_student_id(student_id: int | str) -> str:
    """441126225 -> 44*****25"""
    text = str(student_id)
    if len(text) <= 4:
        return "*" * len(text)
    return f"{text[:2]}{'*' * (len(text) - 4)}{text[-2:]}"


def redact_text(text: str) -> str:
    """يخفي الأرقام الجامعية ومفاتيح API داخل أي نص."""
    text = _API_KEY_RE.sub("[REDACTED_KEY]", text)
    return _STUDENT_ID_RE.sub(lambda m: f"{m.group(1)}*****{m.group(2)}", text)
