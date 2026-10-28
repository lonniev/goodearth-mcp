"""A subject's life cycle: every event a grower can tick, already in the shape
its record stores, and dated on the plot it was asked for.

The LLM's answer is adversarial input. An event that would not pass its own
record's validator is dropped, so whatever the grower ticks saves cleanly.
"""

from __future__ import annotations

import asyncio
import json
import math
from datetime import date, timedelta

import pytest

from goodearth_mcp import (
    block_store,
    catalog,
    crops,
    life_cycle,
    life_cycle_window,
    record_cache,
    reference_store,
    server,
    wildlife,
)
from goodearth_mcp import region as reg
from goodearth_mcp.life_cycle import LifeCycleError

REGION = reg.parse_region(block_store.EXAMPLE_BLOCK["geometry"])
TODAY = date(2026, 3, 1)

HAWK = {
    "scientific_name": "Buteo jamaicensis", "common_name": "Red-tailed Hawk",
    "narrative": "Pairs court in late winter, lay in early spring, and fledge by early summer.",
    "events": [
        {"name": "courtship flights", "emoji": "🪶", "summary": "Pairs soar and call over the territory.",
         "key": True, "driver": "daylight", "daylight_hours": 11.0, "rising": True,
         "source_url": "https://www.allaboutbirds.org/guide/Red-tailed_Hawk/lifehistory"},
        {"name": "first eggs", "emoji": "🥚", "key": True, "driver": "calendar", "typical_on": "03-28",
         "source_url": "https://birdsoftheworld.org/rethaw"},
        {"name": "first flight", "emoji": "🦅", "key": True, "driver": "calendar", "typical_on": "06-12"},
        {"name": "spring chorus", "driver": "moon", "phase": "full", "after": "03-01"},
    ],
}

PUMPKIN = {
    "scientific_name": "Cucurbita pepo", "common_name": "Pumpkin", "base_temp_f": 50,
    "narrative": "Sown after frost, it flowers in midsummer and ripens by early autumn.",
    "events": [
        {"name": "emergence", "emoji": "🌱", "driver": "heat", "gdd": 120},
        {"name": "first flowers", "emoji": "🌼", "key": True, "driver": "heat", "gdd": 700},
        {"name": "harvest", "emoji": "🎃", "key": True, "driver": "heat", "gdd": 1750},
    ],
}


def reply(answer: dict) -> dict:
    return {"model": "test/model", "content": [
        {"type": "server_tool_use", "name": "web_search"},
        {"type": "text", "text": f"Found it.\n<lifecycle>{json.dumps(answer)}</lifecycle>"},
    ]}


def check(answer: dict, subject: str) -> dict:
    return life_cycle.validate(life_cycle.answer_text(reply(answer)), subject)


# ── Reading the answer ───────────────────────────────────────────────────


def test_an_animal_keeps_every_driver_it_may_have():
    got = check(HAWK, "animal")
    assert [e["driver"] for e in got["events"]] == ["daylight", "calendar", "calendar", "moon"]
    assert got["events"][0] == {
        "name": "courtship flights", "emoji": "🪶", "summary": "Pairs soar and call over the territory.",
        "key": True, "driver": "daylight", "daylight_hours": 11.0, "rising": True,
        "source_url": "https://www.allaboutbirds.org/guide/Red-tailed_Hawk/lifehistory",
    }


def test_each_animal_event_saves_as_a_wildlife_record_without_another_check_failing():
    for e in check(HAWK, "animal")["events"]:
        fields = {k: e[k] for k in life_cycle.DRIVER_FIELDS[e["driver"]] if k in e}
        wildlife.validate_event({"species": "Red-tailed Hawk", "event": e["name"],
                                 "driver": e["driver"], **fields})


def test_a_plants_events_save_as_its_planting_stages():
    got = check(PUMPKIN, "plant")
    assert got["base_temp_f"] == 50
    stages = [{"stage": e["name"], "gdd": e["gdd"]} for e in got["events"]]
    assert crops.validate_stages("Pumpkin", stages) == sorted(
        [{"stage": "emergence", "gdd": 120.0}, {"stage": "first flowers", "gdd": 700.0},
         {"stage": "harvest", "gdd": 1750.0}], key=lambda s: s["gdd"])


