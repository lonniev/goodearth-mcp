"""Upstream feeds. Pure I/O — no billing, no npubs, no domain judgement.

Every function here records the feed's **native resolution**, because that
number decides what Good Earth may honestly claim. The reanalysis archive
resolves about 9 km: two sample points on the same farm land in the same
cell and come back byte-identical. Terrain resolves at 90 m. So the coarse
feed supplies the region's signal and the elevation field supplies the
variation across it — see ``downscale`` in ``gdd.py``.

Sources (all free, no API key):
  - Open-Meteo archive    — daily observed max/min, ~9 km (ERA5)
  - Open-Meteo forecast   — 7-day daily max/min, ~2-11 km by model
  - Open-Meteo elevation  — terrain height, ~90 m (SRTM)
"""

from __future__ import annotations

from typing import Any

import httpx

_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
_FORECAST = "https://api.open-meteo.com/v1/forecast"
_ELEVATION = "https://api.open-meteo.com/v1/elevation"

_TIMEOUT = 30.0

# Metres. What each feed can actually distinguish — quoted in tool responses
# so a grower is never sold precision the data does not contain.
ARCHIVE_RESOLUTION_M = 9_000
FORECAST_RESOLUTION_M = 11_000
ELEVATION_RESOLUTION_M = 90

_US_UNITS = {"temperature_unit": "fahrenheit", "windspeed_unit": "mph"}
_DAILY = "temperature_2m_max,temperature_2m_min"
# Frost is a radiative process, so the night's wind and sky decide whether
# cold air stratifies at all. Without them a forecast low is just a number.
_DAILY_FROST = (
    "temperature_2m_min,temperature_2m_max,wind_speed_10m_max,"
    "cloud_cover_mean,dew_point_2m_min"
)

# The almanac's own field set. Sunrise/sunset and the durations are only on the
# forecast endpoint; the archive carries the measures but not the sun, so the
# two lists differ and the caller must not assume symmetry.
_DAILY_ALMANAC_FORECAST = (
    "temperature_2m_max,temperature_2m_min,dew_point_2m_mean,precipitation_sum,"
    "rain_sum,snowfall_sum,sunrise,sunset,daylight_duration,sunshine_duration,"
    "wind_speed_10m_max,wind_direction_10m_dominant,weather_code,"
    "precipitation_probability_max"
)
_DAILY_ALMANAC_ARCHIVE = (
    "temperature_2m_max,temperature_2m_min,dew_point_2m_mean,precipitation_sum,"
    "daylight_duration,sunshine_duration,wind_speed_10m_max,weather_code"
)


class UpstreamError(RuntimeError):
    """An upstream feed failed or answered in a shape we don't recognise."""


