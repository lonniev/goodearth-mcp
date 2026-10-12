"""A block names the groups it belongs to; a group inside a group is a path.

Groups live on the block, sealed like its aliases: a save that says nothing
about groups keeps them, `[]` clears them, and regrouping many plots is one
batched save. `North Farm / Orchard` is inside `North Farm`, so a plot in the
Orchard is in the North Farm too.
"""

from __future__ import annotations

import asyncio

import pytest

from goodearth_mcp import block_store as bs
from goodearth_mcp import server
from goodearth_mcp.layout.transform import Params, propose

from .block_vault import BlockVault

GEO = {"lat": 44, "lon": -73, "radius_m": 200}


@pytest.fixture
def vault(monkeypatch):
    v = BlockVault()

    async def vault_for():
        return v

    monkeypatch.setattr(bs, "_cipher", None)
    monkeypatch.setattr(bs, "_vault_for", vault_for)
    asyncio.run(bs.save_block("npub1x", name="Cottage Garden", geometry=GEO, block_id="map-garden",
                              groups=["North Farm / Gardens"]))
    return v


def save(**kw):
    return asyncio.run(bs.save_block("npub1x", geometry=GEO, **kw))


def test_groups_are_stored_and_read_back(vault):
    (row,) = vault.rows.values()
    assert bs._hydrate(row, "npub1x")["groups"] == ["North Farm / Gardens"]


def test_a_save_that_omits_groups_keeps_them(vault):
    assert save(name="Cottage Garden (east)", block_id="map-garden")["groups"] == ["North Farm / Gardens"]


def test_an_empty_list_clears_them(vault):
    assert save(name="Cottage Garden", block_id="map-garden", groups=[])["groups"] == []


def test_a_new_block_starts_in_no_group(vault):
    assert save(name="Lower Meadow", block_id="map-new")["groups"] == []


def test_regrouping_many_plots_is_one_batch_of_two_trips(vault):
    vault.trips = 0
    out = asyncio.run(server._save_many_blocks("npub1x", [
        {"name": "Cottage Garden", "geometry": GEO, "block": "map-garden", "groups": ["Orchard"]},
        {"name": "Apple Row", "geometry": GEO, "groups": ["Orchard / Apples"]},
    ], single_given=False))
    assert [b["groups"] for b in out["blocks"]] == [["Orchard"], ["Orchard / Apples"]]
    assert vault.trips == 2


@pytest.mark.parametrize(("given", "clean"), [
    ("North Farm", "North Farm"),
    ("a/ b /c", "a / b / c"),
    ("  Orchard  /Apples ", "Orchard / Apples"),
])
def test_a_path_is_cleaned(given, clean):
    assert bs.clean_group_path(given) == clean


@pytest.mark.parametrize("bad", ["", "  / ", "a//b", "a / / b", "/".join("abcdefg"), "x" * (bs.MAX_NAME_LEN + 1)])
def test_a_bad_path_is_refused(bad):
    with pytest.raises(bs.BlockError):
        bs.clean_group_path(bad)


def test_duplicates_fold_and_the_count_is_bounded():
    assert bs._clean_groups(["Orchard", "orchard ", "Orchard/Apples"]) == ["Orchard", "Orchard / Apples"]
    with pytest.raises(bs.BlockError):
        bs._clean_groups([f"g{i}" for i in range(bs.MAX_GROUPS + 1)])
    with pytest.raises(bs.BlockError):
        bs._clean_groups("Orchard")


def test_the_tool_refuses_groups_that_are_not_a_list(vault):
    with pytest.raises(bs.BlockError, match="groups lists"):
        asyncio.run(server._save_many_blocks("npub1x", [
            {"name": "Apple Row", "geometry": GEO, "groups": "Orchard"},
        ], single_given=False))


def test_a_group_holds_the_groups_inside_it():
    assert bs.in_group(["North Farm / Orchard / Apples"], "North Farm")
    assert bs.in_group(["North Farm / Orchard / Apples"], "north farm / orchard")
    assert bs.in_group(["North Farm"], "North Farm")
    assert not bs.in_group(["North Farmstead"], "North Farm")
    assert not bs.in_group(["North Farm"], "North Farm / Orchard")


def test_a_plots_beds_go_in_a_group_named_for_it():
    assert bs.beds_groups("Cottage Garden", ["North Farm / Gardens"]) == ["North Farm / Gardens / Cottage Garden"]
    assert bs.beds_groups("Cottage Garden", []) == ["Cottage Garden"]
    assert bs.beds_groups("A/B", []) == ["A-B"]
    deep = " / ".join("abcdef")
    assert bs.beds_groups("Bed", [deep]) == ["Bed"]


def test_accepting_a_layout_groups_the_new_beds():
    ring = [(44.1700, -73.2560), (44.1712, -73.2535), (44.1705, -73.2512), (44.1688, -73.2518),
            (44.1680, -73.2550), (44.1676, -73.2575), (44.1700, -73.2560)]
    (v,) = propose("Test Plot", ring, Params(style="organic"), seed=7, variants=1,
                   bed_groups=["Test Plot"])
    beds = [b for b in v["accept"]["blocks"] if not b.get("retired")]
    assert beds and all(b["groups"] == ["Test Plot"] for b in beds)
