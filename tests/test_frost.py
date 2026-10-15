"""Frost logic — thresholds, the radiative model, and the record."""

from __future__ import annotations

from datetime import date

import pytest

from goodearth_mcp import frost

MIDSUMMER = (7, 15)  # a northern season's start

# ── First-frost detection ────────────────────────────────────────────────


def test_first_fall_frost_finds_the_first_freezing_night():
    dates = ["2025-08-01", "2025-09-20", "2025-09-25", "2025-10-02"]
    tmin = [55.0, 40.0, 31.0, 28.0]
    assert frost.first_fall_frost(dates, tmin, 2025, MIDSUMMER) == "2025-09-25"


def test_a_spring_freeze_is_not_a_first_fall_frost():
    """A cold night in May is a LATE spring frost — a different question."""
    dates = ["2025-05-12", "2025-10-04"]
    tmin = [30.0, 31.0]
    assert frost.first_fall_frost(dates, tmin, 2025, MIDSUMMER) == "2025-10-04"


def test_exactly_32_counts_as_frost():
    assert frost.first_fall_frost(["2025-09-30"], [32.0], 2025, MIDSUMMER) == "2025-09-30"


def test_a_season_that_never_froze_returns_none():
    assert frost.first_fall_frost(["2025-09-30"], [45.0], 2025, MIDSUMMER) is None


def test_missing_nights_are_skipped_not_treated_as_warm():
    dates = ["2025-09-20", "2025-09-21"]
    assert frost.first_fall_frost(dates, [None, 30.0], 2025, MIDSUMMER) == "2025-09-21"


def test_other_years_are_ignored():
    dates = ["2024-09-10", "2025-10-05"]
    assert frost.first_fall_frost(dates, [20.0, 30.0], 2025, MIDSUMMER) == "2025-10-05"


# ── Summarising the record ───────────────────────────────────────────────


def test_summary_reports_median_and_earliest_in_the_reference_year():
    s = frost.summarize_frost_dates(
        ["2019-09-28", "2020-10-06", "2021-09-20"], reference_year=2026
    )
    assert s is not None
    assert s["years_on_record"] == 3
    assert s["median"].startswith("2026-")
    assert s["earliest"].startswith("2026-")
    # Sep 20 is the earliest day-of-year of the three.
    assert s["earliest"] == "2026-09-20"
    assert s["latest"] == "2026-10-06"


def test_summary_of_an_empty_record_is_none():
    assert frost.summarize_frost_dates([], 2026) is None


def test_summary_of_one_season_still_answers():
    s = frost.summarize_frost_dates(["2025-09-30"], 2026)
    assert s and s["years_on_record"] == 1 and s["median"] == s["earliest"]


# ── The radiative model ──────────────────────────────────────────────────


def test_calm_and_clear_is_the_full_drainage_night():
    factor, reason = frost.radiative_risk(wind_mph=2.0, cloud_pct=5.0)
    assert factor == 1.0
    assert "pool" in reason


def test_wind_mixes_the_air_away():
    calm, _ = frost.radiative_risk(1.0, 0.0)
    windy, _ = frost.radiative_risk(18.0, 0.0)
    assert windy < calm


def test_cloud_puts_a_lid_on_radiation():
    clear, _ = frost.radiative_risk(1.0, 0.0)
    overcast, _ = frost.radiative_risk(1.0, 100.0)
    assert overcast < clear


def test_unknown_conditions_assume_a_middling_night_not_a_safe_one():
    """Absent data must never read as 'no risk'."""
    factor, reason = frost.radiative_risk(None, None)
    assert 0 < factor < 1
    assert "unknown" in reason


# ── Night assessment ─────────────────────────────────────────────────────


def test_low_ground_frosts_while_the_forecast_stays_above_freezing():
    """The whole point: 36 °F forecast, 6 °F of drainage, frost in the hollow."""
    n = frost.night_risk(forecast_low_f=36.0, drainage_f=6.0, wind_mph=2.0, cloud_pct=0.0)
    assert n["forecast_low_f"] == 36.0
    assert n["low_ground_f"] == 30.0
    assert n["level"] == "frost_likely"


def test_the_same_night_with_wind_is_only_a_watch():
    n = frost.night_risk(36.0, 6.0, wind_mph=20.0, cloud_pct=90.0)
    assert n["low_ground_f"] > frost.FROST_F
    assert n["level"] == "frost_watch"


def test_flat_ground_gets_no_drainage_bonus():
    n = frost.night_risk(33.0, 0.0, 2.0, 0.0)
    assert n["low_ground_f"] == 33.0
    assert n["level"] == "frost_watch"


def test_hard_freeze_outranks_frost():
    n = frost.night_risk(30.0, 4.0, 1.0, 0.0)
    assert n["level"] == "hard_freeze"


def test_a_warm_night_is_clear():
    assert frost.night_risk(52.0, 5.0, 1.0, 0.0)["level"] == "clear"


def test_the_reason_travels_with_the_assessment():
    n = frost.night_risk(36.0, 6.0, 2.0, 0.0)
    assert n["reason"] and n["drainage_applied_f"] == 6.0


# ── Picking the night that matters ───────────────────────────────────────