async def _get(client: httpx.AsyncClient, url: str, params: dict[str, Any]) -> Any:
    try:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        raise UpstreamError(f"{url} returned HTTP {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise UpstreamError(f"{url} unreachable: {exc}") from exc
    except ValueError as exc:
        raise UpstreamError(f"{url} returned malformed JSON") from exc


def _as_list(payload: Any) -> list[dict[str, Any]]:
    """Open-Meteo returns a bare object for one location, a list for many."""
    if isinstance(payload, list):
        return [p for p in payload if isinstance(p, dict)]
    if isinstance(payload, dict):
        return [payload]
    raise UpstreamError("expected a JSON object or array from Open-Meteo")


def _join(values: list[float]) -> str:
    return ",".join(f"{v:.5f}" for v in values)


async def fetch_elevations(lats: list[float], lons: list[float]) -> list[float]:
    """Terrain height in metres for each point, at ~90 m resolution.

    This is the only feed that resolves within a single farm, so it carries
    the whole burden of region spread. A failure here is not fatal — the
    caller degrades to a flat-terrain answer and says so.
    """
    if not lats:
        return []
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _get(client, _ELEVATION, {"latitude": _join(lats), "longitude": _join(lons)})
    elevations = data.get("elevation") if isinstance(data, dict) else None
    if not isinstance(elevations, list) or len(elevations) != len(lats):
        raise UpstreamError("elevation service returned an unexpected shape")
    return [float(e) for e in elevations]


async def fetch_daily_history(
    lats: list[float],
    lons: list[float],
    start: str,
    end: str,
) -> list[dict[str, Any]]:
    """Observed daily max/min °F for each point over ``start``..``end``.

    Batched into one request — Open-Meteo accepts comma-separated
    coordinates, which keeps a priced call to a single upstream round trip
    no matter how many points the region samples.
    """
    if not lats:
        return []
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        payload = await _get(
            client,
            _ARCHIVE,
            {
                "latitude": _join(lats),
                "longitude": _join(lons),
                "start_date": start,
                "end_date": end,
                "daily": _DAILY,
                "timezone": "auto",
                **_US_UNITS,
            },
        )
    return _as_list(payload)


async def fetch_daily_forecast(lat: float, lon: float, days: int = 7) -> dict[str, Any]:
    """Forecast daily max/min °F at the region centroid.

    Deliberately centroid-only: the forecast grid is coarser than the region
    itself, so sampling it per point would return the same numbers several
    times and dress a single value up as a spread.
    """
    days = max(1, min(days, 16))
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        payload = await _get(
            client,
            _FORECAST,
            {
                "latitude": lat,
                "longitude": lon,
                "daily": _DAILY,
                "forecast_days": days,
                "timezone": "auto",
                **_US_UNITS,
            },
        )
    results = _as_list(payload)
    if not results:
        raise UpstreamError("forecast returned no locations")
    return results[0]


def daily_series(record: dict[str, Any]) -> tuple[list[str], list[float | None], list[float | None]]:
    """Pull (dates, tmax, tmin) out of one Open-Meteo daily record.

    Missing days come back as ``None`` rather than being dropped, so the
    caller can tell a gap in the record from a shorter season.
    """
    daily = record.get("daily")
    if not isinstance(daily, dict):
        raise UpstreamError("record has no daily block")
    dates = daily.get("time") or []
    tmax = daily.get("temperature_2m_max") or []
    tmin = daily.get("temperature_2m_min") or []
    if not isinstance(dates, list) or not isinstance(tmax, list) or not isinstance(tmin, list):
        raise UpstreamError("daily block is not in the expected array shape")
    n = min(len(dates), len(tmax), len(tmin))

    def num(v: Any) -> float | None:
        return float(v) if isinstance(v, (int, float)) else None

    return (
        [str(d) for d in dates[:n]],
        [num(v) for v in tmax[:n]],
        [num(v) for v in tmin[:n]],
    )


async def fetch_frost_forecast(lat: float, lon: float, days: int = 10) -> dict[str, Any]:
    """Nightly lows with the wind and sky that decide whether frost forms.

    Centroid only, like the temperature forecast: the forecast grid is coarser
    than the region, so the terrain spread is applied afterwards rather than
    pretended to be resolved upstream.
    """
    days = max(1, min(days, 16))
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        payload = await _get(
            client,
            _FORECAST,
            {
                "latitude": lat,
                "longitude": lon,
                "daily": _DAILY_FROST,
                "forecast_days": days,
                "timezone": "auto",
                **_US_UNITS,
            },
        )
    results = _as_list(payload)
    if not results:
        raise UpstreamError("frost forecast returned no locations")
    return results[0]


def frost_series(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten a frost-forecast record into one dict per night.

    Nights missing a low are dropped rather than defaulted — a night we cannot
    assess must not appear as a night that is safe.
    """
    daily = record.get("daily")
    if not isinstance(daily, dict):
        raise UpstreamError("frost forecast has no daily block")

    dates = daily.get("time") or []
    lows = daily.get("temperature_2m_min") or []
    highs = daily.get("temperature_2m_max") or []
    wind = daily.get("wind_speed_10m_max") or []
    cloud = daily.get("cloud_cover_mean") or []
    dew = daily.get("dew_point_2m_min") or []

    def num(seq: Any, i: int) -> float | None:
        if isinstance(seq, list) and i < len(seq) and isinstance(seq[i], (int, float)):
            return float(seq[i])
        return None

    out: list[dict[str, Any]] = []
    for i, d in enumerate(dates):
        low = num(lows, i)
        if low is None:
            continue
        out.append(
            {
                "date": str(d),
                "low_f": low,
                # The day's high, which is the temperature that decides whether
                # anything is FLYING. A night-time low answers a frost question,
                # not a foraging one.
                "high_f": num(highs, i),
                "wind_mph": num(wind, i),
                "cloud_pct": num(cloud, i),
                "dew_point_f": num(dew, i),
            }
        )
    return out


async def fetch_soil_forecast(lat: float, lon: float, hourly_field: str, days: int = 16) -> dict[str, Any]:
    """Hourly soil temperature at the given band, for as far as the model runs.

    The DAILY soil aggregates come back null from this endpoint — only the
    hourly series is populated — so this asks hourly and the caller collapses
    it to daily means. Worth knowing: a daily request looks like the feed has
    no soil data at all.
    """
    days = max(1, min(days, 16))
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        payload = await _get(
            client,
            _FORECAST,
            {
                "latitude": lat,
                "longitude": lon,
                "hourly": hourly_field,
                "forecast_days": days,
                "timezone": "auto",
                **_US_UNITS,
            },
        )
    results = _as_list(payload)
    if not results:
        raise UpstreamError("soil forecast returned no locations")
    return results[0]


def hourly_series(record: dict[str, Any], field: str) -> tuple[list[str], list[float | None]]:
    """Pull one hourly field out of a forecast record."""
    hourly = record.get("hourly")
    if not isinstance(hourly, dict):
        raise UpstreamError("record has no hourly block")
    times = hourly.get("time") or []
    vals = hourly.get(field) or []
    if not isinstance(times, list) or not isinstance(vals, list):
        raise UpstreamError("hourly block is not in the expected array shape")
    n = min(len(times), len(vals))
    return (
        [str(t) for t in times[:n]],
        [float(v) if isinstance(v, (int, float)) else None for v in vals[:n]],
    )


async def fetch_soil_history(
    lat: float, lon: float, archive_field: str, start: str, end: str,
) -> dict[str, Any]:
    """Daily mean soil temperature from the archive, for the climatology."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        payload = await _get(
            client,
            _ARCHIVE,
            {
                "latitude": lat,
                "longitude": lon,
                "start_date": start,
                "end_date": end,
                "daily": archive_field,
                "timezone": "auto",
                **_US_UNITS,
            },
        )
    results = _as_list(payload)
    if not results:
        raise UpstreamError("soil archive returned no locations")
    return results[0]


def daily_field(record: dict[str, Any], field: str) -> tuple[list[str], list[float | None]]:
    """Pull one daily field out of an archive record."""
    daily = record.get("daily")
    if not isinstance(daily, dict):
        raise UpstreamError("record has no daily block")
    times = daily.get("time") or []
    vals = daily.get(field) or []
    if not isinstance(times, list) or not isinstance(vals, list):
        raise UpstreamError("daily block is not in the expected array shape")
    n = min(len(times), len(vals))
    return (
        [str(t) for t in times[:n]],
        [float(v) if isinstance(v, (int, float)) else None for v in vals[:n]],
    )


async def fetch_almanac_forecast(lat: float, lon: float, days: int = 14) -> dict[str, Any]:
    """Everything the sky is about to do, at the region centroid."""
    days = max(1, min(days, 16))
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        payload = await _get(
            client, _FORECAST,
            {
                "latitude": lat, "longitude": lon,
                "daily": _DAILY_ALMANAC_FORECAST,
                "forecast_days": days, "timezone": "auto",
                "precipitation_unit": "inch",
                **_US_UNITS,
            },
        )
    results = _as_list(payload)
    if not results:
        raise UpstreamError("almanac forecast returned no locations")
    return results[0]


async def fetch_almanac_history(lat: float, lon: float, start: str, end: str) -> dict[str, Any]:
    """The same measures from the record, for actuals and for normals."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        payload = await _get(
            client, _ARCHIVE,
            {
                "latitude": lat, "longitude": lon,
                "start_date": start, "end_date": end,
                "daily": _DAILY_ALMANAC_ARCHIVE,
                "timezone": "auto",
                "precipitation_unit": "inch",
                **_US_UNITS,
            },
        )
    results = _as_list(payload)
    if not results:
        raise UpstreamError("almanac archive returned no locations")
    return results[0]


def daily_block(record: dict[str, Any]) -> dict[str, list[Any]]:
    """The whole daily block as-is, for callers reading many fields at once."""
    daily = record.get("daily")
    if not isinstance(daily, dict):
        raise UpstreamError("record has no daily block")
    return {k: (v if isinstance(v, list) else []) for k, v in daily.items()}
