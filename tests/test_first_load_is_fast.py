"""What a Dashboard load costs the weather service, and what it costs twice.

The complaint behind these tests was two words long — "takes a long time" —
and the measurement behind it is that one page load asked Open-Meteo for about
twenty readings at once, several of them multi-year, two of them for something
already being fetched a millisecond earlier, and nine months of them for a
season whose first eight months had not moved since August ended.

Nothing here tests speed. Speed is not a property a test can hold. What these
hold is the COUNT — how many times the feed is asked — because that is what
the latency and the rate limit were both made of.
"""

from __future__ import annotations

import asyncio
from datetime import date

import httpx
import pytest
import respx

from goodearth_mcp import record_cache as rc
from goodearth_mcp import sources

from .test_record_cache import FakeVault


@pytest.fixture(autouse=True)
def _clean():
    rc._vault = None
    rc._cipher = None
    rc._schema_done = False
    token = rc._patron.set("")
    sources._inflight.clear()
    sources._cooloff_until.clear()
    yield
    rc._patron.reset(token)
    rc._vault = None
    rc._schema_done = False
    sources._inflight.clear()


# ── One question, one request ────────────────────────────────────────────


@respx.mock
async def test_the_same_question_asked_twice_at_once_is_one_request():
    """The season and the frost window both want this ground's terrain.

    They are started within a millisecond of each other by two concurrent
    tools, so neither is in the cache when the other goes out. The feed has no
    reason to hear the question twice.
    """
    route = respx.get(sources._ELEVATION).mock(
        return_value=httpx.Response(200, json={"elevation": [76.0, 97.0]})
    )
    a, b = await asyncio.gather(
        sources.fetch_elevations([44.48, 44.46], [-73.21, -73.19]),
        sources.fetch_elevations([44.48, 44.46], [-73.21, -73.19]),
    )
    assert a == b == [76.0, 97.0]
    assert route.call_count == 1


@respx.mock
async def test_different_questions_are_still_different_requests():
    """Coalescing must key on what was ASKED, not merely on the host."""
    route = respx.get(sources._ELEVATION).mock(
        return_value=httpx.Response(200, json={"elevation": [76.0]})
    )
    await asyncio.gather(
        sources.fetch_elevations([44.48], [-73.21]),
        sources.fetch_elevations([44.50], [-73.23]),
    )
    assert route.call_count == 2


@respx.mock
async def test_a_shared_failure_reaches_every_caller():
    """Both callers get the answer, so both must get the refusal too."""
    respx.get(sources._ELEVATION).mock(return_value=httpx.Response(500))
    out = await asyncio.gather(
        sources.fetch_elevations([44.48], [-73.21]),
        sources.fetch_elevations([44.48], [-73.21]),
        return_exceptions=True,
    )
    assert all(isinstance(o, sources.UpstreamError) for o in out)


@respx.mock
async def test_a_later_asker_is_not_served_a_finished_request():
    """Coalescing is not caching. It ends when the request does."""
    route = respx.get(sources._ELEVATION).mock(
        return_value=httpx.Response(200, json={"elevation": [76.0]})
    )
    await sources.fetch_elevations([44.48], [-73.21])
    await sources.fetch_elevations([44.48], [-73.21])
    assert route.call_count == 2


@respx.mock
async def test_the_client_is_pooled_across_requests():
    """One handshake per host, not one per request."""
    respx.get(sources._ELEVATION).mock(
        return_value=httpx.Response(200, json={"elevation": [76.0]})
    )
    await sources.fetch_elevations([44.48], [-73.21])
    first = sources._shared_client()
    await sources.fetch_elevations([44.50], [-73.23])
    assert sources._shared_client() is first
    assert not first.is_closed


# ── The season, split so a new morning costs a few days ──────────────────


TODAY = date(2026, 9, 18)


def test_a_running_season_splits_at_the_first_of_the_month():
    assert rc.running_split("2026-01-01", "2026-09-18", TODAY) == (
        ("2026-01-01", "2026-08-31"), ("2026-09-01", "2026-09-18"),
    )


def test_a_span_that_has_finished_is_not_split():
    """It is already one row that never expires. Splitting buys nothing."""
    assert rc.running_split("2016-01-01", "2025-12-31", TODAY) is None


def test_a_span_inside_this_month_is_not_split():
    """Two requests for eighteen days would be worse than one."""
    assert rc.running_split("2026-09-02", "2026-09-18", TODAY) is None


def test_an_unreadable_span_is_not_split():
    assert rc.running_split("whenever", "2026-09-18", TODAY) is None


def test_the_finished_head_is_the_same_span_tomorrow():
    """The point of the whole thing.

    The tail re-keys every morning — it must, it has a new day in it. The head
    does not, so the eight months behind it are read once and hit forever
    after.
    """
    today = rc.running_split("2026-01-01", "2026-09-18", date(2026, 9, 18))
    tomorrow = rc.running_split("2026-01-01", "2026-09-19", date(2026, 9, 19))
    assert today and tomorrow
    assert today[0] == tomorrow[0]
    assert today[1] != tomorrow[1]


# ── Stitching the parts back into one answer ─────────────────────────────


def _cell(times, highs, lows, **extra):
    return {
        "elevation": 76.0, "latitude": 44.48, "longitude": -73.21,
        "daily": {"time": times, "temperature_2m_max": highs, "temperature_2m_min": lows},
        **extra,
    }


