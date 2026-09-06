"""A cached span written before a measure existed must not take the page down.

The Almanac went down on 2026-09-06 with `IndexError: list index out of range`.
Humidity had been added to the request; every cached ten-year span still held
the field set from before it, so the normals block had ten years of DATES and
no humidity values at all. The alignment loop indexes the date list and reads
the value list with the same number, and the two are the same length only while
every measure's field is present.

Two guards here, because either alone leaves a hole. The reader must survive a
short series, and the cache must stop serving an answer to a question nobody is
asking any more.
"""

from __future__ import annotations

import asyncio
from datetime import date, timedelta
from typing import Any

import pytest

from goodearth_mcp import almanac_window, block_store, record_cache, sources
from goodearth_mcp import region as reg
from goodearth_mcp.almanac_window import MEASURES, region_almanac

REGION = reg.parse_region(block_store.EXAMPLE_BLOCK["geometry"])
TODAY = date(2026, 9, 6)


def _days(start: date, end: date) -> list[str]:
    out, d = [], start
    while d <= end:
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def _block(dates: list[str], *, omit: set[str]) -> dict[str, Any]:
    """A record carrying every almanac field except the ones named.

    `omit` is what a cache written under an older field set looks like: the
    days are all there and one column simply is not.
    """
    daily: dict[str, Any] = {"time": dates}
    for spec in MEASURES.values():
        if spec["field"] in omit:
            continue
        daily[spec["field"]] = [50.0] * len(dates)
    return {"daily": daily}


@pytest.fixture
def _feeds(monkeypatch):
    season = _days(date(2026, 1, 1), TODAY)
    deep = _days(date(2016, 1, 1), date(2025, 12, 31))

    async def almanac_history(lat, lon, start, end):
        # The season read is fresh and complete; the decade is the cached one,
        # and it predates humidity.
        if start.startswith("2016"):
            return _block(deep, omit={"relative_humidity_2m_mean"})
        return _block(season, omit=set())

    async def forecast(lat, lon, days=14):
        return _block(_days(TODAY, TODAY + timedelta(days=13)), omit=set())

    monkeypatch.setattr(record_cache, "almanac_history", almanac_history)
    monkeypatch.setattr(sources, "fetch_almanac_forecast", forecast)
    monkeypatch.setattr(almanac_window.sources, "fetch_almanac_forecast", forecast)
    yield


def test_a_span_missing_a_measure_does_not_take_the_whole_almanac_down(_feeds):
    """THE PRODUCTION CASE. Every other measure must still answer."""
    out = asyncio.run(region_almanac(REGION, today=TODAY))
    assert out["success"] is True
    assert out["measures"]["temp_max"]["normal"], "the measures that ARE cached lost their band"


def test_the_missing_measure_reads_as_absent_rather_than_as_a_number(_feeds):
    out = asyncio.run(region_almanac(REGION, today=TODAY))
    assert not out["measures"]["humidity"]["normal"]


def test_the_field_fingerprint_changes_when_the_request_changes(monkeypatch):
    """A cached answer is reusable only while the question is unchanged."""
    before = record_cache._field_fingerprint()
    monkeypatch.setattr(
        sources, "_DAILY_ALMANAC_HISTORY", sources._DAILY_ALMANAC_HISTORY + ",soil_moisture")
    assert record_cache._field_fingerprint() != before


def test_the_fingerprint_ignores_the_order_the_fields_are_written_in(monkeypatch):
    """Reordering the request string is not a different question, and busting
    every cached decade for it would cost a fortune in upstream reads."""
    before = record_cache._field_fingerprint()
    fields = sources._DAILY_ALMANAC_HISTORY.split(",")
    monkeypatch.setattr(
        sources, "_DAILY_ALMANAC_HISTORY", ",".join(reversed(fields)))
    assert record_cache._field_fingerprint() == before


def test_the_fingerprint_is_in_the_cache_subject(monkeypatch):
    """Not decorative: without it the decade row, which never expires, answers
    with the old field set for as long as the ground exists."""
    seen: list[str] = []

    async def spy(kind, subject, start, end):
        seen.append(subject)

    async def fetched(lat, lon, start, end):
        return {"daily": {"time": []}}

    monkeypatch.setattr(record_cache, "_read", spy)
    monkeypatch.setattr(record_cache, "_write", lambda *a, **k: asyncio.sleep(0))
    monkeypatch.setattr(sources, "fetch_almanac_history", fetched)
    asyncio.run(record_cache.almanac_history(44.45, -73.26, "2016-01-01", "2025-12-31"))
    assert seen and seen[0].endswith(record_cache._field_fingerprint())
