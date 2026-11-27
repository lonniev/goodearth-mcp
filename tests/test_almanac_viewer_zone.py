"""The fortnight's days are the reader's days.

A grower in New York reading a farm's Almanac sees a card dated Saturday. It
must hold Saturday midnight to midnight as they live it, so the zone they
chose is what cuts the forecast into days.
"""

from __future__ import annotations

import asyncio
from datetime import date, timedelta
from typing import Any

import pytest

from goodearth_mcp import almanac_window, block_store, record_cache, sources
from goodearth_mcp import region as reg
from goodearth_mcp.almanac_window import MEASURES, AlmanacError, region_almanac, viewer_zone

REGION = reg.parse_region(block_store.EXAMPLE_BLOCK["geometry"])
TODAY = date(2026, 11, 26)


def _block(start: date, n: int) -> dict[str, Any]:
    dates = [(start + timedelta(days=i)).isoformat() for i in range(n)]
    return {"daily": {"time": dates, **{s["field"]: [50.0] * n for s in MEASURES.values()}}}


@pytest.fixture
def asked(monkeypatch) -> list[str]:
    zones: list[str] = []

    async def almanac_history(lat, lon, start, end):
        return _block(date.fromisoformat(start), (date.fromisoformat(end) - date.fromisoformat(start)).days + 1)

    async def forecast(lat, lon, days=14, timezone="auto"):
        zones.append(timezone)
        return _block(TODAY, days)

    monkeypatch.setattr(record_cache, "almanac_history", almanac_history)
    monkeypatch.setattr(almanac_window.sources, "fetch_almanac_forecast", forecast)
    monkeypatch.setattr(sources, "fetch_almanac_forecast", forecast)
    return zones


def test_the_readers_zone_cuts_the_forecast_days(asked):
    asyncio.run(region_almanac(REGION, today=TODAY, timezone="America/New_York"))
    assert asked == ["America/New_York"]


def test_no_zone_falls_back_to_the_grounds_own(asked):
    asyncio.run(region_almanac(REGION, today=TODAY))
    assert asked == ["auto"]


@pytest.mark.parametrize("bad", ["Nowhere/Special", "../../etc/passwd", "x" * 80, "America/New_York&daily=x"])
def test_a_zone_that_is_not_in_the_database_is_refused(bad):
    with pytest.raises(AlmanacError):
        viewer_zone(bad)


@pytest.mark.parametrize("given,want", [("", "auto"), ("auto", "auto"), (" Europe/Paris ", "Europe/Paris")])
def test_zone_names_read_as_given(given, want):
    assert viewer_zone(given) == want
