"""Region sampling — the abstraction every Good Earth tool is built on.

A farm is not a point. A bench and a hollow on the same acreage carry
different frost exposure, and a single lat/lon lookup hides exactly the
variation a grower needs to plan around. Every tool therefore accepts a
*region* and reports an aggregate **plus the spread across it**.

This module owns two concerns and nothing else:

1. Parsing the two accepted region shapes into a common ``Region``.
2. Laying down sample points inside that region on a grid whose spacing
   matches the **elevation** model (SRTM, ~90 m). That is the feed the
   spread is actually computed from: each point is downscaled by its own
   terrain, while the coarse weather cells behind those points are folded
   together before any fetch. Spacing the grid at the weather resolution
   instead would give a farm-sized block one sample and a spread of zero.

It knows nothing about weather, billing, or npubs.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

# The spread this service sells comes from TERRAIN, not from the temperature
# feed: every sample is downscaled by its own elevation, and the archive cells
# it draws from are folded together by ``cluster_to_grid`` before any fetch.
# So the honest floor on spacing is the elevation model's resolution — SRTM's
# 90 m — not the far coarser weather grid. Sampling at the weather grid would
# hand a farm-sized block a single point and report its spread as zero, which
# reads as "this ground is flat" when it only means "nobody looked".
TERRAIN_CELL_M = 90.0

# A pin with no radius is asking about a place, not a field. One weather cell
# around it is the useful default — small enough to be local, big enough that
# the answer isn't a single point.
DEFAULT_RADIUS_M = 800.0

# A region big enough to need more samples than this is being asked at the
# wrong altitude — a whole county is not a microclimate. The cap keeps one
# priced call from fanning out into thousands of upstream requests.
MAX_SAMPLES = 64

# Latitude is ~111.32 km per degree everywhere; longitude shrinks by cos(lat).
_M_PER_DEG_LAT = 111_320.0

MAX_RADIUS_M = 50_000.0


class RegionError(ValueError):
    """Raised when a caller's region argument cannot be honoured.

    Carries a message written for the grower, not the stack trace — it is
    surfaced verbatim in the tool response.
    """


@dataclass(frozen=True)
class SamplePoint:
    """One grid point inside a region, with the weight it carries."""

    lat: float
    lon: float


@dataclass(frozen=True)
class Region:
    """A normalized region plus the sample grid laid down inside it."""

    kind: str  # "polygon" | "circle"
    points: tuple[SamplePoint, ...]
    centroid: SamplePoint
    bbox: tuple[float, float, float, float]  # min_lat, min_lon, max_lat, max_lon
    area_km2: float
    spacing_m: float

    @property
    def sample_count(self) -> int:
        return len(self.points)

    def describe(self) -> dict[str, Any]:
        """The provenance block echoed back in every tool response.

        A grower comparing two answers needs to know they covered the same
        ground with the same resolution, so this travels with the result.
        """
        return {
            "kind": self.kind,
            "sample_count": self.sample_count,
            "grid_spacing_m": round(self.spacing_m),
            "area_km2": round(self.area_km2, 3),
            "centroid": {"lat": round(self.centroid.lat, 5), "lon": round(self.centroid.lon, 5)},
            "bbox": {
                "min_lat": round(self.bbox[0], 5),
                "min_lon": round(self.bbox[1], 5),
                "max_lat": round(self.bbox[2], 5),
                "max_lon": round(self.bbox[3], 5),
            },
        }


def _check_lat(lat: float) -> None:
    if not -90.0 <= lat <= 90.0:
        raise RegionError(f"latitude must be between -90 and 90, got {lat}")


def _check_lon(lon: float) -> None:
    if not -180.0 <= lon <= 180.0:
        raise RegionError(f"longitude must be between -180 and 180, got {lon}")


def _m_per_deg_lon(lat: float) -> float:
    """Metres per degree of longitude at ``lat``. Floors near the poles."""
    return max(_M_PER_DEG_LAT * math.cos(math.radians(lat)), 1.0)


# ── Polygon geometry ─────────────────────────────────────────────────────


def _ring_from_geojson(geometry: dict[str, Any]) -> list[tuple[float, float]]:
    """Pull the outer ring out of a GeoJSON Polygon as (lat, lon) pairs.

    Accepts a bare geometry or a Feature wrapping one, because both are what
    a drawing library hands back and telling the grower to unwrap it would
    be the app's job, not theirs.
    """
    if not isinstance(geometry, dict):
        raise RegionError("region must be a GeoJSON object or {lat, lon, radius_m}")

    if geometry.get("type") == "Feature":
        geometry = geometry.get("geometry") or {}

    gtype = geometry.get("type")
    if gtype != "Polygon":
        raise RegionError(f"only GeoJSON Polygon regions are supported, got {gtype!r}")

    coords = geometry.get("coordinates")
    if not isinstance(coords, list) or not coords:
        raise RegionError("polygon has no coordinates")

    ring = coords[0]
    if not isinstance(ring, list) or len(ring) < 4:
        raise RegionError("a polygon ring needs at least 4 positions (first repeated as last)")

    out: list[tuple[float, float]] = []
    for pos in ring:
        if not isinstance(pos, (list, tuple)) or len(pos) < 2:
            raise RegionError("each polygon position must be [longitude, latitude]")
        lon, lat = float(pos[0]), float(pos[1])
        _check_lat(lat)
        _check_lon(lon)
        out.append((lat, lon))
    return out


def _point_in_ring(lat: float, lon: float, ring: list[tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon on the (lat, lon) ring."""
    inside = False
    n = len(ring)
    for i in range(n):
        lat_i, lon_i = ring[i]
        lat_j, lon_j = ring[(i - 1) % n]
        intersects = (lat_i > lat) != (lat_j > lat)
        if intersects:
            x = (lon_j - lon_i) * (lat - lat_i) / (lat_j - lat_i) + lon_i
            if lon < x:
                inside = not inside
    return inside


