"""Assemble the water balance for one block: one forecast request, at the centroid.

Centroid only, as in `drying_window`: rain, evapotranspiration and the model's
soil are resolved on a grid kilometres wide, and fourteen identical readings
across a block are not spread.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from goodearth_mcp import sources, water
from goodearth_mcp.region import Region


class WaterWindowError(ValueError):
    """The forecast answered with something that cannot be read."""


async def region_water(region: Region, now: datetime | None = None) -> dict[str, Any]:
    """Rain against the air's pull, two weeks back and one ahead, and the soil's reading."""
    now = now or datetime.now(UTC)
    record = await sources.fetch_water(region.centroid.lat, region.centroid.lon)
    daily = record.get("daily")
    if not isinstance(daily, dict) or not daily.get("time"):
        raise WaterWindowError("the forecast returned no days for this ground")
    try:
        hourly = sources.hourly_block(record)
    except sources.UpstreamError as exc:
        raise WaterWindowError(f"the forecast came back unreadable: {exc}") from exc

    at = sources.local_now(record, now)
    answer = water.assess(daily, hourly, today=at[:10], now_at=at)
    return {
        "success": True,
        "as_of": now.astimezone(UTC).isoformat(timespec="minutes"),
        "region": region.describe(),
        **answer,
        "units": {"rain_mm": "mm", "et0_mm": "mm", "balance_mm": "mm",
                  "topsoil": "m³/m³", "root_zone": "m³/m³"},
        "depths_cm": {"topsoil": list(water.TOPSOIL_CM), "root_zone": list(water.ROOT_ZONE_CM)},
        "note": water.NOTE,
        "sources": [
            {**sources.feed_of([record]),
             "role": "daily rain and reference evapotranspiration; modelled soil moisture by depth"},
            {"name": "computed", "role": "the running balance, rain minus ET0", "resolution_m": 0},
        ],
    }
