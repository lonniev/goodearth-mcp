"""The range reader: every public layout decoded exactly, in as few requests as the file allows."""

from __future__ import annotations

import numpy as np
import pytest
import respx

from goodearth_mcp import rasters
from tests._tiff_fixtures import DEFLATE, NONE, ZSTD, Served, geotiff


@pytest.fixture(autouse=True)
def _fresh_directory_cache():
    rasters._PAGES.clear()
    yield
    rasters._PAGES.clear()


def _serve(url: str, blob: bytes) -> Served:
    served = Served(blob)
    respx.get(url).mock(side_effect=served)
    return served


@respx.mock
def test_striped_predictor2_window_is_exact_and_one_coalesced_range():
    rng = np.random.default_rng(1)
    data = rng.integers(0, 40, size=(64, 48), dtype=np.uint8)
    url = "https://example.test/chm.tif"
    served = _serve(url, geotiff(data, x0=0.0, y0=64.0, dx=1.0, dy=1.0, compression=DEFLATE, predictor=2))

    page = rasters.open_page(url, crs="EPSG:3857")
    assert (page.width, page.height, page.tiled, page.predictor) == (48, 64, False, 2)
    header_requests = served.requests

    out = rasters.read_window(page, 10, 30, 5, 20)
    assert np.array_equal(out, data[10:30, 5:20])
    # Twenty adjacent strips, one request.
    assert served.requests == header_requests + 1


@respx.mock
def test_tiled_deflate_float_predictor_window_is_exact():
    rng = np.random.default_rng(2)
    data = (rng.random((40, 50)) * 500.0).astype(np.float32)
    url = "https://example.test/dem.tif"
    _serve(url, geotiff(data, x0=-73.0, y0=45.0, dx=0.01, dy=0.01, compression=DEFLATE, predictor=3, tile=16))

    page = rasters.open_page(url)
    out = rasters.read_window(page, 3, 37, 2, 49)
    assert out.dtype == np.float32
    assert np.array_equal(out, data[3:37, 2:49])


@respx.mock
def test_tiled_zstd_uint8_with_nodata_outside_the_file():
    data = np.full((20, 20), 111, dtype=np.uint8)
    url = "https://example.test/lc.tif"
    _serve(url, geotiff(data, x0=-180.0, y0=80.0, dx=0.001, dy=0.001, compression=ZSTD, tile=16, nodata=255))

    page = rasters.open_page(url)
    assert page.nodata == 255
    out = rasters.read_window(page, 10, 30, 10, 30)  # half off the bottom-right edge
    assert out.shape == (10, 10)
    assert (out == 111).all()
    # Sampling off the file is NaN, not a number.
    w = rasters.Window(out, page, 10, 10)
    got = w.sample(np.array([80.0 - 0.0105, 80.0 - 0.0305]), np.array([-180.0 + 0.0105, -180.0 + 0.0105]))
    assert got[0] == 111 and np.isnan(got[1])


@respx.mock
def test_uncompressed_single_row_strips_read_only_the_columns_asked():
    data = np.arange(30 * 40, dtype=np.float32).reshape(30, 40)
    url = "https://example.test/date.tif"
    served = _serve(url, geotiff(data, x0=-180.0, y0=83.0, dx=0.01, dy=0.01, compression=NONE))
    page = rasters.open_page(url)
    before = len(served.ranges)
    out = rasters.read_window(page, 12, 13, 7, 8)
    assert out[0, 0] == data[12, 7]
    (start, end), = served.ranges[before:]
    assert end - start + 1 == 4  # one float, not a 160-byte row


@respx.mock
def test_terrain_mosaics_across_a_degree_boundary():
    north = np.full((100, 100), 200.0, dtype=np.float32)
    south = np.full((100, 100), 100.0, dtype=np.float32)
    for lat, arr in ((44, north), (43, south)):
        name = f"Copernicus_DSM_COG_10_N{lat}_00_W073_00_DEM"
        _serve(f"{rasters.DEM_BASE}/{name}/{name}.tif",
               geotiff(arr, x0=-73.0, y0=lat + 1.0, dx=0.01, dy=0.01, compression=DEFLATE, predictor=3, tile=16))
    mosaic = rasters.terrain(43.95, -72.6, 44.05, -72.5)
    assert len(mosaic.windows) == 2
    got = mosaic.sample(np.array([44.02, 43.98]), np.array([-72.55, -72.55]))
    assert got.tolist() == [200.0, 100.0]


@respx.mock
def test_canopy_raises_when_no_tile_answers():
    respx.get(url__regex=r".*/chm/.*\.tif").mock(return_value=respx.MockResponse(503))
    with pytest.raises(rasters.RasterError):
        rasters.canopy_height(44.25, -72.6, 44.26, -72.59)


def test_quadkeys_are_the_published_tile_names():
    assert rasters.quadkey(44.26, -72.58) == "030233002"
    assert rasters.quadkey(49.0, 8.4) == "120203233"
    assert rasters.quadkey(-43.5, 172.6) == "313110301"


@respx.mock
def test_canopy_observed_reads_years_since_2000_with_the_month_as_a_fraction():
    data = np.zeros((10, 10), dtype=np.float32)
    data[3, 4] = 18 + 5 / 12  # May 2018
    data[5, 5] = 0.0  # unobserved
    _serve(f"{rasters.CHM_BASE}/CHM_acquisition_date.tif",
           geotiff(data, x0=-73.0, y0=45.0, dx=0.1, dy=0.1, compression=NONE, nodata=0))
    assert rasters.canopy_observed(45.0 - 0.35, -73.0 + 0.45) == "2018-05"
    assert rasters.canopy_observed(45.0 - 0.55, -73.0 + 0.55) is None


def test_mercator_pixel_placement():
    page = rasters.Page(
        url="x", level=0, width=10, height=10, dtype=np.dtype(np.uint8), compression=1, predictor=1,
        tiled=False, chunk_w=10, chunk_h=1, offsets=np.zeros(10, np.uint64), bytecounts=np.zeros(10, np.uint64),
        nodata=None, crs="EPSG:3857", x0=0.0, y0=1000.0, dx=100.0, dy=100.0,
    )
    w = rasters.Window(np.zeros((10, 10), np.uint8), page, 0, 0)
    row, col = w.pixel(np.array([0.0]), np.array([0.0]))
    assert row[0] == pytest.approx(10.0) and col[0] == pytest.approx(0.0)
