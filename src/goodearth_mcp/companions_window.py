"""Companions for one planting on one block, assembled from the record.

Gathers what the rules need — the block's own plantings, the grower's other
and retired plantings, and the family and genus of each from iNaturalist —
and hands the arithmetic to :mod:`companions`. Nothing here decides what a
companion is.

Plantings without a ``taxon_id`` are reported as ``unplaced``; a typed name
is never turned into a family by guessing, which is the stance the whole
record takes.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from goodearth_mcp import biota, companions
from goodearth_mcp.companions import KINDS, Look, Taxon


class CompanionsError(ValueError):
    """The question was malformed: an unknown kind, a plant not on the block."""


TaxaFetch = Callable[[set[int]], Awaitable[dict[int, dict[str, Any]]]]


def _name(item: dict[str, Any]) -> str:
    return str(item.get("common_name") or item.get("crop") or item.get("name") or "").strip()


def _taxon_id(item: dict[str, Any]) -> int | None:
    raw = item.get("taxon_id")
    return raw if isinstance(raw, int) and raw > 0 else None


def find_subject(plant: str, here: list[dict[str, Any]]) -> dict[str, Any]:
    """The planting ``plant`` names on this block: by ``ref`` first, then by a
    name only one planting has. Several matches list themselves, like a block
    does, so the caller picks rather than guesses."""
    want = plant.strip()
    if not want:
        raise CompanionsError("plant is required: a planting's ref or its name")
    for item in here:
        if item.get("ref") == want:
            return item
    low = want.lower()

    def names(i: dict[str, Any]) -> list[str]:
        return [str(v).strip().lower() for v in (i.get("common_name"), i.get("crop"), i.get("name")) if v]

    exact = [i for i in here if low in names(i)]
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        raise CompanionsError(
            f"{len(exact)} plantings on this block are named {want!r}; pass one's ref: "
            + ", ".join(str(i.get("ref")) for i in exact)
        )
    partial = [i for i in here if any(low in n for n in names(i))]
    if len(partial) == 1:
        return partial[0]
    if partial:
        raise CompanionsError(
            f"{want!r} matches {len(partial)} plantings on this block: "
            + ", ".join(f"{_name(i)} ({i.get('ref')})" for i in partial)
        )
    raise CompanionsError(f"No planting named {want!r} on this block")


def _taxon_for(item: dict[str, Any], taxa: dict[int, dict[str, Any]]) -> Taxon:
    tid = _taxon_id(item)
    rec = taxa.get(tid) if tid is not None else None
    return Taxon(
        name=_name(item),
        family=(rec or {}).get("family"),
        genus=(rec or {}).get("genus"),
        scientific_name=(rec or {}).get("name") or item.get("scientific_name") or None,
        taxon_id=tid,
    )


def _facts(item: dict[str, Any], where: str, taxon: Taxon) -> dict[str, Any]:
    return {
        "name": taxon.name,
        "scientific_name": taxon.scientific_name,
        "taxon_id": taxon.taxon_id,
        "where": where,
        "ref": item.get("ref"),
        "block": item.get("block_name"),
    }


async def block_companions(
    plant: str,
    kind: str,
    here: list[dict[str, Any]],
    elsewhere: list[dict[str, Any]],
    *,
    fetch_taxa: TaxaFetch = biota.fetch_taxa,
    today: datetime | None = None,
) -> dict[str, Any]:
    """Companion rows for ``plant`` on this block.

    ``here`` is the block's live plantings; ``elsewhere`` the grower's other
    blocks' and retired plantings (each carrying ``block_name``). Both are
    shaped as the impls expect: payload plus ``ref``.
    """
    if kind not in KINDS:
        raise CompanionsError(f"kind must be one of {', '.join(KINDS)}")
    subject_item = find_subject(plant, here)
    now = today or datetime.now(UTC)

    # Everything the grower has grown, this plot first, each row once.
    seen: set[str] = set()
    ledger: list[tuple[dict[str, Any], str]] = []
    for item in here:
        key = str(item.get("ref"))
        if item is subject_item or key in seen:
            continue
        seen.add(key)
        ledger.append((item, "this_plot"))
    for item in elsewhere:
        key = str(item.get("ref"))
        if key in seen:
            continue
        seen.add(key)
        ledger.append((item, "grown_before"))

    if kind == "synergy":
        return await _synergy(subject_item, ledger, fetch_taxa, now)
    return _design(subject_item, ledger, now)


async def _synergy(
    subject_item: dict[str, Any],
    ledger: list[tuple[dict[str, Any], str]],
    fetch_taxa: TaxaFetch,
    now: datetime,
) -> dict[str, Any]:
    ids = {t for t in (_taxon_id(subject_item), *(_taxon_id(i) for i, _ in ledger)) if t is not None}
    taxa = await fetch_taxa(ids) if ids else {}
    subject = _taxon_for(subject_item, taxa)
    if not subject.placed:
        # Raised, not returned: a refusal that computed nothing must not cost
        # a fare, and `paid_tool` rolls back only on an exception.
        reason = "no species chosen for it" if subject.taxon_id is None else "iNaturalist has no family for it"
        raise CompanionsError(
            f"{subject.name or 'This planting'} cannot be placed in a family: {reason}. "
            "Pick its species on the ledger and ask again."
        )

    candidates: list[tuple[Taxon, dict[str, Any]]] = []
    unplaced: list[dict[str, Any]] = []
    for item, where in ledger:
        taxon = _taxon_for(item, taxa)
        if not taxon.placed:
            unplaced.append({"name": taxon.name, "ref": item.get("ref"), "where": where,
                             "reason": "no species chosen" if taxon.taxon_id is None else "no family known"})
            continue
        candidates.append((taxon, _facts(item, where, taxon)))
    # Examples come last and never repeat a genus the ledger already holds.
    held = {t.genus for t, _ in candidates if t.genus} | ({subject.genus} if subject.genus else set())
    for ex in companions.EXAMPLES:
        if ex.genus in held:
            continue
        taxon = Taxon(ex.name, ex.family, ex.genus, ex.scientific_name)
        candidates.append((taxon, {"name": ex.name, "scientific_name": ex.scientific_name,
                                   "taxon_id": None, "where": "example", "ref": None, "block": None}))

    rows = companions.synergy(subject, candidates)
    return {
        "success": True,
        "as_of": now.date().isoformat(),
        "kind": "synergy",
        "subject": {"ref": subject_item.get("ref"), "name": subject.name,
                    "scientific_name": subject.scientific_name, "family": subject.family, "genus": subject.genus},
        "companions": rows,
        "unplaced": unplaced,
        "counts": _counts(rows),
        "summary": _summary(subject.name, rows, unplaced),
        "note": (
            "Synergy rows are published companion-planting rules — each names its mechanism "
            "or its tradition and a citation. Good Earth publishes them; it has not tested "
            "them on this ground. Family and genus are iNaturalist's."
        ),
        "sources": [
            {"name": "iNaturalist", "role": "family and genus of each planting", "resolution_m": None},
            {"name": "companion-planting rules", "role": "cited on every row", "resolution_m": None},
        ],
    }


def _design(subject_item: dict[str, Any], ledger: list[tuple[dict[str, Any], str]], now: datetime) -> dict[str, Any]:
    subject = companions.look_of(subject_item)
    name = _name(subject_item)
    if subject.color is None:
        # Raised, so it is free — see the synergy refusal above.
        raise CompanionsError(
            f"{name or 'This planting'} has no flower colour recorded. Add flower_color "
            f"(one of {', '.join(companions.HUES)}) — height_in and bloom_months sharpen the answer."
        )
    candidates: list[tuple[Look, dict[str, Any]]] = []
    uncoloured: list[dict[str, Any]] = []
    for item, where in ledger:
        look = companions.look_of(item)
        if look.color is None:
            uncoloured.append({"name": _name(item), "ref": item.get("ref"), "where": where, "reason": "no flower colour recorded"})
            continue
        candidates.append((look, {"name": _name(item), "scientific_name": item.get("scientific_name"),
                                  "taxon_id": _taxon_id(item), "where": where, "ref": item.get("ref"),
                                  "block": item.get("block_name")}))
    held = {_name(i).lower() for i, _ in ledger}
    for ex_name, sci, color, height in companions.DESIGN_EXAMPLES:
        if ex_name.lower() in held:
            continue
        candidates.append((Look(color, height), {"name": ex_name, "scientific_name": sci, "taxon_id": None,
                                                 "where": "example", "ref": None, "block": None}))
    rows = companions.design(subject, candidates)
    return {
        "success": True,
        "as_of": now.date().isoformat(),
        "kind": "design",
        "subject": {"ref": subject_item.get("ref"), "name": name, "color": subject.color,
                    "band": companions.band(subject.height_in), "bloom_months": list(subject.bloom_months)},
        "companions": rows,
        "unplaced": uncoloured,
        "counts": _counts(rows),
        "summary": _summary(name, rows, uncoloured),
        "note": (
            "Design rows are arithmetic over what you recorded — flower colour on the wheel, "
            "height in bands, bloom months — plus a few classic cut flowers as examples. "
            "No trait database is consulted: this zinnia is the colour you wrote in."
        ),
        "sources": [{"name": "your ledger", "role": "flower colour, height and bloom months", "resolution_m": None}],
    }


def _counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    out = {"this_plot": 0, "grown_before": 0, "example": 0, "avoid": 0}
    for r in rows:
        out[r["where"]] = out.get(r["where"], 0) + 1
        if r.get("relation") == "avoid":
            out["avoid"] += 1
    return out


def _summary(name: str, rows: list[dict[str, Any]], unplaced: list[dict[str, Any]]) -> str:
    c = _counts(rows)
    parts = [f"{name}: {c['this_plot']} on this plot, {c['grown_before']} grown before, {c['example']} examples"]
    if c["avoid"]:
        parts.append(f"{c['avoid']} to keep apart")
    if unplaced:
        parts.append(f"{len(unplaced)} not placed")
    return "; ".join(parts) + "."
