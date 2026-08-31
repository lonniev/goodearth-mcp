"""Soil temperature — validation, crossings, and the persistence rule."""

from __future__ import annotations

import pytest

from goodearth_mcp import soil

# ── Validation ───────────────────────────────────────────────────────────


def test_defaults_validate():
    t, d, b = soil.validate(60, "cooling", "planting")
    assert (t, d, b) == (60.0, "cooling", "planting")


@pytest.mark.parametrize("bad", [10, 120, -5, "warm", None])
def test_absurd_thresholds_are_rejected(bad):
    with pytest.raises(soil.SoilError):
        soil.validate(bad, "cooling", "planting")


def test_celsius_threshold_is_rejected():
    """15 °C would look plausible and answer the wrong question entirely."""
    with pytest.raises(soil.SoilError):
        soil.validate(15, "cooling", "planting")


@pytest.mark.parametrize("bad", ["sideways", "up", "down", "COOLING-ish"])
def test_bad_direction_is_rejected(bad):
    with pytest.raises(soil.SoilError):
        soil.validate(60, bad, "planting")


def test_bad_band_is_rejected():
    with pytest.raises(soil.SoilError):
        soil.validate(60, "cooling", "bedrock")


def test_direction_defaults_to_cooling():
    """None and empty both mean 'use the default', not 'reject'."""
    assert soil.validate(60, None, None)[1] == "cooling"
    assert soil.validate(60, "", "")[1] == "cooling"


# ── Crossings ────────────────────────────────────────────────────────────


def days(n: int, start: str = "2026-01-01") -> list[str]:
    from datetime import date, timedelta
    d0 = date.fromisoformat(start)
    return [(d0 + timedelta(days=i)).isoformat() for i in range(n)]


def test_cooling_crossing_needs_to_have_been_warm_first():
    """A season that starts cold has not 'cooled through' anything."""
    d = days(10)
    t = [40.0] * 10
    assert soil.crossing(d, t, 60.0, "cooling", seasonal=False) is None


def test_cooling_crossing_is_found_once_it_sticks():
    d = days(12)
    t = [70.0] * 5 + [55.0] * 7
    assert soil.crossing(d, t, 60.0, "cooling", seasonal=False) == d[5]


def test_a_one_day_dip_is_not_a_seasonal_crossing():
    """The bug this rule exists for.

    The 2024 record warmed through 60 °F on May 18 and dipped below on May 30
    during a cold snap. Without persistence that dip reported as the AUTUMN
    crossing — telling a grower to plant garlic in the spring.
    """
    d = days(20)
    t = [70.0] * 5 + [55.0] + [70.0] * 14   # single-day dip
    assert soil.crossing(d, t, 60.0, "cooling", seasonal=False) is None


def test_a_dip_shorter_than_the_persistence_window_is_ignored():
    d = days(20)
    t = [70.0] * 5 + [55.0] * 3 + [70.0] * 12
    assert soil.crossing(d, t, 60.0, "cooling", seasonal=False) is None


def test_warming_crossing_is_the_mirror():
    d = days(12)
    t = [40.0] * 5 + [65.0] * 7
    assert soil.crossing(d, t, 60.0, "warming", seasonal=False) == d[5]


def test_a_late_crossing_near_the_end_of_the_record_still_counts():
    """Don't require a full window past the end of the data."""
    d = days(8)
    t = [70.0] * 5 + [55.0] * 3
    assert soil.crossing(d, t, 60.0, "cooling", seasonal=False) == d[5]


def test_gaps_do_not_break_the_run():
    d = days(12)
    t = [70.0] * 5 + [55.0, None, 55.0, 55.0, 55.0, 55.0, 55.0]
    assert soil.crossing(d, t, 60.0, "cooling", seasonal=False) == d[5]


def test_exactly_at_the_threshold_counts_as_crossed_when_cooling():
    d = days(12)
    t = [70.0] * 5 + [60.0] * 7
    assert soil.crossing(d, t, 60.0, "cooling", seasonal=False) == d[5]


# ── Typical crossing ─────────────────────────────────────────────────────


def test_typical_reports_median_earliest_latest():
    got = soil.typical_crossing(["2022-10-01", "2023-10-10", "2024-10-06"], 2026)
    assert got["median"] == "2026-10-06"
    assert got["earliest"] == "2026-10-01"
    assert got["latest"] == "2026-10-10"
    assert got["years_on_record"] == 3


def test_typical_of_nothing_is_none():
    assert soil.typical_crossing([], 2026) is None


def test_leap_year_dates_do_not_drift():
    assert soil.typical_crossing(["2024-10-06"], 2026)["median"] == "2026-10-06"


# ── Hourly to daily ──────────────────────────────────────────────────────


def test_daily_means_collapse_hours():
    hours = ["2026-10-01T00:00", "2026-10-01T12:00", "2026-10-02T00:00"]
    d, m = soil.daily_means(hours, [50.0, 60.0, 40.0])
    assert d == ["2026-10-01", "2026-10-02"]
    assert m == [55.0, 40.0]


def test_a_day_with_no_readings_is_none_not_zero():
    _, m = soil.daily_means(["2026-10-01T00:00"], [None])
    assert m == [None]


# ── The seasonal window ──────────────────────────────────────────────────


def test_a_june_cool_spell_is_not_the_autumn_crossing():
    """Persistence alone was not enough.

    Some seasons hold a genuine five-day cool spell in June. It is a real dip,
    but it is not the AUTUMN crossing, and reporting it as one would put garlic
    in the ground in midsummer. Observed across the 2020-2024 record before the
    seasonal window was added: medians landed in May and June.
    """
    d = days(200, "2026-04-01")           # Apr through Oct
    t = [70.0] * 60 + [55.0] * 8 + [72.0] * 60 + [50.0] * 72
    assert soil.crossing(d, t, 60.0, "cooling") == d[128]   # the autumn one


def test_the_autumn_crossing_is_found_from_july_onward():
    d = days(120, "2026-07-01")
    t = [70.0] * 40 + [52.0] * 80
    assert soil.crossing(d, t, 60.0, "cooling") == d[40]


def test_a_spring_warming_after_july_is_ignored():
    """An August warm spell is not the spring crossing."""
    d = days(60, "2026-08-01")
    t = [40.0] * 10 + [70.0] * 50
    assert soil.crossing(d, t, 50.0, "warming") is None


def test_seasonal_can_be_switched_off_for_a_forecast_window():
    d = days(12, "2026-06-01")
    t = [70.0] * 5 + [55.0] * 7
    assert soil.crossing(d, t, 60.0, "cooling", seasonal=False) == d[5]
    assert soil.crossing(d, t, 60.0, "cooling") is None
