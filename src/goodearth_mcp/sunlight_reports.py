"""Field reports correct the horizon — how a block's light learns what the imagery missed.

The canopy map is years old. A tree cut since is still shading the model; a
tree planted since is invisible to it. The grower knows: "this bed was in
direct sun from nine to two on the fourteenth of June". That sentence is a
measurement of the sky line. Between those clock times the sun crossed a
range of azimuths, and at every one of them it stood at a known elevation; if
the bed was in sun, the horizon there is *below* that elevation. If it was in
shade, the horizon is above it.

So a report becomes, per azimuth bin the sun crossed, a bound on the cell's
horizon. Bounds from several reports on the same spot are combined by rank
(the median, as every correction here is), and applied only once
``MIN_FOR_CORRECTION`` reports agree — one mis-set clock must not fell a
hedgerow. A sun report lowers both the ground and the tree line, because a
seen sun says the whole line was below it; a shade report raises only the
tree line, because ground does not grow.

The cached horizon is never changed: reports are applied on every read, so a
retracted report retracts its correction. Pure domain logic.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import numpy as np

from goodearth_mcp import horizon as hz
from goodearth_mcp import sunpath
from goodearth_mcp.calibration import MIN_FOR_CORRECTION
from goodearth_mcp.region import M_PER_DEG_LAT, m_per_deg_lon

#: A report applies to every cell this close to its spot: a phone's fix is a
#: few metres out, and with 2 m cells three honest reports of one bed would
#: otherwise land in three cells and never agree.
REACH_M = 10.0
#: Kept clear of the bound: the sun's disc is half a degree across and a
#: grower's "nine o'clock" is not to the minute.
MARGIN_DEG = 1.0
#: The clock steps a report is read at. Ten minutes of sun is 2.5° of
#: azimuth, finer than the 5° horizon bins.
STEP_MIN = 10


@dataclass(frozen=True)
class Bound:
    """What one report says about one cell's horizon in one azimuth bin."""

    cell: int
    az_bin: int
    light: str
    elevation_deg: float


def local_tz(name: str | None, lon: float) -> tuple[Any, bool]:
    """The grower's clock: the block's zone by name, else a whole-hour guess from its longitude."""
    if name:
        try:
            return ZoneInfo(name), True
        except (ZoneInfoNotFoundError, ValueError):
            pass
    return timedelta(hours=round(lon / 15.0)), False


def sun_bounds(report: dict[str, Any], grid: hz.Grid, tz: Any) -> list[Bound] | str:
    """Every (cell, azimuth bin) a report constrains, or why it constrains none."""
    day = report["observed_on"]
    if isinstance(tz, timedelta):
        offset = tz
    else:
        offset = tz.utcoffset(datetime(day.year, day.month, day.day, tzinfo=tz)) or timedelta(0)
    # Minutes after the day's UTC midnight — may run past 1440 or below 0
    # when the grower's day straddles the UTC one; the sun position reads
    # them as a fraction of a day either side, which is exactly right.
    shift = -offset.total_seconds() / 60.0
    minutes = np.arange(report["from"], report["to"] + 1, STEP_MIN, dtype=np.float64) + shift
    elev, az = sunpath.sun_position(grid.lat0, grid.lon0, np.array([np.datetime64(day)]), minutes)
    up = elev[0] > 0.0
    if not up.any():
        return "the sun was not up between those times"

    dx = (report["lon"] - grid.lon0) * m_per_deg_lon(grid.lat0)
    dy = (report["lat"] - grid.lat0) * M_PER_DEG_LAT
    reach = max(REACH_M, grid.cell_m)
    near = np.flatnonzero(np.hypot(grid.x - dx, grid.y - dy) <= reach)
    if near.size == 0:
        return "the spot is outside this block"

    bins = (np.rint(az[0][up] / hz.AZ_STEP_DEG).astype(np.int64)) % hz.AZ_BINS
    light = report["light"]
    per_bin: dict[int, float] = {}
    for b, e in zip(bins.tolist(), elev[0][up].tolist(), strict=True):
        # Sun seen: the line is below the LOWEST sun in the bin. Shade seen:
        # it is above the HIGHEST.
        if b not in per_bin:
            per_bin[b] = e
        elif light == "sun":
            per_bin[b] = min(per_bin[b], e)
        else:
            per_bin[b] = max(per_bin[b], e)
    return [Bound(int(c), b, light, e) for c in near for b, e in per_bin.items()]


