"""Living-world feeds — parsing, and refusing to name what we cannot read."""

from __future__ import annotations

import httpx
import pytest
import respx

from goodearth_mcp import biota

BBOX = (44.44, -73.27, 44.52, -73.15)


# ── What a layer's number means ──────────────────────────────────────────
#
# The fixtures below are the values these layers actually returned across
# four latitudes on 2026-08-31. Invented numbers would only test the
# branching; measured ones test the discrimination that matters.


def test_rising_northward_is_a_day_of_year():
    """japanese_beetle_adult: 113 in Georgia, 211 in northern Maine."""
    assert biota.classify_values(113, 211) == biota.DAY_OF_YEAR


def test_falling_northward_is_accumulated_heat():
    """asian_longhorned_beetle: 2066 in Georgia, 320 in Maine."""
    assert biota.classify_values(2066, 320) == biota.ACCUMULATED_GDD


def test_the_trap_a_heat_sum_that_looks_like_a_date():
    """winter_wheat reads 281 in Vermont — a plausible 8 October.

    This is the case that makes eyeballing the local value unsafe: inside
    1..366 a wrong reading is indistinguishable from a right one. Only the
    latitude pair separates them, and it must come out as heat.
    """
    assert biota.classify_values(1611, 129) == biota.ACCUMULATED_GDD


def test_small_flat_values_are_a_risk_class_we_do_not_interpret():
    """monilinia: 1, 0, 3, 1 across the country — not a date, not heat."""
    assert biota.classify_values(1, 1) == biota.INDEX


def test_a_layer_with_no_raster_is_unknown_not_guessed():
    assert biota.classify_values(None, 200) == biota.UNKNOWN
    assert biota.classify_values(150, None) == biota.UNKNOWN


def test_equal_values_refuse_rather_than_pick():
    assert biota.classify_values(150, 150) == biota.UNKNOWN


def test_day_of_year_rejects_values_outside_the_calendar():
    """asian_longhorned_beetle answers 536 here — nodata, not late June."""
    assert biota.npn_event_date(536, 2026) is None
    assert biota.npn_event_date(0, 2026) is None
    assert biota.npn_event_date(191, 2026) == "2026-07-10"
    assert biota.npn_event_date(366, 2024) == "2024-12-31"


# ── Observed species ─────────────────────────────────────────────────────


@pytest.mark.asyncio
@respx.mock
async def test_inat_prefers_the_common_name_and_keeps_the_count():
    respx.get(url__startswith="https://api.inaturalist.org").mock(
        return_value=httpx.Response(200, json={"results": [
            {"count": 626, "taxon": {"id": 1, "name": "Bombus impatiens",
                                     "preferred_common_name": "Common Eastern Bumble Bee",
                                     "rank": "species"}},
            {"count": 12, "taxon": {"id": 2, "name": "Apis mellifera", "rank": "species"}},
        ]})
    )
    out = await biota.fetch_inat_species(BBOX, "Insecta")
    assert out[0]["name"] == "Common Eastern Bumble Bee"
    assert out[0]["observations"] == 626
    # No common name is not a reason to drop a species.
    assert out[1]["name"] == "Apis mellifera"


@pytest.mark.asyncio
@respx.mock
async def test_inat_skips_rows_with_no_taxon_rather_than_crashing():
    respx.get(url__startswith="https://api.inaturalist.org").mock(
        return_value=httpx.Response(200, json={"results": [{"count": 5}, {"count": 3, "taxon": {}}]})
    )
    assert await biota.fetch_inat_species(BBOX, "Insecta") == []


@pytest.mark.asyncio
@respx.mock
async def test_inat_raises_on_an_unexpected_shape():
    respx.get(url__startswith="https://api.inaturalist.org").mock(
        return_value=httpx.Response(200, json={"nope": 1})
    )
    with pytest.raises(biota.BiotaError):
        await biota.fetch_inat_species(BBOX, "Insecta")


@pytest.mark.asyncio
@respx.mock
async def test_gbif_returns_the_record_count():
    respx.get(url__startswith="https://api.gbif.org").mock(
        return_value=httpx.Response(200, json={"count": 29667})
    )
    assert await biota.fetch_gbif_occurrences(BBOX, class_key=216) == 29667


@pytest.mark.asyncio
@respx.mock
async def test_npn_out_of_season_layer_is_an_absence_not_a_failure():
    """An unpublished layer answers with an XML exception, not JSON."""
    respx.get(url__startswith="https://geoserver.usanpn.org").mock(
        return_value=httpx.Response(200, text="<ServiceExceptionReport/>")
    )
    assert await biota.fetch_npn_point("apple_maggot", 44.5, -73.2) is None


@pytest.mark.asyncio
@respx.mock
async def test_npn_model_roster_comes_from_the_service():
    """The list of models must not live in this repo.

    Utility surfaces (the degree-day rasters themselves) are not models and
    are filtered; everything else NPN publishes appears without an edit here.
    """
    respx.get(url__startswith="https://geoserver.usanpn.org").mock(
        return_value=httpx.Response(200, text=(
            "<Name>gdd:agdd</Name><Name>gdd:agdd_50f</Name>"
            "<Name>gdd:30yr_avg_agdd</Name><Name>gdd:japanese_beetle_adult</Name>"
            "<Name>climate:precip</Name>"
        ))
    )
    assert await biota.fetch_npn_models() == ["japanese_beetle_adult"]
