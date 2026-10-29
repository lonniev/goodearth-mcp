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

from goodearth_mcp import block_store, plant_profile, plant_profile_window, record_cache, reference_store, server
from goodearth_mcp import region as reg
from goodearth_mcp.llm_answer import AnswerError
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
    with pytest.raises(AnswerError):
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
    assert plant_profile.cache_key(taxon_id=48927, scientific_name="X", common_name="", text="") == "profile:taxon:48927"
    assert plant_profile.cache_key(taxon_id=None, scientific_name="", common_name="",
                                   text="  Punkin!! ") == "profile:name:punkin"


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
    #: Each kept row's age in days; a test ages one to make it come due.
    age: dict[str, float] = {}
    asked: list[str] = []

    async def daily(lats, lons, start, end):
        return [_record(start, end) for _ in (lats or [0])]

    async def get(key):
        return (kept[key], age.get(key, 0.0)) if key in kept else None

    async def put(key, profile, model):
        kept[key] = profile
        age[key] = 0.0

    async def ask(api_key, user, edit=False, model="writer"):
        asked.append(user)
        return reply(PUMPKIN)

    monkeypatch.setattr(record_cache, "daily_history", daily)
    monkeypatch.setattr(reference_store, "get", get)
    monkeypatch.setattr(reference_store, "put", put)
    monkeypatch.setattr(plant_profile, "ask", ask)
    return kept, asked, age


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

    async def ask(api_key, user, edit=False, model="writer"):
        return reply(stated)
    monkeypatch.setattr(plant_profile, "ask", ask)
    here = look()["on_this_plot"]
    assert (here["basis"], here["gdd_target"], here["base_temp_f"]) == ("published", 1230, 55)


def test_the_second_grower_reads_the_first_ones_lookup(world):
    kept, asked, _age = world
    first, second = look(), look()
    assert (first["kept"], second["kept"]) == (False, True)
    assert len(asked) == 1, "one LLM call per plant, ever"
    assert "profile:taxon:48927" in kept


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


# ── Decay: popular rows renew, unused ones go ────────────────────────────


def test_a_young_profile_is_never_looked_up_again():
    for roll in (0.0, 0.5, 0.999):
        assert not reference_store.due(10, roll)
        assert not reference_store.due(reference_store.FRESH_DAYS - reference_store.JITTER_DAYS - 0.01, roll)


def test_an_old_profile_always_is():
    for roll in (0.0, 0.999):
        assert reference_store.due(reference_store.FRESH_DAYS, roll)
        assert reference_store.due(900, roll)


def test_in_the_last_month_the_chance_rises_day_by_day():
    """So a plant every grower reads is not renewed by all of them at once."""
    start = reference_store.FRESH_DAYS - reference_store.JITTER_DAYS
    mid = start + reference_store.JITTER_DAYS / 2
    assert reference_store.due(mid, 0.49) and not reference_store.due(mid, 0.51)
    assert reference_store.due(start + 1, 0.0) and not reference_store.due(start + 1, 0.5)


def test_a_profile_come_due_is_looked_up_again(world):
    _kept, asked, age = world
    look()
    age["profile:taxon:48927"] = reference_store.FRESH_DAYS + 1
    out = look()
    assert out["kept"] is False and len(asked) == 2


def test_a_failed_renewal_still_answers_with_the_kept_profile(world, monkeypatch):
    _kept, _asked, age = world
    look()
    age["profile:taxon:48927"] = reference_store.FRESH_DAYS + 1

    async def down(api_key, user, edit=False, model="writer"):
        raise ProfileError("The plant reference did not answer (HTTP 503).")
    monkeypatch.setattr(plant_profile, "ask", down)
    out = look()
    assert out["kept"] is True and out["profile"]["common_name"] == "Pumpkin"


# ── The store's own SQL ──────────────────────────────────────────────────


class RecordingVault:
    _schema_prefix = "op."

    def __init__(self, rows=None):
        self.sql: list[tuple[str, list]] = []
        self.rows = rows or []

    async def _execute(self, sql, params=None):
        self.sql.append((sql, params or []))
        return {"rows": self.rows, "rowCount": 2}


@pytest.fixture
def vault(monkeypatch):
    v = RecordingVault()
    monkeypatch.setattr(reference_store, "_vault", v)
    monkeypatch.setattr(reference_store, "_schema_done", True)
    return v


