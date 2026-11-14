"""البحث المعرفي (Retrieval) في مذكرات المواد.

النسخة الأولى كانت تعدّ الكلمات المتطابقة حرفياً، فتفشل مع اختلاف الصيغة
("الشجرة" مقابل "شجرة"، أو "BST" مقابل "bst").
النسخة الحالية تستخدم TF-IDF على مستوى المقاطع الحرفية (character n-grams)
مع تشابه جيب التمام (Cosine Similarity)، وهي طريقة قوية مع العربية لأنها
تتحمل أدوات التعريف والسوابق واللواحق بدون الحاجة لمكتبة تجذير.

يمكن لاحقاً استبدال هذه الطبقة بقاعدة بيانات متجهات (Vector DB) بدون تغيير الواجهة ``search``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

DEFAULT_NOTES: dict[str, list[str]] = {
    "هياكل البيانات": [
        "شجرة البحث الثنائية (BST): زمن البحث والإدراج O(log n) إذا كانت متزنة، وقد يتردى إلى O(n) في أسوأ حالة.",
        "جداول الهاش (Hash Tables): بحث بمتوسط زمن O(1)، وتُعالج التصادمات بطريقة Chaining أو Open Addressing.",
        "خوارزمية الفرز السريع (QuickSort): تعتمد على مبدأ فرّق تسد باختيار عنصر محوري (Pivot)، بمتوسط O(n log n).",
        "المكدس والطابور (Stack & Queue): المكدس يتبع LIFO (آخر من يدخل أول من يخرج)، والطابور يتبع FIFO.",
    ],
    "نظم التشغيل": [
        "خوارزمية SJF (Shortest Job First): تنفذ العملية الأقصر أولاً فتقلل متوسط وقت الانتظار، لكنها قد تسبب المجاعة (Starvation).",
        "خوارزمية Round Robin: لكل عملية شريحة زمنية ثابتة (Time Quantum)، مناسبة للأنظمة التفاعلية.",
        "المجاعة (Starvation): عملية لا تحصل على المعالج لفترة طويلة، وتُحل بالتقادم (Aging) أي رفع أولويتها تدريجياً.",
        "الذاكرة الصفحية (Paging): تقسيم الذاكرة إلى صفحات متساوية الحجم لتجنب التجزئة الخارجية (External Fragmentation).",
    ],
    "أسس هندسة البرمجيات": [
        "منهجية أجايل (Agile): مرونة عالية وتسليم مستمر وتكيّف مع تغيّر المتطلبات عبر دورات قصيرة (Sprints).",
        "إطار سكروم (Scrum): أدوار محددة (Scrum Master, Product Owner, Team) واجتماع يومي قصير (Daily Standup).",
        "مخططات UML: معيار لتصميم الأنظمة، مثل Use Case Diagram لتفاعل المستخدم و Class Diagram لهيكل الأصناف.",
    ],
    "الأمن السيبراني": [
        "مثلث أمن المعلومات (CIA Triad): السرية (Confidentiality)، السلامة (Integrity)، التوافر (Availability).",
        "أنظمة كشف التسلل (IDS) تراقب وتنبّه عند السلوك المريب، بينما أنظمة منع التسلل (IPS) تحجب الهجوم مباشرة.",
        "تخزين كلمات المرور يكون بدوال hash بطيئة مع salt مثل bcrypt أو Argon2، وليس بتشفير قابل للعكس.",
    ],
    "الذكاء الاصطناعي": [
        "تتبع المعرفة البايزي (BKT): نموذج يقدّر احتمال إتقان الطالب لمهارة ويحدّثه بعد كل محاولة باستخدام قاعدة بايز.",
        "الغابة العشوائية (Random Forest): مجموعة أشجار قرار مدرّبة على عينات مختلفة، والتصويت بينها يقلل الإفراط في التخصيص (Overfitting).",
        "نمط ReAct للوكلاء: دورة تفكير (Thought) ثم فعل باستدعاء أداة (Action) ثم ملاحظة النتيجة (Observation).",
    ],
}

_ARABIC_DIACRITICS = re.compile(r"[ؗ-ًؚ-ْـ]")


def normalize_arabic(text: str) -> str:
    """توحيد الحروف العربية: إزالة التشكيل والتطويل، وتوحيد الألف والياء والتاء المربوطة."""
    text = _ARABIC_DIACRITICS.sub("", text.lower())
    text = re.sub("[إأآا]", "ا", text)
    return text.replace("ى", "ي").replace("ة", "ه")


@dataclass(frozen=True)
class SearchHit:
    category: str
    text: str
    score: float


class KnowledgeBase:
    def __init__(self, notes: dict[str, list[str]] | None = None, min_score: float = 0.08):
        self.notes = notes or DEFAULT_NOTES
        self.min_score = min_score
        self._docs = [(cat, note) for cat, items in self.notes.items() for note in items]
        self._vectorizer = TfidfVectorizer(
            analyzer="char_wb", ngram_range=(2, 4), preprocessor=normalize_arabic, sublinear_tf=True
        )
        self._matrix = self._vectorizer.fit_transform(f"{cat} {note}" for cat, note in self._docs)

    def search(self, query: str, top_k: int = 3) -> list[SearchHit]:
        query = (query or "").strip()
        if not query:
            return []
        scores = cosine_similarity(self._vectorizer.transform([query]), self._matrix)[0]
        ranked = scores.argsort()[::-1][:top_k]
        return [
            SearchHit(self._docs[i][0], self._docs[i][1], round(float(scores[i]), 3))
            for i in ranked
            if scores[i] >= self.min_score
        ]

    def search_text(self, query: str, top_k: int = 3) -> str:
        hits = self.search(query, top_k)
        if not hits:
            return "لم أجد معلومات مطابقة في المذكرات المحلية. يمكنك الشرح من معرفتك العامة مع التنويه بذلك."
        lines = ["نتائج البحث في المذكرات:"]
        lines += [f"- [{h.category}] (تطابق {h.score:.0%}): {h.text}" for h in hits]
        return "\n".join(lines)
