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

    async def radiation(lat, lon, year):
        calls["radiation"] = calls.get("radiation", 0) + 1
        times, dni, dhi, ghi = [], [], [], []
        for m in range(1, 13):
            for h in range(24):
                times.append(f"{year}-{m:02d}-15T{h:02d}:00")
                day = 7 <= h <= 17
                dni.append(600.0 if day else 0.0)
                dhi.append(100.0 if day else 0.0)
                ghi.append(500.0 if day else 0.0)
        return {"hourly": {"time": times, "direct_normal_irradiance": dni, "diffuse_radiation": dhi, "shortwave_radiation": ghi}}

    monkeypatch.setattr(rasters, "canopy_height", canopy)
    monkeypatch.setattr(rasters, "canopy_observed", lambda *_a: "2019-06")
    monkeypatch.setattr(rasters, "terrain", terrain)
    monkeypatch.setattr(rasters, "land_cover", land_cover)
    monkeypatch.setattr(record_cache, "remembered", remembered)
    monkeypatch.setattr(record_cache, "remember", remember)
    monkeypatch.setattr(record_cache, "normals_history", normals)
    async def zone(lat, lon):
        calls["zone"] = calls.get("zone", 0) + 1
        return "America/New_York"

    monkeypatch.setattr(sources, "fetch_radiation_year", radiation)
    monkeypatch.setattr(sources, "fetch_time_zone", zone)
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
    s = r["solar"]
    assert s["panel"] == {"tilt_deg": 40.0, "azimuth_deg": 180.0, "fixed": True}
    assert s["radiation_years"] == 10 and s["open_sky_kwh_per_kwp_year"] > 0
    assert s["kwh_per_kwp_year"]["p10"] <= s["kwh_per_kwp_year"]["median"] <= s["kwh_per_kwp_year"]["p90"]
    assert 0 < s["best_point"]["solar_access_pct"] <= 100
    assert len(s["best_point"]["monthly_kwh_per_kwp"]) == 12
    assert "Open-Meteo archive (ERA5)" in names
    assert r["grid"]["cells"] == r["grid"]["rows"] * r["grid"]["cols"] or r["grid"]["cells"] > 0


async def test_climatology_is_remembered_per_cell_and_panel_args_are_checked(stubbed):
    calls, _store = stubbed
    await _call(month=6)
    assert calls["radiation"] == 10
    sunlight_window._memo.clear()
    r = await _call(month=6, panel_tilt_deg=10, panel_azimuth_deg=90)
    assert calls["radiation"] == 10  # the typical year came from the cache
    assert r["solar"]["panel"]["tilt_deg"] == 10.0 and r["solar"]["panel"]["azimuth_deg"] == 90.0
    with pytest.raises(sunlight_window.SunlightError):
        await _call(panel_tilt_deg=91)
    with pytest.raises(sunlight_window.SunlightError):
        await _call(panel_azimuth_deg=float("nan"))


async def test_too_few_radiation_years_means_no_solar_figure(stubbed, monkeypatch):
    async def flaky(lat, lon, year):
        if year % 3:
            raise sources.UpstreamError("archive busy")
        return {"hourly": {"time": [], "direct_normal_irradiance": [], "diffuse_radiation": [], "shortwave_radiation": []}}

    monkeypatch.setattr(sources, "fetch_radiation_year", flaky)
    r = await _call(month=6)
    assert r["solar"] is None
    assert "no solar figure" in r["note"]


async def test_point_card_is_the_nearest_cell_and_refuses_the_outside(stubbed):
    inside = f"{44.0002},{-71.9998}"
    r = await _call(month=6, point=inside)
    card = r["point"]
    assert card["cell"]["row"] >= 0 and len(card["horizon"]["canopy_deg"]) == 72
    assert len(card["hours_by_month"]) == 12 and card["class_by_month"][5] in ("full_sun", "part_shade", "full_shade")
    assert 0 < card["sky_view_factor"] <= 1
    assert card["solar"]["least_light_month"] in range(1, 13)
    assert set(r["sun_paths"]) == {"june", "equinox", "december"}
    assert all(e > -1 for _, e, _m in r["sun_paths"]["december"])
    with pytest.raises(sunlight_window.SunlightError):
        await _call(point="45,-72")
    for bad in ("x", "1,2,3", "nan,1", "44.0002"):
        with pytest.raises(sunlight_window.SunlightError):
            await _call(point=bad)