def test_a_plant_or_pest_keeps_only_heat_stages():
    mixed = {**PUMPKIN, "events": [*PUMPKIN["events"],
                                   {"name": "flowers by the calendar", "driver": "calendar",
                                    "typical_on": "07-10"}]}
    for subject in ("plant", "pest"):
        assert all(e["driver"] == "heat" for e in check(mixed, subject)["events"])


def test_an_event_its_record_would_refuse_is_dropped_never_repaired():
    hostile = {**HAWK, "events": [
        HAWK["events"][0],
        {"name": "", "driver": "calendar", "typical_on": "05-01"},          # no name
        {"name": "nesting", "driver": "interval", "days": 34},              # counts from a day only the grower saw
        {"name": "molt", "driver": "calendar", "typical_on": "13-45"},      # no such date
        {"name": "migration", "driver": "daylight", "daylight_hours": 30},  # no such day
        {"name": "calling", "driver": "moon", "phase": "gibbous"},          # no such phase
        {"name": "x", "driver": "heat"},                                    # no threshold
        {"name": "courtship flights", "driver": "calendar", "typical_on": "02-01"},  # a repeat
        "not an event",
    ]}
    assert [e["name"] for e in check(hostile, "animal")["events"]] == ["courtship flights"]


def test_an_answer_with_nothing_timeable_is_refused():
    with pytest.raises(LifeCycleError):
        check({**HAWK, "events": [{"name": "x", "driver": "calendar"}]}, "animal")


@pytest.mark.parametrize("raw", ["not json", "[1]", json.dumps({"events": HAWK["events"]})])
def test_an_answer_that_is_not_a_life_cycle_is_refused(raw):
    with pytest.raises(LifeCycleError):
        life_cycle.validate(raw, "animal")


def test_text_and_links_are_trimmed_and_checked():
    loud = {**HAWK, "narrative": "x " * 1000, "events": [
        {**HAWK["events"][0], "summary": "y" * 999, "source_url": "javascript:alert(1)",
         "emoji": "🪶🪶🪶🪶🪶🪶"}]}
    got = check(loud, "animal")
    assert len(got["narrative"]) <= 600 and len(got["events"][0]["summary"]) <= 200
    assert got["events"][0]["source_url"] is None and len(got["events"][0]["emoji"]) <= 4


def test_at_most_twenty_events():
    many = {**HAWK, "events": [{"name": f"e{i}", "driver": "calendar", "typical_on": "05-01"}
                               for i in range(40)]}
    assert len(check(many, "animal")["events"]) == life_cycle.MAX_EVENTS


# ── Keys ─────────────────────────────────────────────────────────────────


def test_an_animal_is_kept_per_latitude_band_and_a_plant_is_not():
    hawk_vt = life_cycle.cache_key(subject="animal", taxon_id=5212, name="", lat=44.2)
    hawk_ga = life_cycle.cache_key(subject="animal", taxon_id=5212, name="", lat=33.7)
    hawk_nz = life_cycle.cache_key(subject="animal", taxon_id=5212, name="", lat=-41.3)
    assert (hawk_vt, hawk_ga, hawk_nz) == ("lifecycle:animal:taxon:5212:40",
                                           "lifecycle:animal:taxon:5212:30",
                                           "lifecycle:animal:taxon:5212:-45")
    assert life_cycle.cache_key(subject="plant", taxon_id=76541, name="", lat=44.2) \
        == life_cycle.cache_key(subject="plant", taxon_id=76541, name="", lat=-30) \
        == "lifecycle:plant:taxon:76541"
    assert reference_store.KEY.match(hawk_nz)


def test_the_prompt_says_where_and_names_npns_stages():
    p = life_cycle.prompt_for(subject="animal", taxon_id=5212, scientific_name="Buteo jamaicensis",
                              common_name="", text_typed="", lat=44.2,
                              phenophases=["Courtship", "Nest building"])
    assert "44° north" in p and "Courtship; Nest building" in p


# ── On a plot, through the cache ─────────────────────────────────────────


def _record(start: str, end: str) -> dict:
    a, b = date.fromisoformat(start), date.fromisoformat(end)
    days = [a + timedelta(days=i) for i in range((b - a).days + 1)]
    peak = [math.cos((d.timetuple().tm_yday - 196) / 365.0 * 2 * math.pi) for d in days]
    return {"daily": {"time": [d.isoformat() for d in days],
                      "temperature_2m_max": [round(55 + 28 * p, 1) for p in peak],
                      "temperature_2m_min": [round(35 + 26 * p, 1) for p in peak],
                      "daylight_duration": [43200.0] * len(days),
                      "precipitation_sum": [0.0] * len(days)}}


