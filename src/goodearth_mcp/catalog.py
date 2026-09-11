"""Assemble regional catalogues of what lives on a piece of ground.

The domain layer over ``biota``: it decides what may honestly be shown, and
nothing about billing or transport.

This exists to retire three hand-written lists. A roster in a source file is
its author's taste presented as a place — six cut flowers because someone
typed six, twenty-two animals because someone stopped there. These catalogues
are observations of the region the patron drew, so a lakeshore in Vermont and
an orchard in Georgia get different answers without anyone editing anything.

What it still does NOT do is publish natural history. iNaturalist says a
barred owl is seen here; it does not say when the owl nests on this farm.
The species come from the record and the threshold stays the grower's, which
is the same division the pest and wildlife models already used.
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import biota, roster
from goodearth_mcp.region import Region

# Which groups the wildlife catalogue asks about.
#
# This said it was "a rendering choice, not a species list". It is not: the
# loop below issues one iNaturalist query per entry, so this tuple decides
# what can be catalogued at all, and anything absent from it is absent from
# the page. Naming that is the difference between a caption and a contract.
#
# Insects and spiders are NOT here on purpose — they belong to the pest
# catalogue, which is where a grower goes looking for them.
WILDLIFE_GROUPS: tuple[tuple[str, str, str], ...] = (
    ("Aves", "Birds", "🐦"),
    ("Mammalia", "Mammals", "🦌"),
    ("Amphibia", "Amphibians", "🐸"),
    ("Reptilia", "Reptiles", "🐍"),
    # Mushrooms are a thing growers watch, and the pathogens are the same
    # kingdom. 780 species are recorded around one Vermont farm.
    ("Fungi", "Fungi", "🍄"),
)

# Spiders sit beside the insects wherever this app asks about either, because
# that is where a grower meets them — a scout walking rows is looking at both.
# The pairing is expressed once, in KINGDOMS below.

# Fauna is a landscape fact, not a field one.
#
# Every other tool here answers about the drawn ground and nothing outside it,
# because heat and frost genuinely differ across a fence line. Species do not
# work that way, and neither do the people recording them: a nine-hectare
# hayfield contains almost no iNaturalist observations, so asking its own
# bounding box returned 34 birds and NO amphibians at all, while the
# surrounding country holds barred owl, coyote and three species of bat.
#
# So biodiversity queries are padded to a neighbourhood, and the answer says
# how wide it looked. Reporting a silently different footprint as if it were
# the farm would be the dishonest version of this.
SEARCH_MIN_HALF_SPAN_M = 8_000
_M_PER_DEG_LAT = 111_320.0


def search_box(region: Region) -> tuple[float, float, float, float]:
    """The region's bbox, widened to a neighbourhood if it is smaller."""
    import math

    min_lat, min_lon, max_lat, max_lon = region.bbox
    mid_lat = (min_lat + max_lat) / 2.0
    d_lat = SEARCH_MIN_HALF_SPAN_M / _M_PER_DEG_LAT
    d_lon = SEARCH_MIN_HALF_SPAN_M / max(
        _M_PER_DEG_LAT * math.cos(math.radians(mid_lat)), 1.0
    )
    mid_lon = (min_lon + max_lon) / 2.0
    return (
        min(min_lat, mid_lat - d_lat),
        min(min_lon, mid_lon - d_lon),
        max(max_lat, mid_lat + d_lat),
        max(max_lon, mid_lon + d_lon),
    )


def _search_km(box: tuple[float, float, float, float]) -> float:
    return round((box[2] - box[0]) * _M_PER_DEG_LAT / 1000.0, 1)

# The capabilities document is 2.3 MB and the encoding of a layer is a
# property of the layer rather than of anyone's farm, so both are held for
# the life of the process. A cold start pays for them once.
_ROSTER_TTL_S = 6 * 60 * 60
_roster: tuple[float, list[str]] | None = None
_encoding: dict[tuple[str, int], str] = {}
# The NPN species list is 1,940 rows and changes between seasons, not between
# requests. Held so that marking which species have habits costs one call for
# the whole catalogue rather than one per animal.
_npn_index: tuple[float, dict[str, Any]] | None = None


class CatalogError(ValueError):
    """The catalogue cannot be built as asked."""


async def _models() -> list[str]:
    global _roster
    now = time.monotonic()
    if _roster and now - _roster[0] < _ROSTER_TTL_S:
        return _roster[1]
    models = await biota.fetch_npn_models()
    _roster = (now, models)
    return models


