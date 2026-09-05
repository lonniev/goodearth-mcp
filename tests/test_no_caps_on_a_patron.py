"""How much a grower may have is theirs to decide.

This service used to cap it in six places — 40 plantings ("split the block",
said the error), 10 pests, 24 wildlife events, 12 life stages within one pest
model, 200 to-dos, 40 trees. Every number was invented here, none was ever
justified in a comment or a commit message, and each one refused the WHOLE
answer rather than a page of it.

They are gone. What remains is a page size, which bounds a request and not a
farm. These tests hold that distinction, in both directions: nothing refuses a
big block, and nothing quietly answers about part of one.
"""

from __future__ import annotations

import asyncio
import math
from datetime import date, timedelta
from typing import Any

import pytest

from goodearth_mcp import (
    block_store,
    calendar_feed,
    crop_status,
    perennial_window,
    pest_window,
    pests,
    planting_window,
    record_cache,
    server,
    suitability_window,
    wildlife_window,
)
from goodearth_mcp import region as reg

REGION = reg.parse_region(block_store.EXAMPLE_BLOCK["geometry"])
TODAY = date(2026, 9, 3)


def _season(start: str, end: str) -> dict:
    a, b = date.fromisoformat(start), date.fromisoformat(end)
    days = [a + timedelta(days=i) for i in range((b - a).days + 1)]
    hi, lo = [], []
    for d in days:
        peak = math.cos((d.timetuple().tm_yday - 196) / 365.0 * 2 * math.pi)
        hi.append(round(55 + 28 * peak, 1))
        lo.append(round(35 + 26 * peak, 1))
    return {
        "daily": {"time": [d.isoformat() for d in days],
                  "temperature_2m_max": hi, "temperature_2m_min": lo,
                  "daylight_duration": [43200.0] * len(days)},
        "_feed": {"name": "synthetic (test)", "resolution_m": 1000},
    }


@pytest.fixture(autouse=True)
def _ground(monkeypatch):
    async def daily(lats, lons, start, end):
        return [_season(start, end) for _ in (lats or [0])]
    monkeypatch.setattr(record_cache, "daily_history", daily)
    yield


#: Comfortably past every limit this service used to impose.
MANY = 250


def test_a_grower_may_have_as_many_plantings_as_they_plant():
    """It refused at 41, and told them to "split the block" — which is this
    service asking a farmer to reorganise their farm around a constant."""
    rows = [{"crop": f"Zinnia {i}", "gdd_target": 1100, "set_out": "2026-05-20"}
            for i in range(MANY)]
    out = asyncio.run(crop_status.region_crop_ledger(REGION, rows, today=TODAY))
    assert len(out["plantings"]) == MANY


def test_a_grower_may_watch_as_many_pests_as_they_watch():
    """It refused at 11. The owner's own Pests page had ten rows on it."""
    rows = [{"pest": f"Pest {i}", "watch": True} for i in range(MANY)]
    out = asyncio.run(pest_window.region_pest_window(REGION, rows, today=TODAY))
    assert len(out["pests"]) == MANY


def test_a_grower_may_track_as_many_creatures_as_they_track():
    rows = [{"species": f"Bird {i}", "event": "arrival", "driver": "calendar",
             "typical_on": "05-01"} for i in range(MANY)]
    out = asyncio.run(wildlife_window.region_wildlife(REGION, rows, today=TODAY))
    assert len(out["events"]) == MANY


def test_a_grower_may_have_as_many_trees_as_they_have():
    rows = [{"tree": f"Apple {i}", "chill_hours": 800, "hardy_to_f": -30}
            for i in range(MANY)]
    out = asyncio.run(perennial_window.region_tree_window(REGION, rows, today=TODAY))
    assert len(out["trees"]) == MANY


def test_a_pest_model_may_have_as_many_stages_as_it_has():
    """Twelve was a cap on someone else's entomology."""
    m = pests.validate_model({"pest": "X", "base_temp": 50, "stages": [
        {"stage": f"s{i}", "gdd": i + 1} for i in range(40)]})
    assert len(m["stages"]) == 40


def test_a_caller_may_rate_as_many_crops_as_they_ask_about():
    rows = [{"crop": f"C{i}", "gdd_target": 1200, "base_temp": 50} for i in range(MANY)]
    a = asyncio.run(suitability_window.region_suitability(REGION, rows, today=TODAY))
    b = asyncio.run(planting_window.region_planting_window(REGION, rows, today=TODAY))
    assert len(a["crops"]) == MANY
    assert len(b["crops"]) == MANY


def test_a_season_may_publish_as_many_to_dos_as_it_holds():
    assert not hasattr(calendar_feed, "MAX_TODOS")


# ── The other half: nothing may quietly answer about part of a block ─────


def test_reading_a_block_pages_through_rather_than_truncating(monkeypatch):
    """A page size bounds a REQUEST. Answering from one page would tell a
    grower with 250 pests what 200 of them are doing and say nothing about the
    other 50 — worse than the refusal it replaced, because a wrong answer
    looks exactly like a right one.
    """
    rows = [{"item_id": f"i{i}", "kind": "pest", "pest": f"P{i}"} for i in range(MANY)]
    size = block_store.MAX_PAGE_SIZE
    seen: list[int] = []

    async def listing(npub, block_id, kind, *, season_year=None, page=0,
                      page_size=50, **kw) -> dict[str, Any]:
        seen.append(page)
        start = page * page_size
        return {
            "items": rows[start:start + page_size],
            "total": len(rows),
            "page": page,
            "pages": math.ceil(len(rows) / page_size),
        }

    monkeypatch.setattr(block_store, "list_items", listing)
    got = asyncio.run(server._all_rows("npub1x", "b1", "pest", None))

    assert len(got) == MANY, f"truncated to {len(got)} of {MANY}"
    assert seen == list(range(math.ceil(MANY / size))), "did not walk every page"


def test_a_single_page_block_asks_once(monkeypatch):
    """The paging must not cost a second round trip for the ordinary block."""
    calls: list[int] = []

    async def listing(npub, block_id, kind, *, season_year=None, page=0,
                      page_size=50, **kw) -> dict[str, Any]:
        calls.append(page)
        return {"items": [{"item_id": "i1"}], "total": 1, "page": 0, "pages": 1}

    monkeypatch.setattr(block_store, "list_items", listing)
    assert len(asyncio.run(server._all_rows("npub1x", "b1", "pest", None))) == 1
    assert calls == [0]


def test_a_grower_may_submit_as_many_field_observations_as_they_made():
    """Calibration refused at 61. What a grower saw with their own eyes is not
    this service's to ration — and the more of it there is, the better the
    calibration it feeds."""
    from goodearth_mcp import calibrate

    assert not hasattr(calibrate, "MAX_OBSERVATIONS")


def test_a_block_may_carry_as_many_names_as_the_grower_calls_it():
    """It refused a thirteenth alias. The shape is still checked and each name
    still trimmed; only the count is gone."""
    assert not hasattr(block_store, "MAX_ALIASES")
    assert len(block_store._clean_aliases([f"name {i}" for i in range(50)])) == 50