def _ring_area_km2(ring: list[tuple[float, float]]) -> float:
    """Shoelace area of the ring, projected to metres at its mean latitude."""
    if len(ring) < 3:
        return 0.0
    mean_lat = sum(p[0] for p in ring) / len(ring)
    mx = _m_per_deg_lon(mean_lat)
    acc = 0.0
    for i in range(len(ring)):
        lat_i, lon_i = ring[i]
        lat_j, lon_j = ring[(i + 1) % len(ring)]
        acc += (lon_i * mx) * (lat_j * _M_PER_DEG_LAT) - (lon_j * mx) * (lat_i * _M_PER_DEG_LAT)
    return abs(acc) / 2.0 / 1_000_000.0


# ── Grid construction ────────────────────────────────────────────────────


def _spacing_for(area_km2: float) -> float:
    """Grid spacing in metres: the terrain cell, widened if the region is big.

    Widening rather than truncating matters — a truncated grid samples one
    corner of the region and reports its spread as the whole field's, which
    is worse than a coarse but honest sweep.
    """
    spacing = TERRAIN_CELL_M
    if area_km2 <= 0:
        return spacing
    while (area_km2 * 1_000_000.0) / (spacing * spacing) > MAX_SAMPLES:
        spacing *= 1.5
    return spacing


def _grid(
    min_lat: float,
    min_lon: float,
    max_lat: float,
    max_lon: float,
    spacing_m: float,
    keep: Any,
) -> list[SamplePoint]:
    """Lay a lat/lon grid over the bbox, keeping points ``keep`` accepts."""
    mid_lat = (min_lat + max_lat) / 2.0
    d_lat = spacing_m / _M_PER_DEG_LAT
    d_lon = spacing_m / _m_per_deg_lon(mid_lat)

    pts: list[SamplePoint] = []
    steps_lat = max(int((max_lat - min_lat) / d_lat), 0)
    steps_lon = max(int((max_lon - min_lon) / d_lon), 0)

    # Offset by half a cell so samples sit at cell centres rather than on the
    # region's edge, where a boundary point is as likely outside as in.
    for i in range(steps_lat + 1):
        lat = min_lat + (i + 0.5) * d_lat
        if lat > max_lat:
            lat = (min_lat + max_lat) / 2.0
        for j in range(steps_lon + 1):
            lon = min_lon + (j + 0.5) * d_lon
            if lon > max_lon:
                lon = (min_lon + max_lon) / 2.0
            if keep(lat, lon):
                pts.append(SamplePoint(lat=round(lat, 5), lon=round(lon, 5)))

    # Dedupe — the clamping above can fold two steps onto the same centre.
    seen: set[tuple[float, float]] = set()
    unique: list[SamplePoint] = []
    for p in pts:
        key = (p.lat, p.lon)
        if key not in seen:
            seen.add(key)
            unique.append(p)
    return unique[:MAX_SAMPLES]


# ── Public entry point ───────────────────────────────────────────────────


def parse_region(region: Any) -> Region:
    """Normalize a patron's ``region`` argument into a sampled ``Region``.

    Accepts either a GeoJSON Polygon (bare geometry or Feature) or a
    ``{"lat": .., "lon": .., "radius_m": ..}`` pin. Raises ``RegionError``
    with a grower-readable message on anything else.

    Tool arguments arrive from AI agents and are treated as adversarial:
    every coordinate is range-checked and the sample count is capped before
    a single upstream request is made.
    """
    if not isinstance(region, dict):
        raise RegionError("region must be a GeoJSON Polygon or {lat, lon, radius_m}")

    if {"lat", "lon"} <= region.keys():
        return _circle_region(region)

    return _polygon_region(region)


