"""Today is the grower's date, not Greenwich's.

After 7 pm in Vermont the UTC date is already tomorrow, so every window that
counted days from "today" ran a day ahead each evening. The clock is named at
the tool boundary: the patron's chosen zone, else their ground's, else UTC.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime

import pytest

from goodearth_mcp import block_store, reader_clock, server, sources, task_store
from goodearth_mcp import region as reg

REGION = reg.parse_region(block_store.EXAMPLE_BLOCK["geometry"])
# UTC+14 and UTC-11: 25 hours apart, so their dates always differ.
EAST, WEST = "Pacific/Kiritimati", "Pacific/Pago_Pago"


@pytest.fixture(autouse=True)
def _fresh(monkeypatch):
    monkeypatch.setattr(reader_clock, "_place_zones", {})
    reader_clock.reading_in(None)
    yield
    reader_clock.reading_in(None)


def test_today_follows_the_named_zone():
    reader_clock.reading_in(EAST)
    east = reader_clock.today()
    reader_clock.reading_in(WEST)
    assert reader_clock.today() < east


def test_no_zone_reads_utc():
    assert reader_clock.today() == datetime.now(UTC).date()


@pytest.mark.parametrize("bad", ["auto", "", None, 7, "Nowhere/Special", "../etc", "x" * 80])
def test_anything_but_a_zone_reads_utc(bad):
    reader_clock.reading_in(bad)  # type: ignore[arg-type]
    assert reader_clock.zone_name() is None


def test_a_window_counts_from_the_readers_date():
    """task_store's week starts on the reader's today."""
    reader_clock.reading_in(EAST)
    east = task_store.window_for("day", reader_clock.today(), None)
    reader_clock.reading_in(WEST)
    assert task_store.window_for("day", reader_clock.today(), None) != east


class _Store:
    def __init__(self, stored):
        self.stored = stored

    async def values(self, npub, *, cached=False):
        return self.stored


def _with_property(monkeypatch, stored):
    async def store():
        return _Store(stored)
    monkeypatch.setattr(server.runtime, "property_store", store)


def test_the_patrons_chosen_zone_wins(monkeypatch):
    _with_property(monkeypatch, {"timezone": (EAST, "")})

    async def never(lat, lon):
        raise AssertionError("asked the feed for a zone the patron already chose")
    monkeypatch.setattr(sources, "fetch_time_zone", never)
    assert asyncio.run(server._reader_zone("npub1x", REGION)) == EAST


def test_auto_reads_the_grounds_zone_once(monkeypatch):
    _with_property(monkeypatch, {"timezone": ("auto", "")})
    asked = []

    async def place(lat, lon):
        asked.append((lat, lon))
        return WEST
    monkeypatch.setattr(sources, "fetch_time_zone", place)
    assert asyncio.run(server._reader_zone("npub1x", REGION)) == WEST
    assert asyncio.run(server._reader_zone("npub1x", REGION)) == WEST
    assert len(asked) == 1, "a place's zone is remembered"


def test_nothing_known_reads_utc_and_never_raises(monkeypatch):
    async def broken():
        raise RuntimeError("vault down")
    monkeypatch.setattr(server.runtime, "property_store", broken)

    async def silent(lat, lon):
        raise sources.UpstreamError("no zone")
    monkeypatch.setattr(sources, "fetch_time_zone", silent)
    assert asyncio.run(server._reader_zone("npub1x", REGION)) is None
    assert asyncio.run(server._reader_zone("npub1x", None)) is None
    assert isinstance(reader_clock.today(), date)
