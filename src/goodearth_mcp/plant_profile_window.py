"""A plant's profile, and what it comes to on one plot.

The profile is the species' (`plant_profile`), kept once for every grower
(`profile_store`). This adds the plot: the heat target its days to maturity
hold on this ground in a typical year, and a bloom season turned round for
ground south of the equator.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import plant_profile, profile_store
from goodearth_mcp.plant_profile import ProfileError
from goodearth_mcp.planting_window import PlantingWindowError, region_heat_for_days
from goodearth_mcp.region import Region

logger = logging.getLogger(__name__)


def southern(months: list[int] | None, lat: float) -> list[int] | None:
    """A northern bloom season, six months on for ground south of the equator."""
    if not months or lat >= 0:
        return months
    return sorted({(m + 5) % 12 + 1 for m in months})


async def profile_for(
    *, api_key: str, taxon_id: int | None, scientific_name: str, common_name: str,
    text: str, today: date,
) -> tuple[dict[str, Any], bool]:
    """The kept profile for this plant, or a fresh one. True when it was kept."""
    key = plant_profile.cache_key(taxon_id=taxon_id, scientific_name=scientific_name,
                                  common_name=common_name, text=text)
    try:
        kept = await profile_store.get(key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("plant profile cache unreadable: %s", exc)
        kept = None
    if kept:
        return kept, True
    if not api_key:
        raise ProfileError("This service has no plant reference configured yet.")
    data = await plant_profile.ask(api_key, plant_profile.prompt_for(
        taxon_id=taxon_id, scientific_name=scientific_name, common_name=common_name, text=text))
    profile = plant_profile.validate(plant_profile.answer_text(data))
    profile["looked_up_on"] = today.isoformat()
    try:
        await profile_store.put(key, profile, str(data.get("model") or ""))
    except Exception as exc:  # noqa: BLE001
        # Unkept, it is asked again next time — dearer, never wrong.
        logger.warning("plant profile not kept: %s", exc)
    return profile, False


async def block_plant_profile(
    region: Region,
    *,
    api_key: str,
    plot_base_f: float,
    taxon_id: int | None = None,
    scientific_name: str = "",
    common_name: str = "",
    text: str = "",
    out_on: date | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """The plant's profile, and its heat target and bloom season on this plot."""
    today = today or datetime.now(UTC).date()
    profile, kept = await profile_for(
        api_key=api_key, taxon_id=taxon_id, scientific_name=scientific_name,
        common_name=common_name, text=text, today=today)

    here: dict[str, Any] = {
        "bloom_months": southern(profile.get("bloom_months"), region.centroid.lat),
        "gdd_target": None,
        "base_temp_f": profile.get("base_temp_f") or plot_base_f,
        "basis": None,
    }
    published = profile.get("published_gdd")
    dtm = profile.get("days_to_maturity")
    if published:
        # A stated figure at its stated base is the better answer: no
        # conversion between the source's ground and this one.
        here.update(gdd_target=int(round(published["gdd"] / 10.0) * 10),
                    base_temp_f=published["base_f"], basis="published")
    elif dtm:
        try:
            heat = await region_heat_for_days(
                region, dtm["typical"], here["base_temp_f"], out_on, today=today)
            here.update(gdd_target=heat["gdd_target"], basis="days_to_maturity",
                        days=dtm["typical"], counted_from=heat["counted_from"],
                        **{"from": heat["from"], "to": heat["to"], "record": heat["record"]})
        except PlantingWindowError as exc:
            # The profile still stands; only its fit to this ground is missing.
            here["unfitted"] = str(exc)

    return {"success": True, "profile": profile, "on_this_plot": here, "kept": kept}
