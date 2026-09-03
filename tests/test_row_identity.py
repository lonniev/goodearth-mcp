"""A computed row must know which saved item it is — and be unchanged by it.

The owner's cases: "A farmer might have several rows of the same crop set out
at different starts" and "they might want to track several events for the same
creature class. Like migration arrival and then migration departure."

Nothing a human would name tells those apart, so identity is carried rather
than inferred. The other half of that bargain is that carrying it changes no
answer, which is what most of this file checks.
"""

from __future__ import annotations

import asyncio
from datetime import date

import pytest

from goodearth_mcp import (
    block_store,
    crop_status,
    pest_window,
    record_cache,
    wildlife_window,
)
from goodearth_mcp import (
    region as reg,
)


class OfflineVault:
    def _t(self, t): return t
    async def _execute(self, sql, params=None): return {}


@pytest.fixture(autouse=True)
def _ground():
    record_cache._vault = OfflineVault()
    record_cache._cipher = None
    record_cache._schema_done = True
    record_cache.serving("")          # cache off; every read goes upstream
    yield
    record_cache._vault = None
    record_cache._schema_done = False


REGION = reg.parse_region(block_store.EXAMPLE_BLOCK["geometry"])
TODAY = date(2026, 9, 3)


def strip_refs(value):
    """The same answer with every ref removed, at any depth."""
    if isinstance(value, dict):
        return {k: strip_refs(v) for k, v in value.items() if k != "ref"}
    if isinstance(value, list):
        return [strip_refs(v) for v in value]
    return value


# ── The ref reaches the answer ───────────────────────────────────────────


def test_two_successions_of_one_crop_are_two_identifiable_rows():
    """The owner's case. Today they collide on the delete button."""
    out = asyncio.run(crop_status.region_crop_ledger(REGION, [
        {"ref": "itm_early", "crop": "Zinnia", "gdd_target": 1100, "set_out": "2026-05-20"},
        {"ref": "itm_late", "crop": "Zinnia", "gdd_target": 1100, "set_out": "2026-06-24"},
    ], today=TODAY))
    refs = [r.get("ref") for r in out["plantings"]]
    assert sorted(refs) == ["itm_early", "itm_late"]
    assert len(set(refs)) == 2, "same crop, same target — only the ref separates them"


def test_a_perennial_that_computes_nothing_still_carries_its_ref():
    """Otherwise the one row you most want to fix is the one you cannot."""
    out = asyncio.run(crop_status.region_crop_ledger(REGION, [
        {"ref": "itm_apple", "crop": "Honeycrisp apple"},
    ], today=TODAY))
    assert out["untracked"][0]["ref"] == "itm_apple"


def test_two_events_for_one_species_are_two_identifiable_rows():
    """The owner's case: migration arrival, then migration departure."""
    out = asyncio.run(wildlife_window.region_wildlife(REGION, [
        {"ref": "itm_in", "species": "Hirundo rustica", "event": "migration arrival",
         "driver": "calendar", "typical_on": "2026-04-20"},
        {"ref": "itm_out", "species": "Hirundo rustica", "event": "migration departure",
         "driver": "calendar", "typical_on": "2026-09-10"},
    ], today=TODAY))
    refs = [r.get("ref") for r in out["events"]]
    assert sorted(refs) == ["itm_in", "itm_out"]


def test_a_pest_assessment_carries_its_ref():
    out = asyncio.run(pest_window.region_pest_window(REGION, [
        {"ref": "itm_cm", "pest": "Codling moth", "base_temp": 50, "biofix": "2026-05-01",
         "stages": [{"stage": "1st flight", "gdd": 220}]},
    ], today=TODAY))
    assert out["pests"][0]["ref"] == "itm_cm"


# ── ...and changes nothing on the way ────────────────────────────────────


@pytest.mark.parametrize("rows", [
    [{"crop": "Zinnia", "gdd_target": 1100, "set_out": "2026-05-20"},
     {"crop": "Honeycrisp apple"}],
])
def test_a_ledger_answers_identically_with_and_without_refs(rows):
    """The ref is carried, never read. If it reached a calculation the numbers would
    differ, and a row's progress would depend on its database id."""
    plain = asyncio.run(crop_status.region_crop_ledger(REGION, rows, today=TODAY))
    tagged = asyncio.run(crop_status.region_crop_ledger(
        REGION, [{**r, "ref": f"itm_{i}"} for i, r in enumerate(rows)], today=TODAY,
    ))
    assert strip_refs(tagged) == strip_refs(plain)


def test_wildlife_answers_identically_with_and_without_refs():
    rows = [{"species": "Hirundo rustica", "event": "migration arrival",
             "driver": "calendar", "typical_on": "2026-04-20"}]
    plain = asyncio.run(wildlife_window.region_wildlife(REGION, rows, today=TODAY))
    tagged = asyncio.run(wildlife_window.region_wildlife(
        REGION, [{**r, "ref": "itm_x"} for r in rows], today=TODAY))
    assert strip_refs(tagged) == strip_refs(plain)


def test_pests_answer_identically_with_and_without_refs():
    rows = [{"pest": "Codling moth", "base_temp": 50, "biofix": "2026-05-01",
             "stages": [{"stage": "1st flight", "gdd": 220}]}]
    plain = asyncio.run(pest_window.region_pest_window(REGION, rows, today=TODAY))
    tagged = asyncio.run(pest_window.region_pest_window(
        REGION, [{**r, "ref": "itm_x"} for r in rows], today=TODAY))
    assert strip_refs(tagged) == strip_refs(plain)


# ── A ref is never invented ──────────────────────────────────────────────


def test_a_row_sent_without_a_ref_gets_none():
    """An agent calling the tool directly passes no refs, and must not be
    handed ids that correspond to nothing in anyone's record."""
    out = asyncio.run(crop_status.region_crop_ledger(REGION, [
        {"crop": "Zinnia", "gdd_target": 1100, "set_out": "2026-05-20"},
    ], today=TODAY))
    assert "ref" not in out["plantings"][0]


def test_a_hostile_ref_is_stringified_not_trusted():
    """It is opaque, so it is never parsed — but it must not arrive as a dict
    and end up serialised into someone's answer as structure."""
    out = asyncio.run(crop_status.region_crop_ledger(REGION, [
        {"ref": {"drop": "table"}, "crop": "Zinnia", "gdd_target": 1100,
         "set_out": "2026-05-20"},
    ], today=TODAY))
    assert isinstance(out["plantings"][0].get("ref"), str)
