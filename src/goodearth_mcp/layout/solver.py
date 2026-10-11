"""The stages every style shares: smoothing, the path inset, the quality gate,
the names.

Paths are negative space and never drawn. Each cell is shrunk inward and then
smoothed, so independently smoothed beds cannot overlap (Chaikin only ever
shrinks a polygon) and the lane absorbs the small mismatch. Because smoothing
shrinks the beds further, the inset is solved by bisection until the narrowest
finished gap equals the lane asked for.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from shapely.geometry import Polygon

from .frame import largest

#: Chaikin passes per edge treatment.
EDGE_PASSES = {"straight": 0, "soft": 2, "curved": 4}

#: Bisection steps on the inset distance; 14 halvings of a few metres is
#: well under a millimetre.
INSET_STEPS = 14

COMPASS = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"]


def polsby(poly: Polygon) -> float:
    """Polsby-Popper compactness, 4πA/P²: 1 for a circle, near 0 for a sliver."""
    if poly.is_empty or poly.length == 0:
        return 0.0
    return 4 * math.pi * poly.area / poly.length ** 2


def chaikin(poly: Polygon, passes: int) -> Polygon:
    """Corner-cutting: each pass replaces every edge by its 1/4 and 3/4 points."""
    if passes <= 0 or poly.is_empty:
        return poly
    pts = list(poly.exterior.coords)[:-1]
    for _ in range(passes):
        out = []
        for i, (x0, y0) in enumerate(pts):
            x1, y1 = pts[(i + 1) % len(pts)]
            out.append((0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1))
            out.append((0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1))
        pts = out
    smoothed = Polygon(pts)
    return smoothed if smoothed.is_valid else largest(smoothed.buffer(0))


def _shrink(cells: Sequence[Polygon], d: float, passes: int) -> list[Polygon]:
    return [chaikin(largest(c.buffer(-d, join_style="mitre")), passes) for c in cells]


def _neighbours(cells: Sequence[Polygon]) -> list[tuple[int, int]]:
    """Pairs of cells that share a wall — the gaps that are paths."""
    return [(i, j) for i in range(len(cells)) for j in range(i + 1, len(cells))
            if cells[i].distance(cells[j]) < 1e-6]


def min_gap(beds: Sequence[Polygon], pairs: Sequence[tuple[int, int]]) -> float:
    gaps = [beds[i].distance(beds[j]) for i, j in pairs if not beds[i].is_empty and not beds[j].is_empty]
    return min(gaps) if gaps else math.inf


def inset_to_lane(cells: Sequence[Polygon], lane: float, passes: int) -> list[Polygon]:
    """Shrink and smooth the cells so the narrowest gap between neighbours is
    the lane. With no smoothing that is exactly half the lane each side."""
    if passes == 0 or len(cells) < 2:
        return _shrink(cells, lane / 2, passes)
    pairs = _neighbours(cells)
    if not pairs:
        return _shrink(cells, lane / 2, passes)
    lo, hi = 0.05, lane / 2
    for _ in range(INSET_STEPS):
        d = (lo + hi) / 2
        if min_gap(_shrink(cells, d, passes), pairs) > lane:
            hi = d
        else:
            lo = d
    return _shrink(cells, hi, passes)


def compass_names(centroids: Sequence[tuple[float, float]], centre: tuple[float, float]) -> list[str]:
    """Rooms named by true bearing from the plot's centre: the most central is
    Centre, the rest by eight-point compass, a taken point falling to the next
    free one clockwise, then numbered."""
    if not centroids:
        return []
    dists = [math.hypot(x - centre[0], y - centre[1]) for x, y in centroids]
    names: list[str | None] = [None] * len(centroids)
    taken: set[str] = set()
    if len(centroids) > 1:
        c = dists.index(min(dists))
        names[c] = "Centre"
        taken.add("Centre")
    for i in sorted(range(len(centroids)), key=lambda k: dists[k]):
        if names[i] is not None:
            continue
        x, y = centroids[i]
        bearing = (math.degrees(math.atan2(x - centre[0], y - centre[1])) + 360) % 360
        k = int(((bearing + 22.5) % 360) // 45)
        for step in range(8):
            cand = COMPASS[(k + step) % 8]
            if cand not in taken:
                names[i] = cand
                break
        else:
            n = 2
            while f"{COMPASS[k]} {n}" in taken:
                n += 1
            names[i] = f"{COMPASS[k]} {n}"
        taken.add(names[i])  # type: ignore[arg-type]
    return [n or "Centre" for n in names]


def order_around(polys: Sequence[Polygon]) -> list[int]:
    """Indices of polygons ordered clockwise from north about their joint centre."""
    if not polys:
        return []
    cx = sum(p.centroid.x for p in polys) / len(polys)
    cy = sum(p.centroid.y for p in polys) / len(polys)
    return sorted(range(len(polys)), key=lambda i: (math.degrees(
        math.atan2(polys[i].centroid.x - cx, polys[i].centroid.y - cy)) + 360) % 360)
