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
import base64
import hashlib
import logging
import zlib
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

import numpy as np

from goodearth_mcp import horizon as hz
from goodearth_mcp import rasters, record_cache, solar, sources, sunlight, sunpath
from goodearth_mcp.region import M_PER_DEG_LAT, Region, m_per_deg_lon

logger = logging.getLogger(__name__)

NORMALS_SPAN_YEARS = 10
#: Casting two blocks at once is the most this process gives numpy; the rest queue.
_HEAVY = asyncio.Semaphore(2)
#: Cast horizons held unpacked, so the month slider's repeat calls skip the row.
_MEMO_SIZE = 16
_memo: dict[str, HorizonRecord] = {}

CACHE_KIND = "sun_horizon"
CLIMATOLOGY_KIND = "sun_climatology"
#: Yearly radiation requests in flight at once for one block.
_RADIATION_FANOUT = asyncio.Semaphore(5)


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


# ── Radiation climatology ────────────────────────────────────────────────


def climatology_subject(lat: float, lon: float, first_year: int, last_year: int) -> str:
    """One typical year per 0.1° cell — the archive's own resolution is 9 km."""
    return f"{round(lat, 1):.1f}/{round(lon, 1):.1f}/{first_year}-{last_year}"


async def _climatology_for(lat: float, lon: float, today: date) -> tuple[np.ndarray, int] | None:
    """Mean W/m² by month and hour, and the years behind it — None when too few answered."""
    last, first = today.year - 1, today.year - solar.CLIMATOLOGY_YEARS
    subject = climatology_subject(lat, lon, first, last)
    row = await record_cache.remembered(CLIMATOLOGY_KIND, subject)
    if isinstance(row, dict) and "mean" in row:
        try:
            return np.asarray(row["mean"], dtype=np.float32).reshape(12, 24, 3), int(row.get("years") or 0)
        except (ValueError, TypeError):
            pass

    async def one(year: int) -> tuple[np.ndarray, np.ndarray] | None:
        async with _RADIATION_FANOUT:
            try:
                record = await sources.fetch_radiation_year(lat, lon, year)
            except sources.UpstreamError as exc:
                logger.info("sunlight: radiation for %d unavailable (%s)", year, exc)
                return None
        return solar.reduce_year(record["hourly"])

    parts = [p for p in await asyncio.gather(*(one(y) for y in range(first, last + 1))) if p is not None]
    years = sum(1 for p in parts if p[1].sum() > 0)
    if years < solar.MIN_CLIMATOLOGY_YEARS:
        return None
    mean = solar.climatology(parts)
    await record_cache.remember(CLIMATOLOGY_KIND, subject, {
        "mean": np.round(mean, 1).tolist(), "years": years,
    })
    return mean, years


# ── The answer ───────────────────────────────────────────────────────────


def _check_month(month: int | None) -> int | None:
    if month is None:
        return None
    if isinstance(month, bool) or not isinstance(month, int) or not 1 <= month <= 12:
        raise SunlightError("month must be a whole number from 1 to 12, or left out for all twelve")
    return month


DETAILS = ("summary", "grid")


