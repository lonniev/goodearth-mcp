"""Read the barometer for one block — the storm signal every weather tool shares.

One small hourly request at the centroid. The almanac, the drying line and the
disease layer each run this beside their own reads, and each answers without it
if it fails: a missing barometer is a smaller answer, never a failed one.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from goodearth_mcp import pressure, sources
from goodearth_mcp.region import Region

logger = logging.getLogger(__name__)

SOURCE = {
    "name": "Open-Meteo forecast",
    "role": "hourly sea-level pressure, two days back and three ahead",
    "resolution_m": sources.FORECAST_RESOLUTION_M,
}


async def region_storm(region: Region, now: datetime | None = None) -> dict[str, Any] | None:
    """The barometer's reading and storm signal on this ground, or None."""
    now = now or datetime.now(UTC)
    try:
        record = await sources.fetch_pressure_hourly(region.centroid.lat, region.centroid.lon)
        block = sources.hourly_block(record)
    except sources.UpstreamError as exc:
        logger.warning("pressure: the forecast did not answer (%s)", exc)
        return None
    return pressure.storm_signal(
        block.get("time") or [], block.get("pressure_msl") or [],
        now_at=sources.local_now(record, now), lat=region.centroid.lat,
    )


def settle(result: Any) -> dict[str, Any] | None:
    """A gathered `region_storm` result, with an exception read as no reading."""
    if isinstance(result, BaseException):
        logger.warning("pressure: %s", result)
        return None
    return result if isinstance(result, dict) else None
