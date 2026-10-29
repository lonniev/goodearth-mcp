"""A subject's life cycle, and where each event falls on one plot.

The life cycle is the species' (`life_cycle`), kept once for every grower
(`reference_store`). This adds the plot: the date each event typically falls on
this ground, so the story reads "~Mar 4: courtship flights" for here.

A plant's stages count heat from its set-out, through this ground's typical
heat for each calendar day (`planting.finish_date`). A pest's and an animal's
events are dated as the Fauna page dates them (`wildlife_window`).
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import catalog, gdd, life_cycle, llm_answer, planting, reference_store
from goodearth_mcp.life_cycle import LifeCycleError
from goodearth_mcp.planting_window import PlantingWindowError, air_record, frost_season
from goodearth_mcp.region import Region
from goodearth_mcp.wildlife_window import WildlifeWindowError, region_wildlife

logger = logging.getLogger(__name__)


async def _phenophases(scientific_name: str) -> list[str]:
    """The stages USA-NPN names for this species, to align the answer's words.
    A courtesy: nothing depends on it, so a failure is an empty list."""
    if not scientific_name:
        return []
    try:
        rows = await catalog.species_phenophases([scientific_name])
    except Exception as exc:  # noqa: BLE001
        logger.info("NPN phenophases unavailable: %s", exc)
        return []
    return list((rows[0].get("habits") or []) if rows else [])


async def _plant_dates(region: Region, events: list[dict[str, Any]], base_f: float,
                       out_on: date | None, today: date) -> tuple[list[str | None], str]:
    """Each heat stage's typical date from set-out (or the typical last frost)."""
    dates, tmax, tmin = await air_record(region, today)
    clim = gdd.climatology(dates, tmax, tmin, base_f)
    counted_from = "set_out"
    if out_on is None:
        season, _start, spring, _fall = frost_season(dates, tmin, today)
        out_on, counted_from = (
            (date.fromisoformat(spring["median"]), "typical_last_frost") if spring
            else (date(season, 5, 15), "mid_may"))
    on = [planting.finish_date(out_on, e["gdd"], clim) for e in events]
    return [d.isoformat() if d else None for d in on], counted_from


async def _wildlife_dates(region: Region, subject: dict[str, Any], today: date) -> list[str | None]:
    """Each event's date this season, as the Fauna page would date it."""
    name = subject["common_name"] or subject["scientific_name"]
    rows = []
    for i, e in enumerate(subject["events"]):
        fields = {k: e[k] for k in life_cycle.DRIVER_FIELDS[e["driver"]] if k in e}
        if subject["subject"] == "pest":
            fields["base_temp"] = subject["base_temp_f"]
        rows.append({"species": name, "event": e["name"], "driver": e["driver"],
                     "ref": str(i), **fields})
    out = await region_wildlife(region, rows, today=today)
    when = {r["ref"]: r.get("reached_on") or r.get("projected_date") for r in out["events"]}
    return [when.get(str(i)) for i in range(len(rows))]


async def block_life_cycle(
    region: Region,
    *,
    api_key: str,
    subject: str,
    taxon_id: int | None = None,
    scientific_name: str = "",
    common_name: str = "",
    text: str = "",
    plot_base_f: float = 50.0,
    out_on: date | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """The subject's life cycle, with each event's typical date on this plot."""
    today = today or datetime.now(UTC).date()
    lat = region.centroid.lat
    key = life_cycle.cache_key(subject=subject, taxon_id=taxon_id,
                               name=scientific_name or common_name or text, lat=lat)

    async def fetch() -> tuple[dict[str, Any], str]:
        if not api_key:
            raise LifeCycleError("This service has no reference configured yet.")
        user = life_cycle.prompt_for(
            subject=subject, taxon_id=taxon_id, scientific_name=scientific_name,
            common_name=common_name, text_typed=text, lat=lat,
            phenophases=await _phenophases(scientific_name))
        data = await life_cycle.ask(api_key, user)
        found = life_cycle.validate(life_cycle.answer_text(data), subject)
        found["looked_up_on"] = today.isoformat()
        found["looked_up_with"] = llm_answer.usage_of(data)
        return found, str(data.get("model") or "")

    found, kept = await reference_store.remember(key, fetch)
    if not found["events"]:
        # Kept, so the search is not paid for twice; refused, so neither is the fare.
        name = found.get("common_name") or found.get("scientific_name") or "this subject"
        raise LifeCycleError(f"Nothing in {name}'s life cycle could be timed from a source.")

    fit: dict[str, Any] = {}
    try:
        if subject == "plant":
            base = found.get("base_temp_f") or plot_base_f
            on, counted_from = await _plant_dates(region, found["events"], base, out_on, today)
            fit = {"counted_from": counted_from}
        else:
            on = await _wildlife_dates(region, found, today)
    except (PlantingWindowError, WildlifeWindowError) as exc:
        # The life cycle still stands; only its fit to this ground is missing.
        on, fit = [None] * len(found["events"]), {"unfitted": str(exc)}

    events = [{**e, "on_this_plot": d} for e, d in zip(found["events"], on, strict=True)]
    # In the order they happen here; anything undated keeps its place at the end.
    events.sort(key=lambda e: (e["on_this_plot"] is None, e["on_this_plot"] or ""))
    return {"success": True, "key": key, "kept": kept, **found, "events": events, **fit}
