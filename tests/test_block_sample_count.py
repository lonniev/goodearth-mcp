"""A block's sample count is read from its shape, never from a stored copy.

The count used to be written when a block was saved. When the terrain grid went
from 90 m to 30 m every saved block kept its old count, so My Plots said a farm
had 14 samples while its Dashboard read 106.
"""

from __future__ import annotations

import asyncio

import pytest

from goodearth_mcp import block_store as bs
from goodearth_mcp import region
from goodearth_mcp.region import parse_region

from .block_vault import BlockVault

GEO = {"lat": 44.1366, "lon": -73.356, "radius_m": 150}


@pytest.fixture
def vault(monkeypatch):
    v = BlockVault()

    async def vault_for():
        return v

    monkeypatch.setattr(bs, "_cipher", None)
    monkeypatch.setattr(bs, "_vault_for", vault_for)
    return v


def test_a_saved_block_reports_what_the_season_tools_read(vault):
    stored = asyncio.run(bs.save_block("npub1x", name="Bench", geometry=GEO, block_id="map-b1"))
    assert stored["sample_count"] == parse_region(GEO).sample_count


def test_nothing_about_the_count_is_stored(vault):
    asyncio.run(bs.save_block("npub1x", name="Bench", geometry=GEO, block_id="map-b1"))
    (row,) = vault.rows.values()
    assert "sample_count" not in row


def test_a_finer_grid_shows_on_blocks_saved_before_it(vault, monkeypatch):
    monkeypatch.setattr(region, "TERRAIN_CELL_M", 90.0)
    before = asyncio.run(bs.save_block("npub1x", name="Bench", geometry=GEO, block_id="map-b1"))
    monkeypatch.setattr(region, "TERRAIN_CELL_M", 30.0)
    (row,) = vault.rows.values()
    assert bs._hydrate(row, "npub1x")["sample_count"] > before["sample_count"]


def test_a_shape_that_no_longer_parses_has_no_count():
    assert bs._sample_count({"type": "LineString", "coordinates": []}) is None
