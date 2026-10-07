"""The sky each part of a block can see — a horizon profile per cell.

A block is rasterised at 2–20 m and, from every cell, 72 rays are cast at 5°
steps. Each ray records the highest angle at which it meets ground and the
highest at which it meets a tree, kept separate: the sky chart draws the two
in different colours, and a bare winter tree lets half the beam through where
a ridge lets none.

Near the cell (to 250 m) the rays step 2 m over canopy on smoothed ground.
Copernicus GLO-30 is a surface model — radar partly sees the forest top — so
the ground is smoothed over ~90 m and the trees come from the 1 m canopy map
instead. Beyond 250 m only terrain matters: 30 m steps to 2 km, then 120 m
steps to 20 km with the earth's curvature taken off. The far horizon barely
changes across a block, so it is cast on a 100 m sub-grid and shared.

The result does not change with the weather. The caller caches it per block
geometry and recomputes only when the block is redrawn or a source changes.
"""

from __future__ import annotations

import base64
import zlib
from dataclasses import dataclass, replace
from typing import Any

import numpy as np

from goodearth_mcp import rasters
from goodearth_mcp.region import M_PER_DEG_LAT, m_per_deg_lon

#: Bump when the cast changes shape or meaning, so cached rows re-key.
HORIZON_VERSION = 1
AZ_BINS = 72
AZ_STEP_DEG = 360.0 / AZ_BINS

MIN_CELL_M = 2.0
MAX_CELL_M = 20.0
MAX_CELLS = 2500

NEAR_RANGE_M = 250.0
NEAR_STEP_M = 2.0
MID_RANGE_M = 2_000.0
MID_STEP_M = 30.0
FAR_RANGE_M = 20_000.0
FAR_STEP_M = 120.0
#: The far horizon is cast on this sub-grid and shared by the cells near each point.
FAR_GRID_M = 100.0

#: Canopy heights under this are the map's noise (its published MAE is 2.8 m),
#: not a tree. A hedge this low shades a bed, but the map cannot see it.
CANOPY_MIN_M = 3.0
#: How high the thing being shaded stands: a bed, a seedling, a panel's edge.
OBSERVER_HEIGHT_M = 1.0
EARTH_RADIUS_M = 6_371_000.0
#: Standard refraction coefficient; the effective earth radius is R / (1 − k).
REFRACTION_K = 0.13
#: Cells per numpy pass: 128 × 72 rays × 125 steps keeps the temporaries near 40 MB.
CELL_CHUNK = 128

#: What set a ray's canopy angle — nothing (the tree line is the ground line),
#: or a tree of a leaf habit the land-cover map names.
KIND_NONE, KIND_EVERGREEN, KIND_DECIDUOUS, KIND_MIXED = 0, 1, 2, 3


class HorizonError(ValueError):
    """The block cannot be rasterised as asked."""


