"""Audit a grower's roster against what this ground is actually known for.

An agent asked "are these the right pests to watch?" will, left alone, answer
from its own training data. That is the wrong source: unverifiable, different
per model, and confidently wrong at the margins — which is exactly where a
roster review lives. The server already knows what is modelled and what is
recorded near a piece of ground, so the review is grounded in that and in
nothing else.

**Every reason here is a statement about the RECORD, never about the animal.**
"Not recorded within 16 km" is a fact this service can stand behind. "Does not
live here" is natural history, which Good Earth does not publish — and the
grower who genuinely saw the odd thing is precisely the case worth learning
from, so findings are proposed and never applied.

Three cases, from the field report that asked for this:

  out_of_range  listed, and this ground's record does not know it
  absent        the record knows it well, and the roster does not list it
  implausible   an observation that cannot be right, with what makes it wrong

The third matters most. Observations feed ``calibration``, which shifts the
heat and frost bias for the whole block, so one junk entry degrades every
later answer rather than merely showing a wrong row.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

# An observation count below this is one person noticing once. It is evidence
# that a species CAN be here, not that a grower should be watching for it, so
# it is not used to say something is missing from a roster.
WELL_RECORDED = 25

MAX_SUGGESTIONS = 12


def norm(name: str) -> str:
    """A species name reduced to something two spellings can meet on."""
    s = (name or "").strip().lower()
    s = re.sub(r"\([^)]*\)", " ", s)          # drop parentheticals
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    # Trailing life-stage and event words: a grower's "codling moth first
    # flight" and the catalogue's "codling moth" are the same animal.
    for tail in (" first flight", " second flight", " egg hatch", " adult",
                 " adults", " larvae", " emergence", " first egg hatch"):
        s = s.removesuffix(tail)
    return s.strip()


def _known(catalog_names: list[str]) -> set[str]:
    return {norm(n) for n in catalog_names if n}


def _matches(name: str, known: set[str]) -> bool:
    """Whether the record knows this name, allowing either to be the longer."""
    n = norm(name)
    if not n:
        return False
    if n in known:
        return True
    # "japanese beetle" should match a catalogue "japanese beetle adult", and a
    # roster "codling moth" should match "codling moth" inside a longer entry.
    return any(n in k or k in n for k in known if k)


def review(
    *,
    region_label: str,
    pests: list[dict[str, Any]],
    wildlife: list[dict[str, Any]],
    observations: list[dict[str, Any]],
    pest_catalog: dict[str, Any],
    wildlife_catalog: dict[str, Any],
    frost: dict[str, Any] | None = None,
    today: date,
) -> dict[str, Any]:
    """Compare a roster with the region's own record. Proposes, never applies."""
    span = pest_catalog.get("search_span_km") or wildlife_catalog.get("search_span_km")

    modelled = [e.get("name", "") for e in pest_catalog.get("events", [])]
    recorded_pests = pest_catalog.get("insects_recorded", []) or []
    recorded_fauna = [
        s for g in wildlife_catalog.get("groups", []) for s in g.get("species", [])
    ]
    all_recorded = recorded_pests + recorded_fauna

    known = _known(modelled + [r.get("name", "") for r in all_recorded])

    # ── Listed, and the record does not know it ──────────────────────────
    out_of_range: list[dict[str, Any]] = []
    for item, kind in ((p, "pest") for p in pests):
        name = str(item.get("pest") or item.get("species") or "")
        if name and not _matches(name, known):
            out_of_range.append({
                "name": name, "kind": kind,
                "reason": (
                    f"Not recorded within about {span} km on iNaturalist, and not among the "
                    "degree-day models USA-NPN publishes for this ground."
                ),
                "verdict": "check it — this is a gap in the record, not proof it is absent",
            })
    for item in wildlife:
        name = str(item.get("species") or "")
        if name and not _matches(name, known):
            out_of_range.append({
                "name": name, "kind": "wildlife",
                "reason": f"Not recorded within about {span} km on iNaturalist.",
                "verdict": "check it — this is a gap in the record, not proof it is absent",
            })

    # ── The record knows it well, the roster does not ────────────────────
    listed = _known(
        [str(p.get("pest") or "") for p in pests]
        + [str(w.get("species") or "") for w in wildlife]
    )
    absent: list[dict[str, Any]] = []
    for e in pest_catalog.get("events", []):
        nm = e.get("name", "")
        if nm and not _matches(nm, listed):
            absent.append({
                "name": nm, "kind": "pest",
                "reason": f"USA-NPN models it for this ground; its {e.get('date')} stage is published.",
                "evidence": {"modelled_date": e.get("date"), "source": e.get("source")},
            })
    for r in sorted(all_recorded, key=lambda x: -int(x.get("observations") or 0)):
        nm = r.get("name", "")
        obs = int(r.get("observations") or 0)
        if obs < WELL_RECORDED or not nm or _matches(nm, listed):
            continue
        if any(_matches(nm, {norm(a["name"])}) for a in absent):
            continue
        absent.append({
            "name": nm, "kind": "wildlife",
            "reason": f"{obs:,} sightings within about {span} km.",
            "evidence": {"observations": obs, "source": "iNaturalist"},
        })
    absent = absent[:MAX_SUGGESTIONS]

    # ── Observations that cannot be right ────────────────────────────────
    implausible = review_observations(
        observations, known=known, frost=frost, today=today, span=span,
    )

    return {
        "region": region_label,
        "searched_km": span,
        "out_of_range": out_of_range,
        "absent": absent,
        "implausible": implausible,
        "checked": {
            "pests": len(pests), "wildlife": len(wildlife),
            "observations": len(observations),
        },
        "note": (
            "Proposed, not applied. Every reason above is about the RECORD for this "
            "ground — what is modelled and what has been seen nearby — not about "
            "whether a species can live here. A grower who saw the odd thing is the "
            "case worth keeping."
        ),
    }


