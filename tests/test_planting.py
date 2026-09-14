"""Planting windows — the three dates, and the constraint that wins."""

from __future__ import annotations

from datetime import date, timedelta
from itertools import pairwise

import pytest

from goodearth_mcp import gdd, planting

TODAY = date(2026, 3, 1)
SPRING = date(2026, 4, 22)
FALL = date(2026, 11, 1)


def climate(rate_for) -> gdd.Climate:
    """Typical heat for every calendar day, from a function of the month."""
    day, out = date(2024, 1, 1), {}
    while day.year == 2024:
        out[day.strftime("%m-%d")] = rate_for(day.month)
        day += timedelta(days=1)
    return out


#: Thirteen degree-days every day of the year — the old single-rate world.
FLAT = climate(lambda m: 13.0)


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
    when, days = planting.latest_out(crop(gdd_target=1300), FALL, FLAT)
    assert days == 100
    assert when == date(2026, 7, 24)


def test_a_season_with_no_heat_gives_no_closing_date():
    assert planting.latest_out(crop(), FALL, climate(lambda m: 0.0)) == (None, None)
    assert planting.latest_out(crop(), FALL, {}) == (None, None)


def test_no_frost_record_gives_no_closing_date():
    assert planting.latest_out(crop(), None, FLAT) == (None, None)


def test_a_late_sowing_is_given_septembers_heat_not_julys():
    """The old single rate treated a September day as a July day, which made
    the last sowing optimistic exactly where a succession is decided."""
    seasonal = climate(lambda m: 20.0 if m in (6, 7, 8) else 5.0 if m in (9, 10) else 0.0)
    when, _ = planting.latest_out(crop(gdd_target=600), FALL, seasonal)
    # October and September give 305 degree-days; the other 295 need 15 August days.
    assert when == date(2026, 8, 17)
    assert planting.finish_date(when, 600, seasonal) < FALL
    assert planting.finish_date(when + timedelta(days=1), 600, seasonal) >= FALL

    # The same June–October heat spread as one average rate — the old way —
    # dates the last sowing a month later, and a sowing that late never
    # finishes on this ground at all.
    average = 2145 / 153  # (92 days × 20 + 61 days × 5) / 153 days
    flat_when, _ = planting.latest_out(
        crop(gdd_target=600), FALL, climate(lambda m: average if 6 <= m <= 10 else 0.0),
    )
    assert flat_when > when + timedelta(days=28)
    late = planting.finish_date(flat_when, 600, seasonal)
    assert late is None or late >= FALL


def test_the_closing_date_and_the_finish_are_the_same_arithmetic():
    when, _ = planting.latest_out(crop(gdd_target=1300), FALL, FLAT)
    assert planting.finish_date(when, 1300, FLAT) == FALL - timedelta(days=1)


def test_the_typical_heat_of_a_day_is_its_average_over_the_record():
    clim = gdd.climatology(
        ["2024-07-01", "2025-07-01", "2025-07-02"], [90.0, 80.0, 70.0], [70.0, 60.0, 50.0], 50.0,
    )
    assert clim == {"07-01": 25.0, "07-02": 10.0}


# ── The whole assessment ─────────────────────────────────────────────────


def test_seed_goes_in_indoors_ahead_of_the_out_date():
    r = planting.assess(crop(start_indoors_weeks=6), SPRING, FALL, None, FLAT, TODAY)
    assert r["start_seed_indoors"] == "2026-03-11"
    assert r["earliest_out"] == SPRING.isoformat()


def test_a_direct_sown_crop_has_no_indoor_date():
    r = planting.assess(crop(direct_sow=True), SPRING, FALL, None, FLAT, TODAY)
    assert r["start_seed_indoors"] is None


def test_a_crop_that_cannot_fit_is_called_out():
    r = planting.assess(crop(gdd_target=9000), SPRING, FALL, None, FLAT, TODAY)
    assert r["state"] == "will_not_fit"


