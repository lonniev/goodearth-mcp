"""Looking a plant up, so the grower never has to.

The LLM's answer is adversarial input: every field is checked, and one that is
out of range, mistyped or unsourced comes back absent. The profile is kept once
per plant; the plot fit (heat target, southern bloom) is computed per call.
"""

from __future__ import annotations

import asyncio
import json
import math
from datetime import date, timedelta

import pytest

from goodearth_mcp import block_store, plant_profile, plant_profile_window, profile_store, record_cache, server
from goodearth_mcp import region as reg
from goodearth_mcp.plant_profile import ProfileError

REGION = reg.parse_region(block_store.EXAMPLE_BLOCK["geometry"])
TODAY = date(2026, 9, 3)

PUMPKIN = {
    "scientific_name": "Cucurbita pepo", "common_name": "Pumpkin", "family": "Cucurbitaceae",
    "kind": "annual",
    "days_to_maturity": {"typical": 100, "low": 90, "high": 120, "counted_from": "sowing"},
    "published_gdd": None, "base_temp_f": 50,
    "height_in": {"typical": 18, "low": 12, "high": 24},
    "flower_color": "yellow", "bloom_months": [7, 8], "frost_hardy": False,
    "chill_hours": None, "hardy_to_f": None,
    "sources": [{"title": "UMN Extension", "url": "https://extension.umn.edu/vegetables/pumpkins"}],
    "notes": "Needs a long warm season.",
}


def reply(profile: dict, prose: str = "Here is what I found.") -> dict:
    """An LLM response as the provider shapes it: tool blocks, then text."""
    return {"model": "test/model", "content": [
        {"type": "server_tool_use", "name": "web_search"},
        {"type": "web_search_tool_result", "content": []},
        {"type": "text", "text": f"{prose}\n<profile>{json.dumps(profile)}</profile>"},
    ]}


# ── Reading the answer ───────────────────────────────────────────────────


def test_a_good_answer_reads_whole():
    got = plant_profile.validate(plant_profile.answer_text(reply(PUMPKIN)))
    assert got["days_to_maturity"] == {"typical": 100, "low": 90, "high": 120, "counted_from": "sowing"}
    assert (got["flower_color"], got["bloom_months"], got["frost_hardy"]) == ("yellow", [7, 8], False)
    assert got["sources"][0]["url"].startswith("https://")


def test_an_answer_without_the_tags_is_refused():
    with pytest.raises(ProfileError):
        plant_profile.answer_text({"content": [{"type": "text", "text": json.dumps(PUMPKIN)}]})


@pytest.mark.parametrize("raw", ["not json", "[1, 2]", "null", json.dumps({"kind": "annual"})])
def test_an_answer_that_is_not_a_plant_is_refused(raw):
    with pytest.raises(ProfileError):
        plant_profile.validate(raw)


def test_every_field_out_of_range_comes_back_absent_not_invented():
    hostile = {
        **PUMPKIN,
        "kind": "shrub; DROP TABLE x",
        "days_to_maturity": {"typical": 5000, "counted_from": "never"},
        "base_temp_f": 400, "flower_color": "plaid", "frost_hardy": "yes",
        "chill_hours": -10, "hardy_to_f": 999,
        "height_in": {"typical": "tall"},
        "bloom_months": [0, 13, "7", True, 8, 8],
        "sources": [{"url": "javascript:alert(1)"}, {"url": "ftp://x"}, "https://bare"],
        "notes": "x" * 5000,
    }
    got = plant_profile.validate(json.dumps(hostile))
    for field in ("kind", "days_to_maturity", "base_temp_f", "flower_color", "frost_hardy",
                  "chill_hours", "hardy_to_f", "height_in"):
        assert got[field] is None, field
    assert got["bloom_months"] == [8]
    assert got["sources"] == []
    assert len(got["notes"]) <= 300


def test_a_published_gdd_needs_its_base_and_its_source():
    """A figure without its base is off by hundreds; one without a source is
    a claim nobody can check. Both, or nothing."""
    base_only = {**PUMPKIN, "published_gdd": {"gdd": 1200, "source_url": "https://x.edu/p"}}
    unsourced = {**PUMPKIN, "published_gdd": {"gdd": 1200, "base_f": 50}}
    whole = {**PUMPKIN, "published_gdd": {"gdd": 1200, "base_f": 50, "stage": "harvest",
                                          "source_url": "https://x.edu/p"}}
    assert plant_profile.validate(json.dumps(base_only))["published_gdd"] is None
    assert plant_profile.validate(json.dumps(unsourced))["published_gdd"] is None
    assert plant_profile.validate(json.dumps(whole))["published_gdd"]["base_f"] == 50


def test_a_range_is_ordered_round_its_typical():
    got = plant_profile.validate(json.dumps(
        {**PUMPKIN, "days_to_maturity": {"typical": 100, "low": 130, "high": 80}}))
    assert got["days_to_maturity"]["low"] <= 100 <= got["days_to_maturity"]["high"]


def test_one_plant_one_key():
    assert plant_profile.cache_key(taxon_id=48927, scientific_name="X", common_name="", text="") == "taxon:48927"
    assert plant_profile.cache_key(taxon_id=None, scientific_name="", common_name="",
                                   text="  Punkin!! ") == "name:punkin"


