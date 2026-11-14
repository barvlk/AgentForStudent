"""تنسيق الواجهة (ثيم داكن بأسلوب Apple) ومكونات HTML آمنة.

أي نص يأتي من البيانات (اسم مادة، وصف مهمة...) يُمرَّر عبر ``html.escape``
قبل وضعه داخل HTML، لمنع هجمات XSS (حقن سكربت عبر اسم مهمة مثلاً).
"""

from __future__ import annotations

from html import escape

CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap');
html, body, [class*="css"], .stMarkdown, .stTextInput, .stButton, .stTabs { font-family: 'Tajawal', sans-serif; }
.stApp { direction: rtl; background: #000; color: #f5f5f7; }
[data-testid="stSidebar"] { background: #0f0f11; border-left: 1px solid #1c1c1e; }
#MainMenu, footer { visibility: hidden; }

.afs-card {
  background: #161618; border: 1px solid #2c2c2e; border-radius: 18px;
  padding: 20px; text-align: center; transition: border-color .2s, transform .2s;
}
.afs-card:hover { border-color: #0a84ff; transform: translateY(-2px); }
.afs-card .t { font-size: 13px; color: #86868b; margin-bottom: 8px; }
.afs-card .v { font-size: 28px; font-weight: 700; }

.afs-task {
  background: #0f0f11; border: 1px solid #1c1c1e; border-radius: 14px;
  padding: 14px 18px; margin-bottom: 4px;
}
.afs-task h4 { margin: 0; font-size: 16px; color: #fff; }
.afs-task p { margin: 6px 0 0; font-size: 13px; color: #86868b; }
.afs-muted { color: #86868b; font-size: 14px; }

div.stButton > button { border-radius: 12px; font-weight: 600; }
.stChatMessage { background: #111113; border: 1px solid #222225; border-radius: 18px; }
.stTabs [data-baseweb="tab-list"] { gap: 8px; background: #0a0a0c; padding: 6px; border-radius: 14px; }
.stTabs [aria-selected="true"] { background: #1c1c1e !important; border-radius: 10px; }
</style>
"""

PRIORITY_COLORS = {"عالية": "#ff453a", "متوسطة": "#ffd60a", "عادية": "#30d158"}


def stat_card(title: str, value: str, color: str = "#f5f5f7") -> str:
    return (
        f'<div class="afs-card"><div class="t">{escape(title)}</div>'
        f'<div class="v" style="color:{escape(color)}">{escape(value)}</div></div>'
    )


def task_card(course: str, title: str, priority: str, meta: str) -> str:
    color = PRIORITY_COLORS.get(priority, "#86868b")
    return (
        f'<div class="afs-task" style="border-right:5px solid {color}">'
        f"<h4>📚 {escape(course)} — {escape(title)}</h4>"
        f'<p>الأهمية: <b style="color:{color}">{escape(priority)}</b> · {escape(meta)}</p></div>'
    )
