"""Living-world feeds. Pure I/O — no billing, no npubs, no domain judgement.

The peer of ``sources.py``: that module answers what the weather did here,
this one answers what lives here. Same discipline — every function records
the feed it came from, and none of them decides what the answer means.

The point of this module is that Good Earth must not ship a list of species
someone at a keyboard thought were interesting. A hand-written roster is the
author's taste standing in for a place; these feeds are observations of the
ground the patron actually drew.

Sources (all free, no API key):
  - iNaturalist   — species observed in a bounding box, with counts
  - GBIF          — the same question against a larger record
  - USA-NPN       — degree-day phenology models, as dated national rasters

None of them is authoritative about a farm. Observation counts measure where
people walk as much as where species live: a roadside is better recorded than
a back field. Counts travel with the answer so a reader can see that.
"""

from __future__ import annotations

import asyncio
import re
from datetime import date, timedelta
from typing import Any

import httpx

_INAT = "https://api.inaturalist.org/v1/observations/species_counts"
_GBIF = "https://api.gbif.org/v1/occurrence/search"
_NPN_WMS = "https://geoserver.usanpn.org/geoserver/wms"
_NPN_PORTAL = "https://services.usanpn.org/npn_portal"

_TIMEOUT = 45.0

# What each feed can honestly say it resolves. iNaturalist and GBIF are point
# observations, not a grid, so a bounding box is the unit. USA-NPN's
# phenology rasters are built on PRISM.
NPN_RESOLUTION_M = 4_000


class BiotaError(RuntimeError):
    """A living-world feed failed or answered in a shape we don't recognise."""


