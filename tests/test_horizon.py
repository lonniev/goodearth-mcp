"""The block raster and the cast: sizes that fit, rays that see what is there."""

from __future__ import annotations

import numpy as np
import pytest

from goodearth_mcp import horizon as hz
from goodearth_mcp import rasters, region

ACRE_M2 = 4046.86


@pytest.mark.parametrize(("acres", "cell"), [(0.25, 2.0), (1, 2.0), (2.5, 2.5), (10, 4.5), (50, 9.0)])
def test_cell_size_keeps_a_block_near_the_cell_budget(acres, cell):
    assert hz.cell_size_for(acres * ACRE_M2) == cell


def _square(lat: float, lon: float, side_m: float) -> list[tuple[float, float]]:
    d_lat = side_m / region.M_PER_DEG_LAT
    d_lon = side_m / region.m_per_deg_lon(lat)
    return [(lat, lon), (lat, lon + d_lon), (lat + d_lat, lon + d_lon), (lat + d_lat, lon)]


def test_grid_holds_at_most_the_budget_and_refuses_a_farm():
    g = hz.build_grid(_square(44.0, -72.0, 200.0))
    assert g.n <= hz.MAX_CELLS
    assert g.cell_m == 4.0
    assert g.mask.sum() == g.n
    with pytest.raises(hz.HorizonError):
        hz.build_grid(_square(44.0, -72.0, 1500.0))


def test_grid_rows_run_north_to_south_and_nearest_finds_the_cell():
    g = hz.build_grid(_square(44.0, -72.0, 40.0))
    lat, _lon = g.latlon()
    assert lat[0] > lat[-1]  # row 0 is north
    i = g.nearest(44.0 + 10.0 / region.M_PER_DEG_LAT, -72.0 + 10.0 / region.m_per_deg_lon(44.0))
    assert i is not None
    assert abs(g.x[i] - (10.0 - 20.0)) < g.cell_m and abs(g.y[i] - (10.0 - 20.0)) < g.cell_m
    assert g.nearest(45.0, -72.0) is None


def test_inside_ring_agrees_with_the_scalar_rule():
    ring = [(44.0, -72.0), (44.0, -71.99), (44.01, -71.99), (44.005, -71.995), (44.01, -72.0)]
    rng = np.random.default_rng(3)
    lats = rng.uniform(43.995, 44.015, 500)
    lons = rng.uniform(-72.005, -71.985, 500)
    vec = hz.inside_ring(ring, lats, lons)
    scalar = np.array([region._point_in_ring(a, b, ring) for a, b in zip(lats, lons, strict=True)])
    assert np.array_equal(vec, scalar)


class _Flat:
    def sample_bilinear(self, lats, lons):
        return np.zeros(np.shape(lats), np.float32)

    sample = sample_bilinear


class _Wall:
    """A 20 m tree line along one latitude."""

    def __init__(self, lat: float, height: float = 20.0) -> None:
        self.lat, self.height = lat, height

    def sample(self, lats, lons):
        return np.where(np.abs(lats - self.lat) < 1.0 / region.M_PER_DEG_LAT, self.height, 0.0).astype(np.float32)


def test_flat_open_ground_has_no_horizon():
    g = hz.build_grid(_square(44.0, -72.0, 30.0))
    h = hz.cast(g, _Flat(), _Flat(), None, None)
    assert not h.terrain.any() and not h.canopy.any() and not h.kind.any()


def test_a_tree_line_to_the_south_raises_the_canopy_line_there_only():
    g = hz.build_grid(_square(44.0, -72.0, 30.0))
    south = int(g.y.argmin())
    distance = float(g.y[south] - (-20.0 - 15.0))  # cell to a wall 20 m south of the block
    h = hz.cast(g, _Flat(), _Wall(44.0 - 20.0 / region.M_PER_DEG_LAT), None, None)
    expected = np.degrees(np.arctan((20.0 - hz.OBSERVER_HEIGHT_M) / distance))
    assert h.canopy_deg()[south, 36] == pytest.approx(expected, abs=3.0)  # bin 36 = 180°
    assert h.canopy_deg()[south, 0] == 0.0
    assert h.terrain_deg()[south, 36] == 0.0  # trees are not ground


def test_pack_round_trips_and_stays_small():
    rng = np.random.default_rng(4)
    h = hz.Horizon(
        terrain=rng.integers(0, 300, (2500, 72), dtype=np.uint16),
        canopy=rng.integers(300, 900, (2500, 72), dtype=np.uint16),
        kind=rng.integers(0, 4, (2500, 72), dtype=np.uint8),
    )
    packed = h.pack()
    back = hz.Horizon.unpack(packed)
    assert np.array_equal(back.terrain, h.terrain) and np.array_equal(back.canopy, h.canopy)
    assert np.array_equal(back.kind, h.kind)
    # A real block's profiles vary smoothly from cell to cell, and that is what zlib eats.
    smooth = hz.Horizon(
        terrain=(np.linspace(0, 300, 2500)[:, None] + np.arange(72)[None, :]).astype(np.uint16),
        canopy=(np.linspace(300, 800, 2500)[:, None] + np.arange(72)[None, :]).astype(np.uint16),
        kind=np.full((2500, 72), hz.KIND_MIXED, np.uint8),
    )
    assert sum(len(v) for v in smooth.pack().values() if isinstance(v, str)) < 100_000


def test_leaf_kinds_fill_non_forest_with_the_stand_around_it():
    classes = np.array([[114, 114, 40], [114, 50, 111]], dtype=np.uint8)
    page = rasters.Page(
        url="x", level=0, width=3, height=2, dtype=np.dtype(np.uint8), compression=1, predictor=1,
        tiled=False, chunk_w=3, chunk_h=1, offsets=np.zeros(2, np.uint64), bytecounts=np.zeros(2, np.uint64),
        nodata=255, crs="EPSG:4326", x0=0.0, y0=1.0, dx=0.1, dy=0.1,
    )
    kinds = hz.leaf_kinds(rasters.Window(classes, page, 0, 0))
    assert kinds is not None
    assert kinds.data.tolist() == [[2, 2, 2], [2, 2, 1]]  # deciduous is the stand; evergreen stays
    assert hz.leaf_kinds(None) is None
