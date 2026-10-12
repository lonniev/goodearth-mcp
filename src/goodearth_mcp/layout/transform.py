"""Propose bed layouts inside a plot, and the batch that would accept one.

Nothing is written here. Each variant carries `accept.blocks`, the exact list
`goodearth_block_save(blocks=…)` takes: any blocks already inside the plot
retired under a `v<k> ` name first (so their names are free and the old
layout stays readable), then the new beds.
"""

from __future__ import annotations

import math
import statistics
import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from shapely.geometry import Polygon

from . import organic, rows
from .frame import Frame, frame_for, largest, to_geojson, to_polygon
from .solver import EDGE_PASSES, compass_names, inset_to_lane, order_around, polsby

STYLES = ("organic", "commercial_rows")
EDGES = tuple(EDGE_PASSES)
RESTARTS = 40
GOOD_ENOUGH = 0.62
BUDGET_S = 6.0
PATH_SHARE_WARN = 0.35
#: What one `block_save` call takes; a larger layout is accepted in order, in parts.
BATCH = 100


@dataclass(frozen=True)
class Params:
    style: str
    perimeter: float = 3.0
    room_lane: float = 3.0
    bed_lane: float = 1.8
    compactness_min: float = 0.5
    edge: str = "soft"
    rooms: int = 4
    beds_per_room: int = 8
    size_mix: list[float] = field(default_factory=lambda: [1.0])
    irregularity: float = 0.5
    bearing: float | None = None
    bearing_rule: str = "longest_axis"
    bed_width: float = 1.2
    headland: float = 6.0
    min_row_length: float = 10.0


@dataclass
class Layout:
    """One proposal in metres: named beds, the generator's own figures."""
    beds: list[tuple[str, Polygon]]
    extra: dict[str, Any]
    dropped: int


def _organic(inner: Polygon, p: Params, rng: np.random.Generator, deadline: float) -> Layout:
    passes = EDGE_PASSES[p.edge]
    best: Layout | None = None
    best_worst = -1.0
    for _ in range(RESTARTS):
        room_cells = organic.partition(inner, organic.sizes_for(p.rooms, [1.0], p.irregularity, rng), rng)
        room_polys = inset_to_lane(room_cells, p.room_lane, passes) if p.rooms > 1 else [inner]
        names = compass_names([(r.centroid.x, r.centroid.y) for r in room_polys], (inner.centroid.x, inner.centroid.y))
        beds: list[tuple[str, Polygon]] = []
        for name, room in zip(names, room_polys, strict=True):
            if room.is_empty:
                continue
            cells = organic.partition(room, organic.sizes_for(p.beds_per_room, p.size_mix, p.irregularity, rng), rng)
            shrunk = [b for b in inset_to_lane(cells, p.bed_lane, passes) if not b.is_empty and b.area > 1.0]
            for k, i in enumerate(order_around(shrunk), start=1):
                beds.append((f"{name} {k}", shrunk[i]))
        worst = min((polsby(b) for _, b in beds), default=0.0)
        if worst > best_worst:
            best_worst = worst
            best = Layout(beds=beds, extra={"rooms": len(room_polys)}, dropped=0)
        if worst >= GOOD_ENOUGH or time.monotonic() > deadline:
            break
    assert best is not None
    kept = [(n, b) for n, b in best.beds if polsby(b) >= p.compactness_min]
    best.dropped = len(best.beds) - len(kept)
    best.beds = kept
    return best


def _rows(inner: Polygon, p: Params, bearing: float) -> Layout:
    strips, headland_share = rows.lay_rows(inner, bearing, p.bed_width, p.bed_lane, p.headland, p.min_row_length)
    order = sorted(range(len(strips)), key=lambda i: strips[i].centroid.y)
    beds = [(f"Row {k}", strips[i]) for k, i in enumerate(order, start=1)]
    row_m = sum(b.area / p.bed_width for _, b in beds)
    return Layout(beds=beds, extra={
        "bearing_deg": round(bearing, 1), "row_metres": round(row_m, 1),
        "turns": max(len(beds) - 1, 0), "headland_share": round(headland_share, 3),
    }, dropped=0)


def _min_gap(beds: list[Polygon], reach: float) -> float | None:
    gaps = [beds[i].distance(beds[j]) for i in range(len(beds)) for j in range(i + 1, len(beds))
            if beds[i].distance(beds[j]) < reach]
    return round(min(gaps), 2) if gaps else None


def _svg(plot: Polygon, beds: list[Polygon]) -> str:
    minx, miny, maxx, maxy = plot.bounds
    w, h = maxx - minx, maxy - miny

    def path(poly: Polygon) -> str:
        pts = " ".join(f"{x - minx:.1f},{maxy - y:.1f}" for x, y in poly.exterior.coords)
        return f"M{pts}Z"

    body = "".join(f'<path d="{path(b)}"/>' for b in beds)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {h:.1f}">'
            f'<path d="{path(plot)}" fill="none" stroke="#6b5b3e" stroke-width="{max(w, h) / 300:.2f}"/>'
            f'<g fill="#7fae5c" fill-opacity="0.75">{body}</g></svg>')


