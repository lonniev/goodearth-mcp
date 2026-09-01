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

from goodearth_mcp import biota
from goodearth_mcp.region import Region

# Groups offered for the wildlife catalogue. This maps a taxon to an icon —
# a rendering choice, not a species list; the species inside each come from
# the feed.
WILDLIFE_GROUPS: tuple[tuple[str, str, str], ...] = (
    ("Aves", "Birds", "🐦"),
    ("Mammalia", "Mammals", "🦌"),
    ("Amphibia", "Amphibians", "🐸"),
    ("Reptilia", "Reptiles", "🐍"),
)

MAX_PER_GROUP = 40

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
        events.append({
            "model": layer,
            "name": _humanise(layer),
            "date": when,
            "passed": when < today.isoformat(),
            "source": "USA-NPN Pheno Forecast",
            "resolution_m": biota.NPN_RESOLUTION_M,
        })
    events.sort(key=lambda e: e["date"])

    box = search_box(region)
    try:
        insects = await biota.fetch_inat_species(box, "Insecta", MAX_PER_GROUP)
    except biota.BiotaError:
        insects = []

    return {
        "success": True,
        "region": region.describe(),
        "events": events,
        "insects_recorded": insects,
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


async def region_wildlife_catalog(region: Region) -> dict[str, Any]:
    """Which animals are actually recorded on this ground, by group.

    Ordered by how often each has been observed. That ordering is a fact
    about observers as much as about animals — a roadside is better recorded
    than a back field — so the counts travel with the answer.
    """
    box = search_box(region)
    results = await asyncio.gather(
        *(biota.fetch_inat_species(box, taxon, MAX_PER_GROUP)
          for taxon, _, _ in WILDLIFE_GROUPS),
        return_exceptions=True,
    )

    groups: list[dict[str, Any]] = []
    missing: list[str] = []
    for (taxon, label, icon), rows in zip(WILDLIFE_GROUPS, results, strict=True):
        if isinstance(rows, BaseException):
            missing.append(label)
            continue
        groups.append({
            "group": label,
            "taxon": taxon,
            "emoji": icon,
            "species": [{**r, "emoji": icon} for r in rows],
        })

    return {
        "success": True,
        "region": region.describe(),
        "groups": groups,
        "species_total": sum(len(g["species"]) for g in groups),
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
