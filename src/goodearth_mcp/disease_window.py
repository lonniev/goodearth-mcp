"""Assemble the disease risk answer — what the wet hours on this ground mean.

One hourly fetch for the season and one for the forecast, shared across every
model in the call, so asking about five diseases costs two round trips.

The models are published ones and the tables are theirs. This service counts the
hours and runs the arithmetic; it does not publish plant pathology and it never
names a treatment.

CENTROID, NOT EVERY SAMPLE POINT. The other windows that fan out do so because
terrain moves the answer — a hollow frosts before a bench, and elevation is
resolved at 90 m. Humidity is not resolved anywhere near that: the finest feed
here is a ~2 km cell, which is wider than most of these blocks. Sampling fourteen
points inside one cell would return fourteen identical numbers and charge for the
privilege of looking like spread.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta
from typing import Any

from goodearth_mcp import disease, gdd, record_cache, sources, wetness
from goodearth_mcp.region import Region

#: How far ahead the hourly forecast is asked for. The model runs out at 16.
FORECAST_DAYS = 10


class DiseaseWindowError(ValueError):
    """The request cannot be answered as asked."""


def _with_ref(parsed: dict, row) -> dict:
    """Carry the saved item's id onto its validated form.

    Stamped here rather than inside the validator, which returns a fixed shape
    on purpose — the domain module computes against diseases and has no business
    holding a database id. It rides along and is never read.
    """
    ref = str((row or {}).get("ref") or "") if isinstance(row, dict) else ""
    if ref:
        parsed["ref"] = ref
    return parsed


def _all_models() -> list[dict[str, Any]]:
    """Every model this service runs, for a caller who named none.

    Asking "what is my disease risk" without naming a model is the ordinary
    question, and answering it with an error would be a riddle.
    """
    return [{"model": k, "disease": v["disease"]} for k, v in disease.MODELS.items()]


async def region_disease_window(
    region: Region,
    models: Any = None,
    today: date | None = None,
    season: int | None = None,
) -> dict[str, Any]:
    """Wet hours and what each model makes of them, on this ground."""
    today = today or datetime.now(UTC).date()

    if models in (None, [], ""):
        parsed, skipped = _all_models(), []
    elif not isinstance(models, list):
        raise DiseaseWindowError("models must be a list, or omitted for all of them")
    else:
        # Validated one at a time. As a list comprehension one unusable row
        # raised and the caller lost every other answer in the call.
        parsed, skipped = [], []
        for row in models:
            try:
                parsed.append(_with_ref(disease.validate_model(row), row))
            except disease.DiseaseError as exc_:
                name = str((row or {}).get("disease") or (row or {}).get("model") or "?") \
                    if isinstance(row, dict) else "?"
                skipped.append({"name": name, "reason": str(exc_)})

    start = gdd.season_start(today) if season is None else date(int(season), 1, 1)
    end = today if season is None or int(season) >= today.year else date(int(season), 12, 31)
    if start > end:
        raise DiseaseWindowError(f"{season} has not started yet on this ground")

    ahead = season is None or int(season) >= today.year

    history_task = record_cache.wetness_history(
        region.centroid.lat, region.centroid.lon, start.isoformat(), end.isoformat(),
    )
    tasks: list[Any] = [history_task]
    if ahead:
        tasks.append(sources.fetch_wetness_forecast(
            region.centroid.lat, region.centroid.lon, FORECAST_DAYS,
        ))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    history = results[0]
    forecast = results[1] if len(results) > 1 else None

    if isinstance(history, BaseException):
        raise DiseaseWindowError(
            f"could not read this ground's hours: {history}"
        ) from history

    try:
        past = wetness.read_hours(sources.hourly_block(history))
    except sources.UpstreamError as exc:
        raise DiseaseWindowError(f"the hourly record is unreadable: {exc}") from exc

    # A forecast that did not answer is a smaller answer, never a failed one:
    # what already happened is the half a grower cannot get anywhere else.
    ahead_hours: list[wetness.Hour] = []
    forecast_note = None
    if ahead:
        if isinstance(forecast, BaseException):
            forecast_note = f"the forecast did not answer, so only the record is counted: {forecast}"
        else:
            try:
                ahead_hours = wetness.read_hours(sources.hourly_block(forecast))
            except sources.UpstreamError as exc:
                forecast_note = f"the forecast came back unreadable, so only the record is counted: {exc}"

    # The forecast repeats the last days of the record. Keep the record's
    # version of an hour it already has — it is a later model run of the same
    # hour, and splicing both would double-count a wet night into an infection
    # period that never happened.
    seen = {h.at for h in past}
    ahead_hours = [h for h in ahead_hours if h.at not in seen]
    combined = past + ahead_hours
    cut = ahead_hours[0].at if ahead_hours else None

    assessments = []
    for m in parsed:
        assessments.append({
            **({"ref": m["ref"]} if m.get("ref") else {}),
            **disease.assess(m, combined),
        })

    at_risk = [a for a in assessments if a.get("at_risk")]

    return {
        "success": True,
        "skipped": skipped,
        "as_of": today.isoformat(),
        "season_from": start.isoformat(),
        "region": region.describe(),
        "wetness": {
            **wetness.coverage(combined),
            "estimator": wetness.ESTIMATOR,
            "wet_hours": sum(1 for h in combined if h.wet),
            "humid_hours": sum(1 for h in combined if h.humid),
            # Where the record stops and the forecast starts. Every period
            # dated at or after this is a projection, and saying so here beats
            # saying it once per period.
            "forecast_from": cut,
            **({"forecast_note": forecast_note} if forecast_note else {}),
        },
        "diseases": assessments,
        # Zero risk is an ANSWER, and the one Frogdale gets in a dry year. A
        # season with nothing qualifying must say so out loud rather than come
        # back with an empty list and let the reader guess whether it looked.
        "summary": (
            f"{len(at_risk)} of {len(assessments)} model"
            f"{'s' if len(assessments) != 1 else ''} reporting risk from "
            f"{sum(1 for h in combined if h.wet)} estimated wet hours since "
            f"{start.isoformat()}."
            if at_risk else
            f"No model reports risk: {sum(1 for h in combined if h.wet)} estimated wet "
            f"hours since {start.isoformat()} produced no qualifying period across "
            f"{len(assessments)} model{'s' if len(assessments) != 1 else ''}."
        ),
        "note": disease.NOTE,
        "sources": [
            {**sources.feed_of([history]), "role": "hourly humidity, temperature and rain"},
            *([{"name": "Open-Meteo forecast", "role": "the hours ahead",
                "resolution_m": sources.FORECAST_RESOLUTION_M}] if ahead_hours else []),
            {"name": "computed", "role": "leaf wetness estimated from humidity — never measured",
             "resolution_m": 0},
        ],
    }


async def resolve_disease_models(
    region: Region, pests: list[dict[str, Any]], today: date | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Dated infection periods for pest rows that reference a wetness model.

    The same contract as `catalog.resolve_referenced_models`, and the same
    reason for existing: a stored reference RECOMPUTES each season, where a
    stored date freezes whatever the model said the day it was pasted.

    Returns ``(events, unresolved)``. A row whose model found no qualifying
    period comes back in `unresolved` with that stated — "the conditions did
    not occur" is an answer, and a silent omission is not.
    """
    wanted = [
        p for p in pests
        if str(p.get("model") or "").strip().lower().replace("-", "_") in disease.MODELS
        and not p.get("stages")
    ]
    if not wanted:
        return [], []

    keys = sorted({str(p["model"]).strip().lower().replace("-", "_") for p in wanted})
    answer = await region_disease_window(
        region, [{"model": k} for k in keys], today=today,
    )
    by_key = {d["model"]: d for d in answer["diseases"]}
    cut = answer["wetness"].get("forecast_from")

    events: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    for p in wanted:
        key = str(p["model"]).strip().lower().replace("-", "_")
        name = str(p.get("pest") or disease.MODELS[key]["disease"])
        found = by_key.get(key) or {}
        periods = (
            found.get("periods") if key == "hutton"
            else found.get("infection_periods") or found.get("spells")
        ) or []
        dated = [_period_event(name, key, per, cut) for per in periods]
        dated = [e for e in dated if e]
        if not dated:
            unresolved.append({
                "pest": name,
                "reason": (
                    f"{disease.MODELS[key]['name']} found no qualifying period this "
                    f"season — {found.get('explain', 'nothing to date')}"
                ),
            })
            continue
        events.extend(dated)
    events.sort(key=lambda e: e["date"])
    return events, unresolved


