"""Solar yield: the climatology reduces honestly and the plane-of-array arithmetic is the brief's."""

from __future__ import annotations

import numpy as np
import pytest

from goodearth_mcp import horizon as hz
from goodearth_mcp import solar, sunpath


def _hourly(year: int, dni: float, dhi: float, ghi: float, drop: int = 0) -> dict:
    times, a, b, c = [], [], [], []
    for m in range(1, 13):
        for d in (1, 15):
            for h in range(24):
                times.append(f"{year}-{m:02d}-{d:02d}T{h:02d}:00")
                a.append(dni if 6 <= h <= 18 else 0.0)
                b.append(dhi if 6 <= h <= 18 else 0.0)
                c.append(ghi if 6 <= h <= 18 else 0.0)
    for i in range(drop):  # a gap in the record is skipped, not zeroed
        a[i] = None
    return {"time": times, "direct_normal_irradiance": a, "diffuse_radiation": b, "shortwave_radiation": c}


def test_reduce_and_climatology_average_by_month_and_hour():
    parts = [solar.reduce_year(_hourly(2020, 600, 100, 500)), solar.reduce_year(_hourly(2021, 800, 100, 700, drop=5))]
    mean = solar.climatology(parts)
    assert mean.shape == (12, 24, 3)
    assert mean[5, 12, solar.DNI] == pytest.approx(700.0)
    assert mean[5, 12, solar.GHI] == pytest.approx(600.0)
    assert mean[5, 3, solar.DNI] == 0.0
    # The dropped hours of 2021 leave 2020 alone to answer for them.
    assert mean[0, 0, solar.DNI] == 0.0 and parts[1][1][0, 0] == 1.0


def _open() -> hz.Horizon:
    return hz.Horizon(np.zeros((1, 72), np.uint16), np.zeros((1, 72), np.uint16), np.zeros((1, 72), np.uint8))


def test_sky_view_factor_open_and_ringed():
    assert solar.sky_view_factor(None, True)[0] == 1.0
    assert solar.sky_view_factor(_open(), True)[0] == pytest.approx(1.0)
    ringed = _open()
    ringed.canopy[:] = 600
    ringed.kind[:] = hz.KIND_DECIDUOUS
    assert solar.sky_view_factor(ringed, True)[0] == pytest.approx(0.25, abs=1e-3)  # cos² 60°
    assert solar.sky_view_factor(ringed, False)[0] == pytest.approx(0.25 + 0.5 * 0.75, abs=1e-3)


def test_incidence_cosine_edges():
    assert solar.incidence_cosine(np.array([90.0]), np.array([180.0]), 0.0, 180.0)[0] == pytest.approx(1.0)
    assert solar.incidence_cosine(np.array([0.0]), np.array([180.0]), 0.0, 180.0)[0] == 0.0
    assert solar.incidence_cosine(np.array([-5.0]), np.array([180.0]), 40.0, 180.0)[0] == 0.0
    # A panel facing the sun at 40° elevation, tilted 50°, is square to it.
    assert solar.incidence_cosine(np.array([40.0]), np.array([180.0]), 50.0, 180.0)[0] == pytest.approx(1.0)


def test_flat_panel_under_diffuse_only_sky_is_the_diffuse_sum():
    mean = np.zeros((12, 24, 3), np.float32)
    mean[:, 6:19, solar.DHI] = 100.0  # 13 hours of 100 W/m² diffuse, every day
    elev = np.full((12, 24), 30.0, np.float32)
    az = np.full((12, 24), 180.0, np.float32)
    poa = solar.poa_monthly(None, mean, elev, az, 0.0, 180.0, list(range(1, 13)), 2025)
    assert poa.shape == (1, 12)
    assert poa[0, 0] == pytest.approx(13 * 100 * 31 / 1000.0)
    y = solar.yields(poa, poa)
    assert y["open_sky_kwh_per_kwp"] == pytest.approx(round(float(poa.sum()) * 0.8, 0))
    assert y["solar_access"][0] == pytest.approx(1.0)


def test_defaults_face_the_equator_and_the_southern_panel_faces_north():
    assert solar.default_tilt(44.26) == 40.0 and solar.default_tilt(-35.3) == 35.3 and solar.default_tilt(5.0) == 5.0
    assert solar.default_azimuth(44.0) == 180.0 and solar.default_azimuth(-35.3) == 0.0
    mean = np.zeros((12, 24, 3), np.float32)
    mean[:, :, solar.DNI] = 800.0
    elev, az = sunpath.sun_position(-35.3, 149.1, sunpath.representative_days(2025), sunpath.HOURS_MID)
    north = solar.poa_monthly(None, mean, elev, az, 35.0, 0.0, list(range(1, 13)), 2025).sum()
    south = solar.poa_monthly(None, mean, elev, az, 35.0, 180.0, list(range(1, 13)), 2025).sum()
    assert north > south * 1.3


def test_a_southern_wall_costs_a_northern_panel_its_winter():
    walled = _open()
    walled.terrain[:, 24:49] = 400  # 40° of ground from 120° to 240°
    walled.canopy[:, 24:49] = 400
    mean = np.zeros((12, 24, 3), np.float32)
    mean[:, :, solar.DNI] = 800.0
    elev, az = sunpath.sun_position(44.26, -72.58, sunpath.representative_days(2025), sunpath.HOURS_MID)
    open_sky = solar.poa_monthly(None, mean, elev, az, 40.0, 180.0, list(range(1, 13)), 2025)
    shaded = solar.poa_monthly(walled, mean, elev, az, 40.0, 180.0, list(range(1, 13)), 2025)
    y = solar.yields(open_sky, shaded)
    assert 0.0 < y["solar_access"][0] < 1.0
    assert shaded[0, 11] < open_sky[0, 11] * 0.2  # December sun never clears 40°
    assert shaded[0, 5] > open_sky[0, 5] * 0.7  # June mostly does