def test_a_typed_name_is_handed_over_only_when_nothing_was_picked():
    assert "punkin" in plant_profile.prompt_for(taxon_id=None, scientific_name="", common_name="", text="punkin")
    picked = plant_profile.prompt_for(taxon_id=1, scientific_name="Cucurbita pepo", common_name="", text="x")
    assert "Cucurbita pepo" in picked and "typed" not in picked


def test_south_of_the_equator_the_bloom_season_turns_round():
    assert plant_profile_window.southern([7, 8], 44.0) == [7, 8]
    assert plant_profile_window.southern([7, 8], -33.9) == [1, 2]
    assert plant_profile_window.southern([12, 1], -33.9) == [6, 7]


# ── On a plot, through the cache ─────────────────────────────────────────


def _record(start: str, end: str) -> dict:
    a, b = date.fromisoformat(start), date.fromisoformat(end)
    days = [a + timedelta(days=i) for i in range((b - a).days + 1)]
    peak = [math.cos((d.timetuple().tm_yday - 196) / 365.0 * 2 * math.pi) for d in days]
    return {"daily": {"time": [d.isoformat() for d in days],
                      "temperature_2m_max": [round(55 + 28 * p, 1) for p in peak],
                      "temperature_2m_min": [round(35 + 26 * p, 1) for p in peak]}}


@pytest.fixture
def world(monkeypatch):
    """A climate, an in-memory cache, and an LLM that counts its calls."""
    kept: dict[str, dict] = {}
    asked: list[str] = []

    async def daily(lats, lons, start, end):
        return [_record(start, end) for _ in (lats or [0])]

    async def get(key):
        return kept.get(key)

    async def put(key, profile, model):
        kept[key] = profile

    async def ask(api_key, user):
        asked.append(user)
        return reply(PUMPKIN)

    monkeypatch.setattr(record_cache, "daily_history", daily)
    monkeypatch.setattr(profile_store, "get", get)
    monkeypatch.setattr(profile_store, "put", put)
    monkeypatch.setattr(plant_profile, "ask", ask)
    return kept, asked


def look(**kw):
    kw = {"api_key": "k", "plot_base_f": 50.0, "taxon_id": 48927,
          "scientific_name": "Cucurbita pepo", "today": TODAY, **kw}
    return asyncio.run(plant_profile_window.block_plant_profile(REGION, **kw))


def test_days_to_maturity_become_this_plots_heat_target(world):
    out = look()
    here = out["on_this_plot"]
    assert here["basis"] == "days_to_maturity" and here["days"] == 100
    assert here["gdd_target"] > 0 and here["gdd_target"] % 10 == 0
    assert here["bloom_months"] == [7, 8]


def test_a_published_figure_wins_at_its_own_base(world, monkeypatch):
    stated = {**PUMPKIN, "published_gdd": {"gdd": 1234, "base_f": 55, "stage": "harvest",
                                           "source_url": "https://x.edu/p"}}

    async def ask(api_key, user):
        return reply(stated)
    monkeypatch.setattr(plant_profile, "ask", ask)
    here = look()["on_this_plot"]
    assert (here["basis"], here["gdd_target"], here["base_temp_f"]) == ("published", 1230, 55)


def test_the_second_grower_reads_the_first_ones_lookup(world):
    kept, asked = world
    first, second = look(), look()
    assert (first["kept"], second["kept"]) == (False, True)
    assert len(asked) == 1, "one LLM call per plant, ever"
    assert "taxon:48927" in kept


def test_no_key_and_nothing_kept_is_refused_so_nothing_is_charged(world):
    with pytest.raises(ProfileError):
        look(api_key="")


def test_a_kept_profile_needs_no_key(world):
    look()
    assert look(api_key="")["kept"] is True


def test_a_plot_with_no_usable_record_still_gets_the_profile(world, monkeypatch):
    async def empty(lats, lons, start, end):
        return []
    monkeypatch.setattr(record_cache, "daily_history", empty)
    here = look()["on_this_plot"]
    assert here["gdd_target"] is None and here["unfitted"]


# ── The tool's own refusals raise, so the fare comes back ────────────────


def _bare(fn):
    while hasattr(fn, "__wrapped__"):
        fn = fn.__wrapped__
    return fn


@pytest.mark.parametrize("kw", [
    {},                                   # names nothing
    {"taxon_id": -1},
    {"taxon_id": True},
    {"text": "x" * 121},
    {"taxon_id": 1, "set_out": "June"},
])
def test_the_tool_refuses_what_names_no_plant(kw):
    with pytest.raises(ValueError):
        asyncio.run(_bare(server.plant_profile)(block="b1", npub="npub1x", **kw))


def test_the_operator_key_never_reaches_the_answer(world, monkeypatch):
    async def found(npub, block):
        return REGION, {"block_id": "b1", "base_temp_f": 50.0}

    async def creds(fields, **kw):
        return {"llm_api_key": "sk-or-SECRET-123"}
    monkeypatch.setattr(server, "_block_region", found)
    monkeypatch.setattr(server.runtime, "load_credentials", creds)
    out = asyncio.run(_bare(server.plant_profile)(block="b1", npub="npub1x", taxon_id=48927))
    assert "SECRET" not in json.dumps(out)
