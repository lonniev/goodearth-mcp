"""What a plant is, as a grower needs it on the form: asked of an LLM, once.

A grower picks "American pumpkin" from iNaturalist, or types "punkin", and
should not then be asked for a degree-day figure, a height or a bloom month.
Almost nobody publishes a degree-day target for a cultivar, and a guessed one
quietly wrecks every date the ledger gives. So the service looks it up: our own
search reads the extension services and seed houses (`reference_search`) and an
LLM edits them into a fixed shape, with its sources — or searches the web
itself when nothing was found.

The answer is treated as adversarial input like any other. Every field is
checked here, clamped or dropped, before anything downstream sees it; a field
the model was unsure of comes back absent rather than invented.

Species facts only. Where those facts meet a particular plot — the heat a
packet's days hold there, a southern bloom season — is `plant_profile_window`.
"""

from __future__ import annotations

import json
import re
from typing import Any

from tollbooth.llm_route import TIER_WRITER

from goodearth_mcp import llm_answer
from goodearth_mcp.llm_answer import AnswerError
from goodearth_mcp.llm_answer import number as _num
from goodearth_mcp.llm_answer import one_of as _pick
from goodearth_mcp.llm_answer import text as _text
from goodearth_mcp.llm_answer import whole as _int
from goodearth_mcp.reference_search import EDIT_RULE, cited

#: Flower colours the companion designer pairs on. Mirrors the frontend's HUES.
HUES = ("red", "orange", "yellow", "green", "blue", "violet", "pink", "white")
KINDS = ("annual", "biennial", "perennial")
COUNTED_FROM = ("sowing", "transplant")

MAX_TOKENS = 2000

_MAX_NAME = 120
_MAX_SOURCES = 6


class ProfileError(AnswerError):
    """The plant could not be profiled. A ValueError, so a paid call refunds."""


SYSTEM = (
    "You are a horticultural reference for growers. Given a plant, use web search to "
    "find its growing facts from university extension services, botanical gardens and "
    "established seed companies, then answer with ONE JSON object inside "
    "<profile></profile> tags and nothing else.\n\n"
    "Shape (every field may be null when no reliable source gives it — never guess):\n"
    "{\n"
    '  "scientific_name": "Genus species", "common_name": "…", "family": "…",\n'
    '  "kind": "annual" | "biennial" | "perennial",\n'
    '  "days_to_maturity": {"typical": int, "low": int, "high": int,\n'
    '                       "counted_from": "sowing" | "transplant"},\n'
    '  "published_gdd": {"gdd": number, "base_f": number, "stage": "…", "source_url": "…"},\n'
    '  "base_temp_f": number,\n'
    '  "height_in": {"typical": number, "low": number, "high": number},\n'
    '  "flower_color": one of ' + ", ".join(HUES) + ",\n"
    '  "bloom_months": [int 1–12, …],\n'
    '  "frost_hardy": bool, "chill_hours": int, "hardy_to_f": number,\n'
    '  "sources": [{"title": "…", "url": "https://…"}],\n'
    '  "notes": "one or two plain sentences a grower would want"\n'
    "}\n\n"
    "Rules:\n"
    "- days_to_maturity: the typical range across common varieties, and whether seed "
    "packets count it from direct sowing or from transplanting.\n"
    "- published_gdd only when a source states a growing-degree-day figure WITH its "
    "base temperature; give that source's URL.\n"
    "- base_temp_f: the base temperature growers use for this crop (50 for most "
    "warm-season crops, 40 for most cool-season ones), in °F.\n"
    "- bloom_months: when it flowers in the temperate NORTHERN hemisphere.\n"
    "- frost_hardy: whether it survives a light frost (about 28–32 °F).\n"
    "- chill_hours and hardy_to_f: for fruit and nut trees and other perennials only.\n"
    "- Fahrenheit and inches throughout."
)

#: The same reference, editing sources it was given rather than searching.
SYSTEM_EDIT = SYSTEM.replace("use web search to find its growing facts from",
                             "read the sources given for its growing facts, from") + EDIT_RULE


def prompt_for(*, taxon_id: int | None, scientific_name: str, common_name: str, text: str) -> str:
    """The user turn: what the grower picked, or typed."""
    parts = []
    if scientific_name:
        parts.append(f"Scientific name: {scientific_name}")
    if common_name:
        parts.append(f"Common name: {common_name}")
    if taxon_id:
        parts.append(f"iNaturalist taxon id: {taxon_id}")
    if text and not parts:
        parts.append(f"The grower typed: {text!r} — work out which cultivated plant they mean.")
    return "Profile this plant.\n" + "\n".join(parts)


