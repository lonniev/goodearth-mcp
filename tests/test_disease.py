"""The five disease models, over hours built by hand.

The important case is the one that is NOT met. A model that only ever gets
tested on weather that triggers it will happily trigger on weather that should
not, and "no infection period this season" is the answer a Vermont grower gets
most years — it has to be right, and it has to say why.
"""

from __future__ import annotations

import re

import pytest

from goodearth_mcp import disease
from goodearth_mcp.wetness import Hour


def hours_for(day: str, pattern: list[tuple[float, float]], rain: float = 0.0) -> list[Hour]:
    """One day of hours from (rh, temp_f) pairs."""
    return [
        Hour(at=f"{day}T{i:02d}:00", temp_f=t, rh_pct=rh,
             dew_f=t - (1.0 if rh >= 90 else 12.0), precip_mm=rain)
        for i, (rh, t) in enumerate(pattern)
    ]


def day(d: str, humid_hours: int, temp: float = 60.0, rh_dry: float = 60.0) -> list[Hour]:
    """A day with `humid_hours` at or above 90%, the rest dry, all at `temp`."""
    return hours_for(d, [(95.0 if i < humid_hours else rh_dry, temp) for i in range(24)])


# ── Hutton — and the Frogdale case ───────────────────────────────────────


def test_two_consecutive_qualifying_days_meet_the_criteria():
    hours = day("2026-09-03", 7) + day("2026-09-04", 8)
    out = disease.hutton(hours)
    assert out["qualifying"] == [{"from": "2026-09-03", "to": "2026-09-04", "days": 2}]


def test_a_long_wet_spell_is_ONE_period_not_a_pair_for_every_overlap():
    """Hutton asks for two consecutive days, so a five-day spell holds four
    such pairs. Counting them gave Frogdale "13 periods" for six weather
    events — telling a grower the season was twice as bad as it was.
    """
    hours: list[Hour] = []
    for d in range(28, 32):
        hours += day(f"2026-07-{d:02d}", 9)
    hours += day("2026-08-01", 9)
    out = disease.hutton(hours)
    assert out["qualifying"] == [{"from": "2026-07-28", "to": "2026-08-01", "days": 5}]


def test_two_spells_with_a_dry_day_between_stay_two():
    hours = day("2026-07-01", 9) + day("2026-07-02", 9) + day("2026-07-03", 0) \
        + day("2026-07-04", 9) + day("2026-07-05", 9)
    assert [p["from"] for p in disease.hutton(hours)["qualifying"]] == ["2026-07-01", "2026-07-04"]


def test_a_lone_qualifying_day_is_not_a_spell():
    hours = day("2026-07-01", 9) + day("2026-07-02", 0) + day("2026-07-03", 9)
    assert disease.hutton(hours)["qualifying"] == []


def test_two_qualifying_days_that_are_not_consecutive_do_NOT_meet_it():
    # This is Frogdale's actual week on the feed the service uses: Aug 31 and
    # Sep 3 each cleared both bars, with two dry days between them. Hutton asks
    # for two days RUNNING, and this is the answer a grower must get.
    hours = (
        day("2026-08-31", 9)
        + day("2026-09-01", 3)
        + day("2026-09-02", 0)
        + day("2026-09-03", 7)
    )
    out = disease.hutton(hours)
    assert out["qualifying"] == []
    assert out["qualifying_days"] == ["2026-08-31", "2026-09-03"]
    # It must say WHICH criterion failed, not merely that one did.
    assert "CONSECUTIVE" in out["explain"]
    assert "2026-08-31" in out["explain"] and "2026-09-03" in out["explain"]


def test_a_cold_night_fails_on_temperature_and_the_day_says_so():
    hours = day("2026-09-03", 12, temp=45.0) + day("2026-09-04", 12, temp=45.0)
    out = disease.hutton(hours)
    assert out["qualifying"] == []
    assert all(d["humid_enough"] and not d["warm_enough"] for d in out["days"])


def test_a_warm_dry_day_fails_on_hours_and_the_day_says_so():
    out = disease.hutton(day("2026-09-03", 4, temp=70.0))
    assert out["days"][0]["warm_enough"] is True
    assert out["days"][0]["humid_enough"] is False
    assert out["days"][0]["humid_hours"] == 4


