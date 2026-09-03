"""Upstream feeds. Pure I/O — no billing, no npubs, no domain judgement.

Every function here records the feed's **native resolution**, because that
number decides what Good Earth may honestly claim. The reanalysis archive
resolves about 9 km: two sample points on the same farm land in the same
cell and come back byte-identical. Terrain resolves at 90 m. So the coarse
feed supplies the region's signal and the elevation field supplies the
variation across it — see ``downscale`` in ``gdd.py``.

Sources (all free, no API key):
  - Daymet v4 (NASA ORNL) — daily observed max/min, **1 km**, North America,
    history only (it lags the current year)
  - Open-Meteo archive    — daily observed max/min, ~9 km (ERA5)
  - Open-Meteo forecast   — 7-day daily max/min, ~2-11 km by model
  - Open-Meteo elevation  — terrain height, ~90 m (SRTM)

Daymet is nine times finer than the reanalysis archive and it shows: three
points that ERA5 folds into one cell and returns identically for come back
distinct from Daymet, ordered by their elevation. It cannot replace the
archive — it carries no current year and no forecast — so it supplies the
*history*, where frost dates and normals come from, and Open-Meteo supplies
the running season.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import httpx

_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
_FORECAST = "https://api.open-meteo.com/v1/forecast"
_ELEVATION = "https://api.open-meteo.com/v1/elevation"
_DAYMET = "https://daymet.ornl.gov/single-pixel/api/data"

_TIMEOUT = 30.0

# Metres. What each feed can actually distinguish — quoted in tool responses
# so a grower is never sold precision the data does not contain.
ARCHIVE_RESOLUTION_M = 9_000
FORECAST_RESOLUTION_M = 11_000
ELEVATION_RESOLUTION_M = 90
DAYMET_RESOLUTION_M = 1_000

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


def _why(exc: Exception) -> str:
    """Why a feed did not answer, in words.

    Every httpx transport error stringifies to the empty string — a timeout, a
    refused connection and a DNS failure all render as "". So the message read
    "archive-api.open-meteo.com/v1/archive unreachable:" and stopped, which
    tells a grower nothing and tells whoever is debugging it less: they cannot
    distinguish "the service is down" from "we have no network" from "the
    address is wrong", which are three different days' work.

    The exception CLASS always carries the answer, so it is used when the
    message is empty, and timeouts say how long they waited.
    """
    said = str(exc).strip()
    if isinstance(exc, httpx.TimeoutException):
        kind = {
            httpx.ConnectTimeout: "did not accept a connection",
            httpx.ReadTimeout: "accepted the connection but sent nothing back",
            httpx.WriteTimeout: "would not accept the request",
            httpx.PoolTimeout: "had no free connection",
        }.get(type(exc), "timed out")
        return f"{kind} within {_TIMEOUT:g}s"
    if isinstance(exc, httpx.ConnectError):
        return said or "the connection was refused or the host could not be found"
    return said or type(exc).__name__


async def _get(client: httpx.AsyncClient, url: str, params: dict[str, Any]) -> Any:
    try:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        raise UpstreamError(f"{url} returned HTTP {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise UpstreamError(f"{url} unreachable: {_why(exc)}") from exc
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


# ── Daymet (NASA ORNL), 1 km daily history ───────────────────────────────
#
# Two properties of this feed will produce confidently wrong numbers if they
# are not guarded, and neither announces itself as an error.


def daymet_date(year: int, yday: int) -> str:
    """Daymet's ``yday`` as a civil date.

    Every Daymet year is 365 days: it drops **December 31** from leap years
    rather than carrying a 366th record. February 29 is present and is day
    60, so ``yday`` is the true civil day-of-year and this is a plain offset
    from January 1 in every year.

    That is worth stating because the obvious "fix" — special-casing leap
    years to shift days after February — is wrong, and would silently slide
    a whole leap season by one day. Verified against the live feed: 2024
    returns 58,59,60,61 for Feb 27, Feb 28, Feb 29, Mar 1.
    """
    return (date(year, 1, 1) + timedelta(days=yday - 1)).isoformat()


def parse_daymet_csv(text: str, start: str, end: str) -> tuple[list[str], list[float], list[float]]:
    """Daymet's CSV as dates and °F, or raise if it is not what we asked for.

    **Daymet fails by over-returning.** A request outside its coverage does
    not error: it answers 200 with the entire 1980-onward record, roughly
    16,800 rows. Code that trusted the response would build "this season"
    out of forty-odd concatenated years and report a plausible number with
    no sign anything went wrong.

    So the span is checked rather than assumed, and the check is a
    containment test rather than a row count: it stays correct as Daymet
    publishes new years, where a hardcoded cutoff would rot.
    """
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("year,yday"):
            header, rows = line, lines[i + 1:]
            break
    else:
        raise UpstreamError("Daymet returned no data header")

    cols = [c.strip() for c in header.split(",")]
    try:
        i_max = next(i for i, c in enumerate(cols) if c.startswith("tmax"))
        i_min = next(i for i, c in enumerate(cols) if c.startswith("tmin"))
    except StopIteration as exc:
        raise UpstreamError(f"Daymet is missing tmax/tmin: {header}") from exc

    dates: list[str] = []
    tmax: list[float] = []
    tmin: list[float] = []
    for row in rows:
        parts = row.split(",")
        if len(parts) <= max(i_max, i_min):
            continue
        try:
            iso = daymet_date(int(float(parts[0])), int(float(parts[1])))
            hi, lo = float(parts[i_max]), float(parts[i_min])
        except (ValueError, IndexError):
            continue
        dates.append(iso)
        tmax.append(_c_to_f(hi))
        tmin.append(_c_to_f(lo))

    if not dates:
        raise UpstreamError("Daymet returned a header but no rows")
    if dates[0] < start or dates[-1] > end:
        raise UpstreamError(
            f"Daymet answered {dates[0]}..{dates[-1]} for a request of {start}..{end} — "
            "this is how it reports a span it does not cover, and the extra years "
            "must not be read as data"
        )
    return dates, tmax, tmin


def _c_to_f(c: float) -> float:
    """Daymet publishes Celsius; every other feed here is already °F."""
    return c * 9.0 / 5.0 + 32.0


async def fetch_daymet_history(lat: float, lon: float, start: str, end: str) -> dict[str, Any]:
    """Observed daily max/min °F for one point at 1 km, ``start``..``end``.

    One point per request — unlike Open-Meteo this feed takes no coordinate
    list, so a region costs one round trip per sampled cell. Cluster before
    calling.
    """
    params = {
        "lat": f"{lat:.5f}",
        "lon": f"{lon:.5f}",
        "vars": "tmax,tmin",
        "start": start,
        "end": end,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            resp = await client.get(_DAYMET, params=params)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise UpstreamError(f"Daymet returned HTTP {exc.response.status_code}") from exc
        except httpx.HTTPError as exc:
            raise UpstreamError(f"Daymet unreachable: {_why(exc)}") from exc

    dates, tmax, tmin = parse_daymet_csv(resp.text, start, end)
    return {
        "source": "Daymet v4 (NASA ORNL)",
        "resolution_m": DAYMET_RESOLUTION_M,
        "daily": {"time": dates, "temperature_2m_max": tmax, "temperature_2m_min": tmin},
    }


async def fetch_normals_history(
    lat: float,
    lon: float,
    start: str,
    end: str,
) -> tuple[list[dict[str, Any]], str, int]:
    """Multi-season history for one point, preferring the 1 km feed.

    Returns ``(records, source_name, resolution_m)`` so the caller can say
    which feed actually answered rather than naming a source it did not use.

    Normals are where this choice pays: one point, one span, entirely in the
    past — the shape Daymet serves best and the number frost dates and the
    ahead-of-normal comparison are built from. When Daymet cannot answer, and
    it will not be able to for the current year until ORNL publishes it, the
    reanalysis archive still can, so the answer degrades in resolution rather
    than disappearing.
    """
    try:
        record = await fetch_daymet_history(lat, lon, start, end)
        return [record], "Daymet v4 (NASA ORNL)", DAYMET_RESOLUTION_M
    except UpstreamError:
        records = await fetch_daily_history([lat], [lon], start, end)
        return records, "Open-Meteo archive (ERA5)", ARCHIVE_RESOLUTION_M