async def ask(api_key: str, user: str, *, edit: bool = False,
              model: str = TIER_WRITER) -> dict[str, Any]:
    """One generation, and the raw JSON it answered with. It searches the web
    itself, or with ``edit`` reads only the sources the user turn carries.
    ``model`` is the operator's choice for that mode."""
    if edit:
        return await llm_answer.ask(api_key, system=SYSTEM_EDIT, user=user,
                                    max_tokens=MAX_TOKENS, searches=0, model=model)
    return await llm_answer.ask(api_key, system=SYSTEM, user=user, max_tokens=MAX_TOKENS,
                                searches=llm_answer.MAX_SEARCHES, model=model)


def answer_text(data: dict[str, Any]) -> str:
    """The text inside the last <profile> tags, across every text block."""
    return llm_answer.tagged(data, "profile")


# ── Checking the answer ──────────────────────────────────────────────────


def _span(v: Any, lo: float, hi: float, whole: bool) -> dict[str, float] | None:
    """{typical, low, high}, each in range, ordered; typical required."""
    if not isinstance(v, dict):
        return None
    read = _int if whole else _num
    typical = read(v.get("typical"), lo, hi)  # type: ignore[operator]
    if typical is None:
        return None
    low = read(v.get("low"), lo, hi) or typical  # type: ignore[operator]
    high = read(v.get("high"), lo, hi) or typical  # type: ignore[operator]
    low, high = min(low, typical), max(high, typical)
    return {"typical": typical, "low": low, "high": high}


def validate(raw: str, *, given: set[str] | None = None) -> dict[str, Any]:
    """The model's JSON, as only the fields this service can stand behind. With
    ``given``, the URLs of the sources it was handed, a citation of any other
    page is dropped, and a figure resting on one with it."""
    try:
        data = json.loads(raw)
    except (TypeError, ValueError) as exc:
        raise ProfileError("The plant reference's answer was not readable.") from exc
    if not isinstance(data, dict):
        raise ProfileError("The plant reference's answer was not a profile.")

    out: dict[str, Any] = {
        "scientific_name": _text(data.get("scientific_name"), _MAX_NAME),
        "common_name": _text(data.get("common_name"), _MAX_NAME),
        "family": _text(data.get("family"), _MAX_NAME),
        "kind": _pick(data.get("kind"), KINDS),
        "base_temp_f": _num(data.get("base_temp_f"), 20, 80),
        "flower_color": _pick(data.get("flower_color"), HUES),
        "frost_hardy": data.get("frost_hardy") if isinstance(data.get("frost_hardy"), bool) else None,
        "chill_hours": _int(data.get("chill_hours"), 0, 3000),
        "hardy_to_f": _num(data.get("hardy_to_f"), -60, 50),
        "notes": _text(data.get("notes")),
    }

    dtm = _span(data.get("days_to_maturity"), 14, 365, whole=True)
    if dtm:
        dtm["counted_from"] = _pick((data.get("days_to_maturity") or {}).get("counted_from"),
                                    COUNTED_FROM) or "sowing"
    out["days_to_maturity"] = dtm
    out["height_in"] = _span(data.get("height_in"), 0.5, 1200, whole=False)

    gdd = data.get("published_gdd")
    published = None
    if isinstance(gdd, dict):
        figure, base = _num(gdd.get("gdd"), 1, 20_000), _num(gdd.get("base_f"), 20, 80)
        source = cited(gdd.get("source_url"), given)
        # A figure without its base is off by hundreds, and one without a
        # source is a claim nobody can check. Both, or nothing.
        if figure is not None and base is not None and source:
            published = {"gdd": figure, "base_f": base,
                         "stage": _text(gdd.get("stage"), 80), "source_url": source}
    out["published_gdd"] = published

    months = data.get("bloom_months")
    out["bloom_months"] = (sorted({m for m in months if isinstance(m, int) and not isinstance(m, bool)
                                   and 1 <= m <= 12})
                           if isinstance(months, list) else []) or None

    sources = []
    for s in data.get("sources") or []:
        if isinstance(s, dict) and (u := cited(s.get("url"), given)):
            sources.append({"title": _text(s.get("title"), _MAX_NAME) or u, "url": u})
        if len(sources) >= _MAX_SOURCES:
            break
    out["sources"] = sources

    if not (out["scientific_name"] or out["common_name"]):
        raise ProfileError("The plant reference could not tell which plant this is.")
    return out


def cache_key(*, taxon_id: int | None, scientific_name: str, common_name: str, text: str) -> str:
    """One row per plant: the taxon when there is one, else the name asked."""
    return "profile:" + subject_key(taxon_id=taxon_id, name=scientific_name or common_name or text)


def subject_key(*, taxon_id: int | None, name: str) -> str:
    """Which subject an answer is about: its taxon when known, else its name."""
    if taxon_id:
        return f"taxon:{int(taxon_id)}"
    return "name:" + re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()
