"""Which plots a roll-up takes in: the parts of a plot, by where they lie.

A plot is part of another when it is smaller and its centre lies within the
other's outline. Smaller makes the relation one-way; the centre test admits a
bed that strays over the edge; and parthood carries down, so a bed in a field
in a farm is part of the farm without anything walking the levels.
"""

from __future__ import annotations

import asyncio

from goodearth_mcp import block_store as bs
from goodearth_mcp import server


def square(block_id: str, south: float, west: float, side: float, **extra) -> dict:
    """A square plot, `side` degrees across, with its south-west corner given."""
    n, e = south + side, west + side
    ring = [[west, south], [e, south], [e, n], [west, n], [west, south]]
    return {"block_id": block_id, "name": block_id, "retired": False,
            "geometry": {"type": "Polygon", "coordinates": [ring]}, **extra}


FARM = square("farm", 44.0, -73.0, 0.010)
FIELD = square("field", 44.002, -72.998, 0.004)          # inside the farm
BED = square("bed", 44.003, -72.997, 0.001)              # inside the field, so inside the farm
STRAY = square("stray", 44.0085, -72.9915, 0.002)        # centre inside, top over the edge
NEIGHBOUR = square("neighbour", 44.008, -72.992, 0.006)  # overlaps, centre outside
TWIN = square("twin", 44.0, -73.0, 0.010)                # the farm drawn twice


def ids(plots: list[dict]) -> list[str]:
    return sorted(b["block_id"] for b in plots)


def test_a_plot_takes_in_its_parts_at_every_depth():
    assert ids(server._blocks_inside(FARM, [FARM, FIELD, BED])) == ["bed", "field"]


def test_a_part_takes_in_only_its_own_parts():
    assert ids(server._blocks_inside(FIELD, [FARM, FIELD, BED])) == ["bed"]
    assert ids(server._blocks_inside(BED, [FARM, FIELD, BED])) == []


def test_a_plot_straying_over_the_edge_counts_when_its_centre_is_inside():
    assert ids(server._blocks_inside(FARM, [STRAY])) == ["stray"]


def test_an_overlapping_neighbour_whose_centre_is_outside_does_not():
    assert ids(server._blocks_inside(FARM, [NEIGHBOUR])) == []


def test_two_plots_of_one_size_are_never_parts_of_each_other():
    """Without `smaller`, each would hold the other's centre and each would
    roll up into the other."""
    assert server._blocks_inside(FARM, [TWIN]) == []
    assert server._blocks_inside(TWIN, [FARM]) == []


def test_parthood_runs_one_way():
    assert ids(server._blocks_inside(FARM, [FIELD])) == ["field"]
    assert server._blocks_inside(FIELD, [FARM]) == []


def test_a_retired_plot_is_not_rolled_up():
    assert server._blocks_inside(FARM, [square("gone", 44.002, -72.998, 0.004, retired=True)]) == []


def test_a_pin_is_a_part_like_any_plot():
    pin = {"block_id": "pin", "retired": False, "geometry": {"lat": 44.005, "lon": -72.995, "radius_m": 10}}
    assert ids(server._blocks_inside(FARM, [pin])) == ["pin"]


def test_the_worked_example_rolls_up_nothing(monkeypatch):
    async def never(*_a, **_k):
        raise AssertionError("the example has no parts to read")
    monkeypatch.setattr(bs, "list_blocks", never)
    example = {"block_id": bs.EXAMPLE_BLOCK_ID, "geometry": FARM["geometry"]}
    assert asyncio.run(server._plots_inside("npub1a", example)) == []


def test_the_roll_up_reads_the_growers_live_plots_once(monkeypatch):
    asked: list[tuple] = []

    async def plots(npub, **kw):
        asked.append((npub, kw))
        return [FARM, FIELD, BED, NEIGHBOUR]
    monkeypatch.setattr(bs, "list_blocks", plots)
    assert ids(asyncio.run(server._plots_inside("npub1a", FARM))) == ["bed", "field"]
    assert asked == [("npub1a", {})], "one read, live plots only"
