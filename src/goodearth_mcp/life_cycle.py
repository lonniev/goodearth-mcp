"""A subject's life cycle, as events a grower can tick and track: asked of an LLM.

A grower picks a subject — a pumpkin, a codling moth, a red-tailed hawk — and
should not have to know which stages exist, what drives each, or its threshold.
So the service looks them up: one web-searching generation reads extension
services, field guides and life-history accounts and answers in a fixed shape,
with its sources, and a short story of the subject's year.

Every event must pass the same validator its saved record would face —
`crops.validate_stages` for a plant's or a pest's heat stages,
`wildlife.validate_event` for an animal's — so whatever the grower ticks saves
without a second check failing. An event that does not pass is dropped, never
repaired by guesswork.

Species facts only. Where each event falls on a particular plot is
`life_cycle_window`.
"""

from __future__ import annotations

import json
import math
from typing import Any

from goodearth_mcp import crops, llm_answer, wildlife
from goodearth_mcp.llm_answer import AnswerError, number, one_of, text, url
from goodearth_mcp.plant_profile import subject_key

SUBJECTS = ("plant", "pest", "animal")

#: What may time each subject's events. A plant's are heat stages from set-out,
#: because that is what a planting holds. A pest's and an animal's may be any
#: driver except `interval`, which counts from a day only the grower saw: an
#: insect's are heat stages, but a chipmunk is a pest with no degree days, and
#: its year is timed by the calendar and the light like any animal's.
_ANIMAL_DRIVERS = ("heat", "daylight", "calendar", "condition", "moon")
DRIVERS = {
    "plant": ("heat",),
    "pest": _ANIMAL_DRIVERS,
    "animal": _ANIMAL_DRIVERS,
}

#: The fields each driver carries, as the record stores them.
DRIVER_FIELDS = {
    "heat": ("gdd", "base_temp"),
    "daylight": ("daylight_hours", "rising"),
    "calendar": ("typical_on",),
    "condition": ("trigger",),
    "moon": ("phase", "after", "nth"),
}

MAX_EVENTS = 20
MAX_SEARCHES = 6
MAX_TOKENS = 3000

#: Calendar dates for an animal move with latitude, so its life cycle is kept
#: per band of this many degrees. Heat and day-length thresholds travel.
LAT_BAND = 5


class LifeCycleError(AnswerError):
    """The life cycle could not be looked up. A ValueError, so a paid call refunds."""


SYSTEM = (
    "You are a natural-history reference for growers. Given a subject — a "
    "cultivated plant, a crop pest, or a wild or farm animal — use web search to "
    "find its life cycle from university extension services, field guides and "
    "life-history accounts. Answer with ONE JSON object inside "
    "<lifecycle></lifecycle> tags and nothing else.\n\n"
    "{\n"
    '  "scientific_name": "Genus species", "common_name": "…",\n'
    '  "narrative": "two to four plain sentences: this subject\'s year, in order",\n'
    '  "base_temp_f": number,   // plants and pests: the base all heat stages use\n'
    '  "events": [{\n'
    '    "name": "short name, e.g. first flight", "emoji": "one emoji",\n'
    '    "summary": "one plain sentence a grower would want",\n'
    '    "key": true | false,     // true for the two to five most growers watch\n'
    '    "driver": "heat" | "daylight" | "calendar" | "condition" | "moon",\n'
    "    …the driver's own fields…,\n"
    '    "source_url": "https://…"\n'
    "  }]\n"
    "}\n\n"
    "Driver fields (Fahrenheit throughout):\n"
    '- heat: "gdd". For a PLANT, growing degree days from set-out at base_temp_f. '
    "For a PEST, degree days from January 1 at base_temp_f. For an ANIMAL, from "
    'January 1, with its own "base_temp".\n'
    '- daylight: "daylight_hours" and "rising" (true while days lengthen).\n'
    '- calendar: "typical_on" as "MM-DD" — the typical date AT THE LATITUDE GIVEN.\n'
    '- condition: "trigger": {"after": "MM-DD", "min_night_f", "min_day_f", "wet"}.\n'
    '- moon: "phase" (new, first_quarter, full, last_quarter), "after" "MM-DD", "nth" 1–3.\n\n'
    "Rules:\n"
    "- Only events a source supports, each with that source's URL. Never guess a "
    "threshold; leave the event out instead.\n"
    "- A plant's events use the heat driver only. An insect or mite pest's stages "
    "use heat from January 1 at base_temp_f; a pest that is a mammal, bird or other "
    "animal uses whatever driver fits, as any animal does.\n"
    "- Prefer the driver a source states: heat for insects and crops, daylight for "
    "what day length cues, calendar only when nothing better is known.\n"
    f"- At most {MAX_EVENTS} events, in the order they happen."
)


