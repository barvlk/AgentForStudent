"""لوحة تحكم المسؤول من سطر الأوامر.

أمثلة:
    python main.py setup                       # التهيئة لأول مرة (مفتاح + تشفير + حسابات)
    python main.py setup --demo                # نفس الشي لكن على بيانات تجريبية اصطناعية
    python main.py web                         # تشغيل واجهة الويب
    python main.py student 441126225           # ملخص طالب
    python main.py users set-password 441126225
    python main.py train                       # تدريب وتقييم نموذج التنبؤ
    python main.py backup                      # نسخة احتياطية مشفّرة
    python main.py                             # القائمة التفاعلية
"""

from __future__ import annotations

import argparse
import csv
import getpass
import io
import os
import platform
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path

import pandas as pd

from agentforstudent import __version__
from agentforstudent.config import PROJECT_ROOT, ConfigError, get_settings
from agentforstudent.data.academic_records import DataSourceError
from agentforstudent.logging_setup import setup_logging
from agentforstudent.security import crypto
from agentforstudent.security.auth import PasswordPolicyError
from agentforstudent.security.masking import mask_student_id


# ---------------------------------------------------------------------------
# أدوات الطباعة
# ---------------------------------------------------------------------------
class C:
    OK, WARN, ERR, INFO, BOLD, END = "\033[92m", "\033[93m", "\033[91m", "\033[96m", "\033[1m", "\033[0m"


def ok(msg: str) -> None:
    print(f"{C.OK}✔ {msg}{C.END}")


def warn(msg: str) -> None:
    print(f"{C.WARN}⚠ {msg}{C.END}")


def err(msg: str) -> None:
    print(f"{C.ERR}✘ {msg}{C.END}", file=sys.stderr)


def header(title: str) -> None:
    print(f"\n{C.BOLD}{C.INFO}== {title} =={C.END}")


def _rel(path: Path) -> Path:
    """مسار نسبي للعرض إن أمكن، وإلا المسار الكامل."""
    try:
        return path.relative_to(PROJECT_ROOT)
    except ValueError:
        return path


def _services():
    from agentforstudent.agent.services import AppServices

    return AppServices(get_settings())


# ---------------------------------------------------------------------------
# إدارة ملف .env والتشفير
# ---------------------------------------------------------------------------
ENV_FILE = PROJECT_ROOT / ".env"
ENV_EXAMPLE = PROJECT_ROOT / ".env.example"


def _set_env_value(name: str, value: str) -> None:
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []
    lines = [ln for ln in lines if not ln.startswith(f"{name}=")]
    lines.append(f"{name}={value}")
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.environ[name] = value  # حتى تقرأ العملية الحالية القيمة الجديدة
    get_settings.cache_clear()


def cmd_keygen(args) -> int:
    settings = get_settings()
    if settings.data_encryption_key and not args.force:
        warn("يوجد مفتاح تشفير بالفعل في .env. تغييره يمنع فتح الملفات المشفّرة الحالية.")
        warn("استخدم --force فقط إذا كنت متأكداً (وفك تشفير الملفات أولاً).")
        return 1
    key = crypto.generate_key()
    _set_env_value("DATA_ENCRYPTION_KEY", key)
    get_settings.cache_clear()
    ok("تم توليد مفتاح تشفير جديد وحفظه في .env")
    warn("احتفظ بنسخة من المفتاح في مكان آمن؛ بدونه لا يمكن استرجاع البيانات المشفّرة.")
    return 0


def cmd_encrypt(args) -> int:
    key = get_settings().require_encryption_key()
    src = Path(args.src)
    dst = Path(args.out) if args.out else src.with_name(src.name + ".enc")
    crypto.encrypt_file(src, dst, key)
    ok(f"تم التشفير: {src.name} → {dst}")
    if args.delete_source:
        src.unlink()
        ok(f"تم حذف الملف الأصلي غير المشفّر: {src.name}")
    return 0


def cmd_decrypt(args) -> int:
    key = get_settings().require_encryption_key()
    src = Path(args.src)
    dst = Path(args.out)
    crypto.decrypt_file(src, dst, key)
    ok(f"تم فك التشفير إلى: {dst}")
    warn("الملف الناتج غير مشفّر. احذفه بعد الانتهاء منه.")
    return 0