def test_hutton_counts_humidity_alone_and_not_rain():
    # Six hours of rain at 70% humidity. `wet` says yes, Hutton says no, and
    # Hutton is the published model.
    hours = hours_for("2026-09-03", [(70.0, 60.0)] * 24, rain=2.0)
    hours = [
        Hour(at=h.at, temp_f=h.temp_f, rh_pct=h.rh_pct, dew_f=h.temp_f - 2.0, precip_mm=h.precip_mm)
        for h in hours
    ]
    assert all(h.wet for h in hours)
    assert disease.hutton(hours)["days"][0]["humid_hours"] == 0


def test_an_empty_record_is_not_computed_rather_than_not_met():
    out = disease.assess({"model": "hutton", "disease": "late blight"}, [])
    assert out["risk"] == "not computed"
    assert out["at_risk"] is False


# ── Mills ────────────────────────────────────────────────────────────────


def test_mills_nine_hours_at_sixty_five_is_a_light_infection():
    hours = hours_for("2026-05-01", [(95.0, 65.0)] * 9 + [(50.0, 65.0)] * 15)
    out = disease.mills(hours)
    assert out["infection_periods"][0]["class"] == "light"


def test_mills_gets_harder_as_it_gets_colder():
    warm = disease.mills_requirement(65.0)
    cold = disease.mills_requirement(45.0)
    assert warm is not None and cold is not None
    assert cold[0] > warm[0], "a cold wet period needs MORE hours, not fewer"


def test_mills_eight_hours_at_sixty_five_is_no_infection_and_names_the_shortfall():
    hours = hours_for("2026-05-01", [(95.0, 65.0)] * 8 + [(50.0, 65.0)] * 16)
    out = disease.mills(hours)
    assert out["infection_periods"] == []
    assert "9 were needed" in out["periods"][0]["explain"]


def test_a_wet_period_outside_the_table_is_unanswered_not_negative():
    hours = hours_for("2026-01-01", [(95.0, 20.0)] * 30)
    out = disease.mills(hours)
    assert out["periods"][0]["class"] is None
    assert "outside the published table" in out["periods"][0]["explain"]


def test_mills_bridges_a_short_dry_break():
    # Five wet, one dry, five wet at 65 F. Strictly two runs of five and no
    # infection; the published model tolerates the break, and eleven hours is
    # past the nine a light infection needs.
    hours = hours_for("2026-05-01", [(95.0, 65.0)] * 5 + [(50.0, 65.0)] + [(95.0, 65.0)] * 5)
    assert disease.mills(hours)["infection_periods"] != []


# ── Wallin ───────────────────────────────────────────────────────────────


def test_wallin_accrues_severity_and_reports_the_total():
    # Three separate wet periods, each long enough at 70 F to score.
    hours: list[Hour] = []
    for d in ("2026-07-01", "2026-07-05", "2026-07-09"):
        hours += hours_for(d, [(95.0, 70.0)] * 20 + [(40.0, 70.0)] * 4)
    out = disease.wallin(hours)
    assert out["severity_total"] > 0
    assert len(out["periods"]) == 3


def test_wallin_reports_the_decision_point_without_saying_what_to_do():
    hours: list[Hour] = []
    for d in range(1, 12, 2):
        hours += hours_for(f"2026-07-{d:02d}", [(95.0, 70.0)] * 22 + [(40.0, 70.0)] * 2)
    out = disease.wallin(hours)
    assert out["severity_total"] >= disease.WALLIN_DECISION_SV
    assert out["at_decision_point"] is True
    assert "your extension service" in out["explain"]


def test_a_dry_season_accrues_nothing_and_says_so():
    hours = hours_for("2026-07-01", [(40.0, 70.0)] * 24)
    out = disease.wallin(hours)
    assert out["severity_total"] == 0
    assert out["risk"] == "none accrued"


# ── Botrytis ─────────────────────────────────────────────────────────────


def test_botrytis_takes_an_unbroken_stretch_at_temperature():
    hours = hours_for("2026-09-03", [(95.0, 62.0)] * 9 + [(40.0, 62.0)] * 15)
    out = disease.botrytis(hours)
    assert out["infection_periods"][0]["hours"] == 9