def prompt_for(*, subject: str, taxon_id: int | None, scientific_name: str,
               common_name: str, text_typed: str, lat: float,
               phenophases: list[str]) -> str:
    """The user turn: the subject, where it is, and the stages USA-NPN names."""
    parts = [f"Subject kind: {subject}"]
    if scientific_name:
        parts.append(f"Scientific name: {scientific_name}")
    if common_name:
        parts.append(f"Common name: {common_name}")
    if taxon_id:
        parts.append(f"iNaturalist taxon id: {taxon_id}")
    if text_typed and not (scientific_name or common_name):
        parts.append(f"The grower typed: {text_typed!r} — work out which one they mean.")
    parts.append(f"Latitude: about {round(lat)}° {'north' if lat >= 0 else 'south'}.")
    if phenophases:
        parts.append("USA-NPN tracks these stages for it (use these names where they fit): "
                     + "; ".join(phenophases[:30]))
    return "Give this subject's life cycle.\n" + "\n".join(parts)


async def ask(api_key: str, user: str) -> dict[str, Any]:
    """One web-searching generation, and the raw JSON it answered with."""
    return await llm_answer.ask(api_key, system=SYSTEM, user=user,
                                max_tokens=MAX_TOKENS, searches=MAX_SEARCHES)


def answer_text(data: dict[str, Any]) -> str:
    return llm_answer.tagged(data, "lifecycle")


def lat_band(lat: float) -> int:
    """The band of latitude a life cycle is kept for: 40 for 40°–44.99° N."""
    return int(math.floor(lat / LAT_BAND) * LAT_BAND)


def cache_key(*, subject: str, taxon_id: int | None, name: str, lat: float) -> str:
    """One row per subject — and per latitude band for an animal, whose
    calendar dates move with it."""
    key = f"lifecycle:{subject}:{subject_key(taxon_id=taxon_id, name=name)}"
    return f"{key}:{lat_band(lat)}" if subject == "animal" else key


# ── Checking the answer ──────────────────────────────────────────────────


def _event(subject: str, name: str, raw: dict[str, Any]) -> dict[str, Any] | None:
    """One event in its record's own shape, or None when it does not validate."""
    label = text(raw.get("name"), 80)
    driver = one_of(raw.get("driver"), DRIVERS[subject])
    if not label or not driver:
        return None
    fields = {f: raw[f] for f in DRIVER_FIELDS[driver] if f in raw}
    try:
        if subject == "plant" or (subject == "pest" and driver == "heat"):
            # Kept as a stage: a planting's, or the pest record's own.
            stage = crops.validate_stages(name, [{"stage": label, "gdd": fields.get("gdd")}])[0]
            timing: dict[str, Any] = {"driver": "heat", "gdd": stage["gdd"]}
        else:
            ev = wildlife.validate_event({"species": name, "event": label, "driver": driver, **fields})
            timing = {"driver": driver, **_record_fields(ev)}
    except (crops.CropError, wildlife.WildlifeError):
        return None
    return {
        "name": label,
        "emoji": text(raw.get("emoji"), 4) or None,
        "summary": text(raw.get("summary"), 200),
        "key": raw.get("key") is True,
        **timing,
        "source_url": url(raw.get("source_url")) or None,
    }


def _record_fields(ev: dict[str, Any]) -> dict[str, Any]:
    """A validated animal event's timing, back in the shape a record stores."""
    d = ev["driver"]
    if d == "heat":
        return {"gdd": ev["gdd"], "base_temp": ev["base_temp_f"]}
    if d == "daylight":
        return {"daylight_hours": ev["daylight_hours"], "rising": ev["rising"]}
    if d == "calendar":
        return {"typical_on": f"{ev['month']:02d}-{ev['day']:02d}"}
    if d == "condition":
        return {"trigger": ev["trigger"]}
    return {"phase": ev["phase"], "after": ev["after"], "nth": ev["nth"]}


def validate(raw: str, subject: str) -> dict[str, Any]:
    """The model's JSON, as only the events this service can stand behind."""
    try:
        data = json.loads(raw)
    except (TypeError, ValueError) as exc:
        raise LifeCycleError("The life cycle answer was not readable.") from exc
    if not isinstance(data, dict):
        raise LifeCycleError("The life cycle answer was not one.")
    scientific = text(data.get("scientific_name"), 120)
    common = text(data.get("common_name"), 120)
    name = common or scientific
    if not name:
        raise LifeCycleError("The reference could not tell which subject this is.")
    base_f = number(data.get("base_temp_f"), 20, 80) or 50.0

    events: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw_ev in data.get("events") or []:
        if not isinstance(raw_ev, dict) or len(events) >= MAX_EVENTS:
            continue
        ev = _event(subject, name, raw_ev)
        if ev and ev["name"].lower() not in seen:
            seen.add(ev["name"].lower())
            events.append(ev)
    # None timeable is an answer too, and is kept like one: asking again would
    # pay for the same search to find the same nothing. The window says so.
    return {
        "subject": subject,
        "scientific_name": scientific,
        "common_name": common,
        "narrative": text(data.get("narrative"), 600),
        **({"base_temp_f": base_f} if subject in ("plant", "pest") else {}),
        "events": events,
    }