async def _encoding_of(layer: str, year: int) -> str:
    key = (layer, year)
    if key not in _encoding:
        _encoding[key] = await biota.classify_npn_layer(layer)
    return _encoding[key]


async def region_pest_catalog(region: Region, today: date | None = None) -> dict[str, Any]:
    """Pest stages modelled for this ground, plus the insects recorded on it.

    Only layers measured to encode a day of year become dated events. A layer
    carrying accumulated heat or a risk class is counted and named as
    unreadable rather than rendered — winter_wheat reads 281 here, which is a
    convincing 8 October and is actually a heat sum.
    """
    today = today or datetime.now(UTC).date()
    lat, lon = region.centroid.lat, region.centroid.lon

    models = await _models()
    kinds = await asyncio.gather(*(_encoding_of(m, today.year) for m in models))
    datable = [m for m, k in zip(models, kinds, strict=True) if k == biota.DAY_OF_YEAR]

    # Only the datable layers are worth a per-region probe; the rest could not
    # be shown whatever they answered.
    values = await asyncio.gather(*(biota.fetch_npn_point(m, lat, lon) for m in datable))

    events: list[dict[str, Any]] = []
    for layer, value in zip(datable, values, strict=True):
        if value is None:
            continue
        when = biota.npn_event_date(int(value), today.year)
        if when is None:
            continue
        creature, stage = roster.split_stage(_humanise(layer))
        events.append({
            "model": layer,
            "name": _humanise(layer),
            # The two halves, so a caller adding one to a record puts the
            # ANIMAL in the field that asks for an animal.
            "pest": creature,
            "stage": stage,
            "date": when,
            "passed": when < today.isoformat(),
            "source": "USA-NPN Pheno Forecast",
            "resolution_m": biota.NPN_RESOLUTION_M,
        })
    events.sort(key=lambda e: e["date"])

    # The species recorded nearby used to be swept here — every insect, in one
    # breath. That is `nearby_species` now: 3,542 insects and spiders around
    # one block is a search box's job, not a field on a forecast.
    box = search_box(region)
    return {
        "success": True,
        "region": region.describe(),
        "events": events,
        "search_span_km": _search_km(box),
        "models_published": len(models),
        "models_unreadable": len(models) - len(datable),
        "note": (
            f"{len(events)} of {len(models)} published models resolve to a date on this "
            "ground. The rest carry accumulated heat or a risk class rather than a day, "
            "or have no raster this season, and are not shown rather than guessed at."
        ),
        "sources": _sources(),
    }


async def _species_index() -> dict[str, Any]:
    global _npn_index
    now = time.monotonic()
    if _npn_index and now - _npn_index[0] < _ROSTER_TTL_S:
        return _npn_index[1]
    try:
        index = await biota.fetch_npn_species_index()
    except biota.BiotaError:
        return {}
    _npn_index = (now, index)
    return index


async def region_species_habits(scientific_name: str, today: date | None = None) -> dict[str, Any]:
    """What USA-NPN tracks this animal visibly doing in a year.

    Nest building, nestlings, fledged young, calls or song, emergence above
    ground — published phenophases, not habits written here. A species NPN
    does not track returns an empty list and says so, because "we have no
    data on this bat" and "this bat does nothing" are different claims.
    """
    today = today or datetime.now(UTC).date()
    index = await _species_index()
    entry = index.get(scientific_name.strip().lower())
    if not entry:
        return {
            "success": True,
            "scientific_name": scientific_name,
            "habits": [],
            "tracked": False,
            "note": "USA-NPN does not track this species, so Good Earth has nothing to show for it.",
            "sources": _sources(),
        }
    habits = drop_mortality(
        await biota.fetch_species_habits(int(entry["species_id"]), today.isoformat())
    )
    return {
        "success": True,
        "scientific_name": scientific_name,
        "common_name": entry.get("common_name"),
        "habits": habits,
        "tracked": True,
        "mortality_omitted": True,
        "note": (
            "Phenophases USA-NPN tracks for this species. They name what to watch for; "
            "when each arrives on your ground is the threshold you set."
        ),
        "sources": _sources(),
    }
