"""نموذج التنبؤ بالتعثر الأكاديمي (Random Forest).

السؤال الذي يجيب عنه النموذج: "بناءً على تاريخ الطالب في الترمات السابقة،
ما احتمال أن تقل درجته عن 75 في مقرر قادم من مجال معيّن؟"

تحسينات مقارنة بالنسخة الأولى:
- منع تسرّب البيانات (Data Leakage): الخصائص تُحسب من الترمات السابقة فقط،
  وليس من مقررات نفس الترم.
- تقسيم التدريب/الاختبار حسب الطالب (GroupShuffleSplit) حتى لا يظهر نفس الطالب في الاثنين.
- تقييم حقيقي للنموذج (ROC-AUC, F1, Precision, Recall) مقارنة بنموذج أساسي (Baseline).
- النموذج يُستخدم فعلياً للتنبؤ لكل طالب بدل أن يُدرّب ثم يُهمل.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit

log = logging.getLogger(__name__)

FEATURES = [
    "prev_avg_score",     # متوسط الدرجات الموزون بالساعات في الترمات السابقة
    "prev_gpa",           # المعدل (من النقاط) في الترمات السابقة
    "domain_prior_avg",   # متوسط الطالب السابق في نفس مجال المقرر
    "domain_prior_count", # عدد المقررات السابقة في نفس المجال
    "prev_fail_count",    # عدد مرات الرسوب السابقة
    "credits",            # ساعات المقرر
    "term_no",            # رقم الترم
]
DEFAULT_COURSE_CREDITS = 3


@dataclass(frozen=True)
class ModelMetrics:
    roc_auc: float
    f1: float
    precision: float
    recall: float
    positive_rate: float
    n_train: int
    n_test: int

    def as_dict(self) -> dict[str, float]:
        return {k: round(v, 3) if isinstance(v, float) else v for k, v in self.__dict__.items()}


def _history_features(history: pd.DataFrame, domain: str) -> dict[str, float]:
    graded = history[history["credits"] > 0]
    hours = graded["credits"].sum()
    prev_avg = float((graded["score"] * graded["credits"]).sum() / hours) if hours else float(history["score"].mean())
    prev_gpa = float((graded["points"] * graded["credits"]).sum() / hours) if hours else 0.0
    in_domain = history[history["domain"] == domain]
    return {
        "prev_avg_score": prev_avg,
        "prev_gpa": prev_gpa,
        "domain_prior_avg": float(in_domain["score"].mean()) if not in_domain.empty else prev_avg,
        "domain_prior_count": float(len(in_domain)),
        "prev_fail_count": float((~history["passed"]).sum()),
    }


def build_feature_table(records: pd.DataFrame, at_risk_threshold: float = 75.0) -> pd.DataFrame:
    """صف لكل (طالب، مقرر) من الترم الثاني فما فوق، بخصائص محسوبة من الترمات السابقة فقط."""
    rows: list[dict] = []
    data = records.dropna(subset=["score"])
    for student_id, student in data.groupby("student_id"):
        for term in sorted(student["term_no"].unique()):
            history = student[student["term_no"] < term]
            if history.empty:
                continue
            for _, course in student[student["term_no"] == term].iterrows():
                feats = _history_features(history, course["domain"])
                feats.update(
                    student_id=student_id,
                    credits=float(course["credits"]),
                    term_no=float(term),
                    at_risk=int(course["score"] < at_risk_threshold),
                )
                rows.append(feats)
    return pd.DataFrame(rows)


class RiskModel:
    def __init__(self, at_risk_threshold: float = 75.0, random_state: int = 42):
        self.at_risk_threshold = at_risk_threshold
        self.random_state = random_state
        self.model: RandomForestClassifier | None = None
        self.metrics: ModelMetrics | None = None

    def _new_estimator(self) -> RandomForestClassifier:
        return RandomForestClassifier(
            n_estimators=200,
            max_depth=6,
            min_samples_leaf=5,
            class_weight="balanced",
            random_state=self.random_state,
            n_jobs=-1,
        )

    def fit(self, records: pd.DataFrame) -> "RiskModel":
        table = build_feature_table(records, self.at_risk_threshold)
        if len(table) < 30 or table["at_risk"].nunique() < 2:
            raise ValueError("البيانات غير كافية لتدريب نموذج التنبؤ.")

        X, y, groups = table[FEATURES], table["at_risk"], table["student_id"]
        splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=self.random_state)
        train_idx, test_idx = next(splitter.split(X, y, groups))

        evaluator = self._new_estimator().fit(X.iloc[train_idx], y.iloc[train_idx])
        y_test = y.iloc[test_idx]
        proba = evaluator.predict_proba(X.iloc[test_idx])[:, 1]
        pred = (proba >= 0.5).astype(int)
        self.metrics = ModelMetrics(
            roc_auc=float(roc_auc_score(y_test, proba)) if y_test.nunique() > 1 else float("nan"),
            f1=float(f1_score(y_test, pred, zero_division=0)),
            precision=float(precision_score(y_test, pred, zero_division=0)),
            recall=float(recall_score(y_test, pred, zero_division=0)),
            positive_rate=float(y.mean()),
            n_train=len(train_idx),
            n_test=len(test_idx),
        )
        log.info("Risk model evaluated: %s", self.metrics.as_dict())

        # بعد التقييم نعيد التدريب على كل البيانات للاستخدام الفعلي
        self.model = self._new_estimator().fit(X, y)
        return self

    def feature_importance(self) -> dict[str, float]:
        if self.model is None:
            return {}
        return dict(
            sorted(zip(FEATURES, self.model.feature_importances_.round(3)), key=lambda kv: -kv[1])
        )

    def predict_domain_risk(self, transcript: pd.DataFrame, domains: tuple[str, ...]) -> dict[str, float]:
        """احتمال التعثر في المقرر القادم لكل مجال، بناءً على كامل سجل الطالب الحالي."""
        if self.model is None:
            raise RuntimeError("النموذج غير مدرّب. استدعِ fit() أولاً.")
        history = transcript.dropna(subset=["score"])
        if history.empty:
            return {}
        next_term = float(history["term_no"].max() + 1)
        rows = []
        for domain in domains:
            feats = _history_features(history, domain)
            feats.update(credits=float(DEFAULT_COURSE_CREDITS), term_no=next_term)
            rows.append(feats)
        proba = self.model.predict_proba(pd.DataFrame(rows)[FEATURES])[:, 1]
        return {d: round(float(p), 3) for d, p in zip(domains, np.asarray(proba))}
