"""Naming a block loosely, and blocks that overlap.

An agent working a real farm reported two things. "Frogdale Farm" did not
resolve, because the saved name was "Frogdale Farm, Panton, VT" and the lookup
matched only exactly — while the tool's own metadata offered "Frogdale Farm" as
its example of a name that works. And a meadow drawn inside that farm read to
the agent as a drawing error it should offer to fix.

Both came from the service saying less than it meant. These pin what it means.
"""

from __future__ import annotations

import asyncio

import pytest

from goodearth_mcp import block_store as bs
from goodearth_mcp import server

FARM = {"block_id": "map-farm", "name": "Frogdale Farm, Panton, VT", "aliases": [], "retired": False}
MEADOW = {"block_id": "map-meadow", "name": "Lower Frogdale Meadow", "aliases": [], "retired": False}
OLD = {"block_id": "map-old", "name": "Frogdale Farm 2024", "aliases": [], "retired": True}
BENCH = {"block_id": "map-bench", "name": "Upper Bench", "aliases": ["the high ground"], "retired": False}


# ── The pure matcher ─────────────────────────────────────────────────────


def test_a_name_missing_its_town_still_finds_the_block():
    assert bs.approximate("Frogdale Farm", [FARM, MEADOW]) == [FARM]


def test_one_distinctive_word_is_enough():
    assert bs.approximate("meadow", [FARM, MEADOW]) == [MEADOW]


def test_a_word_both_blocks_share_finds_both():
    # Returned as two, for the caller to refuse — never quietly narrowed to one.
    assert bs.approximate("Frogdale", [FARM, MEADOW]) == [FARM, MEADOW]


def test_every_word_asked_for_must_be_in_the_name():
    assert bs.approximate("Frogdale Orchard", [FARM, MEADOW]) == []


def test_an_article_or_possessive_is_not_held_against_the_asker():
    assert bs.approximate("the meadow", [FARM, MEADOW]) == [MEADOW]
    assert bs.approximate("my Frogdale Farm", [FARM, MEADOW]) == [FARM]


def test_a_real_word_in_a_name_is_not_treated_as_filler():
    # "field" is part of "North Field". Stripping it would make "North Field"
    # and "North Meadow" answer to the same question.
    north_field = {"block_id": "a", "name": "North Field", "aliases": [], "retired": False}
    north_meadow = {"block_id": "b", "name": "North Meadow", "aliases": [], "retired": False}
    assert bs.approximate("north field", [north_field, north_meadow]) == [north_field]


def test_an_alias_is_matched_loosely_too():
    assert bs.approximate("high ground", [FARM, BENCH]) == [BENCH]


def test_retired_ground_is_never_reached_by_a_loose_name():
    # An exact name still reaches it. A loose one must not: that is how a
    # grower asking about "the farm" gets last year's farm.
    assert bs.approximate("Frogdale Farm", [FARM, OLD]) == [FARM]


def test_punctuation_and_case_are_not_words():
    assert bs.approximate("FROGDALE, farm!", [FARM, MEADOW]) == [FARM]


def test_nothing_asked_matches_nothing():
    assert bs.approximate("", [FARM, MEADOW]) == []
    assert bs.approximate("the", [FARM, MEADOW]) == []


# ── resolve, with the store stubbed ──────────────────────────────────────


@pytest.fixture
def farm(monkeypatch):
    """Two live blocks that overlap on the ground, and one retired."""
    async def nothing(*_a, **_k):
        return None

    async def listing(npub, include_retired=False):
        return [b for b in (FARM, MEADOW, OLD, BENCH) if include_retired or not b["retired"]]

    monkeypatch.setattr(bs, "_row_by_id", nothing)
    monkeypatch.setattr(bs, "_row_by_lookup", nothing)
    monkeypatch.setattr(bs, "list_blocks", listing)


def run(coro):
    return asyncio.run(coro)


def test_resolve_finds_the_farm_by_the_name_the_grower_actually_says(farm):
    assert run(bs.resolve("npub1x", "Frogdale Farm"))["block_id"] == "map-farm"


def test_resolve_refuses_a_shared_word_and_names_every_candidate(farm):
    with pytest.raises(bs.AmbiguousBlock) as exc:
        run(bs.resolve("npub1x", "Frogdale"))
    msg = str(exc.value)
    # The agent can choose from this without another call.
    assert "Frogdale Farm, Panton, VT (map-farm)" in msg
    assert "Lower Frogdale Meadow (map-meadow)" in msg
    assert exc.value.candidates == ["map-farm", "map-meadow"]


def test_an_unknown_name_lists_what_the_grower_does_have(farm):
    with pytest.raises(bs.UnknownBlock) as exc:
        run(bs.resolve("npub1x", "Orchard"))
    msg = str(exc.value)
    assert "Lower Frogdale Meadow (map-meadow)" in msg
    assert "map-old" not in msg, "retired ground is not offered as a thing to ask about"


def test_the_refusal_says_how_many_more_rather_than_listing_forty(monkeypatch):
    many = [{"block_id": f"b{i}", "name": f"Bed {i}", "aliases": [], "retired": False} for i in range(40)]

    async def nothing(*_a, **_k):
        return None

    async def listing(npub, include_retired=False):
        return many

    monkeypatch.setattr(bs, "_row_by_id", nothing)
    monkeypatch.setattr(bs, "_row_by_lookup", nothing)
    monkeypatch.setattr(bs, "list_blocks", listing)
    with pytest.raises(bs.UnknownBlock) as exc:
        run(bs.resolve("npub1x", "Orchard"))
    assert "and 28 more" in str(exc.value)


def test_an_exact_alias_still_wins_before_any_loose_match(farm):
    assert run(bs.resolve("npub1x", "the high ground"))["block_id"] == "map-bench"


# ── What the metadata tells an agent ─────────────────────────────────────


def test_the_instructions_say_blocks_may_overlap_and_names_may_be_loose():
    text = server.mcp.instructions.lower()
    assert "overlap" in text and "never a drawing error" in text
    assert "any part of its" in text and "name" in text


def test_the_block_field_does_not_offer_an_example_the_resolver_refuses():
    """The bug in one line: the field's own example was a name that failed.

    It said 'e.g. "Frogdale Farm"' while the saved name carried a town, and an
    exact-only lookup turned the example into an error. Whatever example the
    field gives must resolve under the matcher it describes.
    """
    desc = server.BLOCK_FIELD.description
    assert "overlap" in desc.lower()
    lower = {"block_id": "x", "name": "Lower Meadow", "aliases": [], "retired": False}
    assert bs.approximate("Meadow", [lower]) == [lower], "the field's example must resolve"
    assert '"Meadow"' in desc and '"Lower Meadow"' in desc


def test_tool_metadata_names_no_real_farm():
    """Tool listings are public. Examples are generic, not the owner's ground."""
    import asyncio as _a

    async def texts() -> str:
        tools = await server.mcp.list_tools()
        return " ".join(
            (t.description or "") + " " + str(getattr(t, "parameters", "")) for t in tools
        ) + " " + (server.mcp.instructions or "")

    text = _a.run(texts()).lower()
    # Every patron's agent reads this text. A grower's plot names, and the town
    # and county around them, are that grower's alone.
    for real in ("frogdale", "panton", "addison"):
        assert real not in text, f"{real!r} is in public tool metadata"
