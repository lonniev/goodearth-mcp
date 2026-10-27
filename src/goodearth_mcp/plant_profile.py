"""What a plant is, as a grower needs it on the form: asked of an LLM, once.

A grower picks "American pumpkin" from iNaturalist, or types "punkin", and
should not then be asked for a degree-day figure, a height or a bloom month.
Almost nobody publishes a degree-day target for a cultivar, and a guessed one
quietly wrecks every date the ledger gives. So the service looks it up: an LLM
with web search reads the extension services and seed houses and answers in a
fixed shape, with its sources.

The answer is treated as adversarial input like any other. Every field is
checked here, clamped or dropped, before anything downstream sees it; a field
the model was unsure of comes back absent rather than invented.

Species facts only. Where those facts meet a particular plot — the heat a
packet's days hold there, a southern bloom season — is `plant_profile_window`.
"""

from __future__ import annotations

import json
import math
import re
from typing import Any

import httpx
from tollbooth.llm_route import (
    TIER_WRITER,
    build_messages_request,
    resolve_route,
    web_search_tool,
)

#: Flower colours the companion designer pairs on. Mirrors the frontend's HUES.
HUES = ("red", "orange", "yellow", "green", "blue", "violet", "pink", "white")
KINDS = ("annual", "biennial", "perennial")
COUNTED_FROM = ("sowing", "transplant")

#: Web searches the model may make for one plant.
MAX_SEARCHES = 4
#: A web-searching generation is slow; a minute and a half is the ceiling.
TIMEOUT_S = 90.0
MAX_TOKENS = 2000

_PROFILE_RE = re.compile(r"<profile>(.*?)</profile>", re.DOTALL)
_MAX_TEXT = 300
_MAX_NAME = 120
_MAX_SOURCES = 6


class ProfileError(ValueError):
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


async def ask(api_key: str, user: str) -> dict[str, Any]:
    """One web-searching generation, and the raw JSON it answered with."""
    route = resolve_route(api_key=api_key, tier=TIER_WRITER)
    req = build_messages_request(
        route, system=SYSTEM, user=user, max_tokens=MAX_TOKENS,
        tools=[web_search_tool(MAX_SEARCHES)],
        timeout_seconds=TIMEOUT_S, timeout_max_seconds=TIMEOUT_S,
    )
    async with httpx.AsyncClient(timeout=req["timeout"]) as client:
        resp = await client.post(req["url"], headers=req["headers"], json=req["json"])
    if resp.status_code >= 400:
        # The body may echo request details; the status is all a patron needs.
        raise ProfileError(f"The plant reference did not answer (HTTP {resp.status_code}).")
    return resp.json()


def answer_text(data: dict[str, Any]) -> str:
    """The text inside the last <profile> tags, across every text block."""
    full = "".join(b.get("text", "") for b in data.get("content", []) if isinstance(b, dict)
                   and b.get("type") == "text")
    found = _PROFILE_RE.findall(full)
    if not found:
        raise ProfileError("The plant reference answered without a profile.")
    return found[-1].strip()


# ── Checking the answer ──────────────────────────────────────────────────


def _num(v: Any, lo: float, hi: float) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        return None
    return float(v) if lo <= v <= hi else None


def _int(v: Any, lo: int, hi: int) -> int | None:
    n = _num(v, lo, hi)
    return round(n) if n is not None else None


def _text(v: Any, limit: int = _MAX_TEXT) -> str:
    if not isinstance(v, str):
        return ""
    return re.sub(r"\s+", " ", v).strip()[:limit]


def _url(v: Any) -> str:
    u = _text(v, 500)
    return u if re.match(r"^https?://[^\s<>\"']+$", u) else ""


def _pick(v: Any, allowed: tuple[str, ...]) -> str | None:
    t = _text(v, 20).lower()
    return t if t in allowed else None


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


def validate(raw: str) -> dict[str, Any]:
    """The model's JSON, as only the fields this service can stand behind."""
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
        source = _url(gdd.get("source_url"))
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
        if isinstance(s, dict) and (u := _url(s.get("url"))):
            sources.append({"title": _text(s.get("title"), _MAX_NAME) or u, "url": u})
        if len(sources) >= _MAX_SOURCES:
            break
    out["sources"] = sources

    if not (out["scientific_name"] or out["common_name"]):
        raise ProfileError("The plant reference could not tell which plant this is.")
    return out


def cache_key(*, taxon_id: int | None, scientific_name: str, common_name: str, text: str) -> str:
    """One row per plant: the taxon when there is one, else the name asked."""
    if taxon_id:
        return f"taxon:{int(taxon_id)}"
    name = scientific_name or common_name or text
    return "name:" + re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()
