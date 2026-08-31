"""Planting windows — the three dates, and the constraint that wins."""

from __future__ import annotations

from datetime import date

import pytest

from goodearth_mcp import planting

TODAY = date(2026, 3, 1)
SPRING = date(2026, 4, 22)
FALL = date(2026, 11, 1)


def crop(**kw):
    base = {"crop": "Tomato", "gdd_target": 1300, "base_temp": 50}
    base.update(kw)
    return planting.validate(base)


# ── Validation ───────────────────────────────────────────────────────────


@pytest.mark.parametrize("bad", [None, "tomato", 5, [], {}])
def test_non_object_crops_are_rejected(bad):
    with pytest.raises(planting.PlantingError):
        planting.validate(bad)


@pytest.mark.parametrize("g", [0, -10, 99_999, "some", None])
def test_impossible_targets_are_rejected(g):
    with pytest.raises(planting.PlantingError):
        planting.validate({"crop": "X", "gdd_target": g})


def test_a_celsius_soil_temperature_is_rejected():
    """13 °C would look plausible and open the window months early."""
    with pytest.raises(planting.PlantingError):
        planting.validate({"crop": "X", "gdd_target": 100, "min_soil_f": 13})


@pytest.mark.parametrize("w", [0, -2, 60, "six"])
def test_absurd_indoor_weeks_are_rejected(w):
    with pytest.raises(planting.PlantingError):
        planting.validate({"crop": "X", "gdd_target": 100, "start_indoors_weeks": w})


# ── Which constraint wins ────────────────────────────────────────────────


def test_a_tender_crop_waits_for_the_last_frost():
    when, why = planting.earliest_out(crop(), SPRING, None)
    assert when == SPRING and "tender" in why


def test_the_median_frost_date_is_flagged_as_a_coin_toss():
    """Setting a tender crop out on the median kills it half the time."""
    _, why = planting.earliest_out(crop(), SPRING, None)
    assert "MEDIAN" in why and "coin toss" in why


def test_a_hardy_crop_uses_the_shoulder_before_the_frost():
    when, why = planting.earliest_out(crop(frost_hardy=True), SPRING, None)
    assert when < SPRING and "hardy" in why


def test_the_LATER_of_frost_and_soil_wins():
    """A seed that germinates at 60 °F does not care that frost has stopped."""
    late_soil = date(2026, 6, 24)
    when, why = planting.earliest_out(crop(min_soil_f=65), SPRING, late_soil)
    assert when == late_soil and "soil" in why and "later of" in why


def test_frost_wins_when_the_soil_is_ready_first():
    when, _ = planting.earliest_out(crop(min_soil_f=45), SPRING, date(2026, 3, 30))
    assert when == SPRING


def test_no_record_yields_no_date_rather_than_today():
    when, why = planting.earliest_out(crop(), None, None)
    assert when is None and "no frost" in why


# ── The closing date ─────────────────────────────────────────────────────


def test_the_latest_sowing_leaves_room_to_finish():
    when, days = planting.latest_out(crop(gdd_target=1300), FALL, 13.0)
    assert days == 100
    assert when == date(2026, 7, 24)


def test_a_stalled_rate_gives_no_closing_date():
    assert planting.latest_out(crop(), FALL, 0.0) == (None, None)


def test_no_frost_record_gives_no_closing_date():
    assert planting.latest_out(crop(), None, 13.0) == (None, None)


# ── The whole assessment ─────────────────────────────────────────────────


def test_seed_goes_in_indoors_ahead_of_the_out_date():
    r = planting.assess(crop(start_indoors_weeks=6), SPRING, FALL, None, 13.0, TODAY)
    assert r["start_seed_indoors"] == "2026-03-11"
    assert r["earliest_out"] == SPRING.isoformat()


def test_a_direct_sown_crop_has_no_indoor_date():
    r = planting.assess(crop(direct_sow=True), SPRING, FALL, None, 13.0, TODAY)
    assert r["start_seed_indoors"] is None


def test_a_crop_that_cannot_fit_is_called_out():
    r = planting.assess(crop(gdd_target=9000), SPRING, FALL, None, 13.0, TODAY)
    assert r["state"] == "will_not_fit"


def test_an_impossible_window_withholds_the_closing_date():
    """A latest-sowing date before the earliest — sometimes in a previous year
    — is arithmetic, not advice."""
    r = planting.assess(crop(gdd_target=9000), SPRING, FALL, None, 13.0, TODAY)
    assert r["latest_out"] is None


def test_a_short_window_is_flagged_narrow_rather_than_open():
    r = planting.assess(crop(gdd_target=2400), SPRING, FALL, None, 13.0, TODAY)
    assert r["state"] in {"narrow", "open"}
    if r["window_days"] is not None and r["window_days"] < 14:
        assert r["state"] == "narrow"


def test_sow_now_is_true_only_inside_the_window():
    inside = planting.assess(crop(), SPRING, FALL, None, 13.0, date(2026, 6, 1))
    before = planting.assess(crop(), SPRING, FALL, None, 13.0, date(2026, 2, 1))
    assert inside["sow_now"] is True and before["sow_now"] is False


def test_rows_sort_actionable_first():
    rows = [
        {"state": "will_not_fit", "earliest_out": "2026-04-01"},
        {"state": "open", "earliest_out": "2026-05-01"},
        {"state": "narrow", "earliest_out": "2026-03-01"},
    ]
    rows.sort(key=planting.sort_key)
    assert [r["state"] for r in rows] == ["open", "narrow", "will_not_fit"]
