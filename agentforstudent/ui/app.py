"""تطبيق الويب للطلاب.

التدفق:
    تسجيل الدخول (رقم جامعي + كلمة مرور)
      → تغيير كلمة المرور إجبارياً إن كانت مؤقتة
      → مساحة العمل: المحادثة | لوحة الأداء | المهام
    مع انتهاء الجلسة تلقائياً بعد فترة خمول.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import date

import pandas as pd
import streamlit as st

from agentforstudent.agent.llm import (
    GeminiChat,
    LLMError,
    build_system_prompt,
    local_greeting,
    summarize_transcript,
)
from agentforstudent.agent.services import AppServices
from agentforstudent.agent.study_planner import DOMAIN_LABELS
from agentforstudent.agent.tools import build_tools
from agentforstudent.config import ConfigError, get_settings
from agentforstudent.data.academic_records import DataSourceError
from agentforstudent.data.tasks_repository import PRIORITIES
from agentforstudent.logging_setup import setup_logging
from agentforstudent.security.auth import LoginStatus, PasswordPolicyError
from agentforstudent.ui.styles import CSS, stat_card, task_card

log = logging.getLogger(__name__)

QUICK_PROMPTS = {
    "📌 مهامي الأهم": "وش أهم مهامي ومواعيدي الحين؟ رتبها لي.",
    "📈 خطة رفع المعدل": "عطني خطة مذاكرة لهالأسبوع بناءً على نقاط ضعفي.",
    "🧠 وين أنا ضعيف؟": "حلل لي مستواي في كل مجال ووين أحتاج أركز.",
}


# ---------------------------------------------------------------------------
# التهيئة
# ---------------------------------------------------------------------------
def load_streamlit_secrets() -> None:
    """نقل Secrets (في Streamlit Cloud) إلى متغيرات البيئة حتى تقرأها طبقة الإعدادات.

    Streamlit لا يضع الأسرار في متغيرات البيئة إلا بعد أول قراءة لـ st.secrets،
    وطبقة الإعدادات تقرأ من os.environ، فنقرأها هنا صراحةً قبل تحميل الإعدادات.
    """
    try:
        secrets = dict(st.secrets)
    except Exception as exc:  # noqa: BLE001 — لا يوجد ملف secrets (تشغيل محلي بملف .env)
        st.session_state["_secrets_status"] = f"تعذر قراءة Secrets: {type(exc).__name__}"
        return
    # أسماء المفاتيح فقط (بدون القيم) لتشخيص مشاكل النشر
    st.session_state["_secrets_status"] = "المفاتيح الموجودة في Secrets: " + (", ".join(sorted(secrets)) or "لا شيء")
    for key, value in secrets.items():
        if isinstance(value, (str, int, float, bool)) and key not in os.environ:
            os.environ[key] = str(value)
    get_settings.cache_clear()


@st.cache_resource(show_spinner="جاري تهيئة النظام وتدريب نموذج التنبؤ...")
def get_services() -> AppServices:
    load_streamlit_secrets()
    setup_logging()
    services = AppServices(get_settings())
    services.bootstrap_public_demo()  # على السيرفر العام: بيانات وهمية تلقائياً
    services.ensure_demo_account()  # حساب العرض التجريبي موجود دائماً (إن كان مضبوطاً في .env)
    _ = services.records  # تحميل وفك تشفير السجلات مرة واحدة
    _ = services.risk_model
    return services


def is_public_demo_account(settings, student_id: int | None) -> bool:
    """هل نحن في وضع العرض العام وحساب العرض مضبوط؟ (ومع student_id: هل هو حساب العرض؟)"""
    configured = settings.public_demo and settings.demo_student_id and settings.demo_password
    if student_id is None:
        return bool(configured)
    return bool(configured) and student_id == settings.demo_student_id


def logout(reason: str | None = None) -> None:
    st.session_state.clear()
    if reason:
        st.session_state.flash = reason


def enforce_session_timeout(timeout_minutes: int) -> None:
    now = time.time()
    last = st.session_state.get("last_activity", now)
    if st.session_state.get("student_id") and now - last > timeout_minutes * 60:
        logout("انتهت الجلسة بسبب عدم النشاط. سجّل دخولك مرة أخرى.")
        st.rerun()
    st.session_state.last_activity = now


# ---------------------------------------------------------------------------
# تسجيل الدخول
# ---------------------------------------------------------------------------
def render_login(services: AppServices) -> None:
    _, center, _ = st.columns([1, 1.3, 1])
    with center:
        st.markdown("<br><br>", unsafe_allow_html=True)
        st.markdown("<h1 style='text-align:center'>AgentForStudent</h1>", unsafe_allow_html=True)
        st.markdown(
            "<p class='afs-muted' style='text-align:center'>المساعد الأكاديمي الذكي — جامعة أم القرى</p>",
            unsafe_allow_html=True,
        )
        if msg := st.session_state.pop("flash", None):
            st.info(msg)

        settings = services.settings
        if is_public_demo_account(settings, None):
            st.info(
                f"🔓 **نسخة عرض تجريبية** ببيانات وهمية\n\n"
                f"الرقم الجامعي: `{settings.demo_student_id}`  ·  كلمة المرور: `{settings.demo_password}`"
            )

        with st.form("login", clear_on_submit=False):
            sid = st.text_input("الرقم الجامعي", max_chars=12, placeholder="مثال: 441126225")
            pw = st.text_input("كلمة المرور", type="password", max_chars=72)
            submitted = st.form_submit_button("تسجيل الدخول", type="primary", width="stretch")

        if not submitted:
            return
        sid = sid.strip()
        if not sid.isdigit() or not pw:
            st.warning("أدخل رقماً جامعياً صحيحاً وكلمة المرور.")
            return

        if is_public_demo_account(settings, int(sid)):
            # الحساب التجريبي العام كلمة مروره منشورة؛ نمنع أي زائر من قفله على الباقين
            services.auth.ensure_fixed_password(int(sid), settings.demo_password)
        result = services.auth.authenticate(int(sid), pw)
        if result.status is LoginStatus.LOCKED:
            st.error(f"تم قفل الحساب مؤقتاً بسبب محاولات متكررة. حاول بعد {result.locked_minutes_left} دقيقة.")
            return
        # نفس الرسالة سواء كان الرقم غير موجود أو كلمة المرور خاطئة
        if not result.ok or services.profile(int(sid)) is None:
            st.error("الرقم الجامعي أو كلمة المرور غير صحيحة.")
            return

        st.session_state.student_id = int(sid)
        st.session_state.must_change_password = result.must_change_password
        st.rerun()


def render_change_password(services: AppServices, student_id: int, forced: bool) -> None:
    _, center, _ = st.columns([1, 1.3, 1])
    with center:
        st.subheader("تغيير كلمة المرور")
        if forced:
            st.info("كلمة مرورك الحالية مؤقتة. لازم تغيّرها قبل المتابعة.")
        with st.form("change_pw"):
            old = st.text_input("كلمة المرور الحالية", type="password")
            new = st.text_input("كلمة المرور الجديدة", type="password", help="8 خانات على الأقل، حرف ورقم.")
            confirm = st.text_input("تأكيد كلمة المرور الجديدة", type="password")
            ok = st.form_submit_button("حفظ", type="primary", width="stretch")
        if not ok:
            return
        if new != confirm:
            st.error("كلمتا المرور غير متطابقتين.")
            return
        try:
            if services.auth.change_password(student_id, old, new):
                st.session_state.must_change_password = False
                st.session_state.flash_ok = "تم تغيير كلمة المرور بنجاح ✅"
                st.rerun()
            else:
                st.error("كلمة المرور الحالية غير صحيحة.")
        except PasswordPolicyError as exc:
            st.error(str(exc))


# ---------------------------------------------------------------------------
# مساحة العمل
# ---------------------------------------------------------------------------
def render_sidebar(services: AppServices, profile) -> None:
    with st.sidebar:
        st.markdown(f"### 🎓 {profile.name}")
        st.caption(f"{profile.level}")
        st.divider()
        st.markdown(f"**📈 المعدل التراكمي:** {profile.gpa:.2f} / 4.00")
        st.markdown(f"**⏱️ الساعات المجتازة:** {profile.earned_hours}")
        st.markdown(f"**📚 عدد المقررات:** {profile.courses_count}")
        st.divider()
        ai_ready = bool(services.settings.gemini_api_key)
        st.markdown("**حالة النظام**")
        st.write(("🟢" if ai_ready else "🔴") + " الذكاء الاصطناعي")
        st.write(("🟢" if services.risk_model else "🟡") + " نموذج التنبؤ")
        st.write("🔒 البيانات مشفّرة" if services.settings.students_file.suffix == ".enc" else "⚠️ البيانات غير مشفّرة")
        st.divider()
        if not is_public_demo_account(services.settings, profile.student_id) and st.button(
            "🔑 تغيير كلمة المرور", width="stretch"
        ):
            st.session_state.show_change_pw = True
            st.rerun()
        if st.button("🚪 تسجيل خروج", width="stretch"):
            services.auth.audit("logout", profile.student_id)
            logout("تم تسجيل الخروج.")
            st.rerun()


def render_dashboard(services: AppServices, profile) -> None:
    transcript = services.records.transcript(profile.student_id)
    analytics = services.analytics(profile.student_id)

    c1, c2, c3, c4 = st.columns(4)
    c1.markdown(stat_card("المعدل التراكمي", f"{profile.gpa:.2f}", "#30d158"), unsafe_allow_html=True)
    c2.markdown(stat_card("الساعات المجتازة", str(profile.earned_hours), "#0a84ff"), unsafe_allow_html=True)
    c3.markdown(stat_card("عدد المقررات", str(profile.courses_count), "#ff9f0a"), unsafe_allow_html=True)
    c4.markdown(
        stat_card("مقررات راسبة", str(len(profile.failed_courses)), "#ff453a" if profile.failed_courses else "#30d158"),
        unsafe_allow_html=True,
    )

    st.markdown("#### 🧠 الإتقان وخطر التعثر لكل مجال")
    st.caption("الإتقان محسوب بنموذج BKT، وخطر التعثر هو احتمال أن تقل درجتك عن 75 في المقرر القادم (Random Forest).")
    cols = st.columns(len(analytics.mastery))
    for col, (domain, est) in zip(cols, analytics.mastery.items()):
        with col:
            st.markdown(f"**{DOMAIN_LABELS.get(domain, domain)}**")
            st.progress(est.probability, text=f"الإتقان {est.probability:.0%} · {est.label}")
            risk = analytics.risk.get(domain)
            if risk is not None:
                st.progress(risk, text=f"خطر التعثر {risk:.0%}")

    left, right = st.columns(2)
    with left:
        st.markdown("#### 📈 متوسط الدرجات لكل ترم")
        by_term = transcript.groupby("term_no")["score"].mean().rename("متوسط الدرجة")
        by_term.index = [f"ترم {t}" for t in by_term.index]
        st.line_chart(by_term, height=280, color="#0a84ff")
    with right:
        st.markdown("#### 📊 الدرجات حسب المقرر")
        st.bar_chart(transcript.set_index("course_name")["score"], height=280, color="#30d158")

    st.markdown("#### 🗓️ خطة المذاكرة المقترحة لهالأسبوع")
    hours = st.slider("كم ساعة تقدر تذاكر هالأسبوع؟", 2, 40, 10)
    plan = services.weekly_plan(profile.student_id, hours)
    plan_df = pd.DataFrame(
        [
            {"المجال": f.label, "الساعات": f.hours, "الإتقان": f"{f.mastery:.0%}", "خطر التعثر": f"{f.risk:.0%}"}
            for f in plan.focus
        ]
    )
    st.dataframe(plan_df, hide_index=True, width="stretch")
    with st.expander("كيف فكّر الوكيل؟ (ReAct trace)"):
        st.code("\n".join(plan.trace), language="text")

    with st.expander("📄 السجل الأكاديمي الكامل"):
        st.dataframe(
            transcript[["term_no", "course_code", "course_name", "credits", "score", "letter"]].rename(
                columns={
                    "term_no": "الترم", "course_code": "الرمز", "course_name": "المقرر",
                    "credits": "الساعات", "score": "الدرجة", "letter": "التقدير",
                }
            ),
            hide_index=True,
            width="stretch",
        )


def render_tasks(services: AppServices, student_id: int) -> None:
    scheduled = services.scheduled_tasks(student_id)

    with st.expander("➕ إضافة مهمة جديدة", expanded=not scheduled):
        with st.form("add_task", clear_on_submit=True):
            c1, c2 = st.columns(2)
            course = c1.text_input("المادة", max_chars=100)
            title = c2.text_input("المهمة", max_chars=200, placeholder="واجب، كويز، مشروع...")
            c3, c4, c5 = st.columns(3)
            priority = c3.selectbox("الأهمية", PRIORITIES)
            due = c4.date_input("موعد التسليم", value=None, min_value=date(2020, 1, 1))
            est = c5.number_input("الوقت المتوقع (ساعات)", min_value=0.0, max_value=200.0, value=0.0, step=0.5)
            if st.form_submit_button("إضافة", type="primary"):
                try:
                    services.tasks.add(student_id, course, title, priority, due, est or None)
                    services.auth.audit("task_added", student_id)
                    st.success("تمت إضافة المهمة.")
                    st.rerun()
                except ValueError as exc:
                    st.error(str(exc))

    if not scheduled:
        st.success("🎉 ما عندك مهام معلقة.")
        return

    st.caption("الترتيب حسب درجة أولوية تجمع الأهمية وقرب الموعد، وعند التساوي المهمة الأقصر أولاً (SJF).")
    for s in scheduled:
        meta = f"الموعد: {s.due_label} · درجة الأولوية: {s.score}/100"
        if s.task.est_hours:
            meta += f" · {s.task.est_hours:g} ساعة"
        card, actions = st.columns([6, 1])
        card.markdown(task_card(s.task.course, s.task.title, s.task.priority, meta), unsafe_allow_html=True)
        if actions.button("✅", key=f"done_{s.task.id}", help="تم الإنجاز"):
            services.tasks.set_done(student_id, s.task.id)
            st.rerun()
        if actions.button("🗑️", key=f"del_{s.task.id}", help="حذف"):
            services.tasks.delete(student_id, s.task.id)
            st.rerun()


def render_chat(services: AppServices, profile) -> None:
    settings = services.settings
    if not settings.gemini_api_key:
        st.warning("المحادثة غير مفعلة: لم يتم ضبط GEMINI_API_KEY في ملف .env")
        return

    if "messages" not in st.session_state:
        st.session_state.messages = [{"role": "assistant", "content": local_greeting(profile)}]
        st.session_state.api_history = []

    cols = st.columns(len(QUICK_PROMPTS))
    quick = None
    for col, (label, prompt) in zip(cols, QUICK_PROMPTS.items()):
        if col.button(label, width="stretch"):
            quick = prompt

    for msg in st.session_state.messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

    prompt = st.chat_input("اكتب سؤالك هنا...", max_chars=2000) or quick
    if not prompt:
        return

    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    transcript = services.records.transcript(profile.student_id)
    chat = GeminiChat(
        api_key=settings.gemini_api_key,
        model=settings.model_name,
        system_prompt=build_system_prompt(profile, summarize_transcript(transcript)),
        tools=build_tools(services, profile.student_id),
        temperature=settings.temperature,
        history=st.session_state.api_history,
    )
    with st.chat_message("assistant"):
        with st.spinner("يفكر ويستخدم الأدوات..."):
            try:
                reply = chat.send(prompt)
                st.session_state.api_history = chat.history
            except LLMError as exc:
                reply = f"⚠️ {exc}"
        st.markdown(reply)
    st.session_state.messages.append({"role": "assistant", "content": reply})


def render_workspace(services: AppServices) -> None:
    student_id = st.session_state.student_id
    profile = services.profile(student_id)
    if profile is None:
        logout("تعذر العثور على سجلك الأكاديمي.")
        st.rerun()

    render_sidebar(services, profile)
    if msg := st.session_state.pop("flash_ok", None):
        st.toast(msg)

    if st.session_state.get("show_change_pw"):
        render_change_password(services, student_id, forced=False)
        if st.button("رجوع"):
            st.session_state.show_change_pw = False
            st.rerun()
        return

    if "notified" not in st.session_state:
        for s in services.scheduled_tasks(student_id)[:3]:
            if s.overdue or (s.days_left is not None and s.days_left <= 2):
                st.toast(f"🚨 {s.task.title} — {s.task.course} ({s.due_label})")
        st.session_state.notified = True

    tab_chat, tab_dash, tab_tasks = st.tabs(["💬 المساعد الذكي", "📊 لوحة الأداء", "📅 المهام"])
    with tab_dash:
        render_dashboard(services, profile)
    with tab_tasks:
        render_tasks(services, student_id)
    with tab_chat:
        render_chat(services, profile)


def main() -> None:
    st.set_page_config(page_title="AgentForStudent | UQU", page_icon="🎓", layout="wide")
    st.markdown(CSS, unsafe_allow_html=True)

    try:
        services = get_services()
    except (ConfigError, DataSourceError) as exc:
        st.error(f"خطأ في إعداد النظام: {exc}")
        st.info(
            "محلياً: شغّل `python main.py setup` أو `python main.py setup --demo`.\n\n"
            "على Streamlit Cloud: تأكد أن Secrets فيها `AFS_PUBLIC_DEMO = \"true\"` و `DATA_ENCRYPTION_KEY` "
            "ثم أعد تشغيل التطبيق (Manage app ← Reboot app)."
        )
        if status := st.session_state.get("_secrets_status"):
            st.caption(f"🔎 تشخيص: {status}")
        st.stop()

    enforce_session_timeout(services.settings.session_timeout_minutes)

    student_id = st.session_state.get("student_id")
    if student_id is None:
        render_login(services)
    elif st.session_state.get("must_change_password"):
        render_change_password(services, student_id, forced=True)
    else:
        render_workspace(services)
