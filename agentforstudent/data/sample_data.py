"""توليد بيانات تجريبية اصطناعية (طلاب + مهام) بنفس أعمدة ملف الجامعة.

بيانات الطلاب الحقيقية لا تُرفع على GitHub. هذا السكربت يسمح لأي شخص بتشغيل
المشروع بالكامل على بيانات وهمية:

    python main.py setup --demo          # يولّد البيانات ويهيئ النظام بأمر واحد
    python scripts/generate_sample_data.py --students 200   # توليد فقط
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]

FIRST = ["محمد", "عبدالله", "فيصل", "سعود", "خالد", "نواف", "تركي", "ريان", "يزن", "عمر", "سلمان", "زياد"]
LAST = ["الحربي", "الغامدي", "الزهراني", "العتيبي", "القرشي", "الشهري", "المالكي", "السلمي", "الثقفي", "اللحياني"]

# (رمز، اسم، ساعات) لكل ترم
PLAN: list[list[tuple[str, str, int]]] = [
    [("CS1011", "برمجة الحاسب بلغة بايثون", 3), ("MTH1141", "التفاضل والتكامل 1", 3),
     ("IND1101", "التفكير التصميمي", 2), ("ELIE1201", "اللغة الإنجليزية 1", 3), ("CUR1101", "مهارات جامعية", 0)],
    [("CS1012", "البرمجة الشيئية بلغة بايثون", 3), ("MTH1441", "الجبر الخطي", 3),
     ("CS1302", "هياكل متقطعة 1", 3), ("SEC1101", "مقدمة في الأمن السيبراني", 3)],
    [("CS2015", "هياكل البيانات والخوارزميات", 4), ("MTH1602", "الإحصاء والاحتمالات", 3),
     ("AI2001", "مقدمة في الذكاء الاصطناعي", 3), ("CEN2011", "التصميم الرقمي المنطقي", 3)],
    [("CS2107", "تصميم وتحليل الخوارزميات", 3), ("DS2201", "مقدمة في قواعد البيانات", 3),
     ("SE1201", "أسس هندسة البرمجيات", 3), ("CEN2012", "تنظيم وعمارة الحاسب", 3)],
    [("AI3201", "تعلم الآلة", 3), ("CS3608", "نظم التشغيل", 3),
     ("CEN3011", "شبكات الحاسب الآلي", 3), ("MTH2144", "تفاضل وتكامل عديد المتغيرات", 3)],
    [("AI3202", "مقدمة في التعلم العميق", 3), ("AI3301", "تحليل وتصوير البيانات", 3),
     ("HCI2011", "تصميم واجهة المستخدم", 3), ("AI3103", "أخلاقيات الذكاء الاصطناعي", 2)],
]
DOMAIN_OF = {"CS": "prog", "SE": "prog", "HCI": "prog", "MTH": "math", "AI": "ai",
             "SEC": "sys", "CEN": "sys", "DS": "sys"}
GRADES = [(95, "A+", 4.0), (90, "A", 3.75), (85, "B+", 3.5), (80, "B", 3.0),
          (75, "C+", 2.5), (70, "C", 2.0), (65, "D+", 1.5), (60, "D", 1.0)]


def letter(score: float) -> tuple[str, float]:
    for cut, l, p in GRADES:
        if score >= cut:
            return l, p
    return "F", 0.0


def generate_students(n: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    ids = rng.choice(np.arange(441000000, 446000000), size=n, replace=False)
    for sid in sorted(ids):
        name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        terms_done = int(rng.integers(1, len(PLAN) + 1))
        ability = rng.normal(79, 7)
        strengths = {d: rng.normal(0, 5) for d in ("prog", "math", "ai", "sys")}
        momentum = rng.normal(0, 1.5)  # بعض الطلاب يتحسنون مع الوقت وبعضهم يتراجع
        for t in range(terms_done):
            for code, cname, cr in PLAN[t]:
                prefix = next((p for p in DOMAIN_OF if code.startswith(p)), None)
                skill = strengths.get(DOMAIN_OF.get(prefix, ""), 0.0)
                score = float(np.clip(round(rng.normal(ability + skill + momentum * t, 6)), 40, 100))
                l, p = letter(score)
                rows.append({
                    "الرقم الجامعي": int(sid), "اسم الطالب": name,
                    "المستوى الدراسي الحالي": f"المستوى {terms_done}", "ترم المادة": f"الترم {t + 1}",
                    "رمز المقرر": code, "اسم المقرر": cname, "الساعات": cr,
                    "الدرجة": score, "التقدير": l, "النقاط": p,
                })
    return pd.DataFrame(rows)


def demo_student_rows(student_id: int, name: str, seed: int = 2026) -> pd.DataFrame:
    """سجل أكاديمي كامل (6 ترمات) لحساب العرض التجريبي، بأداء جيد مع نقطة ضعف في الرياضيات."""
    rng = np.random.default_rng(seed)
    strengths = {"prog": 7.0, "ai": 5.0, "sys": 2.0, "math": -8.0}
    rows = []
    for t, courses in enumerate(PLAN):
        for code, cname, cr in courses:
            prefix = next((p for p in DOMAIN_OF if code.startswith(p)), None)
            skill = strengths.get(DOMAIN_OF.get(prefix, ""), 0.0)
            score = float(np.clip(round(rng.normal(83 + skill + 0.8 * t, 4)), 50, 100))
            l, p = letter(score)
            rows.append({
                "الرقم الجامعي": student_id, "اسم الطالب": name,
                "المستوى الدراسي الحالي": f"المستوى {len(PLAN)}", "ترم المادة": f"الترم {t + 1}",
                "رمز المقرر": code, "اسم المقرر": cname, "الساعات": cr,
                "الدرجة": score, "التقدير": l, "النقاط": p,
            })
    return pd.DataFrame(rows)


DEMO_TASKS = [
    ("مشروع تخرج 2", "تسليم التقرير النهائي", "عالية", 3, 8.0),
    ("مقدمة في التعلم العميق", "كويز قصير", "عالية", 1, 2.0),
    ("تحليل وتصوير البيانات", "واجب", "متوسطة", 6, 3.0),
    ("أخلاقيات الذكاء الاصطناعي", "تقرير", "عادية", 12, 2.0),
]


def generate_tasks(students: pd.DataFrame, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed + 1)
    kinds = ["واجب", "كويز قصير", "اختبار منتصف الفصل", "مشروع", "تقرير معمل"]
    rows = []
    for sid in students["الرقم الجامعي"].unique()[:20]:
        courses = students.loc[students["الرقم الجامعي"] == sid, "اسم المقرر"].unique()
        for _ in range(int(rng.integers(2, 5))):
            rows.append({
                "الرقم الجامعي": int(sid), "المادة": str(rng.choice(courses)),
                "نوع المهمة": str(rng.choice(kinds)),
                "الأهمية": str(rng.choice(["عالية", "متوسطة", "عادية"], p=[0.35, 0.4, 0.25])),
                "تاريخ التسليم": date.today() + timedelta(days=int(rng.integers(-1, 21))),
                "الوقت المتوقع (ساعات)": float(rng.choice([1, 2, 3, 5, 8])),
            })
    return pd.DataFrame(rows)


def write_sample_files(out_dir: Path, n_students: int = 100, seed: int = 7) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    students = generate_students(n_students, seed)
    students_path, tasks_path = out_dir / "sample_students.xlsx", out_dir / "sample_tasks.xlsx"
    students.to_excel(students_path, index=False)
    generate_tasks(students, seed).to_excel(tasks_path, index=False)
    return students_path, tasks_path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--students", type=int, default=100)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out-dir", type=Path, default=ROOT / "data" / "raw")
    args = ap.parse_args()

    students_path, tasks_path = write_sample_files(args.out_dir, args.students, args.seed)
    print(f"Generated {students_path} and {tasks_path}")


if __name__ == "__main__":
    main()
