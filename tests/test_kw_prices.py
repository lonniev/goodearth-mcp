"""What a kW costs and what a kWh sells for — read live, never pasted in.

The three feeds are stubbed at the `sources` seam, the way the Sun tests stub
theirs; `tests/conftest.py` would trip a real socket. The benchmark fixture is
the DOE page's two tables as served on 2026-10-10, cut from the page itself.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx

from goodearth_mcp import kw_prices, record_cache, sources

FIXTURES = Path(__file__).parent / "fixtures" / "kw_prices"


def _page() -> str:
    return (FIXTURES / "doe_benchmarks.html").read_text(encoding="utf-8")


# ── Parsing ──────────────────────────────────────────────────────────────


def test_the_pv_only_table_gives_the_three_market_prices_and_its_quarter():
    b = kw_prices.parse_benchmark(_page())
    assert b == kw_prices.Benchmark(
        quarter="2025Q1", residential_usd_per_w=2.95, commercial_usd_per_w=1.98, utility_usd_per_w=1.12,
    )


def test_the_pv_plus_storage_table_is_not_mistaken_for_it():
    """Table 1 comes first on the page and its residential row says $4.59."""
    assert kw_prices.parse_benchmark(_page()).residential_usd_per_w != 4.59


def test_a_page_without_the_table_is_none_not_a_guess():
    assert kw_prices.parse_benchmark("<html><body><h4>Table 2. Something else</h4></body></html>") is None
    missing_row = _page().replace("<tr><th>CPV</th>", "<tr><th>XPV</th>")
    assert kw_prices.parse_benchmark(missing_row) is None


def test_eia_s_first_row_is_the_latest_month():
    payload = {"response": {"data": [
        {"period": "2026-07", "stateid": "VT", "sectorid": "RES", "price": "22.61", "price-units": "cents per kilowatthour"},
    ]}}
    assert kw_prices.parse_retail(payload) == kw_prices.Retail(state_id="VT", period="2026-07", cents_per_kwh=22.61)


@pytest.mark.parametrize("payload", [
    {"response": {"data": []}},
    {"response": {"data": [{"period": "2026-07", "stateid": "VT", "price": "n/a"}]}},
    {"response": {"data": [{"period": "2026-07", "stateid": "VT", "price": "0"}]}},
    {"nope": 1},
    None,
])
def test_an_empty_or_odd_eia_answer_is_none(payload):
    assert kw_prices.parse_retail(payload) is None


def test_nominatim_s_address_gives_the_codes_eia_keys_by():
    payload = json.loads((FIXTURES / "nominatim_vermont.json").read_text(encoding="utf-8"))
    assert kw_prices.parse_place(payload) == kw_prices.Place(country_code="us", state_id="VT", state_name="Vermont")


def test_a_place_outside_a_state_still_has_its_country():
    assert kw_prices.parse_place({"address": {"country_code": "ca", "state": "Québec", "ISO3166-2-lvl4": "CA-QC"}}) == (
        kw_prices.Place(country_code="ca", state_id="QC", state_name="Québec")
    )
    assert kw_prices.parse_place({"address": {"country_code": "fr"}}) == kw_prices.Place("fr", None, None)
    assert kw_prices.parse_place({"error": "Unable to geocode"}) is None


def test_tiers_price_an_array_by_the_nearest_benchmark_shape():
    assert kw_prices.tier_for(8) == "residential"
    assert kw_prices.tier_for(25) == "residential"
    assert kw_prices.tier_for(25.1) == "commercial"
    assert kw_prices.tier_for(1000) == "commercial"
    assert kw_prices.tier_for(1001) == "utility"


def test_a_square_metre_of_ground_is_eighty_eight_watts():
    assert kw_prices.ARRAY_W_PER_M2 == pytest.approx(88.0)


# ── Reading ──────────────────────────────────────────────────────────────


@pytest.fixture
def feeds(monkeypatch):
    """The three feeds answered locally; the place cache is a dict."""
    calls = {"page": 0, "eia": 0, "place": 0}
    store: dict[str, object] = {}
    answers = {"page": _page(), "eia": {"response": {"data": [
        {"period": "2026-07", "stateid": "VT", "sectorid": "RES", "price": "22.61"},
    ]}}, "place": json.loads((FIXTURES / "nominatim_vermont.json").read_text(encoding="utf-8"))}

    async def page():
        calls["page"] += 1
        if isinstance(answers["page"], Exception):
            raise answers["page"]
        return answers["page"]

    async def eia(state_id, api_key):
        calls["eia"] += 1
        calls["eia_key"] = api_key
        if isinstance(answers["eia"], Exception):
            raise answers["eia"]
        return answers["eia"]

    async def place(lat, lon):
        calls["place"] += 1
        if isinstance(answers["place"], Exception):
            raise answers["place"]
        return answers["place"]

    async def remembered(kind, subject):
        return store.get(f"{kind}|{subject}")

    async def remember(kind, subject, value):
        store[f"{kind}|{subject}"] = value

    monkeypatch.setattr(sources, "fetch_pv_benchmark_page", page)
    monkeypatch.setattr(sources, "fetch_retail_price", eia)
    monkeypatch.setattr(sources, "fetch_reverse_place", place)
    monkeypatch.setattr(record_cache, "remembered", remembered)
    monkeypatch.setattr(record_cache, "remember", remember)
    kw_prices._memo.clear()
    yield calls, answers, store
    kw_prices._memo.clear()


async def test_with_a_key_both_prices_are_read_and_named(feeds):
    calls, _, _ = feeds
    out = await kw_prices.read(44.17, -73.25, "k-test")
    assert out["place"] == {"country_code": "us", "state_id": "VT", "state_name": "Vermont"}
    assert out["sell"] == {
        "cents_per_kwh": 22.61, "sector": "residential", "period": "2026-07", "state_id": "VT",
        "source": kw_prices.EIA_NAME,
    }
    assert out["install"]["quarter"] == "2025Q1"
    assert out["install"]["residential_usd_per_w"] == 2.95
    assert out["install"]["source"] == kw_prices.DOE_NAME
    assert out["reasons"] == {}
    assert out["array_w_per_m2"] == pytest.approx(88.0)
    assert out["tiers"] == {"residential_max_kw": 25.0, "commercial_max_kw": 1000.0}
    assert calls["eia_key"] == "k-test"


async def test_without_a_key_eia_is_never_asked_and_the_reason_says_so(feeds):
    calls, _, _ = feeds
    out = await kw_prices.read(44.17, -73.25, "")
    assert out["sell"] is None
    assert out["reasons"]["sell"] == "no EIA key on file"
    assert out["install"]["quarter"] == "2025Q1"
    assert calls["eia"] == 0


async def test_a_block_outside_the_united_states_has_no_tariff_and_still_a_benchmark(feeds):
    calls, answers, _ = feeds
    answers["place"] = {"address": {"country_code": "ca", "state": "Québec", "ISO3166-2-lvl4": "CA-QC"}}
    out = await kw_prices.read(45.5, -73.6, "k-test")
    assert out["sell"] is None
    assert "United States" in out["reasons"]["sell"]
    assert out["install"] is not None
    assert calls["eia"] == 0


async def test_a_dead_feed_is_a_null_with_a_reason_never_a_failed_call(feeds):
    _, answers, _ = feeds
    answers["page"] = sources.UpstreamError("energy.gov unreachable: timed out after 30 s")
    answers["eia"] = sources.UpstreamError("https://api.eia.gov/v2/x?api_key=SECRET returned HTTP 500")
    out = await kw_prices.read(44.17, -73.25, "SECRET")
    assert out["install"] is None
    assert "unreachable" in out["reasons"]["install"]
    assert out["sell"] is None
    assert "SECRET" not in json.dumps(out)
    assert out["reasons"]["sell"].startswith("EIA did not answer for VT")


async def test_a_page_that_lost_its_table_is_said_so(feeds):
    _, answers, _ = feeds
    answers["page"] = "<html><body>moved</body></html>"
    out = await kw_prices.read(44.17, -73.25, "")
    assert out["install"] is None
    assert "no longer carries the table" in out["reasons"]["install"]


async def test_a_day_s_reading_is_held_and_the_place_is_remembered_for_good(feeds):
    calls, _, store = feeds
    await kw_prices.read(44.17, -73.25, "k-test")
    await kw_prices.read(44.17, -73.25, "k-test")
    assert calls["page"] == 1
    assert calls["eia"] == 1
    assert calls["place"] == 1
    assert store["sun_place|44.17,-73.25"] == {"country_code": "us", "state_id": "VT", "state_name": "Vermont"}


async def test_a_nameless_place_is_a_null_not_a_wrong_state(feeds):
    _, answers, _ = feeds
    answers["place"] = {"error": "Unable to geocode"}
    out = await kw_prices.read(0.0, 0.0, "k-test")
    assert out["place"] is None
    assert out["sell"] is None
    assert "could not be named" in out["reasons"]["sell"]


# ── The feeds themselves ─────────────────────────────────────────────────


@respx.mock
async def test_eia_is_asked_for_the_latest_residential_month_with_the_key_in_the_query():
    route = respx.get(sources._EIA_RETAIL).mock(
        return_value=httpx.Response(200, json={"response": {"data": [{"period": "2026-07", "stateid": "VT", "price": "22.61"}]}})
    )
    out = await sources.fetch_retail_price("VT", "k-test")
    assert out["response"]["data"][0]["price"] == "22.61"
    q = dict(route.calls[0].request.url.params)
    assert q["api_key"] == "k-test"
    assert q["facets[sectorid][]"] == "RES"
    assert q["facets[stateid][]"] == "VT"
    assert q["sort[0][direction]"] == "desc"
    assert q["length"] == "1"


async def test_eia_is_not_asked_without_a_key():
    with pytest.raises(sources.UpstreamError):
        await sources.fetch_retail_price("VT", "")


@respx.mock
async def test_the_benchmark_page_comes_back_as_text():
    respx.get(sources._PV_BENCHMARKS).mock(return_value=httpx.Response(200, text=_page()))
    page = await sources.fetch_pv_benchmark_page()
    assert "PV-Only Cost Benchmarks" in page
    assert kw_prices.parse_benchmark(page) is not None


@respx.mock
async def test_an_empty_benchmark_page_is_an_upstream_error():
    respx.get(sources._PV_BENCHMARKS).mock(return_value=httpx.Response(200, text=""))
    with pytest.raises(sources.UpstreamError):
        await sources.fetch_pv_benchmark_page()


@respx.mock
async def test_nominatim_is_asked_at_state_zoom():
    route = respx.get(sources._NOMINATIM_REVERSE).mock(
        return_value=httpx.Response(200, json=json.loads((FIXTURES / "nominatim_vermont.json").read_text(encoding="utf-8")))
    )
    out = await sources.fetch_reverse_place(44.1701, -73.2504)
    assert out["address"]["ISO3166-2-lvl4"] == "US-VT"
    q = dict(route.calls[0].request.url.params)
    assert q["zoom"] == "5"
    assert q["format"] == "jsonv2"
