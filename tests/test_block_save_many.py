"""Many blocks in one call, checked together, written together, in two trips.

An agent laying out a garden as 35 beds made 35 calls, about 29 s apart. The
store now saves a list: one read and one upsert whatever its length, and one
problem anywhere refuses the lot before anything is written.
"""

from __future__ import annotations

import asyncio

import pytest

from goodearth_mcp import block_store as bs

from .block_vault import BlockVault

GEO = {"lat": 44.17, "lon": -73.25, "radius_m": 30}


@pytest.fixture
def vault(monkeypatch):
    v = BlockVault()

    async def vault_for():
        return v

    monkeypatch.setattr(bs, "_cipher", None)
    monkeypatch.setattr(bs, "_vault_for", vault_for)
    return v


def spec(name, **kw):
    return bs.BlockSpec(name=name, geometry=GEO, **kw)


def save(specs):
    return asyncio.run(bs.save_blocks("npub1x", specs))


def test_a_batch_creates_every_block_in_order(vault):
    out = save([spec("Bed 1"), spec("Bed 2"), spec("Bed 3")])
    assert [b["name"] for b in out] == ["Bed 1", "Bed 2", "Bed 3"]
    assert len({b["block_id"] for b in out}) == 3
    assert len(vault.rows) == 3


@pytest.mark.parametrize("n", [1, 30])
def test_two_trips_whatever_the_size(vault, n):
    save([spec(f"Bed {i}") for i in range(n)])
    assert vault.trips == 2


def test_a_name_another_block_holds_refuses_the_lot(vault):
    save([spec("Bed 1")])
    vault.trips = 0
    with pytest.raises(bs.BlockError) as e:
        save([spec("Bed 2"), spec("Bed 1")])
    assert "block 2 ('Bed 1')" in str(e.value)
    assert "Nothing was saved" in str(e.value)
    assert len(vault.rows) == 1
    assert vault.trips == 1


def test_a_name_twice_in_one_call_refuses_the_lot(vault):
    with pytest.raises(bs.BlockError, match="also block 1 in this call"):
        save([spec("Bed 1"), spec("bed  1")])
    assert vault.rows == {}


def test_an_unknown_minted_id_refuses(vault):
    with pytest.raises(bs.BlockError, match="no block of yours has that id"):
        save([spec("Bed 1"), spec("Bed 2", block_id="blk-00000000-0000-0000-0000-000000000000")])
    assert vault.rows == {}


def test_an_update_in_a_batch_keeps_aliases_it_omits(vault):
    (first,) = save([spec("Bed 1", aliases=["the near bed"])])
    out = save([spec("Bed 1 east", block_id=first["block_id"]), spec("Bed 2")])
    assert out[0]["aliases"] == ["the near bed"]
    assert out[0]["name"] == "Bed 1 east"


def test_one_block_raises_its_own_error_unchanged(vault):
    save([spec("Bed 1")])
    with pytest.raises(bs.AmbiguousBlock):
        save([spec("Bed 1", block_id="map-other")])


def test_the_batch_is_bounded(vault):
    with pytest.raises(bs.BlockError, match="at most"):
        save([spec(f"Bed {i}") for i in range(bs.MAX_BATCH + 1)])
    with pytest.raises(bs.BlockError, match="no blocks"):
        save([])


# ── The tool's list, read as adversarial input ──────────────────────────────

from goodearth_mcp import server


def call(blocks, single_given=False):
    return asyncio.run(server._save_many_blocks("npub1x", blocks, single_given=single_given))


def test_the_tool_saves_a_list(vault):
    out = call([{"name": "Bed 1", "geometry": GEO}, {"name": "Bed 2", "geometry": GEO, "base_temp": 45}])
    assert out["success"] is True
    assert out["count"] == 2
    assert out["blocks"][1]["base_temp_f"] == 45.0
    assert out["blocks"][0]["area_ha"] > 0


@pytest.mark.parametrize("blocks,why", [
    ("Bed 1", "must be a list"),
    ([], "1 to"),
    (["Bed 1"], "must be an object"),
    ([{"name": "Bed 1", "geometry": GEO, "colour": "red"}], "unknown field"),
    ([{"geometry": GEO}], "needs a name"),
    ([{"name": "Bed 1", "geometry": GEO, "base_temp": "warm"}], "base_temp a number"),
    ([{"name": "Bed 1", "geometry": {"lat": 999, "lon": 0, "radius_m": 10}}], r"block 1 \('Bed 1'\)"),
])
def test_the_tool_refuses_a_bad_list_and_saves_nothing(vault, blocks, why):
    with pytest.raises(server.block_store.BlockError, match=why):
        call(blocks)
    assert vault.rows == {}


def test_one_block_and_a_list_together_are_refused(vault):
    with pytest.raises(server.block_store.BlockError, match="not both"):
        call([{"name": "Bed 1", "geometry": GEO}], single_given=True)
