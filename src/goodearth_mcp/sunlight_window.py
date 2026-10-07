"""Assemble the sunlight answer — garden light across a block, month by month.

Composes the block raster, the per-cell horizon (read from the cache or cast
from the canopy and terrain maps), the sun's path on each month's
representative day, and the block's own leaf season into one answer: how
many hours of direct sun each part of this ground gets, and how that spreads
across it.

The horizon is the expensive part and the stable one — it changes when a
tree is cut or the block is redrawn, never with the weather — so it is cast
once per block geometry and remembered. Everything after it is a second's
work in numpy and runs on every call.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

import numpy as np

from goodearth_mcp import horizon as hz
from goodearth_mcp import rasters, record_cache, sources, sunlight, sunpath
from goodearth_mcp.region import M_PER_DEG_LAT, Region, m_per_deg_lon

logger = logging.getLogger(__name__)

NORMALS_SPAN_YEARS = 10
#: Casting two blocks at once is the most this process gives numpy; the rest queue.
_HEAVY = asyncio.Semaphore(2)
#: Cast horizons held unpacked, so the month slider's repeat calls skip the row.
_MEMO_SIZE = 16
_memo: dict[str, HorizonRecord] = {}

CACHE_KIND = "sun_horizon"


class SunlightError(ValueError):
    """A caller's request cannot be answered as asked."""


@dataclass(frozen=True)
class HorizonRecord:
    """A cast horizon and what went into it."""

    horizon: hz.Horizon
    canopy_observed: str | None
    terrain_read: bool
    land_cover_read: bool
    computed_now: bool


def horizon_subject(ring: list[tuple[float, float]]) -> str:
    """What exactly was cast: the outline to 5 decimals and every source's version."""
    outline = "|".join(f"{lat:.5f},{lon:.5f}" for lat, lon in ring)
    versions = f"h{hz.HORIZON_VERSION}|{rasters.CHM_VERSION}|{rasters.DEM_VERSION}|{rasters.LANDCOVER_VERSION}"
    return hashlib.sha256(f"{outline}|{versions}".encode()).hexdigest()[:32]


# ── Casting ──────────────────────────────────────────────────────────────


def _pad(grid: hz.Grid, metres: float) -> tuple[float, float, float, float]:
    d_lat = metres / M_PER_DEG_LAT
    d_lon = metres / m_per_deg_lon(grid.lat0)
    return grid.min_lat - d_lat, grid.min_lon - d_lon, grid.max_lat + d_lat, grid.max_lon + d_lon


