"""قراءة السجلات الأكاديمية من ملف Excel (مشفّر أو عادي) وتوحيد أعمدته.

بقية النظام لا يعرف شيئاً عن أسماء الأعمدة العربية أو عن التشفير؛ يتعامل فقط مع
``StudentProfile`` وجدول بأعمدة إنجليزية موحدة. هذا يسهّل تغيير مصدر البيانات لاحقاً
(قاعدة بيانات الجامعة مثلاً) بدون تعديل بقية الكود.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from agentforstudent.security.crypto import read_encrypted

log = logging.getLogger(__name__)

COLUMN_MAP = {
    "الرقم الجامعي": "student_id",
    "اسم الطالب": "name",
    "المستوى الدراسي الحالي": "level",
    "ترم المادة": "term",
    "رمز المقرر": "course_code",
    "اسم المقرر": "course_name",
    "الساعات": "credits",
    "الدرجة": "score",
    "التقدير": "letter",
    "النقاط": "points",
}
REQUIRED_COLUMNS = ("student_id", "name", "course_code", "credits", "score", "points")

# تصنيف المقررات حسب البادئة إلى مجالات مهارية تُستخدم في BKT ونموذج التنبؤ
DOMAIN_PREFIXES: dict[str, tuple[str, ...]] = {
    "AI": ("AI",),
    "Math": ("MTH", "PHYS", "CS1302"),
    "Programming": ("CS", "SE", "HCI"),
    "Systems": ("CEN", "SEC", "DS"),
}


class DataSourceError(RuntimeError):
    pass


def assign_domain(course_code: str) -> str:
    code = str(course_code).strip().upper()
    # نفحص البادئات الأطول أولاً حتى يُصنف CS1302 كرياضيات قبل أن يطابق CS
    candidates = sorted(
        ((prefix, domain) for domain, prefixes in DOMAIN_PREFIXES.items() for prefix in prefixes),
        key=lambda item: len(item[0]),
        reverse=True,
    )
    for prefix, domain in candidates:
        if code.startswith(prefix):
            return domain
    return "General"


def _extract_int(series: pd.Series, default: int = 1) -> pd.Series:
    return (
        pd.to_numeric(series.astype(str).str.extract(r"(\d+)")[0], errors="coerce")
        .fillna(default)
        .astype(int)
    )


def normalize_records(raw: pd.DataFrame) -> pd.DataFrame:
    """تحويل أعمدة الإكسل العربية إلى أعمدة موحدة وتنظيف أنواع البيانات."""
    df = raw.rename(columns=lambda c: str(c).strip()).rename(columns=COLUMN_MAP)
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise DataSourceError(f"أعمدة مفقودة في ملف السجلات: {missing}")

    df["student_id"] = pd.to_numeric(df["student_id"], errors="coerce")
    df = df.dropna(subset=["student_id"]).copy()
    df["student_id"] = df["student_id"].astype("int64")
    df["term_no"] = _extract_int(df["term"]) if "term" in df.columns else 1
    df["credits"] = pd.to_numeric(df["credits"], errors="coerce").fillna(0).astype(int)
    df["score"] = pd.to_numeric(df["score"], errors="coerce")
    df["points"] = pd.to_numeric(df["points"], errors="coerce").fillna(0.0)
    df["letter"] = df.get("letter", pd.Series("-", index=df.index)).fillna("-").astype(str)
    df["course_name"] = df.get("course_name", df["course_code"]).astype(str)
    df["level"] = df.get("level", pd.Series("-", index=df.index)).astype(str)
    df["passed"] = (df["letter"].str.upper() != "F") & (df["score"].fillna(0) >= 60)
    df["domain"] = df["course_code"].map(assign_domain)
    return df.reset_index(drop=True)


def load_records(path: Path, encryption_key: str | None) -> pd.DataFrame:
    """تحميل السجلات. الملفات المنتهية بـ .enc تُفك في الذاكرة فقط."""
    path = Path(path)
    if not path.exists():
        raise DataSourceError(f"ملف السجلات الأكاديمية غير موجود: {path.name}")
    if path.suffix == ".enc":
        if not encryption_key:
            raise DataSourceError("الملف مشفّر ولم يتم ضبط DATA_ENCRYPTION_KEY.")
        raw = pd.read_excel(io.BytesIO(read_encrypted(path, encryption_key)))
    else:
        log.warning("Reading UNENCRYPTED academic records file: %s", path.name)
        raw = pd.read_excel(path)
    return normalize_records(raw)


@dataclass(frozen=True)
class StudentProfile:
    student_id: int
    name: str
    level: str
    gpa: float
    attempted_hours: int
    earned_hours: int
    courses_count: int
    failed_courses: tuple[str, ...]

    @property
    def first_name(self) -> str:
        return self.name.split()[0] if self.name else ""


def calculate_gpa(records: pd.DataFrame) -> float:
    """المعدل = مجموع (الساعات × النقاط) ÷ مجموع الساعات (المقررات ذات 0 ساعة لا تدخل في المعدل)."""
    graded = records[records["credits"] > 0]
    total_hours = graded["credits"].sum()
    if total_hours == 0:
        return 0.0
    return round(float((graded["credits"] * graded["points"]).sum() / total_hours), 2)


class AcademicRepository:
    def __init__(self, records: pd.DataFrame):
        self.records = records

    @classmethod
    def from_file(cls, path: Path, encryption_key: str | None) -> "AcademicRepository":
        return cls(load_records(path, encryption_key))

    def student_ids(self) -> list[int]:
        return sorted(int(s) for s in self.records["student_id"].unique())

    def exists(self, student_id: int) -> bool:
        return bool((self.records["student_id"] == student_id).any())

    def transcript(self, student_id: int) -> pd.DataFrame:
        return (
            self.records[self.records["student_id"] == student_id]
            .sort_values(["term_no", "course_code"])
            .reset_index(drop=True)
        )

    def profile(self, student_id: int) -> StudentProfile | None:
        rows = self.transcript(student_id)
        if rows.empty:
            return None
        return StudentProfile(
            student_id=student_id,
            name=str(rows["name"].iloc[0]),
            level=str(rows["level"].iloc[0]),
            gpa=calculate_gpa(rows),
            attempted_hours=int(rows["credits"].sum()),
            earned_hours=int(rows.loc[rows["passed"], "credits"].sum()),
            courses_count=len(rows),
            failed_courses=tuple(rows.loc[~rows["passed"], "course_name"].tolist()),
        )