def _circle_region(region: dict[str, Any]) -> Region:
    try:
        lat = float(region["lat"])
        lon = float(region["lon"])
        radius_m = float(region.get("radius_m", DEFAULT_RADIUS_M))
    except (TypeError, ValueError) as exc:
        raise RegionError(f"lat, lon and radius_m must be numbers: {exc}") from exc

    _check_lat(lat)
    _check_lon(lon)
    if radius_m <= 0:
        raise RegionError(f"radius_m must be positive, got {radius_m}")
    if radius_m > MAX_RADIUS_M:
        raise RegionError(
            f"radius_m must be {MAX_RADIUS_M:.0f} m or less, got {radius_m:.0f} — "
            "draw a polygon for anything larger than a single farm"
        )

    d_lat = radius_m / _M_PER_DEG_LAT
    d_lon = radius_m / _m_per_deg_lon(lat)
    bbox = (lat - d_lat, lon - d_lon, lat + d_lat, lon + d_lon)
    area_km2 = math.pi * (radius_m / 1000.0) ** 2

    mx = _m_per_deg_lon(lat)

    def inside(plat: float, plon: float) -> bool:
        dy = (plat - lat) * _M_PER_DEG_LAT
        dx = (plon - lon) * mx
        return math.hypot(dx, dy) <= radius_m

    spacing = _spacing_for(area_km2)
    pts = _grid(*bbox, spacing, inside)
    # A radius under one grid cell yields no interior centre; the pin itself
    # is then the honest sample rather than an empty region.
    if not pts:
        pts = [SamplePoint(lat=round(lat, 5), lon=round(lon, 5))]

    return Region(
        kind="circle",
        points=tuple(pts),
        centroid=SamplePoint(lat=round(lat, 5), lon=round(lon, 5)),
        bbox=bbox,
        area_km2=area_km2,
        spacing_m=spacing,
    )


def _polygon_region(region: dict[str, Any]) -> Region:
    ring = _ring_from_geojson(region)
    lats = [p[0] for p in ring]
    lons = [p[1] for p in ring]
    bbox = (min(lats), min(lons), max(lats), max(lons))
    area_km2 = _ring_area_km2(ring)

    def inside(plat: float, plon: float) -> bool:
        return _point_in_ring(plat, plon, ring)

    spacing = _spacing_for(area_km2)
    pts = _grid(*bbox, spacing, inside)
    # A sliver narrower than one grid cell can miss every centre. Falling back
    # to the centroid keeps a legitimately thin field (a hedgerow, a swale)
    # answerable instead of erroring on geometry the grower drew on purpose.
    if not pts:
        pts = [
            SamplePoint(
                lat=round(sum(lats) / len(lats), 5),
                lon=round(sum(lons) / len(lons), 5),
            )
        ]

    return Region(
        kind="polygon",
        points=tuple(pts),
        centroid=SamplePoint(
            lat=round(sum(lats) / len(lats), 5),
            lon=round(sum(lons) / len(lons), 5),
        ),
        bbox=bbox,
        area_km2=area_km2,
        spacing_m=spacing,
    )


def cluster_to_grid(points: tuple[SamplePoint, ...], cell_m: float) -> tuple[list[SamplePoint], list[int]]:
    """Fold sample points onto the coarse feed's own grid.

    The temperature archive resolves ~9 km, so a farm's sample points all
    land in one cell and return byte-identical numbers. Fetching each point
    separately buys nothing and costs an upstream rate limit, so we fetch
    each distinct cell once and map points back to it.

    Returns ``(cell_centres, index_per_point)`` — ``index_per_point[i]`` is
    the cell that ``points[i]`` draws its regional signal from.
    """
    if not points:
        return [], []

    mid_lat = sum(p.lat for p in points) / len(points)
    d_lat = cell_m / _M_PER_DEG_LAT
    d_lon = cell_m / _m_per_deg_lon(mid_lat)

    centres: list[SamplePoint] = []
    index: dict[tuple[int, int], int] = {}
    per_point: list[int] = []

    for p in points:
        key = (math.floor(p.lat / d_lat), math.floor(p.lon / d_lon))
        if key not in index:
            index[key] = len(centres)
            centres.append(
                SamplePoint(
                    lat=round((key[0] + 0.5) * d_lat, 5),
                    lon=round((key[1] + 0.5) * d_lon, 5),
                )
            )
        per_point.append(index[key])

    return centres, per_point


def summarize(values: list[float]) -> dict[str, float] | None:
    """Aggregate plus spread — the shape every Good Earth answer returns.

    ``None`` when nothing was sampled, so a caller can say "no data" rather
    than report a mean of zero.
    """
    clean = [v for v in values if v is not None and not math.isnan(v)]
    if not clean:
        return None
    return {
        "min": round(min(clean), 2),
        "mean": round(sum(clean) / len(clean), 2),
        "max": round(max(clean), 2),
        "spread": round(max(clean) - min(clean), 2),
        "n": len(clean),
    }
