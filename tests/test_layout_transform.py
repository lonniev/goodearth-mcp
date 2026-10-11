"""Bed layouts inside a plot: the geometry holds, the paths are the width asked
for, the same seed gives the same layout, and accepting is one valid batch.

On an irregular five-sided plot near 44 N with a south-west spike, the shape
that produced the slivers in the hand-built Cottage Garden layout.
"""

from __future__ import annotations

import asyncio
import math

import pytest
from shapely.geometry import Polygon, shape

from goodearth_mcp import block_store as bs
from goodearth_mcp import server
from goodearth_mcp.layout import solver
from goodearth_mcp.layout.frame import frame_for, to_polygon
from goodearth_mcp.layout.rows import bearing_for
from goodearth_mcp.layout.transform import Params, propose

from .block_vault import BlockVault

RING = [(44.1700, -73.2560), (44.1712, -73.2535), (44.1705, -73.2512), (44.1688, -73.2518),
        (44.1680, -73.2550), (44.1676, -73.2575), (44.1700, -73.2560)]
SMALL = [(44.17000, -73.25000), (44.17040, -73.25000), (44.17040, -73.24940), (44.17000, -73.24940), (44.17000, -73.25000)]


def beds_of(variant):
    return [shape(b["geometry"]) for b in variant["accept"]["blocks"] if not b.get("retired")]


@pytest.fixture(scope="module")
def organic():
    return propose("Test Plot", RING, Params(style="organic"), seed=7, variants=2)


def test_every_bed_is_valid_disjoint_and_inside(organic):
    plot = Polygon([(lon, lat) for lat, lon in RING])
    for v in organic:
        beds = beds_of(v)
        assert len(beds) >= 20
        assert all(b.is_valid and not b.is_empty for b in beds)
        assert all(plot.contains(b) for b in beds)
        for i in range(len(beds)):
            for j in range(i + 1, len(beds)):
                assert not beds[i].intersects(beds[j])


def test_the_narrowest_path_is_the_lane_asked_for(organic):
    for v in organic:
        assert v["metrics"]["min_gap_m"] == pytest.approx(1.8, rel=0.05)


def test_every_bed_meets_the_compactness_floor(organic):
    for v in organic:
        assert v["metrics"]["worst_compactness"] >= 0.5


def test_the_same_seed_gives_the_same_layout_and_another_differs():
    a = propose("P", RING, Params(style="organic"), seed=3, variants=1)
    b = propose("P", RING, Params(style="organic"), seed=3, variants=1)
    c = propose("P", RING, Params(style="organic"), seed=4, variants=1)
    assert a[0]["accept"] == b[0]["accept"]
    assert a[0]["accept"] != c[0]["accept"]


def test_names_are_unique_and_carry_the_plot(organic):
    names = [b["name"] for b in organic[0]["accept"]["blocks"]]
    assert len(names) == len(set(names))
    assert all(n.startswith("Test Plot · ") for n in names)
    assert any(" Centre " in f" {n} " or "Centre" in n for n in names)


def test_room_names_never_repeat_on_an_irregular_plot():
    pts = [(0, 10), (1, 9), (0.5, 9.5), (-5, -1), (6, -2), (0, -9), (8, 8)]
    names = solver.compass_names(pts, (0, 0))
    assert len(names) == len(set(names))
    assert names.count("Centre") == 1


def test_a_bed_smaller_than_a_terrain_cell_is_named_so():
    v = propose("Tiny", SMALL, Params(style="organic", rooms=1, beds_per_room=4, perimeter=0.5), seed=1, variants=1)[0]
    assert any("terrain cell" in w for w in v["warnings"])


def test_rows_are_long_enough_and_clear_the_headland():
    v = propose("Rows", RING, Params(style="commercial_rows", bed_lane=0.6, bed_width=1.5, min_row_length=20), variants=1)[0]
    frame = frame_for(RING)
    plot = to_polygon(frame, RING)
    clear = plot.buffer(-3.0 - 6.0)
    beds = beds_of(v)
    assert beds
    for b in beds:
        metric = to_polygon(frame, [(lat, lon) for lon, lat in b.exterior.coords])
        assert metric.within(clear.buffer(0.05))
        assert metric.area / 1.5 >= 20 - 0.5
    assert v["metrics"]["turns"] == len(beds) - 1


def test_longest_axis_runs_along_a_rectangle():
    rect = Polygon([(0, 0), (100, 0), (100, 20), (0, 20)])
    assert bearing_for(rect, "longest_axis") == pytest.approx(90, abs=0.5)
    assert bearing_for(rect, "east_west") == 90