def test_botrytis_is_not_met_by_the_same_hours_split_in_two():
    hours = hours_for("2026-09-03", ([(95.0, 62.0)] * 5 + [(40.0, 62.0)] * 2) * 2 + [(40.0, 62.0)] * 10)
    out = disease.botrytis(hours)
    assert out["infection_periods"] == []
    assert out["longest_wet_run"]["hours"] == 5


def test_botrytis_names_the_longest_run_when_nothing_qualified():
    hours = hours_for("2026-09-03", [(95.0, 62.0)] * 4 + [(40.0, 62.0)] * 20)
    out = disease.botrytis(hours)
    assert out["infection_periods"] == []
    assert "4 hours" in out["explain"]


def test_a_cold_wet_night_needs_longer_than_a_warm_one():
    assert disease.botrytis_requirement(45.0) > disease.botrytis_requirement(72.0)


# ── Powdery mildew — the inverse case ────────────────────────────────────


def test_powdery_mildew_wants_humid_air_without_free_water():
    hours = hours_for("2026-07-15", [(80.0, 75.0)] * 10 + [(50.0, 75.0)] * 14)
    out = disease.powdery_mildew(hours)
    assert out["spells"] != []


def test_rain_works_against_powdery_mildew_rather_than_for_it():
    # The exact trap the request names: a naive wetness counter reads this
    # backwards. The same ten humid hours, now rained on, are NOT conducive.
    wet = [
        Hour(at=f"2026-07-15T{i:02d}:00", temp_f=75.0, rh_pct=80.0, dew_f=73.0, precip_mm=2.0)
        for i in range(10)
    ]
    out = disease.powdery_mildew(wet + hours_for("2026-07-16", [(50.0, 75.0)] * 14))
    assert out["spells"] == []
    assert "backwards" in out["explain"]


def test_saturated_air_is_past_powdery_mildews_band():
    hours = hours_for("2026-07-15", [(95.0, 75.0)] * 24)
    assert disease.powdery_mildew(hours)["spells"] == []


# ── Validation ───────────────────────────────────────────────────────────


def test_a_model_may_be_named_directly():
    assert disease.validate_model({"model": "hutton"})["model"] == "hutton"


def test_a_hyphen_is_forgiven():
    assert disease.validate_model({"model": "powdery-mildew"})["model"] == "powdery_mildew"


def test_a_bare_disease_name_resolves_when_exactly_one_model_claims_it():
    assert disease.validate_model({"disease": "grey mould"})["model"] == "botrytis"


def test_an_unknown_model_is_refused_with_the_alternatives_named():
    with pytest.raises(disease.DiseaseError) as exc:
        disease.validate_model({"model": "guesswork"})
    for key in disease.MODELS:
        assert key in str(exc.value)


def test_a_row_naming_nothing_is_refused_and_taught_the_shape():
    with pytest.raises(disease.DiseaseError) as exc:
        disease.validate_model({"disease": "something nobody published"})
    assert 'model="' in str(exc.value)


def test_a_non_object_is_refused():
    with pytest.raises(disease.DiseaseError):
        disease.validate_model("botrytis")


# ── The guardrail ────────────────────────────────────────────────────────

BANNED = re.compile(
    r"\b(spray|sprays|sprayed|apply|applied|dose|dosage|rates?|insecticide|"
    r"fungicide|pesticide|ml/|oz/|per acre|interval)\b",
    re.IGNORECASE,
)


def _every_string(obj) -> list[str]:
    if isinstance(obj, str):
        return [obj]
    if isinstance(obj, dict):
        return [s for v in obj.values() for s in _every_string(v)]
    if isinstance(obj, (list, tuple)):
        return [s for v in obj for s in _every_string(v)]
    return []


@pytest.mark.parametrize("key", sorted(disease.MODELS))
def test_no_model_names_a_treatment(key):
    """Conditions, never the treatment. A label rate is law, not advice."""
    hours: list[Hour] = []
    for d in range(1, 8):
        hours += day(f"2026-07-{d:02d}", 20, temp=70.0)
    out = disease.assess({"model": key, "disease": disease.MODELS[key]["disease"]}, hours)
    for text in _every_string(out):
        assert not BANNED.search(text), f"{key} said: {text!r}"