def test_reading_a_row_is_what_keeps_it(vault):
    vault.rows = [{"profile": json.dumps(PUMPKIN), "age_days": 12.5}]
    got = asyncio.run(reference_store.get("profile:taxon:1"))
    assert got == (PUMPKIN, 12.5)
    sql, args = vault.sql[0]
    assert sql.startswith("UPDATE op.goodearth_reference_cache SET last_read_at = NOW(), reads = reads + 1")
    assert "RETURNING" in sql and args == ["profile:taxon:1"]
    assert len(vault.sql) == 1, "one round trip"


def test_every_write_lets_go_of_the_idle_and_the_excess(vault):
    asyncio.run(reference_store.put("profile:taxon:1", PUMPKIN, "m"))
    stmts = [s for s, _ in vault.sql]
    assert stmts[0].startswith("INSERT INTO op.goodearth_reference_cache")
    assert any(f"INTERVAL '{reference_store.IDLE_DAYS} days'" in s and s.startswith("DELETE") for s in stmts)
    assert any(f"OFFSET {reference_store.MAX_ROWS}" in s and "ORDER BY last_read_at DESC" in s for s in stmts)


def test_one_plant_can_be_let_go_by_its_key(vault):
    assert asyncio.run(reference_store.drop("profile:taxon:76541")) is True
    assert vault.sql[0] == ("DELETE FROM op.goodearth_reference_cache WHERE key = $1", ["profile:taxon:76541"])


def test_the_index_name_is_never_given_the_schema(vault):
    """A schema-qualified index name is a syntax error that would abort the
    migrations on every request."""
    stmt = reference_store._qualify(reference_store._MIGRATIONS[-1])
    assert "INDEX IF NOT EXISTS goodearth_reference_cache_last_read_idx ON op.goodearth_reference_cache" in stmt


# ── Letting one answer go ────────────────────────────────────────────────


def test_the_refresh_is_the_operators_alone():
    ident = server.TOOL_REGISTRY[server.REFERENCE_REFRESH_UUID]
    assert ident.category == "restricted"


def test_the_refresh_lets_go_of_the_row_a_lookup_returned(monkeypatch):
    dropped: list[str] = []

    async def drop(key):
        dropped.append(key)
        return True
    monkeypatch.setattr(reference_store, "drop", drop)
    out = asyncio.run(_bare(server.reference_refresh)(key=" Profile:Taxon:76541 ", npub="npub1x"))
    assert out == {"success": True, "key": "profile:taxon:76541", "dropped": True}
    asyncio.run(_bare(server.reference_refresh)(key="lifecycle:animal:taxon:5212:40", npub="npub1x"))
    assert dropped == ["profile:taxon:76541", "lifecycle:animal:taxon:5212:40"]


@pytest.mark.parametrize("key", ["", "taxon:1", "users:all", "profile:" + "x" * 200,
                                 "profile:taxon:1; DROP TABLE x"])
def test_the_refresh_refuses_a_key_no_lookup_returns(key):
    with pytest.raises(ValueError):
        asyncio.run(_bare(server.reference_refresh)(key=key, npub="npub1x"))


def test_found_sources_are_edited_without_search(world, monkeypatch):
    from goodearth_mcp import reference_search
    from goodearth_mcp.reference_search import Found, Source

    kept, _asked, _age = world
    page = "https://extension.umn.edu/vegetables/pumpkins"
    modes = []

    async def sources_for(search_key, **kw):
        assert kw["subject"] == "plant"
        return Found(sources=(Source(page, "UMN Extension", ("Pumpkins mature in 90–120 days.",)),),
                     queries=2)

    async def ask(api_key, user, edit=False, model="writer"):
        modes.append(edit)
        assert "90–120 days" in user
        return reply(PUMPKIN)
    monkeypatch.setattr(reference_search, "sources_for", sources_for)
    monkeypatch.setattr(plant_profile, "ask", ask)

    out = look(search_key="brave-k")
    assert modes == [True]
    assert out["profile"]["sources"] == [{"title": "UMN Extension", "url": page}]
    assert kept["profile:taxon:48927"]["looked_up_with"]["mode"] == "edit"