def _period_event(
    name: str, key: str, period: dict[str, Any], forecast_from: str | None,
) -> dict[str, Any] | None:
    """One qualifying period as a dated event, or None if it carries no date."""
    when = str(period.get("from") or period.get("start") or "")[:10]
    if len(when) != 10:
        return None
    began = str(period.get("from") or period.get("start") or "")
    ahead = bool(forecast_from and began >= forecast_from)
    return {
        # `pest` and `name` are the keys `calendar_feed` reads, and the two
        # halves mean what they mean there: the thing watched, and what
        # happened to it.
        "pest": name,
        "name": f"{disease.MODELS[key]['name']} period",
        "date": when,
        "via": key,
        "source": disease.MODELS[key]["name"],
        "resolution_m": 0,
        # Said on the event, because a calendar entry outlives the answer it
        # came from and "this one has not happened yet" is the first thing a
        # grower needs to know about a dated risk.
        "forecast": ahead,
        "detail": (
            f"{disease.MODELS[key]['name']}: "
            + str(period.get("explain") or f"criteria met through {period.get('to') or period.get('end')}")
            + (" — from the forecast, not the record." if ahead else "")
        ),
    }


def next_window(hours: list[wetness.Hour], after: str) -> dict[str, Any] | None:
    """The next wet run the forecast implies, for a caller that wants one line.

    Kept out of the per-model answers because "the next wet stretch" is a
    property of the weather, not of any one organism — every model reads the
    same one and each decides for itself whether it counts.
    """
    ahead = [h for h in hours if h.at >= after]
    run = wetness.longest(wetness.runs(ahead))
    return run.as_dict() if run else None


def season_bounds(today: date, days_back: int) -> tuple[date, date]:
    """A rolling window, for callers that do not want the whole season."""
    return today - timedelta(days=max(1, days_back)), today
