"""Our own search first, then the LLM edits: which pages are read, what of them is
kept, what the LLM is handed, and that it may cite nothing else."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from tollbooth.web_search import Hit, WebSearchError

from goodearth_mcp import biota, life_cycle, llm_answer, plant_profile, reference_search
from goodearth_mcp.reference_search import Found, Source

ALL_ABOUT = "https://www.allaboutbirds.org/guide/Red-tailed_Hawk/lifehistory"


def hit(url: str, *snippets: str) -> Hit:
    return Hit(title=url.split("/")[2], url=url, description="", snippets=snippets)


# ── Which pages are read ─────────────────────────────────────────────────


def test_pages_are_trusted_one_per_site_taking_each_querys_best_in_turn():
    figures = [hit("https://spam.example.com/hawk"), hit("https://extension.umn.edu/a"),
               hit("https://extension.umn.edu/b"), hit("https://en.wikipedia.org/wiki/Hawk")]
    account = [hit(ALL_ABOUT), hit("https://www.audubon.org/hawk")]
    picked = [h.url for h in reference_search._picks([figures, account])]
    assert picked == [ALL_ABOUT, "https://extension.umn.edu/a", "https://www.audubon.org/hawk"]


class FakeBrave:
    def __init__(self, results):
        self.results, self.queries = results, []

    async def search(self, query, *, count=10, client=None):
        self.queries.append(query)
        return self.results.pop(0)


def test_gather_reads_the_pages_and_keeps_only_what_mentions_a_stage(monkeypatch):
    pages = {
        ALL_ABOUT: "Menu\nHome\nNesting\nClutch of 1–5 eggs.\nIncubation lasts 28–35 days.\n"
                   "Shop our store\nDonate today",
        "https://extension.umn.edu/a": "",  # would not load
    }

    async def fetch(url, *, user_agent, client=None):
        assert "goodearth-mcp" in user_agent
        return pages[url]
    monkeypatch.setattr(reference_search, "fetch_text", fetch)
    brave = FakeBrave([[hit(ALL_ABOUT)],
                       [hit("https://extension.umn.edu/a", "Young fledge at 42 days.", "Buy now")]])

    found = asyncio.run(reference_search.gather(
        brave, subject="animal", scientific_name="Buteo jamaicensis", common_name="Red-tailed Hawk"))

    assert brave.queries[0].startswith('"Buteo jamaicensis"')
    assert brave.queries[1].startswith('"Red-tailed Hawk"')
    assert found.queries == 2
    by_url = {s.url: s for s in found.sources}
    kept = "\n".join(by_url[ALL_ABOUT].passages)
    assert "Incubation lasts 28–35 days." in kept and "Donate" not in kept
    # A page that would not load still gives what the search quoted from it.
    assert by_url["https://extension.umn.edu/a"].passages == ("Young fledge at 42 days.",)


def test_each_source_is_trimmed(monkeypatch):
    async def fetch(url, *, user_agent, client=None):
        return "\n".join(f"Nest {i} " + "x" * 200 for i in range(200))
    monkeypatch.setattr(reference_search, "fetch_text", fetch)
    found = asyncio.run(reference_search.gather(
        FakeBrave([[hit(ALL_ABOUT)], []]), subject="animal",
        scientific_name="Buteo jamaicensis", common_name=""))
    assert sum(len(p) for p in found.sources[0].passages) <= reference_search.SOURCE_CHARS + 2


def test_no_key_or_a_failed_search_means_the_llm_searches(monkeypatch):
    assert asyncio.run(reference_search.sources_for(
        "", subject="plant", scientific_name="Cucurbita pepo", common_name="", text="")) == Found()

    async def down(*a, **kw):
        raise WebSearchError("search answered 429")
    monkeypatch.setattr(reference_search, "gather", down)
    assert asyncio.run(reference_search.sources_for(
        "k", subject="plant", scientific_name="Cucurbita pepo", common_name="", text="")) == Found()


# ── What the LLM is handed, and may cite ─────────────────────────────────


def test_a_citation_must_be_one_of_the_pages_given():
    given = {ALL_ABOUT}
    assert reference_search.cited(ALL_ABOUT + "/", given) == ALL_ABOUT + "/"
    assert reference_search.cited("https://made.up/page", given) == ""
    assert reference_search.cited("https://made.up/page", None) == "https://made.up/page"
    assert reference_search.cited("javascript:alert(1)", None) == ""


def test_the_sources_are_carried_in_the_user_turn():
    found = Found(sources=(Source(ALL_ABOUT, "All About Birds", ("Clutch 1–5", "Fledge 42 d")),),
                  queries=2)
    block = reference_search.prompt_block(found)
    assert ALL_ABOUT in block and "Clutch 1–5" in block and "Fledge 42 d" in block
    assert reference_search.prompt_block(Found()) == ""


def test_with_no_searches_the_llm_is_given_no_tools(monkeypatch):
    sent = []

    def handler(request):
        sent.append(json.loads(request.content))
        return httpx.Response(200, json={"content": []})
    real = httpx.AsyncClient
    monkeypatch.setattr(llm_answer.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    asyncio.run(llm_answer.ask("sk-test", system="s", user="u", max_tokens=10, searches=0))
    asyncio.run(llm_answer.ask("sk-test", system="s", user="u", max_tokens=10, searches=2))
    assert "tools" not in sent[0]
    assert sent[1]["tools"][0]["max_uses"] == 2


def test_an_edit_asks_without_search_on_its_own_prompt(monkeypatch):
    calls = []

    async def ask(api_key, *, system, user, max_tokens, searches, model="writer"):
        calls.append((system, searches))
        return {}
    monkeypatch.setattr(llm_answer, "ask", ask)
    for m in (life_cycle, plant_profile):
        asyncio.run(m.ask("k", "u", edit=True))
        asyncio.run(m.ask("k", "u"))
    assert calls == [(life_cycle.SYSTEM_EDIT, 0), (life_cycle.SYSTEM, 3),
                     (plant_profile.SYSTEM_EDIT, 0), (plant_profile.SYSTEM, 3)]


def test_an_edited_profile_keeps_only_what_its_given_pages_support():
    given = {"https://extension.umn.edu/vegetables/pumpkins"}
    answer = {
        "scientific_name": "Cucurbita pepo", "common_name": "Pumpkin",
        "published_gdd": {"gdd": 1500, "base_f": 50, "source_url": "https://made.up/gdd"},
        "sources": [{"title": "UMN", "url": "https://extension.umn.edu/vegetables/pumpkins"},
                    {"title": "?", "url": "https://made.up/page"}],
    }
    out = plant_profile.validate(json.dumps(answer), given=given)
    assert out["published_gdd"] is None
    assert [s["url"] for s in out["sources"]] == ["https://extension.umn.edu/vegetables/pumpkins"]


# ── When it is seen near here ────────────────────────────────────────────


def test_the_month_histogram_is_read_as_twelve_counts(monkeypatch):
    async def answer(client, url, params):
        assert params["interval"] == "month_of_year" and params["taxon_id"] == 48701
        return {"results": {"month_of_year": {"7": 133, "8": 157, "9": True}}}
    monkeypatch.setattr(biota, "_json", answer)
    got = asyncio.run(biota.fetch_month_histogram(48701, 42.4, -72.5, 250))
    assert got == {**{m: 0 for m in range(1, 13)}, 7: 133, 8: 157}


def test_the_sightings_are_told_as_sightings():
    user = life_cycle.prompt_for(subject="fungus", taxon_id=48701, scientific_name="Calvatia gigantea",
                                 common_name="", text_typed="", lat=42.4, phenophases=[],
                                 observed_by_month={m: (5 if m == 8 else 0) for m in range(1, 13)})
    assert "Aug 5" in user and "Jan 0" in user and "not a stage" in user
    quiet = life_cycle.prompt_for(subject="fungus", taxon_id=48701, scientific_name="C",
                                  common_name="", text_typed="", lat=42.4, phenophases=[],
                                  observed_by_month={m: 0 for m in range(1, 13)})
    assert "observations near here" not in quiet


@pytest.mark.parametrize("given,kept", [
    (None, ["courtship flights", "first eggs", "first flight", "spring chorus"]),
    ({ALL_ABOUT + "/"}, ["courtship flights"]),
])
def test_an_edited_life_cycle_cites_only_its_given_pages(given, kept):
    from tests.test_life_cycle import HAWK
    out = life_cycle.validate(json.dumps(HAWK), "animal", given=given)
    assert [e["name"] for e in out["events"]] == kept


def test_the_model_asked_for_is_the_model_sent(monkeypatch):
    sent = []

    def handler(request):
        sent.append(json.loads(request.content)["model"])
        return httpx.Response(200, json={"content": []})
    real = httpx.AsyncClient
    monkeypatch.setattr(llm_answer.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.delenv("TOLLBOOTH_LLM_MODEL_WRITER", raising=False)
    asyncio.run(llm_answer.ask("k", system="s", user="u", max_tokens=10, searches=0,
                               model="google/gemini-2.5-flash"))
    asyncio.run(llm_answer.ask("k", system="s", user="u", max_tokens=10, searches=0))
    assert sent == ["google/gemini-2.5-flash", "x-ai/grok-4.5"]


def test_an_answer_cut_off_is_said_plainly():
    """2026-10-29: a reasoning model spent its whole allowance thinking."""
    cut = {"stop_reason": "max_tokens", "content": [{"type": "thinking", "thinking": "hmm"}]}
    with pytest.raises(llm_answer.AnswerError, match="ran out of room"):
        llm_answer.tagged(cut, "lifecycle")
    with pytest.raises(llm_answer.AnswerError, match="without a lifecycle"):
        llm_answer.tagged({"stop_reason": "end_turn", "content": []}, "lifecycle")


def test_both_lookups_leave_room_for_a_model_that_thinks(monkeypatch):
    asked = []

    async def ask(api_key, *, system, user, max_tokens, searches, model="writer"):
        asked.append(max_tokens)
        return {}
    monkeypatch.setattr(llm_answer, "ask", ask)
    for m in (life_cycle, plant_profile):
        asyncio.run(m.ask("k", "u", edit=True))
    assert asked == [llm_answer.MAX_TOKENS] * 2 and llm_answer.MAX_TOKENS >= 12_000


def test_a_generation_may_take_minutes(monkeypatch):
    """2026-10-29: a reasoning model ran past the old 90 s ceiling every time."""
    seen = []

    def handler(request):
        return httpx.Response(200, json={"content": []})
    real = httpx.AsyncClient

    def client(**kw):
        seen.append(kw["timeout"])
        return real(transport=httpx.MockTransport(handler), **kw)
    monkeypatch.setattr(llm_answer.httpx, "AsyncClient", client)
    asyncio.run(llm_answer.ask("k", system="s", user="u", max_tokens=10, searches=0))
    assert seen and seen[0] >= 300
