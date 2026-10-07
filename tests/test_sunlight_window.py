"""The sunlight answer: assembled once, remembered, honest about what it could not read."""

from __future__ import annotations

from datetime import date

import numpy as np
import pytest

from goodearth_mcp import rasters, record_cache, sources, sunlight_window
from goodearth_mcp.region import parse_region, ring_of

GEO = {"type": "Polygon", "coordinates": [[
    [-72.0, 44.0], [-71.9995, 44.0], [-71.9995, 44.0004], [-72.0, 44.0004], [-72.0, 44.0],
]]}
TODAY = date(2026, 6, 1)


class _Flat:
    def sample_bilinear(self, lats, lons):
        return np.zeros(np.shape(lats), np.float32)

    sample = sample_bilinear


class _Trees:
    """A tree line 20 m south of the block."""

    def sample(self, lats, lons):
        return np.where(np.abs(lats - (44.0 - 20.0 / 111_320.0)) < 1e-5, 20.0, 0.0).astype(np.float32)


def _normals(monthly_mean_f):
    dates, hi, lo = [], [], []
    for m, mean in enumerate(monthly_mean_f, start=1):
        dates.append(f"2020-{m:02d}-15")
        hi.append(mean + 10.0)
        lo.append(mean - 10.0)
    return [{"daily": {"time": dates, "temperature_2m_max": hi, "temperature_2m_min": lo}}], "Daymet v4 (NASA ORNL)", 1000


@pytest.fixture
def stubbed(monkeypatch):
    """Every raster and feed answered locally; the cache is a dict."""
    calls = {"canopy": 0, "terrain": 0, "land_cover": 0}
    store: dict[str, object] = {}

    def canopy(*_a, **_k):
        calls["canopy"] += 1
        return _Trees()

    def terrain(*_a, **_k):
        calls["terrain"] += 1
        return rasters.Mosaic([rasters.Window(np.zeros((2, 2), np.float32), _page(), 0, 0)])

    def land_cover(*_a, **_k):
        calls["land_cover"] += 1
        raise rasters.RasterError("land cover host down")

    async def remembered(kind, subject):
        return store.get(f"{kind}|{subject}")

    async def remember(kind, subject, value):
        store[f"{kind}|{subject}"] = value

    async def normals(*_a, **_k):
        return _normals([18, 22, 32, 44, 56, 65, 70, 68, 60, 48, 37, 25])

    monkeypatch.setattr(rasters, "canopy_height", canopy)
    monkeypatch.setattr(rasters, "canopy_observed", lambda *_a: "2019-06")
    monkeypatch.setattr(rasters, "terrain", terrain)
    monkeypatch.setattr(rasters, "land_cover", land_cover)
    monkeypatch.setattr(record_cache, "remembered", remembered)
    monkeypatch.setattr(record_cache, "remember", remember)
    monkeypatch.setattr(record_cache, "normals_history", normals)
    sunlight_window._memo.clear()
    yield calls, store
    sunlight_window._memo.clear()


def _page() -> rasters.Page:
    return rasters.Page(
        url="x", level=0, width=2, height=2, dtype=np.dtype(np.float32), compression=1, predictor=1,
        tiled=False, chunk_w=2, chunk_h=1, offsets=np.zeros(2, np.uint64), bytecounts=np.zeros(2, np.uint64),
        nodata=None, crs="EPSG:4326", x0=-73.0, y0=45.0, dx=1.0, dy=1.0,
    )


async def _call(**kw):
    return await sunlight_window.region_sunlight(parse_region(GEO), ring_of(GEO), today=TODAY, **kw)


async def test_answer_shape_sources_and_note(stubbed):
    r = await _call()
    assert r["success"] and r["horizon"] == "computed"
    assert [m["month"] for m in r["light"]["months"]] == list(range(1, 13))
    june = r["light"]["months"][5]
    assert sum(june["share"].values()) == pytest.approx(1.0, abs=0.002)
    assert june["leaf_on"] and r["light"]["leaf_on_months"] == [5, 6, 7, 8, 9]
    assert r["light"]["leaf_off_months"] == [1, 2, 3, 4, 10, 11, 12]
    names = [s["name"] for s in r["sources"]]
    assert "Meta/WRI canopy height map" in names and "Copernicus GLO-30 terrain" in names
    assert "Copernicus Global Land Cover" not in names  # it was down
    assert r["sources"][0]["observed"] == "2019-06"
    assert "every tree is taken as evergreen" in r["note"]
    assert "taken 2019-06" in r["note"]
    assert r["grid"]["cells"] == r["grid"]["rows"] * r["grid"]["cols"] or r["grid"]["cells"] > 0


async def test_one_month_only(stubbed):
    r = await _call(month=12)
    assert [m["month"] for m in r["light"]["months"]] == [12]
    assert list(r["light"]["open_sky_hours"]) == [12]


async def test_bad_month_is_the_callers_error(stubbed):
    with pytest.raises(sunlight_window.SunlightError):
        await _call(month=13)
    with pytest.raises(sunlight_window.SunlightError):
        await _call(month=True)


async def test_second_call_reads_the_remembered_horizon_and_touches_no_raster(stubbed):
    calls, store = stubbed
    first = await _call(month=6)
    assert calls["canopy"] == 1 and calls["terrain"] == 2 and len(store) == 1  # near field + far overview
    sunlight_window._memo.clear()  # force the Neon row, not the in-process memo
    second = await _call(month=6)
    assert calls["canopy"] == 1 and calls["terrain"] == 2
    assert second["horizon"] == "cached"
    assert second["light"]["months"][0]["median_hours"] == first["light"]["months"][0]["median_hours"]
    assert second["sources"][0]["observed"] == "2019-06"  # remembered with the horizon


async def test_tree_line_shows_in_the_south_row_in_december(stubbed):
    r = await _call(month=12)
    dec = r["light"]["months"][0]
    assert dec["shadiest"]["hours"] < dec["sunniest"]["hours"]
    assert dec["shadiest"]["lat"] < dec["sunniest"]["lat"]  # the shaded ground is nearest the trees


async def test_no_canopy_map_is_upstream_unavailable(stubbed, monkeypatch):
    def gone(*_a, **_k):
        raise rasters.RasterError("no tile")

    monkeypatch.setattr(rasters, "canopy_height", gone)
    with pytest.raises(sources.UpstreamError):
        await _call()


async def test_terrain_down_is_said_not_hidden(stubbed, monkeypatch):
    def gone(*_a, **_k):
        raise rasters.RasterError("dem down")

    monkeypatch.setattr(rasters, "terrain", gone)
    r = await _call(month=6)
    assert "ground is taken as level" in r["note"]
    assert all(s["name"] != "Copernicus GLO-30 terrain" for s in r["sources"])


async def test_normals_down_means_leaf_on_all_year(stubbed, monkeypatch):
    async def gone(*_a, **_k):
        raise sources.UpstreamError("normals down")

    monkeypatch.setattr(record_cache, "normals_history", gone)
    r = await _call(month=1)
    assert r["light"]["leaf_on_months"] == list(range(1, 13))
    assert "every month is taken as in leaf" in r["note"]


def test_horizon_subject_names_the_outline_and_the_sources():
    ring = ring_of(GEO)
    same = [(lat + 1e-7, lon) for lat, lon in ring]
    moved = [(lat + 1e-4, lon) for lat, lon in ring]
    assert sunlight_window.horizon_subject(ring) == sunlight_window.horizon_subject(same)
    assert sunlight_window.horizon_subject(ring) != sunlight_window.horizon_subject(moved)
