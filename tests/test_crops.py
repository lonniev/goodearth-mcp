"""Crop timing — validation, accumulation, projection, and the frost verdict."""

from __future__ import annotations

from datetime import date

import pytest

from goodearth_mcp import crops

TODAY = date(2026, 8, 30)
# A season counting ~10 GDD/day from Jan 1.
DATES = [date(2026, 1, 1).replace(day=1).isoformat()]
SEASON_DATES = [(date(2026, 1, 1).toordinal() + i) for i in range(242)]
DS = [date.fromordinal(o).isoformat() for o in SEASON_DATES]
CUM = [round(i * 10.0, 1) for i in range(242)]


# ── Validation: tool input is adversarial ────────────────────────────────


def test_valid_planting_normalizes():
    p = crops.validate_planting({"crop": "Zinnia", "gdd_target": 780, "set_out": "2026-08-02"})
    assert p["crop"] == "Zinnia" and p["gdd_target"] == 780.0
    assert p["set_out"] == date(2026, 8, 2) and p["base_temp_f"] is None


def test_name_alias_is_accepted():
    assert crops.validate_planting({"name": "Celosia", "gdd_target": 900, "set_out": "2026-06-20"})["crop"] == "Celosia"


@pytest.mark.parametrize("bad", [None, "zinnia", 42, [], {}])
def test_non_object_plantings_are_rejected(bad):
    with pytest.raises(crops.CropError):
        crops.validate_planting(bad)


def test_missing_name_is_rejected():
    with pytest.raises(crops.CropError):
        crops.validate_planting({"gdd_target": 780, "set_out": "2026-08-02"})


@pytest.mark.parametrize("target", [0, -5, 99_999, "lots", None])
def test_absurd_targets_are_rejected(target):
    with pytest.raises(crops.CropError):
        crops.validate_planting({"crop": "X", "gdd_target": target, "set_out": "2026-08-02"})


@pytest.mark.parametrize("d", ["yesterday", "2026-13-01"])
def test_bad_set_out_dates_are_rejected(d):
    """A date that is not a date is still a refusal — that is a typo, not a gap."""
    with pytest.raises(crops.CropError):
        crops.validate_planting({"crop": "X", "gdd_target": 780, "set_out": d})


@pytest.mark.parametrize("d", ["", None])
def test_a_planting_with_no_set_out_is_a_presence_record(d):
    """"Potatoes grow here; I do not recall when they went in" is a true thing.

    It used to be unsayable, and the only way to record the crop was to invent
    a date — which then propagated into every GDD answer and every calibration
    drawn from it. A presence row carries no date, so nothing can count from it.
    """
    row = crops.validate_planting({"crop": "Potato", "gdd_target": 1800, "set_out": d})
    assert row["set_out"] is None
    assert row["presence_only"] is True
    assert row["crop"] == "Potato"


def test_celsius_base_temp_is_rejected():
    """18 °C would look like a plausible base and silently halve the count."""
    with pytest.raises(crops.CropError):
        crops.validate_planting({"crop": "X", "gdd_target": 780, "set_out": "2026-08-02", "base_temp": 18})


# ── Accumulation is re-based to the planting ─────────────────────────────


def test_accumulated_since_rebases_from_set_out():
    """The season counts from Jan 1; a planting counts from the day it went out."""
    got = crops.accumulated_since(DS, CUM, date(2026, 8, 2))
    assert got is not None
    acc, days = got
    assert acc == pytest.approx(CUM[-1] - CUM[DS.index("2026-08-02")])
    assert days == len(DS) - DS.index("2026-08-02")


def test_a_planting_set_out_after_the_record_has_not_started():
    assert crops.accumulated_since(DS, CUM, date(2027, 5, 1)) is None


def test_mismatched_series_are_refused():
    assert crops.accumulated_since(DS, CUM[:-3], date(2026, 8, 2)) is None
    assert crops.accumulated_since([], [], date(2026, 8, 2)) is None


# ── Rate and projection ──────────────────────────────────────────────────


def test_recent_rate_uses_the_tail_not_the_whole_season():
    slow_then_fast = [0.0] * 100 + [i * 20.0 for i in range(1, 15)]
    assert crops.recent_rate(slow_then_fast) > 10.0


def test_recent_rate_is_never_negative():
    assert crops.recent_rate([100.0, 90.0]) == 0.0


def test_projection_reaches_the_target_at_the_recent_rate():
    d = crops.project_target_date(accumulated=500, target=600, rate=10, today=TODAY)
    assert d == date(2026, 9, 9)


def test_no_projection_without_a_rate():
    """A stalled season must not produce a confident date."""
    assert crops.project_target_date(500, 600, 0, TODAY) is None


def test_no_projection_past_the_horizon():
    assert crops.project_target_date(0, 10_000, 1, TODAY) is None


def test_already_past_target_projects_nothing():
    assert crops.project_target_date(700, 600, 10, TODAY) is None


# ── Status ───────────────────────────────────────────────────────────────


def _status(target, set_out):
    p = crops.validate_planting({"crop": "X", "gdd_target": target, "set_out": set_out})
    return crops.status(p, DS, CUM, TODAY)


def test_status_reports_progress_and_remaining():
    s = _status(500, "2026-08-02")
    assert s["state"] in {"on_pace", "past_target"}
    assert s["gdd_remaining"] == round(max(500 - s["gdd_accumulated"], 0), 1)
    assert 0 <= s["progress"] <= 1


def test_past_target_says_so_and_offers_no_date():
    s = _status(50, "2026-08-02")
    assert s["state"] == "past_target"
    assert s["projected_date"] is None


def test_not_yet_planted_is_a_state_not_an_error():
    s = _status(500, "2027-04-01")
    assert s["state"] == "not_yet_planted"


# ── Finish before frost ──────────────────────────────────────────────────


def test_a_planting_that_lands_before_frost_finishes():
    st = {"state": "on_pace", "projected_date": "2026-09-14", "recent_rate_gdd_per_day": 10}
    v = crops.finish_before_frost(st, "2026-09-28", "2026-09-08")
    assert v["verdict"] == "finishes" and v["margin_days"] == 14


def test_a_planting_past_frost_wont_finish_and_reports_the_shortfall():
    st = {"state": "on_pace", "projected_date": "2026-10-09", "recent_rate_gdd_per_day": 12}
    v = crops.finish_before_frost(st, "2026-09-28", "2026-09-08")
    assert v["verdict"] == "wont_finish"
    assert v["margin_days"] == -11
    assert v["gdd_shortfall"] == pytest.approx(132.0)


def test_early_frost_risk_is_flagged_separately_from_the_median():
    """Median and earliest support different decisions — plan vs hedge."""
    st = {"state": "on_pace", "projected_date": "2026-09-20", "recent_rate_gdd_per_day": 10}
    v = crops.finish_before_frost(st, "2026-09-28", "2026-09-08")
    assert v["verdict"] == "finishes"
    assert v["at_risk_of_early_frost"] is True


def test_already_finished_makes_frost_moot():
    assert crops.finish_before_frost({"state": "past_target"}, "2026-09-28", None)["verdict"] == "finished"


def test_no_frost_record_yields_unknown_not_a_guess():
    st = {"state": "on_pace", "projected_date": "2026-09-14", "recent_rate_gdd_per_day": 10}
    assert crops.finish_before_frost(st, None, None)["verdict"] == "unknown"


def test_no_projection_yields_unknown():
    st = {"state": "stalled", "projected_date": None, "recent_rate_gdd_per_day": 0}
    assert crops.finish_before_frost(st, "2026-09-28", None)["verdict"] == "unknown"
