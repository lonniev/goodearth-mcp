"""Calibration — the loop that lets a block correct the model.

These tests carry more weight than most: this is the one module that can
change every other answer, so its guards against a bad observation are the
guards against a poisoned model.
"""

from __future__ import annotations

from datetime import date

import pytest

from goodearth_mcp import calibration as cal

# ── Validation ───────────────────────────────────────────────────────────


def test_a_frost_report_needs_only_a_date():
    o = cal.validate_observation({"kind": "frost", "observed_on": "2026-10-02"})
    assert o["kind"] == "frost" and o["observed_on"] == date(2026, 10, 2)


def test_a_stage_report_needs_the_crop_target_and_set_out():
    o = cal.validate_observation({
        "kind": "stage", "observed_on": "2026-07-31", "crop": "Dahlia",
        "gdd_target": 1200, "set_out": "2026-05-24", "stage": "first bloom"})
    assert o["crop"] == "Dahlia" and o["gdd_target"] == 1200.0


@pytest.mark.parametrize("bad", [None, "frost", 3, [], {}])
def test_non_object_observations_are_rejected(bad):
    with pytest.raises(cal.CalibrationError):
        cal.validate_observation(bad)


@pytest.mark.parametrize("kind", ["", "bloom", "weather", None])
def test_unknown_kinds_are_rejected(kind):
    with pytest.raises(cal.CalibrationError):
        cal.validate_observation({"kind": kind, "observed_on": "2026-10-02"})


@pytest.mark.parametrize("d", ["", "last tuesday", "2026-13-40", None])
def test_bad_dates_are_rejected(d):
    with pytest.raises(cal.CalibrationError):
        cal.validate_observation({"kind": "frost", "observed_on": d})


def test_a_stage_seen_before_it_was_planted_is_rejected():
    """A transposed pair of dates would otherwise yield a negative accumulation."""
    with pytest.raises(cal.CalibrationError):
        cal.validate_observation({
            "kind": "stage", "observed_on": "2026-05-01", "crop": "Dahlia",
            "gdd_target": 1200, "set_out": "2026-05-24"})


def test_a_stage_without_a_target_is_rejected():
    with pytest.raises(cal.CalibrationError):
        cal.validate_observation({
            "kind": "stage", "observed_on": "2026-07-31", "crop": "Dahlia",
            "set_out": "2026-05-24"})


def test_notes_are_truncated_not_rejected():
    o = cal.validate_observation({
        "kind": "frost", "observed_on": "2026-10-02", "note": "x" * 900})
    assert len(o["note"]) == 400


# ── Heat bias ────────────────────────────────────────────────────────────


def test_more_heat_than_expected_is_a_positive_bias():
    assert cal.heat_bias_from_stage(1320, 1200) == pytest.approx(0.1)


def test_less_heat_than_expected_is_a_negative_bias():
    assert cal.heat_bias_from_stage(1080, 1200) == pytest.approx(-0.1)


def test_a_zero_target_yields_no_bias_rather_than_dividing_by_zero():
    assert cal.heat_bias_from_stage(1000, 0) is None


# ── Summarising, and the guards ──────────────────────────────────────────


def test_the_median_is_used_so_one_bad_entry_moves_it_by_one_rank():
    """A mean would let a single typo drag the whole correction."""
    s = cal.summarize([0.10, 0.11, 0.12, 0.13, 0.30], cal.MAX_HEAT_BIAS)
    assert s["median"] == pytest.approx(0.12)


def test_an_implausible_value_is_set_aside_not_averaged_in():
    s = cal.summarize([0.10, 0.11, 0.12, 5.0], cal.MAX_HEAT_BIAS)
    assert s["n"] == 3
    assert s["rejected_as_implausible"] == 1
    assert s["median"] == pytest.approx(0.11)


def test_below_the_minimum_a_bias_is_recorded_but_not_applied():
    """One observation is an anecdote. It must not rewrite a farm's calendar."""
    s = cal.summarize([0.20], cal.MAX_HEAT_BIAS)
    assert s["n"] == 1
    assert s["applicable"] is False
    assert "3 are needed" in s["why_not"]


def test_at_the_minimum_it_becomes_applicable():
    s = cal.summarize([0.10, 0.11, 0.12], cal.MAX_HEAT_BIAS)
    assert s["applicable"] is True
    assert s["why_not"] is None


def test_all_implausible_yields_nothing_rather_than_a_wrong_answer():
    assert cal.summarize([9.0, -9.0], cal.MAX_HEAT_BIAS) is None


def test_summarize_of_nothing_is_none():
    assert cal.summarize([], cal.MAX_HEAT_BIAS) is None


def test_spread_is_reported_so_disagreement_is_visible():
    s = cal.summarize([0.05, 0.10, 0.30], cal.MAX_HEAT_BIAS)
    assert s["spread"] == pytest.approx(0.25)


def test_a_frost_bias_beyond_a_month_is_implausible():
    s = cal.summarize([2.0, 3.0, 45.0], float(cal.MAX_DAY_BIAS))
    assert s["rejected_as_implausible"] == 1


# ── Confidence ───────────────────────────────────────────────────────────


def test_confidence_is_provisional_below_the_minimum():
    assert cal.confidence(1, 0.0, cal.MAX_HEAT_BIAS) == "provisional"
    assert cal.confidence(2, 0.0, cal.MAX_HEAT_BIAS) == "provisional"


def test_confidence_settles_with_many_agreeing_observations():
    assert cal.confidence(10, 0.02, cal.MAX_HEAT_BIAS) == "settled"


def test_wide_disagreement_stays_early_however_many_reports():
    assert cal.confidence(12, cal.MAX_HEAT_BIAS, cal.MAX_HEAT_BIAS) == "early"


def test_confidence_firms_in_between():
    assert cal.confidence(6, cal.MAX_HEAT_BIAS * 0.4, cal.MAX_HEAT_BIAS) == "firming"
