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
