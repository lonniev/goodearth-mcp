"""Region sampling — geometry, guards, and adversarial arguments."""

from __future__ import annotations

import dataclasses

import pytest

from goodearth_mcp.region import (
    MAX_SAMPLES,
    Region,
    RegionError,
    parse_region,
    summarize,
)

# A ~1 km square over the Champlain Valley.
SQUARE = {
    "type": "Polygon",
    "coordinates": [[
        [-73.22, 44.47],
        [-73.20, 44.47],
        [-73.20, 44.49],
        [-73.22, 44.49],
        [-73.22, 44.47],
    ]],
}


def test_polygon_samples_inside_and_reports_geometry():
    r = parse_region(SQUARE)
    assert r.kind == "polygon"
    assert r.sample_count >= 1
    for p in r.points:
        assert 44.47 <= p.lat <= 44.49
        assert -73.22 <= p.lon <= -73.20
    assert r.area_km2 > 0


def test_feature_wrapper_is_unwrapped():
    """Drawing libraries hand back a Feature; the grower shouldn't have to unwrap it."""
    feature = {"type": "Feature", "properties": {}, "geometry": SQUARE}
    assert parse_region(feature).sample_count == parse_region(SQUARE).sample_count


def test_circle_samples_stay_within_radius():
    r = parse_region({"lat": 44.48, "lon": -73.21, "radius_m": 1500})
    assert r.kind == "circle"
    assert r.sample_count >= 1
    assert r.centroid.lat == pytest.approx(44.48, abs=1e-4)


def test_tiny_radius_still_answers_with_the_pin():
    """A radius under one grid cell must not produce an empty region."""
    r = parse_region({"lat": 44.48, "lon": -73.21, "radius_m": 5})
    assert r.sample_count == 1


def test_sample_count_is_capped():
    """One priced call must never fan out into thousands of upstream requests."""
    r = parse_region({"lat": 44.48, "lon": -73.21, "radius_m": 45_000})
    assert r.sample_count <= MAX_SAMPLES


def test_large_region_widens_spacing_rather_than_truncating():
    """A truncated grid would sample one corner and call it the whole field."""
    small = parse_region({"lat": 44.48, "lon": -73.21, "radius_m": 1000})
    large = parse_region({"lat": 44.48, "lon": -73.21, "radius_m": 40_000})
    assert large.bbox[2] - large.bbox[0] > small.bbox[2] - small.bbox[0]
    lat_span = max(p.lat for p in large.points) - min(p.lat for p in large.points)
    assert lat_span > 0.2  # points reach across the region, not just one corner


# ── Adversarial arguments: tool input is treated as hostile ──────────────


@pytest.mark.parametrize(
    "bad",
    [
        None,
        "npub1deadbeef",
        42,
        [],
        {},
        {"type": "Point", "coordinates": [-73.2, 44.4]},
        {"type": "Polygon", "coordinates": []},
        {"type": "Polygon", "coordinates": [[[-73.2, 44.4], [-73.1, 44.4]]]},
    ],
)
def test_malformed_regions_raise_region_error(bad):
    with pytest.raises(RegionError):
        parse_region(bad)


@pytest.mark.parametrize(
    "bad",
    [
        {"lat": 91.0, "lon": 0.0, "radius_m": 100},
        {"lat": -91.0, "lon": 0.0, "radius_m": 100},
        {"lat": 44.0, "lon": 181.0, "radius_m": 100},
        {"lat": 44.0, "lon": 0.0, "radius_m": 0},
        {"lat": 44.0, "lon": 0.0, "radius_m": -500},
        {"lat": 44.0, "lon": 0.0, "radius_m": 999_999},
        {"lat": "north", "lon": 0.0, "radius_m": 100},
    ],
)
def test_out_of_range_pins_are_rejected(bad):
    with pytest.raises(RegionError):
        parse_region(bad)


def test_polygon_coordinate_range_is_checked():
    evil = {
        "type": "Polygon",
        "coordinates": [[[-73.2, 44.4], [-73.1, 44.4], [-73.1, 200.0], [-73.2, 44.4]]],
    }
    with pytest.raises(RegionError):
        parse_region(evil)


# ── summarize ────────────────────────────────────────────────────────────


def test_summarize_reports_spread():
    s = summarize([10.0, 12.0, 16.0])
    assert s == {"min": 10.0, "mean": 12.67, "max": 16.0, "spread": 6.0, "n": 3}


def test_summarize_returns_none_when_nothing_sampled():
    """None lets a caller say 'no data' instead of reporting a mean of zero."""
    assert summarize([]) is None
    assert summarize([float("nan")]) is None


def test_describe_is_json_safe():
    d = parse_region(SQUARE).describe()
    assert set(d) == {"kind", "sample_count", "grid_spacing_m", "area_km2", "centroid", "bbox"}
    assert isinstance(d["centroid"]["lat"], float)


def test_region_is_immutable():
    r = parse_region(SQUARE)
    with pytest.raises(dataclasses.FrozenInstanceError):
        r.kind = "circle"  # type: ignore[misc]
    assert isinstance(r, Region)
