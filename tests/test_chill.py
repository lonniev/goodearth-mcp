"""Winter chill — the sine day, the winter that crosses a year, and the summary.

The arithmetic here is the only new mathematics trees needed, and it is exactly
checkable by hand at three points, so it is checked there rather than against
a fixture nobody can verify.
"""

from __future__ import annotations

from datetime import date

import pytest

from goodearth_mcp import chill

# ── One day, modelled as a sine ──────────────────────────────────────────


def test_the_midpoint_is_half_the_day():
    """THE ANCHOR. A threshold at the day's mean splits it in two, whatever
    the swing — if this drifts, every figure downstream is wrong by the same
    factor and nothing else will show it."""
    assert chill.hours_below(60.0, 40.0, 50.0) == pytest.approx(12.0)
    assert chill.hours_below(80.0, 20.0, 50.0) == pytest.approx(12.0)


def test_a_threshold_at_the_maximum_is_the_whole_day():
    assert chill.hours_below(45.0, 25.0, 45.0) == pytest.approx(24.0)


def test_a_threshold_at_the_minimum_is_none_of_it():
    assert chill.hours_below(45.0, 25.0, 25.0) == pytest.approx(0.0)


def test_a_day_entirely_below_the_threshold_is_all_of_it():
    assert chill.hours_below(30.0, 10.0, 45.0) == 24.0


def test_a_day_entirely_above_the_threshold_is_none_of_it():
    assert chill.hours_below(70.0, 50.0, 45.0) == 0.0


def test_a_flat_day_has_no_swing_to_integrate():
    """tmax == tmin happens in a record and must not divide by zero."""
    assert chill.hours_below(40.0, 40.0, 45.0) == 24.0
    assert chill.hours_below(50.0, 50.0, 45.0) == 0.0


def test_hours_below_rises_with_the_threshold():
    prev = -1.0
    for t in range(20, 70, 5):
        got = chill.hours_below(60.0, 30.0, float(t))
        assert got >= prev
        prev = got


# ── The model is the one the nursery tag was written against ─────────────


def test_a_freezing_day_banks_the_whole_day():
    """No lower bound, deliberately.

    A 32-45 °F band is the tempting refinement and it is the wrong yardstick
    here: under it a Vermont January banks NOTHING, and this would report a
    short chill on ground that grows apples commercially. The figure on the
    tag comes from the model with no floor, so this uses it.
    """
    assert chill.daily_chill(20.0, 0.0) == pytest.approx(24.0)


def test_a_day_wholly_below_the_ceiling_banks_the_whole_day():
    assert chill.daily_chill(44.0, 34.0) == pytest.approx(24.0)


def test_a_day_straddling_the_ceiling_banks_part_of_itself():
    got = chill.daily_chill(55.0, 35.0)
    assert 0.0 < got < 24.0


def test_a_warm_day_banks_nothing():
    assert chill.daily_chill(70.0, 50.0) == 0.0


def test_a_caller_who_wants_a_banded_model_can_ask_for_one():
    assert chill.daily_chill(20.0, 0.0, low_f=32.0) == pytest.approx(0.0)


# ── Winters, which cross the year boundary ───────────────────────────────


def test_november_belongs_to_the_winter_it_starts():
    """A December night and the February that follows are ONE winter. Grouping
    by calendar year would split every dormancy in half and report two short
    seasons where there was one whole one."""
    assert chill.dormancy_ending(date(2025, 11, 15)) == 2026
    assert chill.dormancy_ending(date(2025, 12, 31)) == 2026
    assert chill.dormancy_ending(date(2026, 1, 15)) == 2026
    assert chill.dormancy_ending(date(2026, 2, 10)) == 2026


def test_the_window_excludes_the_shoulders():
    assert chill.in_dormancy(date(2026, 1, 1))
    assert chill.in_dormancy(date(2025, 11, 1))
    assert chill.in_dormancy(date(2026, 2, 15))
    assert not chill.in_dormancy(date(2026, 2, 16))
    assert not chill.in_dormancy(date(2025, 10, 31))
    assert not chill.in_dormancy(date(2025, 7, 1))


def _winter_record(
    ending: int, tmax: float, tmin: float,
) -> tuple[list[str], list[float], list[float]]:
    """Every day of one dormancy window, at a fixed temperature."""
    dates: list[str] = []
    d = date(ending - 1, 11, 1)
    while d <= date(ending, 2, 15):
        dates.append(d.isoformat())
        d = date.fromordinal(d.toordinal() + 1)
    return dates, [tmax] * len(dates), [tmin] * len(dates)


