"""A plot in metres about its centroid, and back to latitude and longitude.

Buffers, distances and areas are honest only in a metric frame, so all
geometry is done here and converted back at the end.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from shapely.geometry import MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

M_PER_DEG_LAT = 110_574.0


@dataclass(frozen=True)
class Frame:
    lat0: float
    lon0: float

    @property
    def mx(self) -> float:
        return 111_320.0 * math.cos(math.radians(self.lat0))

    def xy(self, lat: float, lon: float) -> tuple[float, float]:
        return ((lon - self.lon0) * self.mx, (lat - self.lat0) * M_PER_DEG_LAT)

    def latlon(self, x: float, y: float) -> tuple[float, float]:
        return (self.lat0 + y / M_PER_DEG_LAT, self.lon0 + x / self.mx)


def frame_for(ring: list[tuple[float, float]]) -> Frame:
    """The frame centred on the outline's vertex mean — near enough the centroid."""
    lats = [p[0] for p in ring]
    lons = [p[1] for p in ring]
    return Frame(sum(lats) / len(lats), sum(lons) / len(lons))


def to_polygon(frame: Frame, ring: list[tuple[float, float]]) -> Polygon:
    """The outline in metres, repaired if it self-touches."""
    poly = Polygon([frame.xy(lat, lon) for lat, lon in ring])
    if not poly.is_valid:
        poly = largest(poly.buffer(0))
    return poly


def largest(geom: BaseGeometry) -> Polygon:
    """The biggest polygon in a geometry, or an empty one."""
    if isinstance(geom, Polygon):
        return geom
    if isinstance(geom, MultiPolygon) and not geom.is_empty:
        return max(geom.geoms, key=lambda g: g.area)
    parts = [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon)]
    return max(parts, key=lambda g: g.area) if parts else Polygon()


def to_geojson(frame: Frame, poly: Polygon) -> dict:
    """A GeoJSON Polygon, [lon, lat] at seven decimals (about a centimetre),
    with consecutive repeats dropped so a dense ring cannot degenerate."""
    coords: list[list[float]] = []
    for x, y in poly.exterior.coords:
        lat, lon = frame.latlon(x, y)
        pt = [round(lon, 7), round(lat, 7)]
        if not coords or coords[-1] != pt:
            coords.append(pt)
    if coords[0] != coords[-1]:
        coords.append(coords[0])
    return {"type": "Polygon", "coordinates": [coords]}
