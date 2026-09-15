"""Seed lots — what a grower holds seed of, and what the packet says about it.

A fifth kind of item. It is refused when a figure on it could not be true, and
filed under no season, because a packet bought for last year is still on the
shelf this one.
"""

from __future__ import annotations

import json

import pytest

from goodearth_mcp import block_store as bs

GOOD = {
    "crop": "Zinnia", "variety": "Benary's Giant", "days_to_maturity": 75,
    "germination_pct": 88, "tested_on": "2026-02-01", "packed_for": 2026,
    "quantity": 500, "unit": "seeds", "source": "a seed house", "lot": "Z-114",
}


def test_seed_is_a_kind():
    assert bs._clean_kind("SEED") == "seed"
    assert "seed" not in bs.SEASON_KINDS


def test_a_whole_lot_is_accepted():
    bs.check_item_shape("seed", dict(GOOD))


def test_a_lot_with_only_its_crop_is_accepted():
    """Everything but the crop is the packet's to say, and a packet often
    says little."""
    bs.check_item_shape("seed", {"crop": "Kale"})


def test_a_lot_names_its_crop():
    with pytest.raises(bs.BlockError, match="names the crop"):
        bs.check_item_shape("seed", {"variety": "Benary's Giant"})


@pytest.mark.parametrize(("field", "value"), [
    ("germination_pct", 140),
    ("germination_pct", -1),
    ("days_to_maturity", 0),
    ("days_to_maturity", 5000),
    ("packed_for", 26),
    ("quantity", -3),
    ("germination_pct", "lots"),
    ("germination_pct", True),
    ("days_to_maturity", "nan"),
    ("quantity", "inf"),
])
def test_a_figure_that_could_not_be_true_is_refused(field, value):
    with pytest.raises(bs.BlockError, match=field):
        bs.check_item_shape("seed", {**GOOD, field: value})


def test_a_test_date_is_a_date():
    with pytest.raises(bs.BlockError, match="tested_on"):
        bs.check_item_shape("seed", {**GOOD, "tested_on": "last February"})


def test_how_much_seed_a_grower_holds_has_no_ceiling():
    bs.check_item_shape("seed", {**GOOD, "quantity": 10_000_000})


def test_the_other_kinds_are_not_asked_for_a_crop():
    bs.check_item_shape("pest", {"pest": "Codling moth"})


def test_variety_and_test_date_reach_the_columns_search_and_sort_read():
    cols = bs.clear_columns(GOOD)
    assert cols["name"] == "Zinnia"
    assert cols["event"] == "Benary's Giant"
    assert cols["starts_on"] == "2026-02-01"
    assert cols["target_gdd"] is None


class _Recorder:
    def __init__(self) -> None:
        self.calls: list[tuple[str, list]] = []

    async def _execute(self, sql, args=None):
        self.calls.append((sql, list(args or [])))
        return {}


@pytest.fixture
def recorder(monkeypatch):
    rec = _Recorder()

    async def vault_for():
        return rec

    monkeypatch.setattr(bs, "_vault_for", vault_for)
    return rec


# One row's parameters, in the order save_items writes them.
SEASON_AT = 4
PAYLOAD_AT = 6


async def test_a_seed_lot_is_filed_under_no_season(recorder):
    """A test date in February 2026 must not make the packet a 2026 thing —
    it is on the shelf until it is used or thrown out."""
    await bs.save_items("npub1x", "b1", "seed", [dict(GOOD)])
    _, args = recorder.calls[-1]
    assert args[SEASON_AT] is None
    assert json.loads(args[PAYLOAD_AT])["germination_pct"] == 88


async def test_a_planting_is_still_filed_under_its_own_season(recorder):
    await bs.save_items("npub1x", "b1", "planting", [{"crop": "Kale", "set_out": "2027-01-10"}])
    _, args = recorder.calls[-1]
    assert args[SEASON_AT] == 2027


async def test_a_bad_lot_writes_nothing(recorder):
    with pytest.raises(bs.BlockError):
        await bs.save_items("npub1x", "b1", "seed", [dict(GOOD), {"crop": ""}])
    assert recorder.calls == []
