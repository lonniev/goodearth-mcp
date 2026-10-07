"""Garden light — hours of direct sun per day, cell by cell, month by month.

For every cell and month: step through the day in ten-minute bins and count
the ones where the sun stands above the cell's horizon in that direction.
Terrain blocks outright. A tree blocks in leaf and lets some of the beam
through bare, by its habit.

The classes are the nursery-label ones, so a reading here means what the tag
on a plant means: full sun is six hours or more of direct sun a day, part
shade three to six, full shade under three. This module states measurements
and classes; it never says what to plant.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from goodearth_mcp import sources
from goodearth_mcp.horizon import (
    AZ_BINS,
    AZ_STEP_DEG,
    KIND_DECIDUOUS,
    KIND_EVERGREEN,
    KIND_MIXED,
    KIND_NONE,
    Grid,
    Horizon,
)

#: A month is in leaf when its mean daily temperature reaches this — 10 °C,
#: the brief's rule — in the normals Good Earth holds. Leaf-on months follow
#: the block's own climate, not a calendar.
LEAF_ON_MEAN_F = 50.0
#: Direct beam a bare crown lets through, by habit. A leafless deciduous
#: stand passes roughly half the beam — the branches still take their share —
#: and a mixed stand is taken as half deciduous.
LEAF_OFF_TRANSMITTANCE = {
    KIND_NONE: 0.0,
    KIND_EVERGREEN: 0.0,
    KIND_DECIDUOUS: 0.5,
    KIND_MIXED: 0.25,
}
#: The nursery-label thresholds, hours of direct sun a day.
FULL_SUN_H = 6.0
PART_SHADE_H = 3.0
CLASSES = ("full_sun", "part_shade", "full_shade")
CLASS_FULL_SUN, CLASS_PART_SHADE, CLASS_FULL_SHADE = 0, 1, 2
#: Width of one time bin in hours.
STEP_H = 10.0 / 60.0

_TRANSMITTANCE = np.zeros(4, dtype=np.float32)
for _k, _t in LEAF_OFF_TRANSMITTANCE.items():
    _TRANSMITTANCE[_k] = _t


def leaf_on_months(records: list[dict[str, Any]]) -> list[int]:
    """Months whose mean daily temperature over the normals is at least 50 °F.

    Raises ``UpstreamError`` when the record has no daily block, as
    ``sources.daily_series`` does; the caller then assumes leaf-on all year
    and says so.
    """
    dates, tmax, tmin = sources.daily_series(records[0])
    sums = np.zeros(13)
    counts = np.zeros(13)
    for d, hi, lo in zip(dates, tmax, tmin, strict=True):
        if hi is None or lo is None:
            continue
        m = int(d[5:7])
        sums[m] += (hi + lo) / 2.0
        counts[m] += 1
    return [m for m in range(1, 13) if counts[m] and sums[m] / counts[m] >= LEAF_ON_MEAN_F]


def _bin_interp(values: np.ndarray, az_deg: np.ndarray) -> np.ndarray:
    """Linear interpolation of ``(n, 72)`` bin values at azimuths ``(T,)`` → ``(n, T)``."""
    pos = (az_deg / AZ_STEP_DEG) % AZ_BINS
    lo = np.floor(pos).astype(np.int64) % AZ_BINS
    hi = (lo + 1) % AZ_BINS
    frac = (pos - np.floor(pos)).astype(np.float32)
    return values[:, lo] * (1.0 - frac) + values[:, hi] * frac


def transmittance(horizon: Horizon, az_deg: np.ndarray, elev_deg: np.ndarray, leaf_on: bool) -> np.ndarray:
    """How much of the direct beam reaches each cell at each sun position, ``(n, T)``.

    1 above the canopy line, 0 below the terrain line, and between the two
    whatever a bare crown of that habit passes — or 0 when the trees are in leaf.
    """
    terrain = _bin_interp(horizon.terrain_deg(), az_deg)
    canopy = _bin_interp(horizon.canopy_deg(), az_deg)
    nearest = np.round(az_deg / AZ_STEP_DEG).astype(np.int64) % AZ_BINS
    kind = horizon.kind[:, nearest]
    elev = elev_deg[None, :]
    through_trees = 0.0 if leaf_on else _TRANSMITTANCE[kind]
    return np.where(elev > canopy, 1.0, np.where(elev > terrain, through_trees, 0.0)).astype(np.float32)


def direct_hours(
    horizon: Horizon, elev: np.ndarray, az: np.ndarray, leaf_on: list[int],
) -> np.ndarray:
    """Hours of direct sun per day, ``(n, 12)``, for sun positions ``(12, T)`` on each month's day."""
    out = np.zeros((horizon.terrain.shape[0], 12), dtype=np.float32)
    step_h = 1440.0 / elev.shape[1] / 60.0 if elev.shape[1] else STEP_H
    for m in range(12):
        s = transmittance(horizon, az[m], elev[m], (m + 1) in leaf_on)
        out[:, m] = s.sum(axis=1) * step_h
    return out


def open_sky_hours(elev: np.ndarray) -> np.ndarray:
    """Hours the sun is above a flat horizon on each month's day, ``(12,)``."""
    step_h = 1440.0 / elev.shape[1] / 60.0
    return (elev > 0).sum(axis=1) * step_h


def classify(hours: np.ndarray) -> np.ndarray:
    """Nursery classes: 0 full sun (≥ 6 h), 1 part shade (3–6 h), 2 full shade (< 3 h)."""
    return np.where(hours >= FULL_SUN_H, CLASS_FULL_SUN,
                    np.where(hours >= PART_SHADE_H, CLASS_PART_SHADE, CLASS_FULL_SHADE)).astype(np.uint8)


def month_summary(hours: np.ndarray, grid: Grid, month: int, leaf_on: bool) -> dict[str, Any]:
    """One month's reading across the block: shares, spread and the two extremes."""
    cls = classify(hours)
    n = hours.size
    lat, lon = grid.latlon()
    hi, lo = int(hours.argmax()), int(hours.argmin())
    return {
        "month": month,
        "leaf_on": leaf_on,
        "share": {name: round(float((cls == i).sum()) / n, 3) for i, name in enumerate(CLASSES)},
        "median_hours": round(float(np.median(hours)), 1),
        "p10_hours": round(float(np.percentile(hours, 10)), 1),
        "p90_hours": round(float(np.percentile(hours, 90)), 1),
        "sunniest": {"lat": round(float(lat[hi]), 6), "lon": round(float(lon[hi]), 6), "hours": round(float(hours[hi]), 1)},
        "shadiest": {"lat": round(float(lat[lo]), 6), "lon": round(float(lon[lo]), 6), "hours": round(float(hours[lo]), 1)},
    }


__all__ = [
    "CLASSES", "CLASS_FULL_SHADE", "CLASS_FULL_SUN", "CLASS_PART_SHADE",
    "FULL_SUN_H", "LEAF_OFF_TRANSMITTANCE", "LEAF_ON_MEAN_F", "PART_SHADE_H", "STEP_H",
    "classify", "direct_hours", "leaf_on_months", "month_summary", "open_sky_hours", "transmittance",
]
