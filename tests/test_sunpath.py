"""The sun where NOAA says it is, in the convention every horizon bin shares."""

from __future__ import annotations

from datetime import date

import numpy as np
import pytest

from goodearth_mcp import sunpath


def _noon(lat: float, lon: float, day: str) -> tuple[float, float]:
    """Elevation and azimuth at the minute of highest sun on ``day``."""
    elev, az = sunpath.sun_position(lat, lon, np.array([np.datetime64(day)]), np.arange(0, 1440, 1.0))
    i = int(elev[0].argmax())
    return float(elev[0, i]), float(az[0, i])


@pytest.mark.parametrize("lat", [44.5, -35.3, 0.0])
def test_equinox_noon_elevation_is_colatitude(lat):
    elev, _ = _noon(lat, 0.0, "2024-03-20")
    assert elev == pytest.approx(90.0 - abs(lat), abs=0.5)


def test_june_solstice_noon_elevation_north():
    elev, az = _noon(44.5, -72.0, "2024-06-21")
    assert elev == pytest.approx(90.0 - 44.5 + 23.44, abs=0.3)
    assert az == pytest.approx(180.0, abs=1.0)


def test_southern_hemisphere_noon_sun_is_north():
    _, az = _noon(-35.3, 149.1, "2024-12-21")
    assert min(az, 360.0 - az) < 1.0


def test_morning_sun_is_east_evening_sun_is_west():
    elev, az = sunpath.sun_position(44.5, -72.0, np.array([np.datetime64("2024-03-20")]), np.arange(0, 1440, 10.0))
    up = elev[0] > 0
    first, last = int(np.argmax(up)), int(len(up) - 1 - np.argmax(up[::-1]))
    assert 80 < az[0, first] < 100
    assert 260 < az[0, last] < 280


def test_longitude_shifts_solar_noon_four_minutes_per_degree():
    day = np.array([np.datetime64("2024-03-20")])
    minutes = np.arange(0, 1440, 1.0)
    e0, _ = sunpath.sun_position(44.5, 0.0, day, minutes)
    e15, _ = sunpath.sun_position(44.5, -15.0, day, minutes)
    assert int(e15[0].argmax()) - int(e0[0].argmax()) == pytest.approx(60, abs=1)


def test_shapes_and_dtypes():
    elev, az = sunpath.sun_position(44.5, -72.0, sunpath.representative_days(2024))
    assert elev.shape == az.shape == (12, 144)
    assert elev.dtype == az.dtype == np.float32
    assert (az >= 0).all() and (az < 360).all()


def test_sun_path_is_daylight_only():
    path = sunpath.sun_path(44.5, -72.0, date(2024, 12, 21))
    assert 8 <= len(path) <= 10
    assert all(e > sunpath.SUNRISE_ELEVATION_DEG for _, e, _m in path)
    assert all(0 <= m < 1440 for _, _, m in path)