def review_observations(
    observations: list[dict[str, Any]],
    *,
    known: set[str],
    frost: dict[str, Any] | None,
    today: date,
    span: Any = None,
) -> list[dict[str, Any]]:
    """Observations that cannot be right, and what makes them wrong.

    Kept separate because this is the case that does damage: these feed
    ``calibration``, which moves the heat and frost bias for the whole block.
    """
    out: list[dict[str, Any]] = []
    spring = _as_date(frost.get("last_spring_median")) if frost else None
    fall = _as_date(frost.get("first_fall_median")) if frost else None

    for o in observations:
        kind = str(o.get("kind") or o.get("tag") or "").lower()
        on = _as_date(o.get("observed_on") or o.get("observedOn"))
        name = str(o.get("species") or o.get("crop") or o.get("note") or "")[:60]
        label = f"{kind or 'observation'}{f' — {name}' if name else ''}"

        if on and on > today:
            out.append({
                "observation": label, "observed_on": o.get("observed_on"),
                "reason": f"Dated {on.isoformat()}, which is in the future.",
            })
            continue

        # A frost report inside this ground's own frost-free window. Measured
        # against the region's record rather than against a season anyone
        # assumes — a Vermont July and an Arizona July are not the same claim.
        if kind == "frost" and on and spring and fall and spring < on < fall:
            out.append({
                "observation": label, "observed_on": o.get("observed_on"),
                "reason": (
                    f"Frost dated {on.isoformat()}, inside this ground's own frost-free "
                    f"window ({spring.isoformat()} to {fall.isoformat()}, median). "
                    "Frost observations move the frost bias for the whole block."
                ),
            })
            continue

        if o.get("species") and known and not _matches(str(o["species"]), known):
            out.append({
                "observation": label, "observed_on": o.get("observed_on"),
                "reason": (
                    f"'{o['species']}' is not recorded within about {span} km. Worth "
                    "confirming the name before it teaches the model."
                ),
            })

    return out


def _as_date(v: Any) -> date | None:
    try:
        return date.fromisoformat(str(v)[:10])
    except (TypeError, ValueError):
        return None
