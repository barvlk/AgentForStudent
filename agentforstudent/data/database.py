"""قاعدة بيانات SQLite للبيانات التشغيلية للتطبيق.

الفصل بين نوعين من البيانات:
- السجلات الأكاديمية الرسمية (الدرجات): ملف Excel مشفّر، للقراءة فقط.
- بيانات التطبيق (حسابات الدخول، المهام، سجل التدقيق): SQLite، تُقرأ وتُكتب.

كل الاستعلامات تستخدم معاملات (``?``) وليس دمج نصوص، لمنع هجمات SQL Injection.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    student_id       INTEGER PRIMARY KEY,
    password_hash    TEXT    NOT NULL,
    must_change      INTEGER NOT NULL DEFAULT 1,
    failed_attempts  INTEGER NOT NULL DEFAULT 0,
    locked_until     TEXT,
    created_at       TEXT    NOT NULL,
    last_login       TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  INTEGER NOT NULL,
    course      TEXT    NOT NULL,
    title       TEXT    NOT NULL,
    priority    TEXT    NOT NULL CHECK (priority IN ('عالية', 'متوسطة', 'عادية')),
    due_date    TEXT,
    est_hours   REAL,
    done        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_student ON tasks(student_id, done);

CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL,
    event       TEXT NOT NULL,
    subject     TEXT,
    detail      TEXT
);
"""


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        """اتصال مع commit تلقائي عند النجاح و rollback عند الخطأ."""
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()
