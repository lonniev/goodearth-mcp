"""A save that says nothing about aliases keeps them.

The upsert wrote whatever aliases it was handed, and ``None`` became ``[]``.
The page never sent aliases, so every save from it — a rename, a base
temperature, a retire — erased the ones an agent had set. An agent renaming a
block did the same.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from goodearth_mcp import block_store as bs

HAS = {"block_id": "map-farm", "name": "North Farm", "aliases": ["home", "the farm"], "retired": False}


@pytest.fixture
def written(monkeypatch):
    """Stub the store; return the aliases each save wrote."""
    out: list[list[str]] = []

    class Vault:
        async def _execute(self, _sql, params):
            out.append(json.loads(params[4]))
            return {"rows": []}

    async def vault():
        return Vault()

    async def by_id(npub, bid):
        # The farm exists before any save; a new block only once it is written.
        if bid != "map-farm" and not out:
            return None
        return {**HAS, "block_id": bid, "aliases": out[-1] if out else HAS["aliases"]}

    async def by_lookup(*_a):
        return None

    monkeypatch.setattr(bs, "_cipher", None)
    monkeypatch.setattr(bs, "_vault_for", vault)
    monkeypatch.setattr(bs, "_row_by_id", by_id)
    monkeypatch.setattr(bs, "_row_by_lookup", by_lookup)
    return out


def save(**kw):
    return asyncio.run(bs.save_block("npub1x", geometry={"lat": 44, "lon": -73, "radius_m": 200}, **kw))


def test_a_rename_that_omits_aliases_keeps_them(written):
    save(name="North Farm (east)", block_id="map-farm")
    assert written == [["home", "the farm"]]


def test_an_empty_list_clears_them(written):
    save(name="North Farm", block_id="map-farm", aliases=[])
    assert written == [[]]


def test_a_given_list_replaces_them(written):
    save(name="North Farm", block_id="map-farm", aliases=["the bench"])
    assert written == [["the bench"]]


def test_a_new_block_starts_with_none(written):
    save(name="Lower Meadow", block_id="map-new")
    assert written == [[]]