class _Flat:
    """Stands in for terrain when the DEM will not answer: level ground, no far horizon."""

    def sample_bilinear(self, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
        return np.zeros(np.shape(lats), dtype=np.float32)

    sample = sample_bilinear


def _fetch_and_cast(grid: hz.Grid) -> HorizonRecord:
    """Blocking: pull the rasters on a few threads, then cast. Runs off the event loop."""
    near = _pad(grid, hz.NEAR_RANGE_M + 50.0)
    mid = _pad(grid, hz.MID_RANGE_M + 100.0)
    far = _pad(grid, hz.FAR_RANGE_M + 200.0)
    with ThreadPoolExecutor(max_workers=4, thread_name_prefix="sunlight-raster") as pool:
        f_chm = pool.submit(rasters.canopy_height, *near)
        f_date = pool.submit(rasters.canopy_observed, grid.lat0, grid.lon0)
        f_dem = pool.submit(rasters.terrain, *mid)
        f_far = pool.submit(rasters.terrain, *far, level=2)
        f_lc = pool.submit(rasters.land_cover, *near)

        canopy = f_chm.result()  # no trees, no answer: let RasterError out
        observed = f_date.result()
        try:
            ground: Any = hz.smoothed(f_dem.result())
            far_ground: Any = f_far.result()
            terrain_read = True
        except rasters.RasterError as exc:
            logger.warning("sunlight: terrain unavailable, casting over level ground (%s)", exc)
            ground, far_ground, terrain_read = _Flat(), None, False
        try:
            kinds = hz.leaf_kinds(f_lc.result())
            land_cover_read = True
        except rasters.RasterError as exc:
            logger.warning("sunlight: land cover unavailable, every tree counts as evergreen (%s)", exc)
            kinds, land_cover_read = None, False

    cast = hz.cast(grid, ground, canopy, kinds, far_ground)
    return HorizonRecord(cast, observed, terrain_read, land_cover_read, computed_now=True)


async def _horizon_for(grid: hz.Grid, subject: str) -> HorizonRecord:
    held = _memo.get(subject)
    if held is not None:
        return HorizonRecord(held.horizon, held.canopy_observed, held.terrain_read, held.land_cover_read, False)

    row = await record_cache.remembered(CACHE_KIND, subject)
    if isinstance(row, dict) and row.get("v") == hz.HORIZON_VERSION and row.get("n") == grid.n:
        try:
            rec = HorizonRecord(
                hz.Horizon.unpack(row["horizon"]), row.get("canopy_observed"),
                bool(row.get("terrain_read")), bool(row.get("land_cover_read")), False,
            )
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("sunlight: a cached horizon would not unpack (%s) — recasting", exc)
        else:
            _hold(subject, rec)
            return rec

    async with _HEAVY:
        rec = await asyncio.to_thread(_fetch_and_cast, grid)
    _hold(subject, rec)
    await record_cache.remember(CACHE_KIND, subject, {
        "v": hz.HORIZON_VERSION, "n": grid.n, "horizon": rec.horizon.pack(),
        "canopy_observed": rec.canopy_observed,
        "terrain_read": rec.terrain_read, "land_cover_read": rec.land_cover_read,
    })
    return rec


def _hold(subject: str, rec: HorizonRecord) -> None:
    if len(_memo) >= _MEMO_SIZE:
        _memo.pop(next(iter(_memo)))
    _memo[subject] = rec


# ── The answer ───────────────────────────────────────────────────────────


def _check_month(month: int | None) -> int | None:
    if month is None:
        return None
    if isinstance(month, bool) or not isinstance(month, int) or not 1 <= month <= 12:
        raise SunlightError("month must be a whole number from 1 to 12, or left out for all twelve")
    return month


async def region_sunlight(
    region: Region,
    ring: list[tuple[float, float]],
    *,
    month: int | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """Hours of direct sun per day across a block, for one month or all twelve."""
    today = today or datetime.now(UTC).date()
    month = _check_month(month)
    try:
        grid = hz.build_grid(ring)
    except hz.HorizonError as exc:
        raise SunlightError(str(exc)) from exc
    subject = horizon_subject(ring)

    normals_task = record_cache.normals_history(
        region.centroid.lat, region.centroid.lon,
        date(today.year - NORMALS_SPAN_YEARS, 1, 1).isoformat(),
        date(today.year - 1, 12, 31).isoformat(),
    )
    rec, normals = await asyncio.gather(_horizon_for(grid, subject), normals_task, return_exceptions=True)
    if isinstance(rec, rasters.RasterError):
        raise sources.UpstreamError(f"the canopy map did not answer: {rec}") from rec
    if isinstance(rec, BaseException):
        raise rec

    leaf_on: list[int] | None = None
    if not isinstance(normals, BaseException):
        try:
            leaf_on = sunlight.leaf_on_months(normals[0])
        except (sources.UpstreamError, IndexError, TypeError, ValueError):
            leaf_on = None
    leaf_months = leaf_on if leaf_on is not None else list(range(1, 13))

    def compute() -> tuple[np.ndarray, np.ndarray]:
        elev, az = sunpath.sun_position(grid.lat0, grid.lon0, sunpath.representative_days(today.year))
        return sunlight.direct_hours(rec.horizon, elev, az, leaf_months), sunlight.open_sky_hours(elev)

    hours, open_sky = await asyncio.to_thread(compute)
    months = [month] if month else list(range(1, 13))
    readings = [sunlight.month_summary(hours[:, m - 1], grid, m, m in leaf_months) for m in months]

    return {
        "success": True,
        "as_of": today.isoformat(),
        "region": region.describe(),
        "grid": grid.describe(),
        "light": {
            "months": readings,
            "open_sky_hours": {m: round(float(open_sky[m - 1]), 1) for m in months},
            "leaf_on_months": leaf_months,
            "leaf_off_months": [m for m in range(1, 13) if m not in leaf_months],
            "classes": {
                "full_sun": f"{sunlight.FULL_SUN_H:g} hours or more of direct sun a day",
                "part_shade": f"{sunlight.PART_SHADE_H:g} to {sunlight.FULL_SUN_H:g} hours",
                "full_shade": f"under {sunlight.PART_SHADE_H:g} hours",
            },
        },
        "horizon": "computed" if rec.computed_now else "cached",
        "azimuth_convention": "degrees clockwise from north; 90 is east, 180 is south",
        "note": _note(rec, leaf_on),
        "sources": _sources(rec, normals),
    }


def _note(rec: HorizonRecord, leaf_on: list[int] | None) -> str:
    parts = [
        ("Direct sun is counted in ten-minute steps on the 15th of each month, wherever the sun stands "
        "above this cell's horizon of ground and trees. The classes are the nursery-label definitions: "
        "full sun 6 hours or more, part shade 3 to 6, full shade under 3. Measurements and classes only; "
        "Good Earth publishes no agronomy."),
        (f"Trees come from canopy imagery{' taken ' + rec.canopy_observed if rec.canopy_observed else ''}; "
        f"anything cut or grown since is not in it, and its height error is a few metres "
        f"({rasters.CHM_ERROR_M:g} m published), so small ornamental trees can be missed. "
        "Buildings are not modelled."),
        (f"Bare deciduous crowns pass {sunlight.LEAF_OFF_TRANSMITTANCE[hz.KIND_DECIDUOUS]:.0%} of the beam, "
        f"evergreens none; a month is in leaf when its mean temperature reaches {sunlight.LEAF_ON_MEAN_F:g} °F "
        f"in the {NORMALS_SPAN_YEARS}-year normals."),
    ]
    if leaf_on is None:
        parts.append("The normals could not be read, so every month is taken as in leaf.")
    if not rec.terrain_read:
        parts.append("The terrain model could not be read, so the ground is taken as level and no hill shades this block.")
    if not rec.land_cover_read:
        parts.append("The land cover map could not be read, so every tree is taken as evergreen — bare-season light is understated.")
    return " ".join(parts)


def _sources(rec: HorizonRecord, normals: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = [
        {
            "name": "Meta/WRI canopy height map",
            "role": f"tree heights within {hz.NEAR_RANGE_M:.0f} m",
            "resolution_m": rasters.CHM_RESOLUTION_M,
            "observed": rec.canopy_observed,
            "licence": "CC BY 4.0",
        },
    ]
    if rec.terrain_read:
        out.append({
            "name": "Copernicus GLO-30 terrain",
            "role": f"ground to {hz.FAR_RANGE_M / 1000:.0f} km",
            "resolution_m": rasters.DEM_RESOLUTION_M,
        })
    if rec.land_cover_read:
        out.append({
            "name": "Copernicus Global Land Cover",
            "role": "leaf habit of each stand",
            "resolution_m": rasters.LANDCOVER_RESOLUTION_M,
        })
    if not isinstance(normals, BaseException):
        records, name, res = normals
        out.append({
            "name": name, "resolution_m": res,
            "role": f"leaf-on months, {NORMALS_SPAN_YEARS}-year normals",
            **({"as_of": sources.feed_of(records)["as_of"]} if "as_of" in sources.feed_of(records) else {}),
        })
    out.append({"name": "computed", "role": "sun position (NOAA) and horizon cast", "resolution_m": 0})
    return out


__all__ = ["SunlightError", "horizon_subject", "region_sunlight"]
