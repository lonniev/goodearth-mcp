"""A planting's sowing date — the seed half of its life.

A planting carried one date, its set-out. A seed-started one has an earlier
day too, and "When to sow" already predicts that pair: the service forecast a
date the grower could never record against it.

`sown_on` rides in the payload rather than in a typed column, which is what
makes this check worth having. A `"Feb 14"` would be stored happily, read back
as a string the chart cannot place, and show up as a planting that silently
has no sowing — which reads as "never sown" rather than as "we could not
understand this".
"""

from __future__ import annotations

import pytest

from goodearth_mcp import block_store as bs

PLANTING = {"crop": "Asparagus", "set_out": "2026-04-10", "gdd_target": 600}


def test_a_sowing_date_is_a_date():
    with pytest.raises(bs.BlockError, match="sown_on"):
        bs.check_item_shape("planting", {**PLANTING, "sown_on": "Feb 14"})


def test_a_real_sowing_date_is_accepted():
    bs.check_item_shape("planting", {**PLANTING, "sown_on": "2026-02-14"})


def test_a_planting_with_no_sowing_date_still_saves():
    """Most of the ledger has none, and a date nobody stated is not an error.
    A presence row — a tree that grows here — has no dates at all."""
    bs.check_item_shape("planting", dict(PLANTING))
    bs.check_item_shape("planting", {"crop": "Maple · sugar"})


def test_a_blank_sowing_date_is_absence_not_a_bad_date():
    """Clearing the field in the row sends "", and that means "not stated"."""
    bs.check_item_shape("planting", {**PLANTING, "sown_on": ""})
    bs.check_item_shape("planting", {**PLANTING, "sown_on": None})


def test_the_packet_is_not_required_behind_the_date():
    """Garlic cloves, asparagus crowns, a nursery start and a grafted tree all
    have a day they went in and no packet at all. The date is the fact; the
    packet is the annotation."""
    bs.check_item_shape("planting", {
        "crop": "Garlic", "set_out": "2026-10-15", "sown_on": "2026-10-15",
    })


def test_a_sowing_date_the_same_day_as_the_set_out_is_ordinary():
    """Direct-sown: seed went in where it will grow. The model says so by
    holding the same date twice rather than by inventing a flag."""
    bs.check_item_shape("planting", {**PLANTING, "sown_on": PLANTING["set_out"]})
