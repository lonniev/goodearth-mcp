"""Wildlife calendar — three clocks, and the guard against asserting biology."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from goodearth_mcp import wildlife as w

TODAY = date(2026, 8, 30)
DS = [(date(2026, 1, 1) + timedelta(days=i)).isoformat() for i in range(242)]
CUM = [round(i * 10.0, 1) for i in range(242)]
# Day length rising to a June peak and falling back — the real shape.
LIGHT = [9.0 + 6.5 * (1 - abs((i - 171) / 171)) for i in range(242)]


def ev(**kw):
    base = {"species": "Robin", "event": "first arrival", "driver": "daylight",
            "daylight_hours": 11.5}
    base.update(kw)
    return base


# ── Validation ───────────────────────────────────────────────────────────


def test_a_heat_event_validates():
    e = w.validate_event({"species": "Woodchuck", "event": "emergence",
                          "driver": "heat", "gdd": 120, "base_temp": 43})
    assert e["gdd"] == 120.0 and e["base_temp_f"] == 43.0


def test_a_daylight_event_defaults_to_lengthening():
    assert w.validate_event(ev())["rising"] is True


def test_a_calendar_event_validates():
    e = w.validate_event({"species": "Squirrel", "event": "caching",
                          "driver": "calendar", "typical_on": "09-15"})
    assert (e["month"], e["day"]) == (9, 15)


@pytest.mark.parametrize("bad", [None, "robin", 5, [], {}])
def test_non_object_events_are_rejected(bad):
    with pytest.raises(w.WildlifeError):
        w.validate_event(bad)


@pytest.mark.parametrize("driver", ["", "vibes", "weather", None])
def test_unknown_drivers_are_rejected(driver):
    with pytest.raises(w.WildlifeError):
        w.validate_event(ev(driver=driver))


def test_a_species_without_an_event_name_is_rejected():
    with pytest.raises(w.WildlifeError):
        w.validate_event({"species": "Robin", "driver": "calendar", "typical_on": "03-01"})


@pytest.mark.parametrize("h", [0, 24, 30, -3, "noon", None])
def test_impossible_daylight_thresholds_are_rejected(h):
    with pytest.raises(w.WildlifeError):
        w.validate_event(ev(daylight_hours=h))


@pytest.mark.parametrize("g", [0, -50, 99_999, "warm", None])
def test_impossible_heat_thresholds_are_rejected(g):
    with pytest.raises(w.WildlifeError):
        w.validate_event({"species": "X", "event": "y", "driver": "heat", "gdd": g})


def test_a_celsius_base_temp_is_rejected():
    with pytest.raises(w.WildlifeError):
        w.validate_event({"species": "X", "event": "y", "driver": "heat",
                          "gdd": 120, "base_temp": 6})


@pytest.mark.parametrize("d", ["", "September", "13-40", None])
def test_bad_calendar_dates_are_rejected(d):
    with pytest.raises(w.WildlifeError):
        w.validate_event({"species": "X", "event": "y", "driver": "calendar", "typical_on": d})


# ── Heat clock ───────────────────────────────────────────────────────────


def test_a_crossed_heat_threshold_reports_the_date_it_happened():
    e = w.validate_event({"species": "X", "event": "y", "driver": "heat", "gdd": 500})
    got = w.heat_event(e, DS, CUM, rate=10.0, today=TODAY)
    assert got["reached_on"] == DS[50]
    assert got["projected_date"] is None


def test_an_uncrossed_threshold_projects_at_the_recent_rate():
    e = w.validate_event({"species": "X", "event": "y", "driver": "heat", "gdd": 2600})
    got = w.heat_event(e, DS, CUM, rate=10.0, today=TODAY)
    assert got["reached_on"] is None
    assert got["projected_date"] is not None


def test_a_stalled_season_projects_nothing():
    e = w.validate_event({"species": "X", "event": "y", "driver": "heat", "gdd": 9000})
    assert w.heat_event(e, DS, CUM, rate=0.0, today=TODAY)["projected_date"] is None


# ── Daylight clock ───────────────────────────────────────────────────────


def test_a_rising_crossing_lands_in_the_first_half_of_the_year():
    e = w.validate_event(ev(daylight_hours=12.0, rising=True))
    got = w.daylight_event(e, DS, LIGHT, lat=44.48, today=TODAY)
    assert got["reached_on"] is not None
    assert got["reached_on"] < "2026-07-01"


def test_direction_separates_spring_from_autumn():
    """The same 12 hours is April going up and September coming down. An
    animal cued by lengthening days ignores the autumn crossing entirely."""
    up = w.daylight_event(w.validate_event(ev(daylight_hours=12.0, rising=True)),
                          DS, LIGHT, 44.48, TODAY)
    down = w.daylight_event(w.validate_event(ev(daylight_hours=12.0, rising=False)),
                            DS, LIGHT, 44.48, TODAY)
    assert up["reached_on"] != down["reached_on"]


def test_a_future_crossing_is_computed_rather_than_left_unknown():
    """Day length is astronomy — a future date is exactly as knowable."""
    e = w.validate_event(ev(daylight_hours=12.5, rising=False))
    got = w.daylight_event(e, DS[:10], LIGHT[:10], lat=44.48, today=TODAY)
    assert got["projected_date"] is not None


def test_without_a_latitude_no_future_date_is_invented():
    e = w.validate_event(ev(daylight_hours=12.5, rising=False))
    got = w.daylight_event(e, DS[:10], LIGHT[:10])
    assert got["projected_date"] is None


# ── Calendar clock ───────────────────────────────────────────────────────


def test_a_past_calendar_date_reads_as_reached():
    e = w.validate_event({"species": "X", "event": "y", "driver": "calendar", "typical_on": "05-01"})
    assert w.calendar_event(e, TODAY)["reached_on"] == "2026-05-01"


def test_a_future_calendar_date_reads_as_upcoming():
    e = w.validate_event({"species": "X", "event": "y", "driver": "calendar", "typical_on": "11-01"})
    got = w.calendar_event(e, TODAY)
    assert got["reached_on"] is None and got["projected_date"] == "2026-11-01"


# ── Due soon ─────────────────────────────────────────────────────────────


def test_due_soon_is_sorted_nearest_first():
    rows = [
        {"species": "far", "projected_date": (TODAY + timedelta(days=18)).isoformat()},
        {"species": "near", "projected_date": (TODAY + timedelta(days=2)).isoformat()},
    ]
    assert [r["species"] for r in w.upcoming(rows, TODAY)] == ["near", "far"]


def test_events_beyond_the_window_are_not_due_soon():
    rows = [{"species": "x", "projected_date": (TODAY + timedelta(days=90)).isoformat()}]
    assert w.upcoming(rows, TODAY) == []


def test_already_happened_is_not_due_soon():
    rows = [{"species": "x", "reached_on": "2026-04-01", "projected_date": None}]
    assert w.upcoming(rows, TODAY) == []
