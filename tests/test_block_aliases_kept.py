"""A save that says nothing about aliases keeps them.

The upsert wrote whatever aliases it was handed, and ``None`` became ``[]``.
The page never sent aliases, so every save from it — a rename, a base
temperature, a retire — erased the ones an agent had set. An agent renaming a
block did the same.
"""

from __future__ import annotations

import asyncio

import pytest

from goodearth_mcp import block_store as bs

from .block_vault import BlockVault

GEO = {"lat": 44, "lon": -73, "radius_m": 200}


@pytest.fixture
def vault(monkeypatch):
    v = BlockVault()

    async def vault_for():
        return v

    monkeypatch.setattr(bs, "_cipher", None)
    monkeypatch.setattr(bs, "_vault_for", vault_for)
    asyncio.run(bs.save_block("npub1x", name="North Farm", geometry=GEO, block_id="map-farm",
                              aliases=["home", "the farm"]))
    return v


def save(**kw):
    return asyncio.run(bs.save_block("npub1x", geometry=GEO, **kw))


def test_a_rename_that_omits_aliases_keeps_them(vault):
    assert save(name="North Farm (east)", block_id="map-farm")["aliases"] == ["home", "the farm"]


def test_an_empty_list_clears_them(vault):
    assert save(name="North Farm", block_id="map-farm", aliases=[])["aliases"] == []


def test_a_given_list_replaces_them(vault):
    assert save(name="North Farm", block_id="map-farm", aliases=["the bench"])["aliases"] == ["the bench"]


def test_a_new_block_starts_with_none(vault):
    assert save(name="Lower Meadow", block_id="map-new")["aliases"] == []
