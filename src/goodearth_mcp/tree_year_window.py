"""Assemble the tree year — spring dated for this block, and the sap run.

Two sources, and only one of them is a fetch a grower pays for twice: the
Spring Index is four point queries against USA-NPN, and the sap run is read
off the season record `crop_gdd_status` has already cached.

The sap section appears only when the block has something worth tapping on it.
The freeze-and-thaw count is just as true for a block of apples, and reporting
it there would be answering a question nobody on that ground asked.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import biota, catalog, gdd, record_cache, sources, tree_year
from goodearth_mcp.region import Region


class TreeYearError(ValueError):
    """The request cannot be answered as asked."""


async def region_tree_year(
    region: Region,
    plants: Any = None,
    today: date | None = None,
) -> dict[str, Any]:
    """When spring reached this block, and what the sap did."""
    today = today or datetime.now(UTC).date()

    rows = [p for p in (plants if isinstance(plants, list) else []) if isinstance(p, dict)]
    names = [
        str(p.get("crop") or p.get("tree") or p.get("name") or "") for p in rows
    ]
    tapped = tree_year.taps([n for n in names if n])

    # The binomial the crop preset carried in, which is the only key USA-NPN
    # answers to — it has no row for "Maple · sugar". Rows without one are
    # plants a grower typed themselves, and they simply get no species section.
    binomials = [str(p.get("scientific_name") or "") for p in rows]
    labelled = {b: n for b, n in zip(binomials, names, strict=True) if b}

    # The season read is the ledger's own cache key. The Spring Index is four
    # point queries. Neither can be allowed to cost the other: NPN goes out of
    # season and answers with an exception document, and a block still wants
    # its sap run when that happens.
    index, record, per_species = await asyncio.gather(
        biota.fetch_spring_index(region.centroid.lat, region.centroid.lon),
        record_cache.daily_history(
            [region.centroid.lat], [region.centroid.lon],
            gdd.season_start(today).isoformat(), today.isoformat(),
        ),
        catalog.species_phenophases(list(labelled), today),
        return_exceptions=True,
    )

    spring: dict[str, Any] | None = None
    note = "The spring index could not be read for this ground."
    if not isinstance(index, BaseException):
        spring = tree_year.spring(index, today.year)
        note = tree_year.spring_note(spring)

    sap: dict[str, Any] | None = None
    sap_error: str | None = None
    if isinstance(record, BaseException) or not record:
        sap_error = "The season record for this ground could not be read."
    elif tapped:
        try:
            dates, tmax, tmin = sources.daily_series(record[0])
            sap = tree_year.sap_run(dates, tmax, tmin, today)
        except (sources.UpstreamError, IndexError, ValueError) as exc:
            sap_error = f"The season record is unreadable: {exc}"

    # Nothing to say is not an answer worth charging for. `paid_tool` debits
    # before the body and rolls back only on an exception, so a hollow success
    # here would take the fare and hand back four nulls.
    species: list[dict[str, Any]] = []
    if not isinstance(per_species, BaseException):
        # The grower's own word for the plant travels beside the binomial. They
        # saved "Maple · sugar"; being answered about Acer saccharum alone
        # would make them match the two up by eye.
        species = [{**s, "crop": labelled.get(s["scientific_name"], "")}
                   for s in per_species]

    if spring is None and sap is None:
        raise TreeYearError(
            sap_error or "Neither the spring index nor a sap run could be read "
            "for this ground."
        )

    return {
        "success": True,
        "as_of": today.isoformat(),
        "region": region.describe(),
        "spring": spring,
        "summary": note,
        # Named rather than merely counted: a sugarmaker with a stand of sugar
        # maple and a few paper birch taps them on different weeks.
        "tapped": tapped,
        "sap": sap,
        # The Spring Index dates one leaf-out for the whole block. This says
        # what EACH tree is tracked doing, which is where pollen release and
        # leaf colour actually live — they are per-species and the index has
        # no opinion on them.
        "species": species,
        **({"sap_error": sap_error} if sap_error else {}),
        "note": (
            "First leaf and first bloom are USA-NPN's Spring Index, dated for "
            "this block against its own thirty-year normal. First bloom is "
            "also when the pollen starts, which is what bloom is rather than a "
            "pollen forecast — Good Earth has no pollen feed. The sap run is "
            "freeze and thaw counted off this ground's own record. The species "
            "list is what USA-NPN tracks each of your trees doing, in NPN's "
            "words — pollen release and leaf colour are per-species, and the "
            "index has no opinion on them. They name what to watch for; when "
            "each one arrives on your ground is yours to record."
        ),
        "sources": [
            {"name": "USA-NPN Spring Index (SI-x)", "role": "first leaf and bloom"},
            *([{"name": "USA-NPN species phenophases",
                "role": "what each tree is tracked doing through a year"}]
              if species else []),
            *([{**sources.feed_of(record), "role": "sap run"}]
              if not isinstance(record, BaseException) and record else []),
        ],
    }
