"""Where the sun is — NOAA's solar position, vectorised.

``almanac.day_length_hours`` answers how long the day is. Sunlight needs more:
the sun's elevation and azimuth through the day, because a horizon blocks a
direction, not a duration. This is NOAA's General Solar Position algorithm
(Meeus, via the NOAA Solar Calculator), accurate to about 0.01° over the
years that matter here, computed in numpy over a whole year of days at once.

Azimuth is degrees clockwise from true north, so 90 is east and 180 is south
— the convention every horizon bin, panel facing and sky chart in this
service shares.
"""

from __future__ import annotations

from datetime import date

import numpy as np

#: Bin centres through the day, UTC minutes: 144 ten-minute steps.
MINUTES_10 = np.arange(5, 1440, 10, dtype=np.float64)
#: Hour midpoints, for weather feeds that report the preceding hour.
HOURS_MID = np.arange(30, 1440, 60, dtype=np.float64)
#: Sun elevation at which NOAA's sunrise is defined (refraction + half a disc).
SUNRISE_ELEVATION_DEG = -0.833


def representative_days(year: int) -> np.ndarray:
    """The 15th of each month, as ``datetime64[D]`` — a year in twelve days."""
    return np.array([np.datetime64(date(year, m, 15)) for m in range(1, 13)])


def _julian_century(days: np.ndarray, minutes_utc: np.ndarray) -> np.ndarray:
    """Julian centuries since J2000.0, shape ``(D, T)``."""
    jd0 = (days.astype("datetime64[D]") - np.datetime64("2000-01-01")).astype(np.float64) + 2451544.5
    jd = jd0[:, None] + minutes_utc[None, :] / 1440.0
    return (jd - 2451545.0) / 36525.0


def declination_eot(days: np.ndarray, minutes_utc: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Solar declination (degrees) and equation of time (minutes), shape ``(D, T)``."""
    if minutes_utc is None:
        minutes_utc = np.array([720.0])
    t = _julian_century(days, minutes_utc)
    l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360.0
    m = np.radians(357.52911 + t * (35999.05029 - 0.0001537 * t))
    e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    c = (
        np.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t))
        + np.sin(2 * m) * (0.019993 - 0.000101 * t)
        + np.sin(3 * m) * 0.000289
    )
    true_long = l0 + c
    omega = np.radians(125.04 - 1934.136 * t)
    app_long = np.radians(true_long - 0.00569 - 0.00478 * np.sin(omega))
    eps0 = 23.0 + (26.0 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60.0) / 60.0
    eps = np.radians(eps0 + 0.00256 * np.cos(omega))
    decl = np.degrees(np.arcsin(np.sin(eps) * np.sin(app_long)))

    y = np.tan(eps / 2) ** 2
    l0r = np.radians(l0)
    eot = 4 * np.degrees(
        y * np.sin(2 * l0r) - 2 * e * np.sin(m) + 4 * e * y * np.sin(m) * np.cos(2 * l0r)
        - 0.5 * y * y * np.sin(4 * l0r) - 1.25 * e * e * np.sin(2 * m)
    )
    return decl, eot


def sun_position(
    lat: float, lon: float, days: np.ndarray, minutes_utc: np.ndarray = MINUTES_10,
) -> tuple[np.ndarray, np.ndarray]:
    """Sun elevation and azimuth in degrees, each ``(D, T)`` float32.

    Elevation includes NOAA's atmospheric refraction, so the sun "rises" when
    its refracted disc clears the horizon rather than its geometric centre.
    """
    decl, eot = declination_eot(days, minutes_utc)
    true_solar_min = (minutes_utc[None, :] + eot + 4.0 * lon) % 1440.0
    ha = np.radians(true_solar_min / 4.0 - 180.0)
    phi, d = np.radians(lat), np.radians(decl)
    cos_zen = np.sin(phi) * np.sin(d) + np.cos(phi) * np.cos(d) * np.cos(ha)
    zen = np.arccos(np.clip(cos_zen, -1.0, 1.0))
    elev = 90.0 - np.degrees(zen)

    # Azimuth from the hour angle's sign: morning sun is east of the meridian.
    sin_zen = np.sin(zen)
    with np.errstate(divide="ignore", invalid="ignore"):
        cos_az = (np.sin(phi) * np.cos(zen) - np.sin(d)) / (np.cos(phi) * sin_zen)
    az = np.degrees(np.arccos(np.clip(cos_az, -1.0, 1.0)))
    az = np.where(ha > 0, (180.0 + az) % 360.0, (180.0 - az) % 360.0)
    az = np.where(sin_zen < 1e-9, 180.0, az)

    elev = elev + _refraction(elev)
    return elev.astype(np.float32), az.astype(np.float32)


def _refraction(elev_deg: np.ndarray) -> np.ndarray:
    """NOAA's refraction correction in degrees, for a geometric elevation."""
    e = elev_deg
    te = np.tan(np.radians(np.clip(e, -5.0, 85.0)))
    high = 58.1 / te - 0.07 / te**3 + 0.000086 / te**5
    mid = 1735 + e * (-518.2 + e * (103.4 + e * (-12.79 + e * 0.711)))
    low = -20.774 / te
    corr = np.where(e > 85.0, 0.0, np.where(e > 5.0, high, np.where(e > -0.575, mid, low)))
    return corr / 3600.0


def sun_path(lat: float, lon: float, day: date, step_minutes: int = 60) -> list[list[float]]:
    """``[azimuth, elevation, minutes_utc]`` through one day, hourly, for a sky chart.

    Only the daylight part, as plain floats rounded for the wire. The minute
    lets a chart label the hour in the grower's own clock.
    """
    minutes = np.arange(step_minutes / 2, 1440, step_minutes, dtype=np.float64)
    elev, az = sun_position(lat, lon, np.array([np.datetime64(day)]), minutes)
    return [
        [round(float(a), 1), round(float(e), 1), float(m)]
        for a, e, m in zip(az[0], elev[0], minutes, strict=True)
        if e > SUNRISE_ELEVATION_DEG
    ]


__all__ = [
    "HOURS_MID", "MINUTES_10", "SUNRISE_ELEVATION_DEG",
    "declination_eot", "representative_days", "sun_path", "sun_position",
]