async def _attach_habit_events(
    groups: list[dict[str, Any]], index: dict[str, Any], on: date,
) -> None:
    """Add each species' known phenophases, in place.

    One upstream call per species, gathered rather than serialised. A species
    whose call fails gets no `habit_events` key at all rather than an empty
    list, because "we could not ask" and "NPN tracks nothing for it" are
    different claims and only one of them is about the animal.
    """
    wanted = [
        s for g in groups for s in g["species"]
        if s.get("has_habits") and (s.get("scientific_name") or "").lower() in index
    ]
    if not wanted:
        return

    got = await asyncio.gather(
        *(biota.fetch_species_habits(
            int(index[(s["scientific_name"] or "").lower()]["species_id"]), on.isoformat())
          for s in wanted),
        return_exceptions=True,
    )
    for s, habits in zip(wanted, got, strict=True):
        if isinstance(habits, BaseException):
            continue
        s["habit_events"] = drop_mortality(habits)


async def region_wildlife_catalog(
    region: Region, *, with_events: bool = False, today: date | None = None,
) -> dict[str, Any]:
    """Which animals are actually recorded on this ground, by group.

    Ordered by how often each has been observed. That ordering is a fact
    about observers as much as about animals — a roadside is better recorded
    than a back field — so the counts travel with the answer.

    ``with_events`` adds ``habit_events`` to every species that has them: the
    phenophases USA-NPN tracks for it, in NPN's words. Off by default because
    it costs one upstream call PER SPECIES, and most callers want the list.

    It exists because an agent asked to record what a farm watches for will
    otherwise invent the labels — which is exactly what `review_roster` warns
    about for pests, and it happened here on 2026-09-04: rows arrived reading
    "rut onset" and "southbound flights", words this service has never used.
    Publishing the vocabulary lets a caller choose from what is known instead
    of from what it remembers.

    **The event name is not load-bearing.** Nothing resolves it — a wildlife
    row is dated by its DRIVER, and the label is the grower's own words. So
    this is a courtesy to a caller looking for the right word, never a list of
    the only acceptable ones. "Big Night crossing" is a real thing a
    salamander does and no catalogue will ever contain it.
    """
    box = search_box(region)
    results = await asyncio.gather(
        *(biota.fetch_inat_species(box, taxon)
          for taxon, _, _ in WILDLIFE_GROUPS),
        return_exceptions=True,
    )

    # One call marks every species that has life-cycle data, so the page can
    # show which are worth asking about without asking about all 124.
    index = await _species_index()

    groups: list[dict[str, Any]] = []
    missing: list[str] = []
    for (taxon, label, icon), answer in zip(WILDLIFE_GROUPS, results, strict=True):
        if isinstance(answer, BaseException):
            missing.append(label)
            continue
        rows, total = answer
        groups.append({
            "group": label,
            "taxon": taxon,
            "emoji": icon,
            # What the feed says is there, beside what came back. They are the
            # same number now; they were 40 and 253 before, and only one of
            # them was on screen.
            "recorded": total,
            "species": [
                {
                    **r,
                    "emoji": icon,
                    "has_habits": (r.get("scientific_name") or "").lower() in index,
                }
                for r in rows
            ],
        })

    if with_events:
        await _attach_habit_events(groups, index, today or datetime.now(UTC).date())

    return {
        "success": True,
        "region": region.describe(),
        "groups": groups,
        "species_total": sum(len(g["species"]) for g in groups),
        "with_habits": sum(1 for g in groups for s in g["species"] if s["has_habits"]),
        "search_span_km": _search_km(box),
        "unavailable": missing,
        "note": (
            f"Recorded within about {_search_km(box)} km — species are a landscape fact "
            "and one field holds almost no records. Ranked by how often each has been "
            "seen, which measures where people walk as well as where animals live. Good "
            "Earth times an event you set; it does not publish natural history."
        ),
        "sources": _sources(),
    }


def drop_mortality(habits: list[str]) -> list[str]:
    """Leave out the phenophases that record a death.

    USA-NPN tracks "Dead individuals" and "Dead nestlings or fledglings"
    because a research network needs mortality. This is a calendar of things
    to look forward to on a farm, and an entry offering to time the death of
    the robins is not that.

    Filtered rather than hidden: the count of what was left out travels with
    the answer, so the list is short for a stated reason.
    """
    return [h for h in habits if not h.lower().startswith("dead")]


def _humanise(layer: str) -> str:
    """A layer name as a person would say it."""
    words = layer.replace("_", " ").split()
    expanded = {"eab": "emerald ash borer", "slf": "spotted lanternfly", "alb": "asian longhorned beetle"}
    out = [expanded.get(w, w) for w in words]
    text = " ".join(out)
    return text[:1].upper() + text[1:]


