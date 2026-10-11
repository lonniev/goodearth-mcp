"""Commercial rows: parallel beds on a bearing, headlands kept clear at the ends.

The bearing is the decision. `longest_axis` gives the fewest turns and the
most row-metres; `east_west` gives even light along the row.
"""

from __future__ import annotations

import math

from shapely import affinity
from shapely.geometry import Polygon, box

from .frame import largest


def bearing_for(region: Polygon, rule: str) -> float:
    """Degrees clockwise from north that the rows run along."""
    if rule == "east_west":
        return 90.0
    mrr = region.minimum_rotated_rectangle
    xs, ys = mrr.exterior.coords.xy
    best = 0.0
    longest = -1.0
    for i in range(4):
        dx, dy = xs[i + 1] - xs[i], ys[i + 1] - ys[i]
        length = math.hypot(dx, dy)
        if length > longest:
            longest = length
            best = (math.degrees(math.atan2(dx, dy)) + 360) % 180
    return best


def lay_rows(region: Polygon, bearing: float, bed_width: float, lane: float,
             headland: float, min_len: float) -> tuple[list[Polygon], float]:
    """The rows, and the share of the region the headlands take."""
    clear = largest(region.buffer(-headland, join_style="mitre")) if headland > 0 else region
    if clear.is_empty:
        return [], 1.0
    # Turn the ground so the rows run along x, cut strips, turn them back.
    angle = 90.0 - bearing
    origin = clear.centroid
    turned = affinity.rotate(clear, -angle, origin=origin)
    minx, miny, maxx, maxy = turned.bounds
    rows: list[Polygon] = []
    y = miny
    while y + bed_width <= maxy + 1e-9:
        strip = turned.intersection(box(minx - 1, y, maxx + 1, y + bed_width))
        for piece in getattr(strip, "geoms", [strip]):
            if isinstance(piece, Polygon) and not piece.is_empty:
                bx0, _, bx1, _ = piece.bounds
                if bx1 - bx0 >= min_len:
                    rows.append(affinity.rotate(piece, angle, origin=origin))
        y += bed_width + lane
    return rows, 1 - clear.area / region.area if region.area else 0.0