async def test_grid_fields_decode_to_the_raster_with_nodata_outside(stubbed):
    import base64
    import zlib

    r = await _call(detail="grid")
    g = r["grid"]
    rows, cols, n = g["rows"], g["cols"], g["cells"]
    june = g["fields"]["hours_by_month"][5]
    arr = np.frombuffer(base64.b64decode(june["b64"]), dtype=june["dtype"]).reshape(rows, cols)
    kept = arr != june["nodata"]
    assert kept.sum() == n
    hours = arr[kept] * june["scale"]
    assert hours.max() <= 24.0
    kwh = g["fields"]["kwh_per_kwp_year"]
    k = np.frombuffer(base64.b64decode(kwh["b64"]), dtype=kwh["dtype"]).reshape(rows, cols)
    assert ((k != kwh["nodata"]) == kept).all()
    terrain = g["fields"]["horizon_terrain_deg"]
    t = np.frombuffer(zlib.decompress(base64.b64decode(terrain["b64"])), dtype=terrain["dtype"]).reshape(terrain["shape"])
    assert t.shape == (n, 72) and t.max() <= 90
    assert "sun_paths" in r and "bounds" in g
    # The leaf chip's other reading: identical in leaf-on months, never lower in leaf-off ones.
    full = g["fields"]["hours_by_month_in_leaf"]
    for m in range(12):
        a = np.frombuffer(base64.b64decode(g["fields"]["hours_by_month"][m]["b64"]), dtype=np.uint8)
        b = np.frombuffer(base64.b64decode(full[m]["b64"]), dtype=np.uint8)
        assert (a == b).all() if (m + 1) in r["light"]["leaf_on_months"] else (b[kept.ravel()] <= a[kept.ravel()]).all()
    assert "kwh_per_kwp_year_in_leaf" in g["fields"]
    with pytest.raises(sunlight_window.SunlightError):
        await _call(detail="everything")


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
    assert calls["canopy"] == 1 and calls["terrain"] == 2  # near field + far overview
    assert len(store) == 2  # the horizon and the typical year
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


# ── field reports ────────────────────────────────────────────────────────────

NORTH_SPOT = "44.00038,-71.99975"  # the block's north edge: 60 m from the tree line, in full sun


def _sun_report(light, **over):
    return {"kind": "sunlight", "observed_on": "2026-06-14", "from": "10:00", "to": "14:00",
            "light": light, "lat": 44.00038, "lon": -71.99975, "ref": "r1", **over}


async def test_three_agreeing_shade_reports_change_a_spots_hours(stubbed):
    clean = await _call(point=NORTH_SPOT)
    june_before = clean["point"]["hours_by_month"][5]
    assert clean["calibration"] is None and june_before > 10.0

    r = await _call(point=NORTH_SPOT, reports=[_sun_report("shade") for _ in range(3)])
    acct = r["calibration"]
    assert acct["reports"] == 3 and acct["used"] == 3 and acct["cells_corrected"] >= 1
    assert r["point"]["hours_by_month"][5] <= june_before - 3.0
    assert "cells corrected" in r["note"]
    assert acct["clock"] == "America/New_York" and "whole-hour zone" not in r["note"]
    # The remembered horizon is the imagery's, not the reports': a retracted report retracts.
    again = await _call(point=NORTH_SPOT)
    assert again["point"]["hours_by_month"][5] == june_before
    # The zone is a fact about the place: fetched once, remembered, never asked without reports.
    calls, store = stubbed
    assert calls["zone"] == 1 and any(k.startswith("sun_zone|") for k in store)


async def test_without_a_zone_the_clock_is_assumed_from_longitude_and_said(stubbed, monkeypatch):
    async def down(lat, lon):
        raise sources.UpstreamError("forecast feed down")

    monkeypatch.setattr(sources, "fetch_time_zone", down)
    r = await _call(point=NORTH_SPOT, reports=[_sun_report("shade") for _ in range(3)])
    assert r["calibration"]["clock"] == "assumed from longitude"
    assert r["calibration"]["cells_corrected"] >= 1 and "whole-hour zone" in r["note"]


async def test_frost_reports_are_passed_over_and_a_bad_sunlight_report_is_named(stubbed):
    reports = [
        {"kind": "frost", "observed_on": "2025-10-02", "ref": "f1"},
        _sun_report("sun", ref="ok"),
        _sun_report("sun", ref="bad", to="08:00"),
    ]
    r = await _call(reports=reports)
    acct = r["calibration"]
    assert acct["reports"] == 1 and acct["cells_corrected"] == 0
    assert acct["skipped"] == [{"ref": "bad", "reason": '"to" must come after "from" on the same day'}]
    assert "none moves the horizon yet" in r["note"]
