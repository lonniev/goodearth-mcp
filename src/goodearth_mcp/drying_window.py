"""Assemble the drying answer — dew off, dry days, next rain — for one block.

One forecast call. The forecast covers today from local midnight, so the
morning already gone is in it, and nothing here reads or writes the season's
cached wetness record: the drying line costs no storage.

Centroid only, for the reason `disease_window` gives: humidity is resolved at
~2 km, wider than most blocks, and fourteen identical readings are not spread.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

from goodearth_mcp import drying, pressure, pressure_window, sources, wetness
from goodearth_mcp.region import Region

#: Ten days, matching the disease layer, so the two read the same horizon.
FORECAST_DAYS = 10


class DryingWindowError(ValueError):
    """The request cannot be answered as asked."""


async def region_drying_window(region: Region, now: datetime | None = None) -> dict[str, Any]:
    """When the dew burns off this ground, and the dry days ahead."""
    now = now or datetime.now(UTC)
    record, storm_read = await asyncio.gather(
        sources.fetch_wetness_forecast(
            region.centroid.lat, region.centroid.lon, FORECAST_DAYS,
            hourly=sources._HOURLY_DRYING,
        ),
        pressure_window.region_storm(region, now),
        return_exceptions=True,
    )
    if isinstance(record, BaseException):
        raise record
    storm = pressure_window.settle(storm_read)
    try:
        hours = drying.read_hours(sources.hourly_block(record))
    except sources.UpstreamError as exc:
        raise DryingWindowError(f"the forecast came back unreadable: {exc}") from exc
    if not hours:
        raise DryingWindowError("the forecast returned no hours for this ground")

    at = sources.local_now(record, now)
    answer = drying.assess(hours, today=at[:10], now_at=at)
    # A dry day the barometer says a low is crossing is the dry day most
    # likely to be cut short. Said on the day, so the Dashboard can mark it.
    window = storm["window"] if storm else None
    for day in answer["days"]:
        day["front_due"] = pressure.overlaps(window, day["date"])
    return {
        "success": True,
        "as_of": now.astimezone(UTC).isoformat(timespec="minutes"),
        "region": region.describe(),
        **answer,
        "estimator": wetness.ESTIMATOR,
        "note": drying.NOTE,
        "storm": storm,
        "sources": [
            {**sources.feed_of([record]),
             "role": "hourly humidity, rain, evapotranspiration, sun and wind ahead"},
            *([pressure_window.SOURCE] if storm else []),
            {"name": "computed",
             "role": "dew off and dry days, from estimated leaf wetness — never measured",
             "resolution_m": 0},
        ],
    }
