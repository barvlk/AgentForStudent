import pandas as pd
import pytest

from agentforstudent.analytics.bkt import BKTModel, BKTParams, update
from agentforstudent.analytics.risk_model import RiskModel, build_feature_table

P = BKTParams(L0=0.5, T=0.1, G=0.2, S=0.1)


def test_bkt_update_direction():
    assert update(0.5, True, P) > 0.5
    assert update(0.5, False, P) < 0.5


def test_bkt_update_matches_formula():
    # posterior = 0.5*0.9 / (0.5*0.9 + 0.5*0.2) = 0.818181..., ثم + (1-post)*0.1
    post = 0.45 / 0.55
    assert update(0.5, True, P) == pytest.approx(post + (1 - post) * 0.1)


def test_bkt_invalid_params():
    with pytest.raises(ValueError):
        BKTParams(L0=1.5, T=0.1, G=0.2, S=0.1)


def test_bkt_no_data_returns_prior():
    est = BKTModel().estimate(pd.DataFrame(columns=["domain", "score", "term_no"]), "AI")
    assert not est.has_data and est.probability == 0.60


def test_bkt_strong_student_masters(records):
    transcript = pd.DataFrame({"domain": ["Math"] * 5, "score": [95] * 5, "term_no": range(1, 6)})
    assert BKTModel().estimate(transcript, "Math").probability > 0.9


def test_features_use_only_previous_terms(records):
    table = build_feature_table(records)
    assert table["term_no"].min() >= 2  # الترم الأول بلا تاريخ سابق فلا يدخل
    first = records[records["student_id"] == 441000000]
    term1 = first[first["term_no"] == 1]
    row = table[(table["student_id"] == 441000000) & (table["term_no"] == 2)].iloc[0]
    expected = (term1["score"] * term1["credits"]).sum() / term1["credits"].sum()
    assert row["prev_avg_score"] == pytest.approx(expected)


def test_risk_model_trains_and_predicts(records):
    model = RiskModel().fit(records)
    assert model.metrics is not None and 0 <= model.metrics.f1 <= 1
    risk = model.predict_domain_risk(records[records["student_id"] == 441000001], ("AI", "Math"))
    assert set(risk) == {"AI", "Math"} and all(0 <= v <= 1 for v in risk.values())
