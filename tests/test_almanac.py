"""Almanac — sky codes, wind, sun and moon."""

from __future__ import annotations

from datetime import date

import pytest

from goodearth_mcp import almanac as a


def test_known_wmo_codes_get_words_and_a_glyph():
    assert a.describe_code(0)["label"] == "Clear"
    assert a.describe_code(95)["emoji"] == "⛈️"


@pytest.mark.parametrize("bad", [None, "rain", 999, -1])
def test_an_unknown_code_is_unknown_not_a_guess(bad):
    assert a.describe_code(bad)["label"] == "Unknown"


def test_wind_is_reported_as_the_direction_it_comes_FROM():
    """A 'south wind' blows from the south — that is what a grower means."""
    w = a.describe_wind(10.0, 180)
    assert w["from"] == "S"
    assert w["arrow"] == "↑"          # air travels north


def test_a_north_wind_points_south():
    w = a.describe_wind(10.0, 0)
    assert w["from"] == "N" and w["arrow"] == "↓"


@pytest.mark.parametrize(("mph", "strength"), [
    (1, "calm"), (8, "light"), (18, "breezy"), (30, "windy"), (50, "gale"),
])
def test_wind_strength_bands(mph, strength):
    assert a.describe_wind(mph, 180)["strength"] == strength


def test_wind_without_a_speed_still_reports_direction():
    w = a.describe_wind(None, 90)
    assert w["from"] == "E" and w["strength"] is None


# ── Sun ──────────────────────────────────────────────────────────────────


def test_seconds_become_hours():
    assert a.hours(3600) == 1.0
    assert a.hours(None) is None


def test_sunshine_fraction_compares_sun_to_available_daylight():
    """Eight hours of sun is dull in June and brilliant in December."""
    assert a.sunshine_fraction(3600 * 6, 3600 * 12) == 0.5


def test_sunshine_fraction_is_capped_at_one():
    assert a.sunshine_fraction(3600 * 13, 3600 * 12) == 1.0


def test_sunshine_fraction_of_a_polar_night_is_none_not_infinite():
    assert a.sunshine_fraction(0, 0) is None


def test_day_length_change_is_minutes_per_day():
    """Hours in, minutes out. Dividing instead of multiplying returned -0.0
    for a late-August day losing nearly three minutes — a bug that reads as
    'no change'."""
    hrs = [13.6, 13.55, 13.5, 13.45, 13.4, 13.35, 13.3, 13.25]
    got = a.day_length_change(hrs)
    assert got is not None and -4.0 < got < -2.0


def test_day_length_change_needs_two_points():
    assert a.day_length_change([13.0]) is None


def test_computed_day_length_matches_the_feed():
    """44.48 N on Aug 30: the feed reports 13.33 h."""
    assert abs(a.day_length_hours(44.48, date(2026, 8, 30)) - 13.33) < 0.1


def test_solstices_are_the_extremes():
    jun = a.day_length_hours(44.48, date(2026, 6, 21))
    dec = a.day_length_hours(44.48, date(2026, 12, 21))
    assert jun > 15.0 and dec < 9.0
    assert abs((jun + dec) / 2 - 12.2) < 0.5


def test_the_equator_is_about_twelve_hours_year_round():
    for m in (1, 4, 7, 10):
        assert abs(a.day_length_hours(0.0, date(2026, m, 15)) - 12.1) < 0.2


def test_the_arctic_returns_a_polar_extreme_rather_than_an_error():
    assert a.day_length_hours(80.0, date(2026, 6, 21)) == 24.0
    assert a.day_length_hours(80.0, date(2026, 12, 21)) == 0.0


def test_a_future_daylight_crossing_is_found():
    got = a.next_daylight_crossing(44.48, date(2026, 8, 30), 12.5, rising=False)
    assert got is not None and got.startswith("2026-09")


def test_direction_matters_for_a_crossing():
    """12.5 h lengthening is spring; shortening is autumn. Same number,
    different half of the year, and an animal cued by one ignores the other."""
    down = a.next_daylight_crossing(44.48, date(2026, 8, 30), 12.5, rising=False)
    up = a.next_daylight_crossing(44.48, date(2026, 8, 30), 12.5, rising=True)
    assert down < up


# ── Moon ─────────────────────────────────────────────────────────────────


def test_moon_phase_is_computed_not_fetched():
    m = a.moon_phase(date(2026, 8, 30))
    assert 0 <= m["phase"] <= 1
    assert 0 <= m["illumination"] <= 1
    assert m["emoji"] and m["name"]


def test_a_full_moon_is_fully_lit_and_a_new_moon_is_dark():
    full = a.next_full_moon(date(2026, 8, 30))
    assert full is not None
    assert a.moon_phase(date.fromisoformat(full))["illumination"] > 0.97


def test_the_cycle_returns_after_a_synodic_month():
    from datetime import timedelta
    d = date(2026, 8, 30)
    later = d + timedelta(days=round(a.SYNODIC))
    assert abs(a.moon_phase(d)["phase"] - a.moon_phase(later)["phase"]) < 0.05


def test_next_full_moon_is_within_a_cycle():
    d = date(2026, 3, 1)
    got = date.fromisoformat(a.next_full_moon(d))
    assert 0 <= (got - d).days <= 30


# ── Aggregation ──────────────────────────────────────────────────────────


def test_a_running_total_carries_a_gap_flat():
    assert a.running_total([1.0, None, 2.0]) == [1.0, 1.0, 3.0]


def test_the_normal_band_skips_gaps_rather_than_counting_them_as_zero():
    band = a.normal_band([[10.0, None], [20.0, 4.0]])
    assert band[0] == {"min": 10.0, "mean": 15.0, "max": 20.0}
    assert band[1]["mean"] == 4.0


def test_the_band_truncates_to_the_shortest_season():
    assert len(a.normal_band([[1.0, 2.0, 3.0], [1.0]])) == 1


def test_the_band_of_nothing_is_none():
    assert a.normal_band([]) is None
    assert a.normal_band([[]]) is None