def test_an_impossible_window_withholds_the_closing_date():
    """A latest-sowing date before the earliest — sometimes in a previous year
    — is arithmetic, not advice."""
    r = planting.assess(crop(gdd_target=9000), SPRING, FALL, None, FLAT, TODAY)
    assert r["latest_out"] is None


def test_a_short_window_is_flagged_narrow_rather_than_open():
    r = planting.assess(crop(gdd_target=2400), SPRING, FALL, None, FLAT, TODAY)
    assert r["state"] in {"narrow", "open"}
    if r["window_days"] is not None and r["window_days"] < 14:
        assert r["state"] == "narrow"


def test_sow_now_is_true_only_inside_the_window():
    inside = planting.assess(crop(), SPRING, FALL, None, FLAT, date(2026, 6, 1))
    before = planting.assess(crop(), SPRING, FALL, None, FLAT, date(2026, 2, 1))
    assert inside["sow_now"] is True and before["sow_now"] is False


# ── Successions ──────────────────────────────────────────────────────────


@pytest.mark.parametrize("every", [0, 2, 61, "often", 14.5, True])
def test_an_impossible_interval_is_rejected(every):
    with pytest.raises(planting.PlantingError):
        planting.validate({"crop": "Zinnia", "gdd_target": 900, "succession_days": every})


def test_successions_are_only_given_when_asked_for():
    assert "successions" not in planting.assess(crop(), SPRING, FALL, None, FLAT, TODAY)


def test_a_sowing_every_fortnight_from_the_first_day_out_to_the_last():
    r = planting.assess(crop(gdd_target=900, succession_days=14), SPRING, FALL, None, FLAT, TODAY)
    rows = r["successions"]
    outs = [date.fromisoformat(s["out"]) for s in rows]
    assert outs[0] == SPRING
    assert all(b - a == timedelta(days=14) for a, b in pairwise(outs))
    assert outs[-1] <= date.fromisoformat(r["latest_out"]) < outs[-1] + timedelta(days=14)
    assert [s["n"] for s in rows] == list(range(1, len(rows) + 1))


def test_every_succession_carries_its_own_finish_and_verdict():
    rows = planting.assess(
        crop(gdd_target=900, succession_days=14), SPRING, FALL, None, FLAT, TODAY,
        earliest_frost=date(2026, 10, 1),
    )["successions"]
    assert all(s["verdict"] == "finishes" and s["margin_days"] > 0 for s in rows)
    # Later sowings finish later and with less room — each is its own answer.
    margins = [s["margin_days"] for s in rows]
    assert margins == sorted(margins, reverse=True)
    # The late ones land after the earliest frost on record, and say so.
    assert rows[0]["at_risk_of_early_frost"] is False
    assert rows[-1]["at_risk_of_early_frost"] is True


def test_a_season_already_under_way_schedules_from_today():
    today = date(2026, 6, 3)
    rows = planting.assess(
        crop(gdd_target=900, succession_days=10), SPRING, FALL, None, FLAT, today,
    )["successions"]
    assert rows[0]["out"] == today.isoformat()


def test_no_successions_are_offered_once_the_last_sowing_has_passed():
    r = planting.assess(
        crop(gdd_target=900, succession_days=14), SPRING, FALL, None, FLAT, date(2026, 10, 20),
    )
    assert r["successions"] == []


def test_a_transplanted_succession_carries_its_own_indoor_date():
    rows = planting.assess(
        crop(gdd_target=900, succession_days=21, start_indoors_weeks=4),
        SPRING, FALL, None, FLAT, TODAY,
    )["successions"]
    for s in rows:
        assert date.fromisoformat(s["out"]) - date.fromisoformat(s["start_seed_indoors"]) == timedelta(days=28)


def test_rows_sort_actionable_first():
    rows = [
        {"state": "will_not_fit", "earliest_out": "2026-04-01"},
        {"state": "open", "earliest_out": "2026-05-01"},
        {"state": "narrow", "earliest_out": "2026-03-01"},
    ]
    rows.sort(key=planting.sort_key)
    assert [r["state"] for r in rows] == ["open", "narrow", "will_not_fit"]