# ---------------------------------------------------------------------------
# التهيئة لأول مرة
# ---------------------------------------------------------------------------
def cmd_setup(args) -> int:
    header("التهيئة لأول مرة")
    if not ENV_FILE.exists():
        ENV_FILE.write_text(ENV_EXAMPLE.read_text(encoding="utf-8"), encoding="utf-8")
        ok("تم إنشاء ملف .env من .env.example")
    get_settings.cache_clear()
    settings = get_settings()

    if not settings.data_encryption_key:
        cmd_keygen(argparse.Namespace(force=False))
        settings = get_settings()

    if not settings.gemini_api_key:
        warn("GEMINI_API_KEY غير مضبوط في .env — المحادثة الذكية لن تعمل حتى تضيفه.")

    if args.demo:
        from agentforstudent.data.sample_data import write_sample_files

        students_path, tasks_path = write_sample_files(settings.data_dir / "raw")
        args.students, args.tasks = str(students_path), str(tasks_path)
        ok("تم توليد بيانات تجريبية اصطناعية (طلاب ومهام وهمية)")

    src = Path(args.students)
    if settings.students_file.exists():
        ok(f"ملف السجلات المشفّر موجود: {settings.students_file.name}")
    elif src.exists():
        crypto.encrypt_file(src, settings.students_file, settings.data_encryption_key)
        ok(f"تم تشفير سجلات الطلاب → {_rel(settings.students_file)}")
    else:
        err(f"لم يتم العثور على ملف السجلات: {src}")
        return 1

    services = _services()
    tasks_src = Path(args.tasks)
    if tasks_src.exists():
        with services.db.connect() as conn:
            has_tasks = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] > 0
        if not has_tasks:
            n = services.tasks.import_dataframe(pd.read_excel(tasks_src))
            ok(f"تم استيراد {n} مهام من {tasks_src.name}")

    demo_id = services.ensure_demo_account()
    if demo_id:
        ok(f"حساب العرض التجريبي جاهز: {demo_id}")

    created = services.auth.provision([i for i in services.records.student_ids() if i != demo_id])
    if created:
        out = settings.data_dir / "initial_credentials.csv"
        with out.open("w", encoding="utf-8-sig", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(["الرقم الجامعي", "كلمة المرور المؤقتة"])
            writer.writerows(created.items())
        ok(f"تم إنشاء {len(created)} حساب بكلمات مرور مؤقتة → {_rel(out)}")
        warn("وزّع كلمات المرور على الطلاب ثم احذف هذا الملف. سيُطلب من كل طالب تغييرها عند أول دخول.")
    else:
        ok("كل الحسابات موجودة مسبقاً.")

    ok("التهيئة اكتملت. شغّل: python main.py web")
    return 0


# ---------------------------------------------------------------------------
# المستخدمون والمهام
# ---------------------------------------------------------------------------
def _ask_new_password() -> str:
    pw = getpass.getpass("كلمة المرور الجديدة: ")
    if pw != getpass.getpass("تأكيد كلمة المرور: "):
        raise PasswordPolicyError("كلمتا المرور غير متطابقتين.")
    return pw


def cmd_users(args) -> int:
    services = _services()
    if args.action == "set-password":
        if not services.records.exists(args.student_id):
            err("الرقم الجامعي غير موجود في السجلات.")
            return 1
        services.auth.set_password(args.student_id, _ask_new_password(), must_change=args.temporary)
        ok(f"تم ضبط كلمة المرور للطالب {mask_student_id(args.student_id)}")
    elif args.action == "unlock":
        services.auth.unlock(args.student_id)
        ok("تم فك قفل الحساب.")
    elif args.action == "provision":
        created = services.auth.provision(services.records.student_ids(), overwrite=args.overwrite)
        out = get_settings().data_dir / "initial_credentials.csv"
        with out.open("w", encoding="utf-8-sig", newline="") as fh:
            csv.writer(fh).writerows([["الرقم الجامعي", "كلمة المرور المؤقتة"], *created.items()])
        ok(f"تم إنشاء {len(created)} كلمة مرور مؤقتة → {out}")
    return 0


def cmd_import_tasks(args) -> int:
    services = _services()
    n = services.tasks.import_dataframe(pd.read_excel(args.file))
    ok(f"تم استيراد {n} مهام.")
    return 0


# ---------------------------------------------------------------------------
# التقارير والتحليلات
# ---------------------------------------------------------------------------
def cmd_student(args) -> int:
    services = _services()
    profile = services.profile(args.student_id)
    if profile is None:
        err("لا يوجد سجل أكاديمي لهذا الرقم.")
        return 1

    header(f"{profile.name} — {profile.level}")
    print(f"المعدل: {profile.gpa:.2f} | الساعات المجتازة: {profile.earned_hours} | المقررات: {profile.courses_count}")
    if profile.failed_courses:
        warn("مقررات راسبة: " + "، ".join(profile.failed_courses))

    plan = services.weekly_plan(args.student_id)
    header("الإتقان وخطر التعثر")
    for f in plan.focus:
        print(f"  {f.label:<28} إتقان {f.mastery:>5.0%}   خطر {f.risk:>5.0%}   ساعات مقترحة {f.hours:g}")
    header("حلقة الوكيل (ReAct)")
    print("\n".join(f"  {line}" for line in plan.trace))

    if args.export:
        out = Path(args.export)
        transcript = services.records.transcript(args.student_id)
        with out.open("w", encoding="utf-8") as fh:
            fh.write(f"تقرير أكاديمي — {profile.name}\nالمستوى: {profile.level}\nالمعدل: {profile.gpa:.2f}\n")
            fh.write("=" * 50 + "\n")
            for r in transcript.itertuples():
                fh.write(f"الترم {r.term_no} | {r.course_name} | {r.score:g} ({r.letter})\n")
            fh.write("\n" + plan.to_text() + "\n")
        ok(f"تم حفظ التقرير: {out}")
    return 0


def cmd_train(args) -> int:
    services = _services()
    model = services.risk_model
    if model is None or model.metrics is None:
        err("تعذر تدريب النموذج.")
        return 1
    m = model.metrics
    header("تقييم نموذج التنبؤ بالتعثر (بيانات اختبار لطلاب لم يرهم النموذج)")
    print(f"  عينات التدريب/الاختبار : {m.n_train} / {m.n_test}")
    print(f"  نسبة الحالات المتعثرة   : {m.positive_rate:.1%}")
    print(f"  ROC-AUC               : {m.roc_auc:.3f}   (0.5 = تخمين عشوائي)")
    print(f"  F1 / Precision / Recall: {m.f1:.3f} / {m.precision:.3f} / {m.recall:.3f}")
    header("أهمية الخصائص")
    for name, imp in model.feature_importance().items():
        print(f"  {name:<20} {'█' * int(imp * 50)} {imp:.3f}")
    return 0


# ---------------------------------------------------------------------------
# التشغيل والصيانة
# ---------------------------------------------------------------------------
def cmd_web(args) -> int:
    app = PROJECT_ROOT / "app.py"
    print("تشغيل واجهة الويب... (Ctrl+C للإيقاف)")
    # قائمة معاملات بدل os.system(نص) لتجنب حقن الأوامر في الـ shell
    return subprocess.call([sys.executable, "-m", "streamlit", "run", str(app), "--server.port", str(args.port)])


def cmd_diag(args) -> int:
    settings = get_settings()
    header("تشخيص النظام")
    print(f"  الإصدار     : AgentForStudent {__version__}")
    print(f"  نظام التشغيل: {platform.system()} {platform.release()} | Python {platform.python_version()}")
    checks = [
        ("ملف .env", ENV_FILE.exists()),
        ("مفتاح Gemini", bool(settings.gemini_api_key)),
        ("مفتاح التشفير", bool(settings.data_encryption_key)),
        ("السجلات الأكاديمية", settings.students_file.exists()),
        ("السجلات مشفّرة", settings.students_file.suffix == ".enc"),
        ("قاعدة البيانات", settings.db_file.exists()),
    ]
    for name, passed in checks:
        (ok if passed else warn)(name)
    plain = [p.name for p in PROJECT_ROOT.glob("*.xlsx")]
    if plain:
        warn(f"ملفات Excel غير مشفّرة في جذر المشروع: {plain}")
    return 0 if all(p for _, p in checks) else 1


def cmd_audit(args) -> int:
    header("سجل التدقيق (آخر الأحداث)")
    for row in reversed(_services().auth.recent_audit(args.limit)):
        print(f"  {row['ts']}  {row['event']:<18} {row['subject'] or '-':<12} {row['detail'] or ''}")
    return 0


def cmd_logs(args) -> int:
    log_file = get_settings().log_dir / "agentforstudent.log"
    if not log_file.exists():
        warn("لا يوجد سجل بعد.")
        return 0
    lines = log_file.read_text(encoding="utf-8").splitlines()[-args.lines:]
    for line in lines:
        color = C.ERR if "ERROR" in line else C.WARN if "WARNING" in line else ""
        print(f"{color}{line}{C.END if color else ''}")
    return 0


def cmd_backup(args) -> int:
    """نسخة احتياطية مضغوطة ثم مشفّرة بالكامل (قاعدة البيانات + السجلات المشفّرة)."""
    settings = get_settings()
    key = settings.require_encryption_key()
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in (settings.students_file, settings.db_file):
            if path.exists():
                zf.write(path, path.name)
    out = settings.backup_dir / f"backup_{datetime.now():%Y%m%d_%H%M%S}.zip.enc"
    crypto.write_encrypted(out, buffer.getvalue(), key)
    ok(f"تم إنشاء نسخة احتياطية مشفّرة: {_rel(out)}")
    return 0


def cmd_chat(args) -> int:
    """محادثة تجريبية مع الوكيل من الطرفية (للمطور)."""
    from agentforstudent.agent.llm import GeminiChat, LLMError, build_system_prompt, summarize_transcript
    from agentforstudent.agent.tools import build_tools

    services = _services()
    profile = services.profile(args.student_id)
    if profile is None:
        err("لا يوجد سجل لهذا الرقم.")
        return 1
    settings = services.settings
    chat = GeminiChat(
        settings.require_api_key(),
        settings.model_name,
        build_system_prompt(profile, summarize_transcript(services.records.transcript(args.student_id))),
        build_tools(services, args.student_id),
        settings.temperature,
    )
    print("اكتب exit للخروج.")
    while True:
        try:
            msg = input(f"{C.BOLD}أنت > {C.END}").strip()
        except EOFError:
            break
        if msg.lower() in {"exit", "quit", "خروج"}:
            break
        if not msg:
            continue
        try:
            print(f"{C.OK}الوكيل:{C.END} {chat.send(msg)}\n")
        except LLMError as exc:
            err(str(exc))
    return 0


# ---------------------------------------------------------------------------
# القائمة التفاعلية
# ---------------------------------------------------------------------------
MENU = [
    ("تشغيل واجهة الويب", lambda: cmd_web(argparse.Namespace(port=8501))),
    ("ملخص وتحليل طالب", lambda: cmd_student(argparse.Namespace(student_id=_ask_id(), export=None))),
    ("تقييم نموذج التنبؤ", lambda: cmd_train(None)),
    ("تشخيص النظام", lambda: cmd_diag(None)),
    ("سجل التدقيق", lambda: cmd_audit(argparse.Namespace(limit=30))),
    ("سجلات النظام", lambda: cmd_logs(argparse.Namespace(lines=30))),
    ("نسخة احتياطية مشفّرة", lambda: cmd_backup(None)),
    ("محادثة تجريبية مع الوكيل", lambda: cmd_chat(argparse.Namespace(student_id=_ask_id()))),
]


def _ask_id() -> int:
    raw = input("الرقم الجامعي: ").strip()
    if not raw.isdigit():
        raise ValueError("الرقم الجامعي يجب أن يكون أرقاماً فقط.")
    return int(raw)


def interactive_menu() -> int:
    while True:
        header(f"AgentForStudent {__version__} — لوحة تحكم المسؤول")
        for i, (label, _) in enumerate(MENU, 1):
            print(f"  [{i}] {label}")
        print("  [0] خروج")
        choice = input("اختر: ").strip()
        if choice == "0":
            return 0
        if not choice.isdigit() or not 1 <= int(choice) <= len(MENU):
            warn("خيار غير صحيح.")
            continue
        try:
            MENU[int(choice) - 1][1]()
        except (ValueError, ConfigError, DataSourceError, PasswordPolicyError) as exc:
            err(str(exc))
        input("\nاضغط Enter للمتابعة...")


# ---------------------------------------------------------------------------
# نقطة الدخول
# ---------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="main.py", description="AgentForStudent admin console")
    sub = p.add_subparsers(dest="command")

    s = sub.add_parser("setup", help="التهيئة لأول مرة")
    s.add_argument("--students", default=str(PROJECT_ROOT / "data" / "raw" / "students_by_term_150.xlsx"))
    s.add_argument("--tasks", default=str(PROJECT_ROOT / "data" / "raw" / "tasks.xlsx"))
    s.add_argument("--demo", action="store_true", help="توليد بيانات تجريبية اصطناعية واستخدامها")
    s.set_defaults(func=cmd_setup)

    s = sub.add_parser("keygen", help="توليد مفتاح تشفير")
    s.add_argument("--force", action="store_true")
    s.set_defaults(func=cmd_keygen)

    s = sub.add_parser("encrypt", help="تشفير ملف")
    s.add_argument("src")
    s.add_argument("--out")
    s.add_argument("--delete-source", action="store_true")
    s.set_defaults(func=cmd_encrypt)

    s = sub.add_parser("decrypt", help="فك تشفير ملف")
    s.add_argument("src")
    s.add_argument("--out", required=True)
    s.set_defaults(func=cmd_decrypt)

    s = sub.add_parser("users", help="إدارة حسابات الطلاب")
    us = s.add_subparsers(dest="action", required=True)
    u = us.add_parser("set-password")
    u.add_argument("student_id", type=int)
    u.add_argument("--temporary", action="store_true", help="إجبار الطالب على التغيير عند الدخول")
    u = us.add_parser("unlock")
    u.add_argument("student_id", type=int)
    u = us.add_parser("provision")
    u.add_argument("--overwrite", action="store_true")
    s.set_defaults(func=cmd_users)

    s = sub.add_parser("import-tasks", help="استيراد مهام من Excel")
    s.add_argument("file")
    s.set_defaults(func=cmd_import_tasks)

    s = sub.add_parser("student", help="ملخص وتحليل طالب")
    s.add_argument("student_id", type=int)
    s.add_argument("--export", help="حفظ التقرير في ملف نصي")
    s.set_defaults(func=cmd_student)

    sub.add_parser("train", help="تدريب وتقييم نموذج التنبؤ").set_defaults(func=cmd_train)
    sub.add_parser("diag", help="تشخيص النظام").set_defaults(func=cmd_diag)
    sub.add_parser("backup", help="نسخة احتياطية مشفّرة").set_defaults(func=cmd_backup)

    s = sub.add_parser("audit", help="سجل التدقيق")
    s.add_argument("--limit", type=int, default=50)
    s.set_defaults(func=cmd_audit)

    s = sub.add_parser("logs", help="سجلات النظام")
    s.add_argument("--lines", type=int, default=40)
    s.set_defaults(func=cmd_logs)

    s = sub.add_parser("web", help="تشغيل واجهة الويب")
    s.add_argument("--port", type=int, default=8501)
    s.set_defaults(func=cmd_web)

    s = sub.add_parser("chat", help="محادثة تجريبية مع الوكيل")
    s.add_argument("student_id", type=int)
    s.set_defaults(func=cmd_chat)
    return p


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    setup_logging()
    args = build_parser().parse_args(argv)
    try:
        if not getattr(args, "command", None):
            return interactive_menu()
        return args.func(args)
    except (
        ConfigError, DataSourceError, PasswordPolicyError, crypto.DecryptionError, FileNotFoundError, ValueError
    ) as exc:
        err(str(exc))
        return 1
    except KeyboardInterrupt:
        print()
        return 130