def _retired_name(name: str, taken: set[str]) -> str:
    k = 1
    while f"v{k} {name}".lower() in taken:
        k += 1
    return f"v{k} {name}"


def _metrics(plot: Polygon, layout: Layout, p: Params, grid_spacing_m: float) -> tuple[dict[str, Any], list[str]]:
    polys = [b for _, b in layout.beds]
    areas = [b.area for b in polys]
    comp = [polsby(b) for b in polys]
    path_share = 1 - sum(areas) / plot.area if plot.area else 0.0
    metrics: dict[str, Any] = {
        "beds": len(polys),
        "bed_area_m2": round(sum(areas), 1),
        "mean_bed_m2": round(statistics.fmean(areas), 1) if areas else 0.0,
        "path_share": round(path_share, 3),
        "worst_compactness": round(min(comp), 3) if comp else None,
        "median_compactness": round(statistics.median(comp), 3) if comp else None,
        "min_gap_m": _min_gap(polys, 3 * max(p.bed_lane, p.room_lane)),
        **layout.extra,
    }
    warnings: list[str] = []
    if areas and statistics.fmean(areas) < grid_spacing_m ** 2:
        warnings.append(
            f"A bed averages {metrics['mean_bed_m2']} m², inside one terrain cell "
            f"({grid_spacing_m:.0f} m across). Neighbouring beds share a terrain sample "
            "and answer alike for frost and heat: the beds are bookkeeping, and the "
            "climate answers stay at the scale of the plot."
        )
    if path_share > PATH_SHARE_WARN:
        warnings.append(f"Paths take {path_share:.0%} of the plot.")
    if layout.dropped:
        warnings.append(f"{layout.dropped} bed(s) below the compactness floor were dropped.")
    if not polys:
        warnings.append("The plot is too small for these paths and sizes; try narrower paths or fewer beds.")
    return metrics, warnings


def propose(
    plot_name: str,
    ring: list[tuple[float, float]],
    p: Params,
    *,
    seed: int = 0,
    variants: int = 3,
    base_temp_f: float = 50.0,
    grid_spacing_m: float = 90.0,
    inside: list[dict[str, Any]] | None = None,
    taken_names: set[str] | None = None,
    bed_groups: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Variants of a layout for one plot. `inside` are the blocks already within
    it (each {block_id, name, geometry, base_temp_f}), retired by acceptance;
    `taken_names` are every name the grower uses, lower-cased; `bed_groups`
    are the groups every new bed is saved in."""
    frame: Frame = frame_for(ring)
    plot = to_polygon(frame, ring)
    inner = largest(plot.buffer(-p.perimeter, join_style="mitre"))
    taken = set(taken_names or ())
    retire = []
    for child in inside or []:
        new = _retired_name(child["name"], taken)
        taken.add(new.lower())
        retire.append({"block": child["block_id"], "name": new, "geometry": child["geometry"],
                       "base_temp": child.get("base_temp_f", base_temp_f), "retired": True})

    bearings: list[float] = []
    if p.style == "commercial_rows":
        base = p.bearing if p.bearing is not None else rows.bearing_for(inner, p.bearing_rule)
        for b in (base, (base + 90) % 180, 90.0, 0.0):
            if all(abs(b - x) > 1 for x in bearings):
                bearings.append(b)

    out = []
    for v in range(variants):
        vseed = seed + v
        if inner.is_empty:
            layout = Layout(beds=[], extra={}, dropped=0)
        elif p.style == "organic":
            layout = _organic(inner, p, np.random.default_rng(vseed), time.monotonic() + BUDGET_S)
        else:
            layout = _rows(inner, p, bearings[v % len(bearings)])
        metrics, warnings = _metrics(plot, layout, p, grid_spacing_m)
        new_blocks = [{"name": f"{plot_name} · {name}", "geometry": to_geojson(frame, poly),
                       "base_temp": base_temp_f, "groups": list(bed_groups or [])}
                      for name, poly in layout.beds]
        everything = retire + new_blocks
        batches = [everything[i:i + BATCH] for i in range(0, len(everything), BATCH)]
        if len(batches) > 1:
            warnings.append(
                f"Accepting this takes {len(batches)} block_save calls of up to {BATCH} blocks, "
                "in the order given."
            )
        out.append({
            "seed": vseed,
            "metrics": metrics,
            "warnings": warnings,
            "preview_svg": _svg(plot, [b for _, b in layout.beds]),
            "accept": {"blocks": everything, "batches": batches},
        })
    return out


def is_finite_number(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)
