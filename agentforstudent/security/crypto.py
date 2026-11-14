"""تشفير الملفات والبيانات (Encryption at Rest).

نستخدم Fernet من مكتبة ``cryptography``، وهو تشفير متماثل موثّق يجمع:
- AES-128 في وضع CBC للتشفير.
- HMAC-SHA256 للتحقق من سلامة البيانات (أي تعديل على الملف المشفّر يُكتشف فوراً).

ملفات الطلاب (الدرجات والأسماء) تُحفظ مشفّرة على القرص بامتداد ``.enc``،
وتُفك في الذاكرة فقط عند القراءة، فلا تُكتب نسخة مكشوفة على القرص.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken


class DecryptionError(RuntimeError):
    """فشل فك التشفير: المفتاح خاطئ أو الملف تم العبث به."""


def generate_key() -> str:
    """توليد مفتاح تشفير عشوائي آمن (32 بايت بترميز base64)."""
    return Fernet.generate_key().decode("ascii")


def _fernet(key: str | bytes) -> Fernet:
    try:
        return Fernet(key.encode("ascii") if isinstance(key, str) else key)
    except (ValueError, TypeError) as exc:
        raise DecryptionError("صيغة مفتاح التشفير غير صحيحة.") from exc


def encrypt_bytes(data: bytes, key: str | bytes) -> bytes:
    return _fernet(key).encrypt(data)


def decrypt_bytes(token: bytes, key: str | bytes) -> bytes:
    try:
        return _fernet(key).decrypt(token)
    except InvalidToken as exc:
        raise DecryptionError("تعذر فك التشفير: المفتاح غير صحيح أو الملف تالف/معدّل.") from exc


def _atomic_write(path: Path, data: bytes) -> None:
    """كتابة ذرّية: نكتب في ملف مؤقت ثم نستبدل، فلا ينتج ملف نصف مكتوب لو انقطع البرنامج."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        os.replace(tmp_name, path)
    except BaseException:
        Path(tmp_name).unlink(missing_ok=True)
        raise


def encrypt_file(src: Path, dst: Path, key: str | bytes) -> None:
    _atomic_write(Path(dst), encrypt_bytes(Path(src).read_bytes(), key))


def decrypt_file(src: Path, dst: Path, key: str | bytes) -> None:
    _atomic_write(Path(dst), decrypt_bytes(Path(src).read_bytes(), key))


def read_encrypted(path: Path, key: str | bytes) -> bytes:
    """قراءة ملف مشفّر وإرجاع محتواه مفكوكاً في الذاكرة."""
    return decrypt_bytes(Path(path).read_bytes(), key)


def write_encrypted(path: Path, data: bytes, key: str | bytes) -> None:
    _atomic_write(Path(path), encrypt_bytes(data, key))
