"""The frost record stays inside the span Daymet covers; this season is read
apart, from the day this ground's own record says its season begins."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from goodearth_mcp import frost, frost_window, record_cache, sources
from goodearth_mcp.region import parse_region

PIN = {"lat": 44.5, "lon": -73.2, "radius_m": 200}


def _days(start: str, end: str) -> list[str]:
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    return [(d0 + timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]


def _vermont(day: str) -> float:
    """Frost every night Oct 1 to Apr 30, none May to September."""
    m = int(day[5:7])
    return 28.0 if m >= 10 or m <= 4 else 50.0


@pytest.fixture
def spans(monkeypatch):
    asked: list[tuple[str, str]] = []

    async def history(lats, lons, start, end, today=None):
        asked.append((start, end))
        days = _days(start, end)
        return [{"daily": {"time": days, "temperature_2m_max": [60.0] * len(days),
                           "temperature_2m_min": [_vermont(d) for d in days]}}]

    async def elevations(lats, lons):
        return [100.0] * len(lats)

    async def forecast(lat, lon, nights):
        raise sources.UpstreamError("no forecast in this test")

    monkeypatch.setattr(record_cache, "daily_history", history)
    monkeypatch.setattr(record_cache, "elevations", elevations)
    monkeypatch.setattr(sources, "fetch_frost_forecast", forecast)
    return asked


async def test_the_record_ends_last_december_and_this_season_is_its_own_read(spans):
    out = await frost_window.region_frost_window(parse_region(PIN), today=date(2026, 8, 20))
    record, season = sorted(spans)
    assert record[1] == "2025-12-31"
    # The longest frost-free stretch is May 1 to Sep 30; its middle starts the season.
    assert season == ("2026-07-16", "2026-08-19")
    assert out["first_frost"]["median"] == "2026-10-01"
    assert out["first_frost"]["season_starts"] == "2026-07-16"
    assert out["this_season"]["first_frost"] is None


async def test_until_the_season_turns_the_frost_that_came_is_the_answer(spans):
    out = await frost_window.region_frost_window(parse_region(PIN), today=date(2027, 6, 1))
    assert out["first_frost"]["season_starts"] == "2026-07-16"
    assert out["this_season"]["first_frost"] == "2026-10-01"


# ── Where the season begins ──────────────────────────────────────────────────


def _season(lows) -> tuple[list[str], list[float]]:
    days = _days("2016-01-01", "2025-12-31")
    return days, [lows(d) for d in days]


def test_vermont_and_the_gulf_turn_in_midsummer():
    assert frost.season_start(*_season(_vermont)) == (7, 16)
    gulf = _season(lambda d: 30.0 if d[5:10] in ("12-20", "01-10", "02-05") else 50.0)
    assert frost.season_start(*gulf)[0] in (6, 7)


def test_south_of_the_equator_the_season_turns_in_midsummer_there():
    south = _season(lambda d: 30.0 if 5 <= int(d[5:7]) <= 9 else 55.0)
    assert frost.season_start(*south)[0] == 1


def test_ground_that_never_frosts_has_no_season():
    assert frost.season_start(*_season(lambda d: 55.0)) is None
    assert frost.frost_dates(*_season(lambda d: 55.0), [2020, 2021]) == []


def test_a_gulf_january_frost_belongs_to_the_season_that_began_the_summer_before():
    days, lows = _season(lambda d: 30.0 if d[5:10] == "01-10" else 50.0)
    start = frost.season_start(days, lows)
    assert frost.frost_dates(days, lows, [2020], start) == ["2021-01-10"]


async def test_ground_that_never_froze_says_so(monkeypatch, spans):
    async def warm(lats, lons, start, end, today=None):
        days = _days(start, end)
        return [{"daily": {"time": days, "temperature_2m_max": [80.0] * len(days),
                           "temperature_2m_min": [62.0] * len(days)}}]

    async def forecast(lat, lon, nights):
        return {}

    monkeypatch.setattr(record_cache, "daily_history", warm)
    monkeypatch.setattr(sources, "fetch_frost_forecast", forecast)
    monkeypatch.setattr(sources, "frost_series", lambda _f: [
        {"date": "2026-10-15", "low_f": 64.0, "wind_mph": 5.0, "cloud_pct": 40.0,
         "dew_point_f": 55.0, "high_f": 80.0}])
    out = await frost_window.region_frost_window(parse_region(PIN), today=date(2026, 10, 15))
    assert out["frost_free"] is True
    assert out["first_frost"] is None