def test_the_parts_rejoin_in_date_order():
    out = rc.stitch_daily([
        [_cell(["2026-09-01"], [70.0], [50.0])],
        [_cell(["2026-08-31"], [72.0], [52.0])],
    ])
    assert out is not None
    assert out[0]["daily"]["time"] == ["2026-08-31", "2026-09-01"]
    assert out[0]["daily"]["temperature_2m_max"] == [72.0, 70.0]


def test_the_cell_keeps_its_elevation():
    """The terrain correction reads it, and a cell without it goes flat."""
    out = rc.stitch_daily([[_cell(["2026-09-01"], [70.0], [50.0])],
                           [_cell(["2026-08-31"], [72.0], [52.0])]])
    assert out and out[0]["elevation"] == 76.0


def test_a_day_in_both_parts_is_counted_once():
    out = rc.stitch_daily([
        [_cell(["2026-09-01"], [70.0], [50.0])],
        [_cell(["2026-09-01"], [70.0], [50.0])],
    ])
    assert out and out[0]["daily"]["time"] == ["2026-09-01"]


def test_provenance_names_the_coarsest_part():
    fine = _cell(["2026-09-01"], [70.0], [50.0], _feed={"name": "runs", "resolution_m": 2000})
    coarse = _cell(["2026-08-31"], [72.0], [52.0], _feed={"name": "ERA5", "resolution_m": 9000})
    out = rc.stitch_daily([[fine], [coarse]])
    assert out and out[0]["_feed"]["name"] == "ERA5"


def test_parts_that_disagree_on_cells_do_not_stitch():
    """A cell dropped here is a corner of the farm missing from the spread."""
    assert rc.stitch_daily([
        [_cell(["2026-09-01"], [70.0], [50.0]), _cell(["2026-09-01"], [71.0], [51.0])],
        [_cell(["2026-08-31"], [72.0], [52.0])],
    ]) is None


async def test_a_disagreement_falls_back_to_reading_the_whole_span(monkeypatch):
    """Slower and right, rather than faster and short a cell."""
    asked: list[tuple[str, str]] = []

    async def fake(lats, lons, start, end):
        asked.append((start, end))
        # The head answers with two cells and the tail with one, which cannot
        # be merged. Only the whole-span read can answer.
        return [_cell([start], [70.0], [50.0])] * (2 if start == "2026-01-01" else 1)

    monkeypatch.setattr(rc.sources, "fetch_daily_history", fake)
    out = await rc.daily_history([44.48], [-73.21], "2026-01-01", "2026-09-18", TODAY)
    assert ("2026-01-01", "2026-09-18") in asked
    assert out


async def test_a_second_morning_reads_only_the_new_days(monkeypatch):
    """The measurement this whole change exists for."""
    vault = FakeVault()
    rc._vault, rc._cipher, rc._schema_done = vault, None, True
    rc.serving("npub1grower")
    asked: list[tuple[str, str]] = []

    async def fake(lats, lons, start, end):
        asked.append((start, end))
        return [_cell([start], [70.0], [50.0])]

    monkeypatch.setattr(rc.sources, "fetch_daily_history", fake)
    await rc.daily_history([44.48], [-73.21], "2026-01-01", "2026-09-18", TODAY)
    assert len(asked) == 2

    asked.clear()
    await rc.daily_history(
        [44.48], [-73.21], "2026-01-01", "2026-09-19", date(2026, 9, 19)
    )
    assert asked == [("2026-09-01", "2026-09-19")], "the eight finished months must not be re-read"


# ── Terrain, read once and never again ───────────────────────────────────


async def test_terrain_is_read_once_for_the_life_of_the_ground(monkeypatch):
    vault = FakeVault()
    rc._vault, rc._cipher, rc._schema_done = vault, None, True
    rc.serving("npub1grower")
    calls = 0

    async def fake(lats, lons):
        nonlocal calls
        calls += 1
        return [76.0, 97.0]

    monkeypatch.setattr(rc.sources, "fetch_elevations", fake)
    assert await rc.elevations([44.48, 44.46], [-73.21, -73.19]) == [76.0, 97.0]
    assert await rc.elevations([44.48, 44.46], [-73.21, -73.19]) == [76.0, 97.0]
    assert calls == 1


async def test_terrain_is_stored_without_an_expiry(monkeypatch):
    """Ground does not move. A row that expires would ask again for nothing."""
    vault = FakeVault()
    rc._vault, rc._cipher, rc._schema_done = vault, None, True
    rc.serving("npub1grower")

    async def fake(lats, lons):
        return [76.0]

    monkeypatch.setattr(rc.sources, "fetch_elevations", fake)
    await rc.elevations([44.48], [-73.21])
    insert = vault.statements("INSERT")[0]
    assert insert[1][6] is None
    assert insert[1][3] is None, "terrain has no span, and must not claim one"


async def test_terrain_for_other_ground_is_not_served(monkeypatch):
    """The key is the coordinates. A neighbour's bench is not this hollow."""
    vault = FakeVault()
    rc._vault, rc._cipher, rc._schema_done = vault, None, True
    rc.serving("npub1grower")
    seen: list[list[float]] = []

    async def fake(lats, lons):
        seen.append(list(lats))
        return [76.0] * len(lats)

    monkeypatch.setattr(rc.sources, "fetch_elevations", fake)
    await rc.elevations([44.48], [-73.21])
    await rc.elevations([44.50], [-73.23])
    assert seen == [[44.48], [44.50]]


async def test_no_points_asks_nobody(monkeypatch):
    async def boom(lats, lons):
        raise AssertionError("a region with no points must not be asked about")

    monkeypatch.setattr(rc.sources, "fetch_elevations", boom)
    assert await rc.elevations([], []) == []