def apply(
    horizon: hz.Horizon, grid: hz.Grid, reports: list[dict[str, Any]], tz: Any,
) -> tuple[hz.Horizon, dict[str, Any]]:
    """The horizon with every agreed report applied, and an account of what moved.

    ``reports`` are validated sunlight observations (``calibration.validate_observation``).
    """
    groups: dict[tuple[int, int, str], list[float]] = {}
    rows: list[dict[str, Any]] = []
    for r in reports:
        found = sun_bounds(r, grid, tz)
        row = {
            "observed_on": r["observed_on"].isoformat(),
            "from": f"{r['from'] // 60:02d}:{r['from'] % 60:02d}",
            "to": f"{r['to'] // 60:02d}:{r['to'] % 60:02d}",
            "light": r["light"], "note": r.get("note") or None,
        }
        if isinstance(found, str):
            rows.append({**row, "used": False, "why_not": found})
            continue
        for b in found:
            groups.setdefault((b.cell, b.az_bin, b.light), []).append(b.elevation_deg)
        rows.append({**row, "used": True, "cells": len({b.cell for b in found}),
                     "azimuth_bins": len({b.az_bin for b in found})})

    terrain = horizon.terrain.copy()
    canopy = horizon.canopy.copy()
    kind = horizon.kind.copy()
    cells: set[int] = set()
    bins_moved = 0
    conflicts = 0
    short = 0
    for (cell, az_bin, light), elevations in groups.items():
        if len(elevations) < MIN_FOR_CORRECTION:
            short += 1
            continue
        if len(groups.get((cell, az_bin, "shade" if light == "sun" else "sun"), ())) >= MIN_FOR_CORRECTION:
            conflicts += 1
            continue
        bound = statistics.median(elevations)
        if light == "sun":
            cap = np.uint16(max(0.0, (bound - MARGIN_DEG) * 10.0))
            moved = terrain[cell, az_bin] > cap or canopy[cell, az_bin] > cap
            terrain[cell, az_bin] = min(terrain[cell, az_bin], cap)
            canopy[cell, az_bin] = min(canopy[cell, az_bin], cap)
        else:
            floor = np.uint16(min(900.0, (bound + MARGIN_DEG) * 10.0))
            moved = canopy[cell, az_bin] < floor
            canopy[cell, az_bin] = max(canopy[cell, az_bin], floor)
            if kind[cell, az_bin] == hz.KIND_NONE:
                # An unseen tree of unknown habit: taken as evergreen, so the
                # reported shade holds all year rather than vanishing in winter.
                kind[cell, az_bin] = hz.KIND_EVERGREEN
        if moved:
            cells.add(cell)
            bins_moved += 1

    used = sum(1 for r in rows if r["used"])
    account = {
        "reports": len(rows),
        "used": used,
        "cells_corrected": len(cells),
        "azimuth_bins_corrected": bins_moved,
        "awaiting_agreement": short,
        "conflicting": conflicts,
        "rows": rows,
        "why_not": None if cells else (
            f"A spot's horizon moves only where {MIN_FOR_CORRECTION} reports agree on the same "
            "spot, the same hours and the same light. Until then the reports are a record, not a model change."
        ) if used else None,
    }
    corrected = hz.Horizon(terrain=terrain, canopy=canopy, kind=kind) if cells else horizon
    return corrected, account


__all__ = ["MARGIN_DEG", "REACH_M", "STEP_MIN", "Bound", "apply", "local_tz", "sun_bounds"]
