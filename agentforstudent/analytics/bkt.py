"""تتبع المعرفة البايزي (Bayesian Knowledge Tracing).

لكل مجال (ذكاء اصطناعي، رياضيات، برمجة، أنظمة) نحتفظ باحتمال أن الطالب "أتقن" المهارة،
ونحدّثه بعد كل مقرر بقاعدة بايز:

1. الملاحظة: هل درجة الطالب في المقرر >= عتبة الإتقان (80 افتراضياً)؟
2. التحديث البعدي (Posterior):
   - إذا نجح:  P(L|صح)  = P(L)(1-S) / [P(L)(1-S) + (1-P(L))G]
   - إذا أخفق: P(L|خطأ) = P(L)S     / [P(L)S     + (1-P(L))(1-G)]
3. التعلّم (Transition):  P(L) = P(L|obs) + (1 - P(L|obs)) * T

حيث: L0 = الإتقان المبدئي، T = احتمال التعلم، G = احتمال التخمين، S = احتمال الزلة.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class BKTParams:
    L0: float  # prior: احتمال الإتقان قبل أي ملاحظة
    T: float   # transit: احتمال اكتساب المهارة بعد كل فرصة تعلم
    G: float   # guess: احتمال الأداء الجيد بدون إتقان
    S: float   # slip: احتمال الأداء الضعيف رغم الإتقان

    def __post_init__(self):
        for name in ("L0", "T", "G", "S"):
            value = getattr(self, name)
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be a probability in [0, 1], got {value}")


DEFAULT_PARAMS: dict[str, BKTParams] = {
    "AI": BKTParams(L0=0.60, T=0.02, G=0.20, S=0.15),
    "Math": BKTParams(L0=0.30, T=0.15, G=0.20, S=0.20),
    "Programming": BKTParams(L0=0.70, T=0.02, G=0.20, S=0.20),
    "Systems": BKTParams(L0=0.50, T=0.02, G=0.30, S=0.20),
}


@dataclass(frozen=True)
class MasteryEstimate:
    domain: str
    probability: float
    observations: int
    history: tuple[float, ...]

    @property
    def has_data(self) -> bool:
        return self.observations > 0

    @property
    def label(self) -> str:
        if not self.has_data:
            return "لا توجد بيانات"
        if self.probability >= 0.8:
            return "متقن"
        if self.probability >= 0.5:
            return "في طور الإتقان"
        return "يحتاج تقوية"


def update(p_mastery: float, correct: bool, params: BKTParams) -> float:
    """خطوة BKT واحدة: تحديث بايز ثم احتمال التعلم."""
    if correct:
        numerator = p_mastery * (1 - params.S)
        denominator = numerator + (1 - p_mastery) * params.G
    else:
        numerator = p_mastery * params.S
        denominator = numerator + (1 - p_mastery) * (1 - params.G)
    posterior = numerator / denominator if denominator > 0 else p_mastery
    return posterior + (1 - posterior) * params.T


class BKTModel:
    def __init__(self, params: dict[str, BKTParams] | None = None, mastery_threshold: float = 80.0):
        self.params = params or DEFAULT_PARAMS
        self.mastery_threshold = mastery_threshold

    def estimate(self, transcript: pd.DataFrame, domain: str) -> MasteryEstimate:
        params = self.params.get(domain, self.params["Math"])
        p = params.L0
        history = [p]
        rows = transcript[transcript["domain"] == domain].dropna(subset=["score"])
        for score in rows.sort_values("term_no")["score"]:
            p = update(p, score >= self.mastery_threshold, params)
            history.append(p)
        return MasteryEstimate(domain, round(p, 4), len(rows), tuple(round(h, 4) for h in history))

    def estimate_all(self, transcript: pd.DataFrame, domains: tuple[str, ...]) -> dict[str, MasteryEstimate]:
        return {d: self.estimate(transcript, d) for d in domains}