@pytest.fixture
def world(monkeypatch):
    kept: dict[str, dict] = {}
    asked: list[str] = []
    answers = {"animal": HAWK, "plant": PUMPKIN, "pest": PUMPKIN}

    async def daily(lats, lons, start, end):
        return [_record(start, end) for _ in (lats or [0])]

    async def get(key):
        return (kept[key], 0.0) if key in kept else None

    async def put(key, answer, model):
        kept[key] = answer

    async def ask(api_key, user):
        asked.append(user)
        subject = user.split("Subject kind: ")[1].split("\n")[0]
        return reply(answers[subject])

    async def no_npn(names, today=None):
        raise RuntimeError("NPN is down")

    async def season(lat, lon, start, end):
        return _record(start, end)

    monkeypatch.setattr(record_cache, "daily_history", daily)      # a plant's typical year
    monkeypatch.setattr(record_cache, "almanac_history", season)   # the Fauna page's season
    monkeypatch.setattr(reference_store, "get", get)
    monkeypatch.setattr(reference_store, "put", put)
    monkeypatch.setattr(life_cycle, "ask", ask)
    monkeypatch.setattr(catalog, "species_phenophases", no_npn)
    return kept, asked


def look(**kw):
    kw = {"api_key": "k", "subject": "plant", "taxon_id": 76541,
          "scientific_name": "Cucurbita pepo", "today": TODAY, **kw}
    return asyncio.run(life_cycle_window.block_life_cycle(REGION, **kw))


def test_a_plants_stages_are_dated_in_order_from_the_typical_last_frost(world):
    out = look()
    on = [e["on_this_plot"] for e in out["events"]]
    assert all(on) and on == sorted(on)
    assert out["counted_from"] == "typical_last_frost"


def test_a_given_set_out_moves_every_stage(world):
    early = look(out_on=date(2026, 5, 15))["events"][0]["on_this_plot"]
    late = look(out_on=date(2026, 6, 15))["events"][0]["on_this_plot"]
    assert early < late


def test_an_animals_events_are_dated_as_the_fauna_page_dates_them(world):
    out = look(subject="animal", taxon_id=5212, scientific_name="Buteo jamaicensis")
    by = {e["name"]: e["on_this_plot"] for e in out["events"]}
    assert by["first eggs"] == "2026-03-28" and by["first flight"] == "2026-06-12"
    assert by["spring chorus"] and by["courtship flights"] is not None


def test_one_lookup_per_subject_and_band_however_many_growers_ask(world):
    _kept, asked = world
    first, second = look(), look()
    assert (first["kept"], second["kept"]) == (False, True) and len(asked) == 1
    assert first["key"] == "lifecycle:plant:taxon:76541"


def test_npn_being_down_costs_nothing_but_the_hint(world):
    assert look()["events"]


def test_no_key_and_nothing_kept_is_refused_so_nothing_is_charged(world):
    with pytest.raises(LifeCycleError):
        look(api_key="")


# ── The tool's refusals raise, and the key never shows ───────────────────


def _bare(fn):
    while hasattr(fn, "__wrapped__"):
        fn = fn.__wrapped__
    return fn


@pytest.mark.parametrize("kw", [
    {"subject": "rock", "taxon_id": 1},
    {"subject": "animal"},
    {"subject": "animal", "taxon_id": -1},
    {"subject": "animal", "taxon_id": True},
    {"subject": "animal", "common_name": "x" * 121},
    {"subject": "plant", "taxon_id": 1, "set_out": "June"},
])
def test_the_tool_refuses_what_names_no_subject(kw):
    with pytest.raises(ValueError):
        asyncio.run(_bare(server.life_cycle)(block="b1", npub="npub1x", **kw))


def test_the_operator_key_never_reaches_the_answer(world, monkeypatch):
    async def found(npub, block):
        return REGION, {"block_id": "b1", "base_temp_f": 50.0}

    async def creds(fields, **kw):
        return {"llm_api_key": "sk-or-SECRET-123"}
    monkeypatch.setattr(server, "_block_region", found)
    monkeypatch.setattr(server.runtime, "load_credentials", creds)
    out = asyncio.run(_bare(server.life_cycle)(block="b1", npub="npub1x", subject="animal",
                                               taxon_id=5212, scientific_name="Buteo jamaicensis"))
    assert out["events"] and "SECRET" not in json.dumps(out)