def _parse_point(point: str | None) -> tuple[float, float] | None:
    if point is None or point == "":
        return None
    if not isinstance(point, str):
        raise SunlightError('point must be "lat,lon"')
    parts = point.split(",")
    if len(parts) != 2:
        raise SunlightError('point must be "lat,lon"')
    try:
        lat, lon = float(parts[0]), float(parts[1])
    except ValueError as exc:
        raise SunlightError('point must be "lat,lon" with two numbers') from exc
    if not (np.isfinite(lat) and np.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        raise SunlightError("point must be a latitude and a longitude")
    return lat, lon


def _check_angle(value: float | None, name: str, low: float, high: float) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not np.isfinite(value):
        raise SunlightError(f"{name} must be a number of degrees")
    if not low <= value <= high:
        raise SunlightError(f"{name} must be between {low:g} and {high:g} degrees")
    return float(value)


async def region_sunlight(
    region: Region,
    ring: list[tuple[float, float]],
    *,
    month: int | None = None,
    panel_tilt_deg: float | None = None,
    panel_azimuth_deg: float | None = None,
    point: str | None = None,
    detail: str = "summary",
    today: date | None = None,
) -> dict[str, Any]:
    """Hours of direct sun per day across a block, and what a fixed panel would yield there.

    ``point`` ("lat,lon" inside the block) adds that spot's card: its horizon,
    sun paths, monthly hours and solar figures. ``detail="grid"`` adds every
    cell's numbers, packed for a map overlay.
    """
    today = today or datetime.now(UTC).date()
    month = _check_month(month)
    tilt = _check_angle(panel_tilt_deg, "panel_tilt_deg", 0.0, 90.0)
    azimuth = _check_angle(panel_azimuth_deg, "panel_azimuth_deg", 0.0, 360.0)
    if detail not in DETAILS:
        raise SunlightError(f"detail must be one of {', '.join(DETAILS)}")
    spot = _parse_point(point)
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
    rec, normals, clim = await asyncio.gather(
        _horizon_for(grid, subject), normals_task, _climatology_for(grid.lat0, grid.lon0, today),
        return_exceptions=True,
    )
    if isinstance(clim, BaseException):
        logger.warning("sunlight: climatology failed (%s) — no solar figure", clim)
        clim = None
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

    tilt = solar.default_tilt(grid.lat0) if tilt is None else tilt
    azimuth = solar.default_azimuth(grid.lat0) if azimuth is None else azimuth
    cell = None
    if spot is not None:
        cell = grid.nearest(*spot)
        if cell is None:
            raise SunlightError("point is outside this block")

    def compute() -> tuple[np.ndarray, np.ndarray, dict[str, Any] | None]:
        days = sunpath.representative_days(today.year)
        elev, az = sunpath.sun_position(grid.lat0, grid.lon0, days)
        hours = sunlight.direct_hours(rec.horizon, elev, az, leaf_months)
        panel = None
        if clim is not None:
            mean, years = clim
            e_h, a_h = sunpath.sun_position(grid.lat0, grid.lon0, days, sunpath.HOURS_MID)
            open_sky = solar.poa_monthly(None, mean, e_h, a_h, tilt, azimuth, leaf_months, today.year)
            shaded = solar.poa_monthly(rec.horizon, mean, e_h, a_h, tilt, azimuth, leaf_months, today.year)
            panel = {**solar.yields(open_sky, shaded), "years": years, "shaded_monthly": shaded}
        return hours, sunlight.open_sky_hours(elev), panel

    hours, open_sky, panel = await asyncio.to_thread(compute)
    months = [month] if month else list(range(1, 13))
    readings = [sunlight.month_summary(hours[:, m - 1], grid, m, m in leaf_months) for m in months]

    return {
        "success": True,
        "as_of": today.isoformat(),
        "region": region.describe(),
        **({"grid": grid.describe()} if detail != "grid" else {}),
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
        "solar": _solar_block(panel, grid, tilt, azimuth),
        **({"point": _point_card(cell, spot, grid, rec.horizon, hours, panel, leaf_months, today)} if cell is not None else {}),
        **({"grid": _grid_block(grid, rec.horizon, hours, panel)} if detail == "grid" else {}),
        **({"sun_paths": _sun_paths(grid, today)} if detail == "grid" or cell is not None else {}),
        "horizon": "computed" if rec.computed_now else "cached",
        "azimuth_convention": "degrees clockwise from north; 90 is east, 180 is south",
        "note": _note(rec, leaf_on, panel is not None),
        "sources": _sources(rec, normals, panel),
    }


def _solar_block(panel: dict[str, Any] | None, grid: hz.Grid, tilt: float, azimuth: float) -> dict[str, Any] | None:
    if panel is None:
        return None
    kwh = panel["kwh_per_kwp"]
    access = panel["solar_access"]
    best = int(kwh.argmax())
    lat, lon = grid.latlon()
    return {
        "panel": {"tilt_deg": tilt, "azimuth_deg": azimuth, "fixed": True},
        "open_sky_kwh_per_kwp_year": panel["open_sky_kwh_per_kwp"],
        "kwh_per_kwp_year": {
            "median": round(float(np.median(kwh)), 0),
            "p10": round(float(np.percentile(kwh, 10)), 0),
            "p90": round(float(np.percentile(kwh, 90)), 0),
        },
        "solar_access_pct": {
            "median": round(float(np.median(access)) * 100, 1),
            "p10": round(float(np.percentile(access, 10)) * 100, 1),
            "p90": round(float(np.percentile(access, 90)) * 100, 1),
        },
        "monthly_open_sky_kwh_per_kwp": panel["monthly_open_kwh_per_kwp"],
        "best_point": {
            "lat": round(float(lat[best]), 6), "lon": round(float(lon[best]), 6),
            "kwh_per_kwp_year": round(float(kwh[best]), 0),
            "solar_access_pct": round(float(access[best]) * 100, 1),
            "monthly_kwh_per_kwp": [round(float(v) * solar.PERFORMANCE_RATIO, 1) for v in panel["shaded_monthly"][best]],
        },
        "performance_ratio": solar.PERFORMANCE_RATIO,
        "radiation_years": panel["years"],
        "estimate": "screening estimate, not a site survey",
    }


def _note(rec: HorizonRecord, leaf_on: list[int] | None, solar_given: bool) -> str:
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
    if solar_given:
        parts.append(
            f"Solar figures are a screening estimate, not a site survey: a typical year averaged from "
            f"{solar.CLIMATOLOGY_YEARS} years of the ERA5 archive, put on the panel with the isotropic sky "
            f"model, and a performance ratio of {solar.PERFORMANCE_RATIO:.2f} from plane of array to AC. "
            "Solar access is the shaded yield as a share of the open-sky yield."
        )
    else:
        parts.append("The radiation archive could not be read, so there is no solar figure this time.")
    if leaf_on is None:
        parts.append("The normals could not be read, so every month is taken as in leaf.")
    if not rec.terrain_read:
        parts.append("The terrain model could not be read, so the ground is taken as level and no hill shades this block.")
    if not rec.land_cover_read:
        parts.append("The land cover map could not be read, so every tree is taken as evergreen — bare-season light is understated.")
    return " ".join(parts)


def _sources(rec: HorizonRecord, normals: Any, panel: dict[str, Any] | None) -> list[dict[str, Any]]:
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
    if panel is not None:
        out.append({
            "name": "Open-Meteo archive (ERA5)",
            "role": f"hourly radiation, {panel['years']} years averaged",
            "resolution_m": sources.RADIATION_RESOLUTION_M,
        })
    out.append({"name": "computed", "role": "sun position (NOAA), horizon cast, plane-of-array model", "resolution_m": 0})
    return out


# ── The spot card and the grid ───────────────────────────────────────────


def _sun_paths(grid: hz.Grid, today: date) -> dict[str, list[list[float]]]:
    """Hourly [azimuth, elevation] on the solstices and an equinox, for a sky chart."""
    return {
        "june": sunpath.sun_path(grid.lat0, grid.lon0, date(today.year, 6, 21)),
        "equinox": sunpath.sun_path(grid.lat0, grid.lon0, date(today.year, 3, 20)),
        "december": sunpath.sun_path(grid.lat0, grid.lon0, date(today.year, 12, 21)),
    }


def _point_card(
    cell: int, spot: tuple[float, float], grid: hz.Grid, horizon: hz.Horizon,
    hours: np.ndarray, panel: dict[str, Any] | None, leaf_months: list[int], today: date,
) -> dict[str, Any]:
    lat, lon = grid.latlon()
    row, col = divmod(int(grid.idx[cell]), grid.cols)
    monthly = [round(float(h), 1) for h in hours[cell]]
    classes = [sunlight.CLASSES[c] for c in sunlight.classify(hours[cell])]
    card: dict[str, Any] = {
        "asked": {"lat": spot[0], "lon": spot[1]},
        "cell": {"row": row, "col": col, "lat": round(float(lat[cell]), 6), "lon": round(float(lon[cell]), 6)},
        "horizon": {
            "azimuth_step_deg": hz.AZ_STEP_DEG,
            "terrain_deg": [round(float(v), 1) for v in horizon.terrain_deg()[cell]],
            "canopy_deg": [round(float(v), 1) for v in horizon.canopy_deg()[cell]],
            "canopy_kind": horizon.kind[cell].tolist(),
        },
        "hours_by_month": monthly,
        "class_by_month": classes,
        "leaf_on_months": leaf_months,
        "sky_view_factor": round(float(solar.sky_view_factor(horizon, True)[cell]), 3),
    }
    if panel is not None:
        shaded = panel["shaded_monthly"][cell]
        card["solar"] = {
            "kwh_per_kwp_year": round(float(panel["kwh_per_kwp"][cell]), 0),
            "open_sky_kwh_per_kwp_year": panel["open_sky_kwh_per_kwp"],
            "solar_access_pct": round(float(panel["solar_access"][cell]) * 100, 1),
            "monthly_kwh_per_kwp": [round(float(v) * solar.PERFORMANCE_RATIO, 1) for v in shaded],
            "least_light_month": int(np.argmin(shaded)) + 1,
        }
    return card


def _field(values: np.ndarray, grid: hz.Grid, dtype: Any, scale: float, nodata: int) -> dict[str, Any]:
    """One per-cell quantity as a full raster, nodata where the block is not."""
    full = np.full(grid.rows * grid.cols, nodata, dtype=dtype)
    full[grid.idx] = np.clip(np.round(values / scale), 0, nodata - 1).astype(dtype)
    return {
        "dtype": np.dtype(dtype).name, "scale": scale, "nodata": nodata,
        "encoding": "base64", "b64": base64.b64encode(full.tobytes()).decode(),
    }


def _packed(values: np.ndarray, dtype: Any) -> dict[str, Any]:
    """A per-kept-cell array, zlib then base64: the horizons, which are large and smooth."""
    raw = np.ascontiguousarray(values.astype(dtype)).tobytes()
    return {
        "dtype": np.dtype(dtype).name, "shape": list(values.shape),
        "encoding": "zlib+base64", "b64": base64.b64encode(zlib.compress(raw, 6)).decode(),
    }


def _grid_block(grid: hz.Grid, horizon: hz.Horizon, hours: np.ndarray, panel: dict[str, Any] | None) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "hours_by_month": [_field(hours[:, m], grid, np.uint8, 0.1, 255) for m in range(12)],
        "horizon_terrain_deg": _packed(np.round(horizon.terrain_deg()), np.uint8),
        "horizon_canopy_deg": _packed(np.round(horizon.canopy_deg()), np.uint8),
        "canopy_kind": _packed(horizon.kind, np.uint8),
    }
    if panel is not None:
        fields["kwh_per_kwp_year"] = _field(panel["kwh_per_kwp"], grid, np.uint16, 1.0, 65535)
        fields["solar_access_pct"] = _field(panel["solar_access"] * 100.0, grid, np.uint8, 1.0, 255)
    return {
        **grid.describe(),
        "crs": "EPSG:4326",
        "order": "row-major, row 0 north, col 0 west; a raster field's nodata marks ground outside the block",
        "kept_order": "per-cell arrays run over the cells with data, in row-major order",
        "byte_order": "little",
        "canopy_kinds": {hz.KIND_NONE: "none", hz.KIND_EVERGREEN: "evergreen", hz.KIND_DECIDUOUS: "deciduous", hz.KIND_MIXED: "mixed"},
        "fields": fields,
    }


__all__ = ["DETAILS", "SunlightError", "horizon_subject", "region_sunlight"]