def test_the_shared_note_defers_to_extension_and_says_wetness_is_estimated():
    """The one string allowed to name a label rate is the one refusing to give one.

    The banned-words check above is aimed at a tool RECOMMENDING something. The
    disclaimer has to be able to say "a label rate is law" in order to explain
    why it will not — a guardrail that forbids its own reason for existing would
    only be satisfied by saying less.
    """
    assert "never measured" in disease.NOTE.lower() or "estimated" in disease.NOTE.lower()
    assert "extension service" in disease.NOTE
    assert "never recommends a treatment" in disease.NOTE
    # Everything banned EXCEPT the refusal's own vocabulary.
    without_the_refusal = disease.NOTE.replace("a label rate is law", "")
    assert not BANNED.search(without_the_refusal)


# ── What "risk" means ────────────────────────────────────────────────────
#
# The finding these exist for: run against Frogdale's real season, all five
# models reported risk — on a farm having its driest year in a decade. "Risk"
# had come to mean "at some point since January", which on any Vermont season
# is nearly always true and therefore says nothing.


def period(start: str, end: str = "") -> dict:
    return {"from": start, "to": end or start}


CUT = "2026-09-12T00:00"


def test_a_period_in_the_forecast_is_risk_now():
    when = disease.timeline([period("2026-09-15")], CUT, "2026-09-11")
    assert when["at_risk"] is True
    assert when["next_period"] == period("2026-09-15")
    assert when["last_period"] is None


def test_a_period_inside_the_recent_window_is_risk_now():
    when = disease.timeline([period("2026-09-05")], CUT, "2026-09-11")
    assert when["at_risk"] is True
    assert when["recent"] is True


def test_a_period_in_JUNE_is_not_risk_in_SEPTEMBER():
    """The whole point. Twenty infection periods is not an answer about today."""
    when = disease.timeline([period("2026-06-14"), period("2026-06-22")], CUT, "2026-09-11")
    assert when["at_risk"] is False
    assert when["recent"] is False
    assert when["season_count"] == 2
    assert when["last_period"] == period("2026-06-22")


def test_the_last_one_is_the_most_recent_and_not_merely_the_last_listed():
    when = disease.timeline(
        [period("2026-08-01"), period("2026-06-01"), period("2026-07-01")],
        CUT, "2026-09-11",
    )
    assert when["last_period"] == period("2026-08-01")


def test_a_period_at_the_cut_belongs_to_the_forecast_not_the_record():
    when = disease.timeline([period("2026-09-12")], CUT, "2026-09-11")
    assert when["next_period"] == period("2026-09-12")
    assert when["last_period"] is None


def test_nothing_at_all_is_an_answer_and_says_so():
    when = disease.timeline([], CUT, "2026-09-11")
    assert when["at_risk"] is False
    assert when["season_count"] == 0
    assert (when["last_period"], when["next_period"]) == (None, None)


def test_assess_leads_with_what_is_true_today():
    hours = day("2026-06-14", 9) + day("2026-06-15", 9)
    out = disease.assess(
        {"model": "hutton", "disease": "late blight"}, hours,
        forecast_from=CUT, today="2026-09-11",
    )
    assert out["at_risk"] is False
    assert "most recent was 2026-06-14" in out["now"]
    assert "1 this season" in out["now"]


def test_assess_names_the_date_the_forecast_implies():
    hours = day("2026-09-14", 9) + day("2026-09-15", 9)
    out = disease.assess(
        {"model": "hutton", "disease": "late blight"}, hours,
        forecast_from=CUT, today="2026-09-11",
    )
    assert out["at_risk"] is True
    assert "beginning 2026-09-14" in out["now"]


def test_wallins_cumulative_accrual_is_kept_separate_from_now():
    # A season past the decision point that has been dry for a month is two
    # different facts, and collapsing them would lose the one a grower needs.
    hours: list[Hour] = []
    for d in range(1, 12, 2):
        hours += hours_for(f"2026-07-{d:02d}", [(95.0, 70.0)] * 22 + [(40.0, 70.0)] * 2)
    out = disease.assess(
        {"model": "wallin", "disease": "early blight"}, hours,
        forecast_from=CUT, today="2026-09-11",
    )
    assert out["at_decision_point"] is True
    assert out["at_risk"] is False