@dataclass(frozen=True)
class Grid:
    """The block as a regular lat/lon raster, row 0 north, with its kept cells.

    ``x, y`` are metres east and north of the block's centroid for the kept
    cells only; ``idx`` is their flat row-major index into the full raster,
    which is how the overlay and the grid payload address them.
    """

    lat0: float
    lon0: float
    cell_m: float
    rows: int
    cols: int
    min_lat: float
    min_lon: float
    max_lat: float
    max_lon: float
    mask: np.ndarray
    idx: np.ndarray
    x: np.ndarray
    y: np.ndarray

    @property
    def n(self) -> int:
        return int(self.idx.size)

    @property
    def d_lat(self) -> float:
        return self.cell_m / M_PER_DEG_LAT

    @property
    def d_lon(self) -> float:
        return self.cell_m / m_per_deg_lon(self.lat0)

    def latlon(self, x: np.ndarray | None = None, y: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
        """Metres east/north of the centroid → lat/lon (the kept cells by default)."""
        x = self.x if x is None else x
        y = self.y if y is None else y
        return self.lat0 + y / M_PER_DEG_LAT, self.lon0 + x / m_per_deg_lon(self.lat0)

    def nearest(self, lat: float, lon: float) -> int | None:
        """The kept cell under a point, or None when it is outside the block."""
        r = int((self.max_lat - lat) / self.d_lat)
        c = int((lon - self.min_lon) / self.d_lon)
        if not (0 <= r < self.rows and 0 <= c < self.cols) or not self.mask[r, c]:
            return None
        return int(np.searchsorted(self.idx, r * self.cols + c))

    def describe(self) -> dict[str, Any]:
        return {
            "rows": self.rows, "cols": self.cols, "cell_m": self.cell_m, "cells": self.n,
            "bounds": {
                "min_lat": round(self.min_lat, 6), "min_lon": round(self.min_lon, 6),
                "max_lat": round(self.max_lat, 6), "max_lon": round(self.max_lon, 6),
            },
        }


def ring_area_m2(ring: list[tuple[float, float]]) -> float:
    lat0 = sum(p[0] for p in ring) / len(ring)
    mx = m_per_deg_lon(lat0)
    xs = np.array([p[1] * mx for p in ring])
    ys = np.array([p[0] * M_PER_DEG_LAT for p in ring])
    return float(abs(np.dot(xs, np.roll(ys, -1)) - np.dot(ys, np.roll(xs, -1))) / 2.0)


def cell_size_for(area_m2: float) -> float:
    """Half-metre steps from 2 m, chosen so the block holds about MAX_CELLS cells."""
    want = np.sqrt(max(area_m2, 0.0) / MAX_CELLS)
    return max(MIN_CELL_M, float(np.ceil(want * 2.0) / 2.0))


def inside_ring(ring: list[tuple[float, float]], lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Vectorised ray-casting point-in-polygon, the same rule as ``region._point_in_ring``."""
    inside = np.zeros(lats.shape, dtype=bool)
    n = len(ring)
    for i in range(n):
        lat_i, lon_i = ring[i]
        lat_j, lon_j = ring[(i - 1) % n]
        crosses = (lat_i > lats) != (lat_j > lats)
        if lat_j == lat_i:
            continue
        x = (lon_j - lon_i) * (lats - lat_i) / (lat_j - lat_i) + lon_i
        inside ^= crosses & (lons < x)
    return inside


def build_grid(ring: list[tuple[float, float]]) -> Grid:
    """Rasterise the ring. Raises ``HorizonError`` when it is too big to answer at 20 m."""
    if len(ring) < 3:
        raise HorizonError("a block needs at least three corners")
    lats = np.array([p[0] for p in ring])
    lons = np.array([p[1] for p in ring])
    lat0, lon0 = float(lats.mean()), float(lons.mean())
    cell_m = cell_size_for(ring_area_m2(ring))

    while True:
        if cell_m > MAX_CELL_M:
            raise HorizonError(
                "this block is too large to answer cell by cell — draw the garden or the field, not the farm"
            )
        d_lat, d_lon = cell_m / M_PER_DEG_LAT, cell_m / m_per_deg_lon(lat0)
        rows = max(1, int(np.ceil((lats.max() - lats.min()) / d_lat)))
        cols = max(1, int(np.ceil((lons.max() - lons.min()) / d_lon)))
        min_lon, max_lat = float(lons.min()), float(lats.max())
        c_lat = max_lat - (np.arange(rows) + 0.5) * d_lat
        c_lon = min_lon + (np.arange(cols) + 0.5) * d_lon
        grid_lat, grid_lon = np.meshgrid(c_lat, c_lon, indexing="ij")
        mask = inside_ring(ring, grid_lat, grid_lon)
        if not mask.any():
            # A sliver thinner than a cell: keep the cell under its centroid.
            mask[min(rows - 1, int((max_lat - lat0) / d_lat)), min(cols - 1, int((lon0 - min_lon) / d_lon))] = True
        if mask.sum() <= MAX_CELLS:
            break
        cell_m += 0.5

    idx = np.flatnonzero(mask).astype(np.int32)
    x = ((grid_lon.ravel()[idx] - lon0) * m_per_deg_lon(lat0)).astype(np.float32)
    y = ((grid_lat.ravel()[idx] - lat0) * M_PER_DEG_LAT).astype(np.float32)
    return Grid(
        lat0=lat0, lon0=lon0, cell_m=cell_m, rows=rows, cols=cols,
        min_lat=max_lat - rows * d_lat, min_lon=min_lon, max_lat=max_lat, max_lon=min_lon + cols * d_lon,
        mask=mask, idx=idx, x=x, y=y,
    )


# ── The cast ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Horizon:
    """Per kept cell, the sky line in 72 azimuth bins (0 = north, clockwise).

    Angles are tenths of a degree in ``uint16``: 0.1° is 24 seconds of sun
    motion, fine enough that no rounding shows in an hours-per-day figure.
    """

    terrain: np.ndarray
    canopy: np.ndarray
    kind: np.ndarray

    def terrain_deg(self) -> np.ndarray:
        return self.terrain.astype(np.float32) / 10.0

    def canopy_deg(self) -> np.ndarray:
        return self.canopy.astype(np.float32) / 10.0

    def pack(self) -> dict[str, Any]:
        return {
            "v": HORIZON_VERSION,
            "n": int(self.terrain.shape[0]),
            "terrain": _b64(self.terrain),
            "canopy": _b64(self.canopy),
            "kind": _b64(self.kind),
        }

    @classmethod
    def unpack(cls, packed: dict[str, Any]) -> Horizon:
        n = int(packed["n"])
        return cls(
            terrain=_unb64(packed["terrain"], np.uint16).reshape(n, AZ_BINS),
            canopy=_unb64(packed["canopy"], np.uint16).reshape(n, AZ_BINS),
            kind=_unb64(packed["kind"], np.uint8).reshape(n, AZ_BINS),
        )


def _b64(arr: np.ndarray) -> str:
    return base64.b64encode(zlib.compress(np.ascontiguousarray(arr).tobytes(), 6)).decode()


def _unb64(text: str, dtype: Any) -> np.ndarray:
    return np.frombuffer(zlib.decompress(base64.b64decode(text)), dtype=dtype)


_LC_TO_KIND = np.full(256, KIND_NONE, dtype=np.uint8)
for _cls in (111, 112, 121, 122):
    _LC_TO_KIND[_cls] = KIND_EVERGREEN
for _cls in (113, 114, 123, 124):
    _LC_TO_KIND[_cls] = KIND_DECIDUOUS
for _cls in (115, 116, 125, 126):
    _LC_TO_KIND[_cls] = KIND_MIXED


def leaf_kinds(land_cover: rasters.Window | None) -> rasters.Window | None:
    """Land-cover classes → leaf habit per 100 m pixel.

    A tree the canopy map sees on a pixel the land-cover map calls field or
    town — a hedgerow, a yard tree — takes the habit of the forest around it,
    because that is what grows there. None when there is no land cover at all.
    """
    if land_cover is None:
        return None
    kinds = _LC_TO_KIND[land_cover.data]
    forest = kinds[kinds != KIND_NONE]
    fill = int(np.bincount(forest, minlength=4)[1:].argmax() + 1) if forest.size else KIND_MIXED
    kinds = np.where(kinds == KIND_NONE, fill, kinds).astype(np.uint8)
    return rasters.Window(kinds, replace(land_cover.page, nodata=None), land_cover.row0, land_cover.col0)


def smoothed(mosaic: rasters.Mosaic, radius_px: int = 1) -> rasters.Mosaic:
    """The terrain mosaic with a (2r+1)² box mean over each window — ~90 m for r = 1 at 30 m."""
    out = []
    for w in mosaic.windows:
        d = np.nan_to_num(w.data.astype(np.float32), nan=0.0)
        padded = np.pad(d, radius_px, mode="edge")
        k = 2 * radius_px + 1
        acc = np.zeros_like(d)
        for dr in range(k):
            for dc in range(k):
                acc += padded[dr:dr + d.shape[0], dc:dc + d.shape[1]]
        out.append(rasters.Window(acc / (k * k), w.page, w.row0, w.col0))
    return rasters.Mosaic(out)


def _azimuths() -> tuple[np.ndarray, np.ndarray]:
    az = np.radians(np.arange(AZ_BINS) * AZ_STEP_DEG)
    return np.sin(az).astype(np.float32), np.cos(az).astype(np.float32)


def cast(
    grid: Grid,
    ground: rasters.Mosaic,
    canopy: rasters.Mosaic,
    kinds: rasters.Window | None,
    far_ground: rasters.Mosaic | None,
) -> Horizon:
    """Cast the rays. ``ground`` is the smoothed near-field terrain; ``far_ground`` the overview.

    ``far_ground`` None means the terrain could not be read: the near field
    then has no ground either (``ground`` is a flat stand-in from the caller)
    and the result holds canopy only.
    """
    n = grid.n
    terrain = np.zeros((n, AZ_BINS), dtype=np.float32)
    canopy_t = np.zeros((n, AZ_BINS), dtype=np.float32)
    kind = np.zeros((n, AZ_BINS), dtype=np.uint8)
    sin_a, cos_a = _azimuths()
    steps = np.arange(NEAR_STEP_M, NEAR_RANGE_M + NEAR_STEP_M / 2, NEAR_STEP_M, dtype=np.float32)

    cell_lat, cell_lon = grid.latlon()
    z_obs = np.nan_to_num(ground.sample_bilinear(cell_lat, cell_lon), nan=0.0) + OBSERVER_HEIGHT_M

    for start in range(0, n, CELL_CHUNK):
        sl = slice(start, start + CELL_CHUNK)
        x = grid.x[sl][:, None, None]
        y = grid.y[sl][:, None, None]
        px = x + steps[None, None, :] * sin_a[None, :, None]
        py = y + steps[None, None, :] * cos_a[None, :, None]
        lat, lon = grid.latlon(px, py)
        zg = np.nan_to_num(ground.sample_bilinear(lat, lon), nan=-1e6)
        ch = np.nan_to_num(canopy.sample(lat, lon), nan=0.0)
        ch = np.where(ch >= CANOPY_MIN_M, ch, 0.0).astype(np.float32)
        rise_g = zg - z_obs[sl][:, None, None]
        tan_g = rise_g / steps[None, None, :]
        tan_c = (rise_g + ch) / steps[None, None, :]
        terrain[sl] = tan_g.max(axis=2)
        best = tan_c.argmax(axis=2)
        canopy_t[sl] = np.take_along_axis(tan_c, best[:, :, None], axis=2)[:, :, 0]
        if kinds is not None:
            k_lat = np.take_along_axis(lat, best[:, :, None], axis=2)[:, :, 0]
            k_lon = np.take_along_axis(lon, best[:, :, None], axis=2)[:, :, 0]
            k = np.nan_to_num(kinds.sample(k_lat, k_lon), nan=KIND_MIXED).astype(np.uint8)
            kind[sl] = np.where(canopy_t[sl] > terrain[sl], k, KIND_NONE)

    if far_ground is not None:
        far = _far_field(grid, ground, far_ground, z_obs, sin_a, cos_a)
        terrain = np.maximum(terrain, far)
    canopy_t = np.maximum(canopy_t, terrain)
    kind = np.where(canopy_t > terrain, kind, KIND_NONE).astype(np.uint8)

    return Horizon(
        terrain=_tenths(terrain), canopy=_tenths(canopy_t), kind=kind,
    )


def _tenths(tan_values: np.ndarray) -> np.ndarray:
    deg = np.degrees(np.arctan(tan_values))
    return np.clip(np.round(deg * 10.0), 0, 900).astype(np.uint16)


def _far_field(
    grid: Grid, ground: rasters.Mosaic, far_ground: rasters.Mosaic,
    z_obs: np.ndarray, sin_a: np.ndarray, cos_a: np.ndarray,
) -> np.ndarray:
    """Terrain tangent beyond the near field, cast on a coarse sub-grid and spread to the cells."""
    xs = np.arange(grid.x.min(), grid.x.max() + FAR_GRID_M, FAR_GRID_M, dtype=np.float32)
    ys = np.arange(grid.y.min(), grid.y.max() + FAR_GRID_M, FAR_GRID_M, dtype=np.float32)
    cx, cy = (a.ravel().astype(np.float32) for a in np.meshgrid(xs, ys, indexing="xy"))
    c_lat, c_lon = grid.latlon(cx, cy)
    cz = np.nan_to_num(ground.sample_bilinear(c_lat, c_lon), nan=0.0) + OBSERVER_HEIGHT_M

    mid = np.arange(NEAR_RANGE_M + MID_STEP_M, MID_RANGE_M + MID_STEP_M / 2, MID_STEP_M, dtype=np.float32)
    far = np.arange(MID_RANGE_M + FAR_STEP_M, FAR_RANGE_M + FAR_STEP_M / 2, FAR_STEP_M, dtype=np.float32)
    r_eff = EARTH_RADIUS_M / (1.0 - REFRACTION_K)
    best = np.full((cx.size, AZ_BINS), -np.inf, dtype=np.float32)
    for start in range(0, cx.size, 64):
        sl = slice(start, start + 64)
        for steps, source in ((mid, ground), (far, far_ground)):
            px = cx[sl][:, None, None] + steps[None, None, :] * sin_a[None, :, None]
            py = cy[sl][:, None, None] + steps[None, None, :] * cos_a[None, :, None]
            lat, lon = grid.latlon(px, py)
            z = np.nan_to_num(source.sample_bilinear(lat, lon), nan=-1e6)
            z = z - steps[None, None, :] ** 2 / (2.0 * r_eff)
            tan_g = (z - cz[sl][:, None, None]) / steps[None, None, :]
            best[sl] = np.maximum(best[sl], tan_g.max(axis=2))

    # Each fine cell takes the nearest coarse point's profile; its own
    # observer height differs by metres over kilometres, which is nothing.
    ci = np.clip(np.round((grid.x - xs[0]) / FAR_GRID_M).astype(int), 0, xs.size - 1)
    ri = np.clip(np.round((grid.y - ys[0]) / FAR_GRID_M).astype(int), 0, ys.size - 1)
    return best[ri * xs.size + ci]


__all__ = [
    "AZ_BINS", "AZ_STEP_DEG", "CANOPY_MIN_M", "FAR_RANGE_M", "HORIZON_VERSION",
    "KIND_DECIDUOUS", "KIND_EVERGREEN", "KIND_MIXED", "KIND_NONE",
    "MAX_CELLS", "MID_RANGE_M", "NEAR_RANGE_M", "OBSERVER_HEIGHT_M",
    "Grid", "Horizon", "HorizonError",
    "build_grid", "cast", "cell_size_for", "inside_ring", "leaf_kinds", "ring_area_m2", "smoothed",
]