def test_a_whole_winter_of_chilly_days_banks_every_hour_of_it():
    dates, hi, lo = _winter_record(2026, 44.0, 34.0)
    [w] = chill.banked(dates, hi, lo)
    assert w["winter"] == 2026
    assert w["days"] == len(dates)
    assert w["hours"] == pytest.approx(24.0 * len(dates))


def test_days_outside_the_window_are_not_counted():
    dates, hi, lo = _winter_record(2026, 44.0, 34.0)
    # A chilly October and a chilly March, either side of the window.
    extra = ["2025-10-15", "2026-03-01"]
    [w] = chill.banked(dates + extra, hi + [44.0] * 2, lo + [34.0] * 2)
    assert w["days"] == len(dates)


def test_a_leap_year_february_is_grouped_by_DATE_not_by_offset():
    """Daymet drops 31 December in leap years and every feed disagrees about
    how many days a year has, so a slice taken by index silently shifts. This
    is the guard: the record is 2024's, a leap year, and the answer must be
    driven by what the dates say."""
    dates, hi, lo = _winter_record(2024, 40.0, 36.0)
    assert "2024-02-15" in dates
    [w] = chill.banked(dates, hi, lo)
    assert w["winter"] == 2024
    assert w["from"] == "2023-11-01"
    assert w["to"] == "2024-02-15"


def test_a_missing_day_banks_nothing_and_is_counted_as_a_gap():
    dates, hi, lo = _winter_record(2026, 44.0, 34.0)
    hi = list(hi)
    hi[5] = None
    [w] = chill.banked(dates, hi, lo)
    assert w["gaps"] == 1
    assert w["days"] == len(dates) - 1


def test_an_unparseable_date_is_skipped_rather_than_fatal():
    dates, hi, lo = _winter_record(2026, 44.0, 34.0)
    [w] = chill.banked([*dates, "not-a-date"], [*hi, 40.0], [*lo, 30.0])
    assert w["days"] == len(dates)


# ── The summary a grower plans against ───────────────────────────────────


def _winters(*hours: float) -> list[dict]:
    return [
        {"winter": 2020 + i, "hours": h, "days": 107, "gaps": 0,
         "from": f"{2019 + i}-11-01", "to": f"{2020 + i}-02-15"}
        for i, h in enumerate(hours)
    ]


def test_the_summary_reports_the_median_AND_the_lowest():
    """They support different decisions: the median is what to plant for, the
    lowest is what a marginal cultivar is actually tested by."""
    s = chill.summarize(_winters(900.0, 1000.0, 1100.0, 700.0, 1200.0))
    assert s["median_hours"] == 1000.0
    assert s["lowest_hours"] == 700.0
    assert s["highest_hours"] == 1200.0
    assert s["winters_on_record"] == 5


def test_a_partial_winter_is_not_counted_as_a_season():
    """A record that covers six weeks of a dormancy would report a low winter
    that never happened, and drag the median with it."""
    ws = _winters(1000.0, 1000.0)
    ws.append({"winter": 2022, "hours": 300.0, "days": 40, "gaps": 0,
               "from": "2021-11-01", "to": "2021-12-10"})
    s = chill.summarize(ws)
    assert s["winters_on_record"] == 2
    assert s["lowest_hours"] == 1000.0


def test_no_whole_winter_is_none_rather_than_a_flattering_zero():
    assert chill.summarize([]) is None
    assert chill.summarize(
        [{"winter": 2022, "hours": 300.0, "days": 10, "gaps": 0,
          "from": "x", "to": "y"}]
    ) is None


def test_the_summary_states_the_window_AND_the_model_it_used():
    """The figure means nothing without them — a wider window or a different
    model banks different hours against the same requirement."""
    s = chill.summarize(_winters(1000.0))
    assert "Nov" in s["window"] and "Feb" in s["window"]
    assert s["model"] == "hours at or below 45 °F"


def test_counting_winters_that_met_the_requirement():
    ws = _winters(700.0, 900.0, 1100.0, 800.0)
    assert chill.winters_meeting(ws, 800.0) == 3
    assert chill.winters_meeting(ws, 1200.0) == 0
    assert chill.winters_meeting(ws, 0.0) == 4


def test_a_partial_winter_cannot_be_counted_as_meeting_it():
    ws = _winters(1000.0)
    ws.append({"winter": 2021, "hours": 1000.0, "days": 12, "gaps": 0,
               "from": "x", "to": "y"})
    assert chill.winters_meeting(ws, 900.0) == 1