async def _json(client: httpx.AsyncClient, url: str, params: dict[str, Any]) -> Any:
    try:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        raise BiotaError(f"{url} returned HTTP {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise BiotaError(f"{url} unreachable: {exc}") from exc
    except ValueError as exc:
        raise BiotaError(f"{url} returned malformed JSON") from exc


# ── Observed species ─────────────────────────────────────────────────────


async def fetch_inat_species(
    bbox: tuple[float, float, float, float],
    iconic_taxa: str,
    limit: int = 30,
) -> list[dict[str, Any]]:
    """Species observed inside ``bbox`` (min_lat, min_lon, max_lat, max_lon).

    Ordered by observation count, which is what makes this regional rather
    than a catalogue: the answer for a Vermont lakeshore is not the answer
    for a Georgia orchard.
    """
    min_lat, min_lon, max_lat, max_lon = bbox
    params = {
        "swlat": f"{min_lat:.5f}", "swlng": f"{min_lon:.5f}",
        "nelat": f"{max_lat:.5f}", "nelng": f"{max_lon:.5f}",
        "iconic_taxa": iconic_taxa,
        "per_page": max(1, min(limit, 200)),
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _json(client, _INAT, params)

    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        raise BiotaError("iNaturalist returned an unexpected shape")

    out: list[dict[str, Any]] = []
    for row in results:
        taxon = row.get("taxon") if isinstance(row, dict) else None
        if not isinstance(taxon, dict):
            continue
        name = taxon.get("preferred_common_name") or taxon.get("name")
        if not name:
            continue
        # The taxon's own photograph, rather than one icon standing in for a
        # whole class. An emoji table would be another hand-written list, and
        # a barred owl and a chickadee are not the same bird.
        photo = taxon.get("default_photo") or {}
        out.append({
            "name": str(name),
            "scientific_name": taxon.get("name"),
            "observations": int(row.get("count") or 0),
            "taxon_id": taxon.get("id"),
            "rank": taxon.get("rank"),
            "photo": photo.get("square_url") or photo.get("url"),
            # These images are Creative Commons. Carrying the credit is the
            # condition of using them, so it travels with the photo or the
            # photo does not go.
            "photo_by": photo.get("attribution"),
            "photo_licence": photo.get("license_code"),
            "source": "iNaturalist",
        })
    return out


async def fetch_gbif_occurrences(
    bbox: tuple[float, float, float, float],
    class_key: int | None = None,
    kingdom_key: int | None = None,
) -> int:
    """How many records GBIF holds for ``bbox`` — a corroborating count.

    Used to say how well observed a place is, never to name a species: a
    thin iNaturalist list over a thick GBIF record means people have looked
    but not with this app's audience.
    """
    min_lat, min_lon, max_lat, max_lon = bbox
    params: dict[str, Any] = {
        "decimalLatitude": f"{min_lat},{max_lat}",
        "decimalLongitude": f"{min_lon},{max_lon}",
        "limit": 0,
    }
    if class_key is not None:
        params["classKey"] = class_key
    if kingdom_key is not None:
        params["kingdomKey"] = kingdom_key
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _json(client, _GBIF, params)
    count = data.get("count") if isinstance(data, dict) else None
    if not isinstance(count, int):
        raise BiotaError("GBIF returned an unexpected shape")
    return count


# ── USA-NPN phenology models ─────────────────────────────────────────────
#
# The roster is READ FROM THE SERVICE, not written here. NPN adds and retires
# models between seasons, and a list in this file would be another author's
# snapshot pretending to be the world — the thing this module exists to stop.

# Layers that are the degree-day surface itself rather than a species model.
_NPN_UTILITY = re.compile(r"^(agdd|30yr_avg)")


async def fetch_npn_models() -> list[str]:
    """Every species phenology model USA-NPN currently publishes.

    Parsed from the WMS capabilities document, so a model NPN adds next
    season appears without anyone editing this repo.
    """
    params = {"service": "WMS", "version": "1.3.0", "request": "GetCapabilities"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            resp = await client.get(_NPN_WMS, params=params)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise BiotaError(f"USA-NPN capabilities unreachable: {exc}") from exc

    names = sorted({
        n[4:] for n in re.findall(r"<Name>([^<]+)</Name>", resp.text)
        if n.startswith("gdd:")
    })
    return [n for n in names if not _NPN_UTILITY.match(n)]


def npn_event_date(doy: int, year: int) -> str | None:
    """A model's pixel value as a calendar date.

    The rasters encode the **day of year the modelled stage is reached**,
    which was established by reading one model across latitude rather than
    from documentation: japanese_beetle_adult returns 113 in Georgia, 149 in
    Virginia, 191 in Vermont and 211 in northern Maine — south to north, and
    biologically right for adult emergence.

    Out-of-range values are the raster's nodata, not a date in December.
    """
    if not 1 <= doy <= 366:
        return None
    return (date(year, 1, 1) + timedelta(days=doy - 1)).isoformat()


async def fetch_npn_point(layer: str, lat: float, lon: float) -> float | None:
    """One phenology model's value at one point, or None where it has none.

    Queried without a TIME, which the service resolves to its own default of
    today — the current season's run. A model out of season simply has no
    raster and answers with an exception document; that is an absence, not a
    failure, and it returns None.
    """
    d = 0.02
    bbox = f"{lon - d},{lat - d},{lon + d},{lat + d}"
    # An unqualified name is a pest model, which is the common case and the
    # only one this took when it was written. A name that names its own
    # workspace is passed through — the spring indices live in `si-x:`.
    qualified = layer if ":" in layer else f"gdd:{layer}"
    params = {
        "service": "WMS", "version": "1.1.1", "request": "GetFeatureInfo",
        "layers": qualified, "query_layers": qualified,
        "srs": "EPSG:4326", "bbox": bbox,
        "width": "101", "height": "101", "x": "50", "y": "50",
        "info_format": "application/json",
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            resp = await client.get(_NPN_WMS, params=params)
            resp.raise_for_status()
        except httpx.HTTPError:
            return None
        try:
            data = resp.json()
        except ValueError:
            # An out-of-season layer answers with an XML exception document.
            return None

    features = data.get("features") if isinstance(data, dict) else None
    if not isinstance(features, list) or not features:
        return None
    props = features[0].get("properties") if isinstance(features[0], dict) else None
    if not isinstance(props, dict) or not props:
        return None
    value = next(iter(props.values()))
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ── The Spring Index ─────────────────────────────────────────────────────
#
# USA-NPN's SI-x models the arrival of spring from the accumulated warmth a
# set of calibration plants respond to — cloned lilac and honeysuckle, grown
# identically across the continent so the index means the same thing in
# Georgia and in Maine. Two moments are published as rasters: FIRST LEAF, when
# the growing season starts, and FIRST BLOOM, when it begins to flower.
#
# Both are dated FOR A POINT, which is the whole reason they are worth
# fetching: "spring is early this year" is a headline, and "leaf-out reached
# this block on 11 April, seven days before its thirty-year normal" is an
# answer.
#
# Measured at Macon GA, Caribou ME and Panton VT on 2026-09-04:
#
#   average_leaf_best     26   112   101      rises north -> day of year
#   average_bloom_best    58   144   139      rises north -> day of year
#   30yr_avg_six_leaf     35   123   108      the normal, same encoding
#   30yr_avg_six_bloom    65   149   135
#
# `_best` is NPN's own blend of observed and forecast, which is the product
# they intend a reader to use. The `_ncep` and `_prism` variants are the two
# inputs, and picking one over the blend would be this repo second-guessing
# the people who built the model.
#
# NPN also publishes leaf_anomaly and bloom_anomaly. Those are NOT used: they
# disagreed with subtracting the 30-year layer from the current one (-1 where
# the subtraction gives -7 at Panton), which means they are computed against
# some other baseline. One transparent subtraction a reader can check beats a
# second number this code cannot explain.

SPRING_LAYERS = {
    "first_leaf": "si-x:average_leaf_best",
    "first_bloom": "si-x:average_bloom_best",
    "normal_leaf": "si-x:30yr_avg_six_leaf",
    "normal_bloom": "si-x:30yr_avg_six_bloom",
}


async def fetch_spring_index(lat: float, lon: float) -> dict[str, float | None]:
    """First leaf and first bloom at one point, this year and normally.

    Four point queries, gathered rather than serialised. Each returns None on
    its own where the layer has no value — a coastal pixel, or a season the
    run has not reached — and an absent half is reported as absent rather
    than costing the other three.
    """
    keys = list(SPRING_LAYERS)
    values = await asyncio.gather(
        *(fetch_npn_point(SPRING_LAYERS[k], lat, lon) for k in keys),
        return_exceptions=True,
    )
    return {
        k: (v if isinstance(v, (int, float)) else None)
        for k, v in zip(keys, values, strict=True)
    }


# ── What a layer's number MEANS ──────────────────────────────────────────
#
# USA-NPN serves at least three encodings from one namespace, and nothing in
# the capabilities document distinguishes them. Reading one model across
# latitude is what established it:
#
#   japanese_beetle_adult   113  149  191  211   rises north -> day of year
#   asian_longhorned_beetle 2066 1291  536  320  falls north -> accumulated GDD
#   monilinia                  1    0    3    1  small, flat -> a risk class
#
# The danger is not the obvious 2066. It is winter_wheat, which reads 281 in
# Vermont — a perfectly plausible 8 October — and is accumulated heat. At one
# point a wrong reading inside 1..366 is indistinguishable from a right one,
# so the encoding must be measured, never eyeballed from the local value.

# Far apart in latitude, and fixed: the classification is a property of the
# LAYER, not of the patron's ground, so this costs two calls per layer once
# for everyone rather than two per region per request.
_REF_SOUTH = (32.84, -83.63)   # Macon, Georgia
_REF_NORTH = (46.86, -68.01)   # Caribou, Maine

DAY_OF_YEAR = "day_of_year"
ACCUMULATED_GDD = "accumulated_gdd"
INDEX = "index"
UNKNOWN = "unknown"


def classify_values(south: float | None, north: float | None) -> str:
    """Name a layer's encoding from its values at two known latitudes.

    Deliberately refuses more often than it guesses. An unclassified layer
    is dropped from the catalogue, which costs a row; a misclassified one
    would print a confident date for a heat sum.
    """
    if south is None or north is None:
        return UNKNOWN
    # A day of year cannot exceed 366, whatever the latitude.
    if max(south, north) > 366:
        return ACCUMULATED_GDD
    # Risk classes are single digits and carry no latitude signal.
    if max(south, north) <= 10:
        return INDEX
    # Spring arrives later in the north; heat accumulates faster in the south.
    if north > south:
        return DAY_OF_YEAR
    if north < south:
        return ACCUMULATED_GDD
    return UNKNOWN


async def classify_npn_layer(layer: str) -> str:
    """Measure one layer's encoding. Cache this — it changes only per season."""
    south = await fetch_npn_point(layer, *_REF_SOUTH)
    north = await fetch_npn_point(layer, *_REF_NORTH)
    return classify_values(south, north)


# ── Life-cycle habits ────────────────────────────────────────────────────
#
# USA-NPN publishes, per species, the phenophases it tracks — the things an
# animal visibly does in a year: nest building, nestlings, fledged young,
# calls or song, mating, emergence above ground, young individuals. That is
# the vocabulary a grower means by "when do the chicks hatch", and it is
# published rather than invented here.
#
# The join to iNaturalist is the scientific name. iNaturalist returns
# "Strix varia"; NPN stores genus and species apart, so they are rejoined.


async def fetch_npn_species_index() -> dict[str, dict[str, Any]]:
    """Every species USA-NPN tracks, keyed by lowercase scientific name.

    One call for the whole catalogue, which is what makes it affordable to
    say WHICH species have habits before anyone asks for one in particular.
    """
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _json(client, f"{_NPN_PORTAL}/species/getSpecies.json", {})
    if not isinstance(data, list):
        raise BiotaError("USA-NPN species list returned an unexpected shape")
    index: dict[str, dict[str, Any]] = {}
    for s in data:
        if not isinstance(s, dict):
            continue
        genus = str(s.get("genus") or "").strip()
        species = str(s.get("species") or "").strip()
        if not genus or not species:
            continue
        index[f"{genus} {species}".lower()] = s
    return index


async def fetch_species_habits(species_id: int, on: str) -> list[str]:
    """The phenophases USA-NPN tracks for one species, in its own words."""
    params = {"species_id": str(species_id), "date": on}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        data = await _json(client, f"{_NPN_PORTAL}/phenophases/getPhenophasesForSpecies.json", params)
    names: list[str] = []
    for block in data if isinstance(data, list) else []:
        if not isinstance(block, dict):
            continue
        for ph in block.get("phenophases") or []:
            name = str(ph.get("phenophase_name") or "").strip()
            if name and name not in names:
                names.append(name)
    return names
