"""Frost logic — thresholds, the radiative model, and the record."""

from __future__ import annotations

import pytest

from goodearth_mcp import frost

# ── First-frost detection ────────────────────────────────────────────────


def test_first_fall_frost_finds_the_first_freezing_night():
    dates = ["2025-08-01", "2025-09-20", "2025-09-25", "2025-10-02"]
    tmin = [55.0, 40.0, 31.0, 28.0]
    assert frost.first_fall_frost(dates, tmin, 2025) == "2025-09-25"


def test_a_spring_freeze_is_not_a_first_fall_frost():
    """A cold night in May is a LATE spring frost — a different question."""
    dates = ["2025-05-12", "2025-10-04"]
    tmin = [30.0, 31.0]
    assert frost.first_fall_frost(dates, tmin, 2025) == "2025-10-04"


def test_exactly_32_counts_as_frost():
    assert frost.first_fall_frost(["2025-09-30"], [32.0], 2025) == "2025-09-30"


def test_a_season_that_never_froze_returns_none():
    assert frost.first_fall_frost(["2025-09-30"], [45.0], 2025) is None


def test_missing_nights_are_skipped_not_treated_as_warm():
    dates = ["2025-09-20", "2025-09-21"]
    assert frost.first_fall_frost(dates, [None, 30.0], 2025) == "2025-09-21"


def test_other_years_are_ignored():
    dates = ["2024-09-10", "2025-10-05"]
    assert frost.first_fall_frost(dates, [20.0, 30.0], 2025) == "2025-10-05"


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
    assert frost.first_fall_frost([bad, "2025-10-01"], [20.0, 30.0], 2025) == "2025-10-01"


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
