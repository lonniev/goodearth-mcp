"""The frost record stays inside the span Daymet covers; this fall is read apart."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from goodearth_mcp import frost_window, record_cache, sources
from goodearth_mcp.region import parse_region

PIN = {"lat": 44.5, "lon": -73.2, "radius_m": 200}


def _record(start: str, end: str, low_on: dict[str, float]) -> list[dict]:
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    days = [(d0 + timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]
    lows = [low_on.get(d, 45.0) for d in days]
    return [{"daily": {"time": days, "temperature_2m_max": [60.0] * len(days),
                       "temperature_2m_min": lows}}]


@pytest.fixture
def spans(monkeypatch):
    asked: list[tuple[str, str]] = []
    # A frost on Oct 1 of each past season; none yet this fall.
    frosts = {f"{y}-10-01": 30.0 for y in range(2010, 2026)}

    async def history(lats, lons, start, end, today=None):
        asked.append((start, end))
        return _record(start, end, frosts)

    async def elevations(lats, lons):
        return [100.0] * len(lats)

    async def forecast(lat, lon, nights):
        raise sources.UpstreamError("no forecast in this test")

    monkeypatch.setattr(record_cache, "daily_history", history)
    monkeypatch.setattr(record_cache, "elevations", elevations)
    monkeypatch.setattr(sources, "fetch_frost_forecast", forecast)
    return asked


async def test_the_record_ends_last_december_and_this_fall_is_its_own_read(spans):
    out = await frost_window.region_frost_window(parse_region(PIN), today=date(2026, 10, 15))
    record, season = sorted(spans)
    assert record[1] == "2025-12-31"
    assert season == ("2026-07-15", "2026-10-14")
    assert out["first_frost"]["median"] == "2026-10-01"
    assert out["this_season"]["first_frost"] is None
    assert out["this_season"]["given_none_yet"] == {"seasons": 0, "of": out["first_frost"]["years_on_record"]}


async def test_before_the_fall_begins_only_the_record_is_read(spans):
    out = await frost_window.region_frost_window(parse_region(PIN), today=date(2026, 6, 1))
    assert [end for _s, end in spans] == ["2025-12-31"]
    assert out["this_season"] is None