def test_a_large_layout_is_accepted_in_batches_of_100():
    v = propose("Rows", RING, Params(style="commercial_rows", bed_lane=0.4, bed_width=0.8, min_row_length=5), variants=1)[0]
    blocks = v["accept"]["blocks"]
    assert len(blocks) > 100
    assert [len(b) for b in v["accept"]["batches"]][:-1] == [100] * (len(v["accept"]["batches"]) - 1)
    assert sum(len(b) for b in v["accept"]["batches"]) == len(blocks)
    assert any("block_save calls" in w for w in v["warnings"])


# ── Accepting: the batch is one the save takes, retiring the old layout ────


@pytest.fixture
def vault(monkeypatch):
    v = BlockVault()

    async def vault_for():
        return v

    monkeypatch.setattr(bs, "_cipher", None)
    monkeypatch.setattr(bs, "_vault_for", vault_for)
    return v


def test_accepting_twice_retires_the_first_layout_under_v1_names(vault):
    first = propose("Plot", RING, Params(style="organic", rooms=2, beds_per_room=3), seed=1, variants=1)[0]
    saved = asyncio.run(server._save_many_blocks("npub1x", first["accept"]["blocks"], single_given=False))
    assert saved["count"] == len(first["accept"]["blocks"])
    inside = [dict(b, geometry=b["geometry"]) for b in saved["blocks"]]
    # The same names again: the old layout must give them up within the batch.
    again = propose("Plot", RING, Params(style="organic", rooms=2, beds_per_room=3), seed=1, variants=1,
                    inside=inside, taken_names={b["name"].lower() for b in inside})[0]
    retired = [b for b in again["accept"]["blocks"] if b.get("retired")]
    assert len(retired) == len(inside)
    assert all(b["name"].startswith("v1 ") for b in retired)
    out = asyncio.run(server._save_many_blocks("npub1x", again["accept"]["blocks"], single_given=False))
    assert out["count"] == len(again["accept"]["blocks"])
    names = [bs._open(r["name_enc"], "npub1x", r["block_id"]) for r in vault.rows.values()]
    assert len(names) == len(set(names))


def test_blocks_inside_finds_only_the_plots_own(vault):
    parent = {"block_id": "p", "geometry": {"type": "Polygon", "coordinates": [[[lon, lat] for lat, lon in RING]]}}
    inside = {"block_id": "c", "retired": False, "geometry": {"lat": 44.1695, "lon": -73.2545, "radius_m": 10}}
    outside = {"block_id": "o", "retired": False, "geometry": {"lat": 44.20, "lon": -73.20, "radius_m": 10}}
    gone = {"block_id": "r", "retired": True, "geometry": {"lat": 44.1695, "lon": -73.2545, "radius_m": 10}}
    assert [b["block_id"] for b in server._blocks_inside(parent, [parent, inside, outside, gone])] == ["c"]


def test_polsby_reads_a_circle_as_one():
    circle = Polygon([(math.cos(t / 100 * 2 * math.pi), math.sin(t / 100 * 2 * math.pi)) for t in range(100)])
    assert solver.polsby(circle) == pytest.approx(1, abs=0.01)


KW = {"rooms": 4, "beds_per_room": 8, "compactness_min": 0.5, "edge": "soft", "irregularity": 0.5,
      "bearing": None, "bearing_rule": "longest_axis", "bed_width_m": 1.2, "headland_m": 6.0,
      "min_row_length_m": 10.0}


def test_the_settings_take_good_paths_and_a_mix():
    p = server._layout_params("organic", {"bed": 1.2}, [1, 2], **KW)
    assert (p.perimeter, p.room_lane, p.bed_lane, p.size_mix) == (3.0, 3.0, 1.2, [1.0, 2.0])
    assert server._layout_params("commercial_rows", None, None, **KW).bed_lane == 0.6


@pytest.mark.parametrize("paths,mix,why", [
    ({"lane": 1.0}, None, "paths.lane"),
    ({"bed": 0.1}, None, "paths.bed"),
    ({"bed": True}, None, "paths.bed"),
    ("wide", None, "paths is an object"),
    (None, [], "size_mix"),
    (None, [0], "size_mix"),
    (None, ["big"], "size_mix"),
    (None, list(range(1, 12)), "size_mix"),
])
def test_the_settings_refuse_bad_arguments(paths, mix, why):
    with pytest.raises(bs.BlockError, match=why):
        server._layout_params("organic", paths, mix, **KW)


def test_too_many_beds_are_refused():
    with pytest.raises(bs.BlockError, match="rooms × beds_per_room"):
        server._layout_params("organic", None, None, **{**KW, "rooms": 20, "beds_per_room": 40})
