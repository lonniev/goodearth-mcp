"""Assemble the drying answer — dew off, dry days, next rain — for one block.

One forecast call. The forecast covers today from local midnight, so the
morning already gone is in it, and nothing here reads or writes the season's
cached wetness record: the drying line costs no storage.

Centroid only, for the reason `disease_window` gives: humidity is resolved at
~2 km, wider than most blocks, and fourteen identical readings are not spread.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from goodearth_mcp import drying, sources, wetness
from goodearth_mcp.region import Region

#: Ten days, matching the disease layer, so the two read the same horizon.
FORECAST_DAYS = 10


class DryingWindowError(ValueError):
    """The request cannot be answered as asked."""


def local_now(record: dict[str, Any], now: datetime) -> str:
    """This hour on the block's own clock, in the feed's timestamp form.

    The feed answers in local time (`timezone=auto`); the server runs in UTC.
    Comparing a UTC "now" with local hours puts the next rain five hours off.
    """
    offset = record.get("utc_offset_seconds")
    shift = timedelta(seconds=offset if isinstance(offset, (int, float)) else 0)
    return (now.astimezone(UTC) + shift).strftime("%Y-%m-%dT%H:00")


async def region_drying_window(region: Region, now: datetime | None = None) -> dict[str, Any]:
    """When the dew burns off this ground, and the dry days ahead."""
    now = now or datetime.now(UTC)
    record = await sources.fetch_wetness_forecast(
        region.centroid.lat, region.centroid.lon, FORECAST_DAYS,
        hourly=sources._HOURLY_DRYING,
    )
    try:
        hours = drying.read_hours(sources.hourly_block(record))
    except sources.UpstreamError as exc:
        raise DryingWindowError(f"the forecast came back unreadable: {exc}") from exc
    if not hours:
        raise DryingWindowError("the forecast returned no hours for this ground")

    at = local_now(record, now)
    answer = drying.assess(hours, today=at[:10], now_at=at)
    return {
        "success": True,
        "as_of": now.astimezone(UTC).isoformat(timespec="minutes"),
        "region": region.describe(),
        **answer,
        "estimator": wetness.ESTIMATOR,
        "note": drying.NOTE,
        "sources": [
            {**sources.feed_of([record]),
             "role": "hourly humidity, rain, evapotranspiration, sun and wind ahead"},
            {"name": "computed",
             "role": "dew off and dry days, from estimated leaf wetness — never measured",
             "resolution_m": 0},
        ],
    }
