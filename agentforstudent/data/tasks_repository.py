"""إدارة مهام الطالب (واجبات، كويزات، مشاريع) في SQLite.

كل دالة تستقبل ``student_id`` وتقيّد الاستعلام به، فلا يستطيع طالب
قراءة أو تعديل مهام طالب آخر حتى لو عرف رقم المهمة (منع IDOR).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

import pandas as pd

from agentforstudent.data.database import Database

PRIORITIES = ("عالية", "متوسطة", "عادية")


@dataclass(frozen=True)
class Task:
    id: int
    student_id: int
    course: str
    title: str
    priority: str
    due_date: date | None
    est_hours: float | None
    done: bool


def _to_task(row) -> Task:
    return Task(
        id=row["id"],
        student_id=row["student_id"],
        course=row["course"],
        title=row["title"],
        priority=row["priority"],
        due_date=date.fromisoformat(row["due_date"]) if row["due_date"] else None,
        est_hours=row["est_hours"],
        done=bool(row["done"]),
    )


class TaskRepository:
    def __init__(self, db: Database):
        self.db = db

    def list(self, student_id: int, include_done: bool = False) -> list[Task]:
        sql = "SELECT * FROM tasks WHERE student_id = ?"
        if not include_done:
            sql += " AND done = 0"
        sql += " ORDER BY done, due_date IS NULL, due_date, id"
        with self.db.connect() as conn:
            return [_to_task(r) for r in conn.execute(sql, (student_id,)).fetchall()]

    def add(
        self,
        student_id: int,
        course: str,
        title: str,
        priority: str = "عادية",
        due_date: date | None = None,
        est_hours: float | None = None,
    ) -> int:
        course, title = course.strip(), title.strip()
        if not course or not title:
            raise ValueError("اسم المادة ووصف المهمة مطلوبان.")
        if len(course) > 100 or len(title) > 200:
            raise ValueError("النص طويل جداً.")
        if priority not in PRIORITIES:
            raise ValueError(f"الأولوية يجب أن تكون واحدة من: {', '.join(PRIORITIES)}")
        if est_hours is not None and not (0 < est_hours <= 200):
            raise ValueError("الوقت المتوقع يجب أن يكون بين 0 و 200 ساعة.")
        with self.db.connect() as conn:
            cur = conn.execute(
                "INSERT INTO tasks (student_id, course, title, priority, due_date, est_hours, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    student_id,
                    course,
                    title,
                    priority,
                    due_date.isoformat() if due_date else None,
                    est_hours,
                    datetime.now(timezone.utc).isoformat(timespec="seconds"),
                ),
            )
            return int(cur.lastrowid)

    def set_done(self, student_id: int, task_id: int, done: bool = True) -> bool:
        with self.db.connect() as conn:
            cur = conn.execute(
                "UPDATE tasks SET done = ? WHERE id = ? AND student_id = ?",
                (int(done), task_id, student_id),
            )
            return cur.rowcount == 1

    def delete(self, student_id: int, task_id: int) -> bool:
        with self.db.connect() as conn:
            cur = conn.execute(
                "DELETE FROM tasks WHERE id = ? AND student_id = ?", (task_id, student_id)
            )
            return cur.rowcount == 1

    def import_dataframe(self, df: pd.DataFrame) -> int:
        """استيراد مهام من جدول Excel بالأعمدة العربية القديمة (+ أعمدة اختيارية للتاريخ والوقت)."""
        count = 0
        for _, row in df.iterrows():
            due = row.get("تاريخ التسليم")
            due_date = pd.to_datetime(due).date() if pd.notna(due) else None
            hours = row.get("الوقت المتوقع (ساعات)")
            priority = str(row.get("الأهمية", "عادية")).strip()
            self.add(
                student_id=int(row["الرقم الجامعي"]),
                course=str(row["المادة"]),
                title=str(row["نوع المهمة"]),
                priority=priority if priority in PRIORITIES else "عادية",
                due_date=due_date,
                est_hours=float(hours) if pd.notna(hours) else None,
            )
            count += 1
        return count