def test_worst_night_is_the_most_severe_not_the_soonest():
    nights = [
        frost.night_risk(40.0, 4.0, 2.0, 0.0),   # clear
        frost.night_risk(29.0, 4.0, 2.0, 0.0),   # hard freeze
        frost.night_risk(35.0, 4.0, 2.0, 0.0),   # frost
    ]
    assert frost.worst(nights)["level"] == "hard_freeze"


def test_worst_night_breaks_ties_on_the_colder_ground():
    a = frost.night_risk(35.0, 4.0, 2.0, 0.0)
    b = frost.night_risk(33.0, 4.0, 2.0, 0.0)
    assert frost.worst([a, b])["low_ground_f"] == b["low_ground_f"]


def test_worst_of_nothing_is_none():
    assert frost.worst([]) is None


def test_frost_dates_collects_each_year_that_has_one():
    dates = ["2023-10-01", "2024-09-28", "2025-08-01"]
    tmin = [30.0, 29.0, 60.0]
    got = frost.frost_dates(dates, tmin, [2023, 2024, 2025])
    assert got == ["2023-10-01", "2024-09-28"]


@pytest.mark.parametrize("bad", ["not-a-date", ""])
def test_unparseable_dates_are_skipped(bad):
    assert frost.first_fall_frost([bad, "2025-10-01"], [20.0, 30.0], 2025, MIDSUMMER) == "2025-10-01"


def test_leap_year_dates_do_not_drift_by_a_day():
    """Oct 6 in a leap year and Oct 6 in a common year are the same date.

    Day-of-year comparison would put the 2020 date one day later when
    re-expressed in a common year — a silent one-day error in the answer a
    grower plans a succession around.
    """
    s = frost.summarize_frost_dates(["2020-10-06"], reference_year=2026)
    assert s["median"] == "2026-10-06"
    s2 = frost.summarize_frost_dates(["2019-10-06"], reference_year=2026)
    assert s2["median"] == "2026-10-06"


def test_even_count_median_falls_between_the_two_central_dates():
    s = frost.summarize_frost_dates(
        ["2022-09-20", "2023-09-30", "2024-10-02", "2025-10-10"], reference_year=2026
    )
    assert "2026-09-30" <= s["median"] <= "2026-10-02"


# ── This fall so far ─────────────────────────────────────────────────────────


def _fall(lows: dict[str, float]) -> tuple[list[str], list[float | None]]:
    days = sorted(lows)
    return days, [lows[d] for d in days]


RECORD = ["2016-09-19", "2017-10-02", "2018-10-08", "2019-10-13", "2020-10-13",
          "2021-10-20", "2022-10-24", "2023-10-30", "2024-11-04", "2025-01-06"]


def test_a_frost_this_fall_is_reported_as_it_came():
    dates, lows = _fall({"2026-09-30": 40, "2026-10-01": 31, "2026-10-02": 29})
    got = frost.season_so_far(dates, lows, RECORD, date(2026, 10, 14), MIDSUMMER)
    assert got == {"first_frost": "2026-10-01", "through": "2026-10-02"}


def test_past_the_median_with_no_frost_the_later_seasons_answer():
    dates, lows = _fall({"2026-10-12": 41, "2026-10-13": 38})
    got = frost.season_so_far(dates, lows, RECORD, date(2026, 10, 14), MIDSUMMER)
    assert got["first_frost"] is None
    later = got["given_none_yet"]
    # Five of ten seasons were still frost-free on Oct 13, the January one last.
    assert (later["seasons"], later["of"]) == (5, 10)
    assert later["earliest"] == "2026-10-20"
    assert later["latest"] == "2027-01-06"
    assert later["median"] == "2026-10-30"


def test_frost_free_past_every_season_on_record_says_so():
    dates, lows = _fall({"2026-11-10": 40})
    got = frost.season_so_far(dates, lows, RECORD[:9], date(2026, 11, 11), MIDSUMMER)
    assert got["given_none_yet"] == {"seasons": 0, "of": 9}


def test_in_january_the_season_that_began_in_july_is_still_running():
    # The Gulf case: no frost since July, and every season on record frosted by now.
    dates, lows = _fall({"2027-01-20": 40})
    got = frost.season_so_far(dates, lows, RECORD, date(2027, 1, 21), MIDSUMMER)
    assert got["first_frost"] is None
    assert got["given_none_yet"] == {"seasons": 0, "of": 10}


def test_tonight_is_not_counted_before_it_happens():
    dates, lows = _fall({"2026-10-13": 40, "2026-10-14": 20})
    got = frost.season_so_far(dates, lows, RECORD, date(2026, 10, 14), MIDSUMMER)
    assert got["first_frost"] is None and got["through"] == "2026-10-13"


def test_nothing_observed_since_the_season_began_is_no_answer():
    assert frost.season_so_far([], [], RECORD, date(2026, 10, 14), MIDSUMMER) is None
    assert frost.season_so_far(["2026-07-01"], [30.0], RECORD, date(2026, 7, 20), MIDSUMMER) is None


def test_a_january_frost_sorts_after_december():
    assert frost.season_day(date(2027, 1, 6), MIDSUMMER) > frost.season_day(date(2026, 12, 20), MIDSUMMER)