def _sources() -> list[dict[str, Any]]:
    return [
        {"name": "iNaturalist", "role": "species recorded in this region", "resolution_m": None},
        {"name": "USA-NPN Pheno Forecast", "role": "degree-day pest models",
         "resolution_m": biota.NPN_RESOLUTION_M},
    ]


async def resolve_referenced_models(
    region: Region, pests: list[dict[str, Any]], today: date | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Dates for the pests that reference a published model instead of stating one.

    Returns ``(events, unresolved)``. An event is the same shape the pest
    catalog already publishes — name, date, source, resolution — because it IS
    that: the caller asked for the published forecast for their own ground, and
    this is that forecast, cited.

    Names are matched with the roster's own comparison, which already knows a
    grower's "Japanese beetle" and a layer's "japanese beetle adult" are the
    same animal. A pest that names a model but finds no layer for this ground
    comes back in ``unresolved`` rather than vanishing: "NPN publishes nothing
    for this here" is an answer, and a silent omission is not.
    """
    # NPN's own references, and no others. A row naming a WETNESS model is not
    # a row this function failed to resolve — it is one that was never asked
    # here, and reporting "NPN publishes no dated layer for botrytis" would be
    # a true sentence about the wrong question.
    wanted = [
        p for p in pests
        if str(p.get("model") or "").strip().lower() == "usa-npn" and not p.get("stages")
    ]
    if not wanted:
        return [], []

    catalog = await region_pest_catalog(region, today=today)
    published = catalog.get("events") or []

    events: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    for p in wanted:
        name = str(p.get("pest") or "")
        hits = [e for e in published if roster._matches(name, {roster.norm(e["name"])})]
        if not hits:
            unresolved.append({
                "pest": name,
                "reason": (
                    f"{p['model']} publishes no dated layer for this ground — "
                    "the model is on your list, but it has nothing to say here yet"
                ),
            })
            continue
        for e in hits:
            events.append({**e, "pest": name, "via": p["model"]})
    events.sort(key=lambda e: e["date"])
    return events, unresolved


async def species_phenophases(
    names: list[str], today: date | None = None,
) -> list[dict[str, Any]]:
    """The phenophases USA-NPN tracks for each of these plants, by name.

    The Spring Index dates ONE leaf-out and ONE bloom for a whole block,
    because it is computed from cloned lilac and honeysuckle standing in for
    spring itself. That is the right instrument for "is spring early here" and
    the wrong one for an orchard: a birch and an oak on the same acre do not
    shed in the same week. This is the per-species half — what each plant is
    tracked doing, in NPN's own words, so a grower knows what to watch for and
    sets the date themselves.

    Names come off the saved planting, put there by the crop preset and
    resolved once by `scripts/resolve_species.py`. A plant NPN does not track
    comes back with `tracked: false` and no list, which is not the same claim
    as an empty one.
    """
    today = today or datetime.now(UTC).date()
    wanted = list(dict.fromkeys(n.strip() for n in names if (n or "").strip()))
    if not wanted:
        return []

    index = await _species_index()
    entries = [index.get(n.lower()) for n in wanted]
    askable = [(n, e) for n, e in zip(wanted, entries, strict=True) if e]

    got = await asyncio.gather(
        *(biota.fetch_species_habits(int(e["species_id"]), today.isoformat())
          for _, e in askable),
        return_exceptions=True,
    )
    habits = dict(zip((n for n, _ in askable), got, strict=True))

    out: list[dict[str, Any]] = []
    for name, entry in zip(wanted, entries, strict=True):
        if entry is None:
            out.append({"scientific_name": name, "tracked": False})
            continue
        h = habits.get(name)
        row: dict[str, Any] = {
            "scientific_name": name,
            "common_name": entry.get("common_name"),
            "tracked": True,
        }
        # A failed call is not an absence. Saying "no phenophases" because the
        # network dropped would be the same fault as reporting a cold vault
        # read as "never authorized".
        if isinstance(h, BaseException):
            row["unreadable"] = True
        else:
            row["habits"] = drop_mortality(h or [])
        out.append(row)
    return out


# ── Discovery: search what is recorded nearby, a page at a time ──────────
#
# The catalogues above answer "what is here" in one breath, which was fine
# while the answer was forty things and wrong once it was all of them: 2,196
# insect species around one Vermont block is eleven round trips to build a wall
# nobody reads. This is the other shape — a search box and a page — and it is
# the same shape for every kingdom, so the three choosers in the app can stop
# being three different things.

#: What a grower is looking for, in the terms iNaturalist files it under.
#: Comma-joined, which the feed accepts: `Insecta,Arachnida` returns 2,386
#: where the two asked separately return 2,196 and 190, so one query pages
#: correctly across the pair instead of interleaving two.
KINGDOMS: dict[str, tuple[str, str]] = {
    # Spiders sit with the insects because that is where a grower meets them.
    "insects": ("Insecta,Arachnida", "insects and spiders"),
    "plants": ("Plantae", "plants"),
    # Fauna a grower would name: birds, mammals, amphibians, reptiles. Insects
    # have their own kingdom above rather than being buried in this one.
    "wildlife": ("Aves,Mammalia,Amphibia,Reptilia", "wildlife"),
    "fungi": ("Fungi", "fungi"),
}

#: One screen of results. Small on purpose: a grower reads twenty and searches
#: again, which is faster than scrolling two thousand.
PAGE_SIZE = 20


async def region_nearby_species(
    region: Region, kingdom: str, q: str = "", page: int = 1,
    with_lifecycle: bool = False,
) -> dict[str, Any]:
    """One page of what is recorded near this ground, narrowed by a search.

    The count travels with every page, so "20 of 2,196" is on screen and the
    grower knows what they are looking at a slice of. That is the whole point:
    the old answer showed forty and said nothing.

    Ordered by how often each has been observed, which measures observers as
    much as organisms — a roadside is better recorded than a back hayfield.
    """
    key = (kingdom or "").strip().lower()
    if key not in KINGDOMS:
        raise CatalogError(
            f"{kingdom!r} is not something to look for. Ask for one of: "
            + ", ".join(sorted(KINGDOMS))
        )
    taxa, plain = KINGDOMS[key]
    page = max(1, int(page or 1))

    box = search_box(region)
    index = await _species_index()

    def mark(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Which of these USA-NPN tracks a life cycle for.

        The signal that made the old grouped catalogue worth tapping — "there
        is a year to see here" — and it costs one cached index read rather than
        a call per row.
        """
        for row in rows:
            row["has_habits"] = (row.get("scientific_name") or "").lower() in index
        return rows

    try:
        if with_lifecycle:
            # Filtering has to see EVERYTHING before it can page.
            #
            # Thirty-nine of the 2,416 insects recorded around one Vermont
            # block have a published life cycle. Filtering the twenty rows in
            # hand would answer "one of the twenty on this page", which is the
            # page size standing in for the total all over again — and finding
            # those thirty-nine by turning 121 pages is not finding them.
            #
            # It costs a full scan. That was fifteen seconds while the pages
            # were fetched one after another and is about four now they are
            # not; see `fetch_inat_species`.
            everything, _ = await biota.fetch_inat_species(box, taxa, q=q)
            kept = [r for r in mark(everything) if r["has_habits"]]
            total = len(kept)
            start = (page - 1) * PAGE_SIZE
            rows = kept[start : start + PAGE_SIZE]
        else:
            rows, total = await biota.fetch_inat_species(
                box, taxa, limit=PAGE_SIZE, q=q, page=page)
            mark(rows)
    except biota.BiotaError as exc:
        raise CatalogError(f"iNaturalist did not answer: {exc}") from exc

    pages = max(1, -(-total // PAGE_SIZE))
    return {
        "success": True,
        "region": region.describe(),
        "kingdom": key,
        "looking_for": plain,
        "search": q.strip(),
        # So a caller knows the total it was handed counts only the filtered
        # ones, rather than everything recorded here.
        "with_lifecycle": bool(with_lifecycle),
        "items": rows,
        "with_habits": sum(1 for r in rows if r["has_habits"]),
        "total": total,
        "page": page,
        "pages": pages,
        "page_size": PAGE_SIZE,
        "search_span_km": _search_km(box),
        "note": (
            f"{total} {plain} recorded near this ground"
            + (f' matching "{q.strip()}"' if q.strip() else "")
            + f". Showing page {page} of {pages}, most-observed first — a count "
            "that measures observers as much as organisms, since a roadside is "
            "better recorded than a back hayfield. iNaturalist does not say "
            "which of these is a pest, a weed or worth planting."
        ),
        "sources": _sources(),
    }
