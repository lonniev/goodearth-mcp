"""Finding a subject's sources ourselves, before the LLM edits them into an answer.

A web-searching generation reads whole pages, and pays for every word: a hawk's life
cycle cost 100,000–220,000 input tokens that way. Two searches of our own, on sites a
grower would trust, and the paragraphs of the top three pages that mention a stage, a
month or a threshold, come to a few thousand. The LLM then only edits them into the
fixed JSON — and may cite only what it was given.

When there is no search key, or our search finds nothing usable, the lookup asks the
LLM to search for itself as before. The search kit is the SDK's (`tollbooth.web_search`);
what to search for, and where, is Good Earth's, here.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

import httpx
from tollbooth.web_search import BraveSearch, Hit, WebSearchError, allowed, fetch_text, passages

from goodearth_mcp import llm_answer

logger = logging.getLogger(__name__)

USER_AGENT = "goodearth-mcp (+https://github.com/lonniev/goodearth-mcp)"

#: Sites a grower would take a stage or a threshold from. Universities and their
#: extension services, governments, the field guides, and a few seed houses whose
#: catalogs state days to maturity.
TRUSTED = (
    ".edu", ".gov", ".gov.uk", ".gc.ca", ".gov.au", ".ac.uk",
    "wikipedia.org", "allaboutbirds.org", "birdsoftheworld.org", "audubon.org",
    "inaturalist.org", "usanpn.org", "mushroomexpert.com", "bugwood.org",
    "missouribotanicalgarden.org", "rhs.org.uk", "extension.org",
    "johnnyseeds.com", "highmowingseeds.com", "territorialseed.com",
)

#: Two searches per lookup: one for the figures, one for the account.
QUERIES = {
    "plant": ("{name} days to maturity growing degree days base temperature",
              "{name} growing guide extension bloom harvest"),
    "pest": ("{name} degree day model life stages base temperature",
             "{name} life cycle extension generations"),
    "animal": ("{name} life history breeding nesting incubation fledging",
               "{name} seasonal timing migration arrival"),
    "fungus": ("{name} fruiting season conditions",
               "{name} mushroom life cycle when it fruits"),
}

_MONTHS = ("january", "february", "march", "april", "may ", "june", "july", "august",
           "september", "october", "november", "december", "spring", "summer", "autumn",
           " fall", "winter")
#: Words that mark a paragraph worth quoting, per subject.
KEYWORDS = {
    "plant": ("days", "degree", "gdd", "base temp", "matur", "harvest", "bloom", "flower",
              "frost", "germinat", "transplant", "sow", "height", "tall", "chill", "hardy",
              *_MONTHS),
    "pest": ("degree", "gdd", "base", "threshold", "egg", "larva", "instar", "pupa", "adult",
             "emerge", "flight", "generation", "overwinter", "hatch", *_MONTHS),
    "animal": ("breed", "nest", "egg", "clutch", "incubat", "hatch", "fledg", "young",
               "migrat", "arriv", "depart", "mating", "court", "litter", "hibernat",
               "daylight", "day length", *_MONTHS),
    "fungus": ("fruit", "season", "rain", "temperature", "spore", "mycel", "appear",
               "found from", "grows", *_MONTHS),
}

PAGES = 3
#: Per source, so three sources come to about 3,000 tokens.
SOURCE_CHARS = 4_000


@dataclass(frozen=True)
class Source:
    """One page, and the paragraphs of it worth the LLM's reading."""

    url: str
    title: str
    passages: tuple[str, ...]


@dataclass(frozen=True)
class Found:
    """What our own search found, and what it took."""

    sources: tuple[Source, ...] = ()
    queries: int = 0

    @property
    def urls(self) -> set[str]:
        return {s.url for s in self.sources}


def _picks(results: list[list[Hit]]) -> list[Hit]:
    """The pages to read: trusted, one per site, taking each query's best in turn."""
    picked: list[Hit] = []
    hosts: set[str] = set()
    for rank in range(max((len(r) for r in results), default=0)):
        for hits in results:
            if rank >= len(hits) or len(picked) >= PAGES:
                continue
            hit = hits[rank]
            host = (urlsplit(hit.url).hostname or "").lower()
            if host in hosts or not allowed(hit.url, TRUSTED):
                continue
            hosts.add(host)
            picked.append(hit)
    return picked


def _quoted(name: str) -> str:
    return f'"{name}"' if " " in name else name


async def gather(brave: BraveSearch, *, subject: str, scientific_name: str,
                 common_name: str) -> Found:
    """Our own search for this subject's sources. Raises ``WebSearchError`` when search does.

    The figures are searched by the scientific name, which the extension services and
    degree-day models use; the account by the common name, which a field guide leads with.
    """
    by_figures = scientific_name or common_name
    by_account = common_name or scientific_name
    if not by_figures:
        return Found()
    keywords = KEYWORDS[subject]
    figures, account = QUERIES[subject]
    queries = [figures.format(name=_quoted(by_figures)), account.format(name=_quoted(by_account))]
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*(brave.search(q, count=10, client=client) for q in queries))
        picks = _picks(list(results))
        pages = await asyncio.gather(*(fetch_text(h.url, user_agent=USER_AGENT, client=client)
                                       for h in picks))
    sources = []
    for hit, page in zip(picks, pages, strict=True):
        # A page that would not load, or says nothing to the point, may still have
        # said it in the lines the search quoted from it.
        kept = (passages(page, keywords, max_chars=SOURCE_CHARS)
                or passages("\n".join((hit.description, *hit.snippets)), keywords, around=0,
                            max_chars=SOURCE_CHARS))
        if kept:
            sources.append(Source(url=hit.url, title=hit.title, passages=tuple(kept)))
    return Found(sources=tuple(sources), queries=len(queries))


async def sources_for(search_key: str, *, subject: str, scientific_name: str,
                      common_name: str, text: str) -> Found:
    """Our own sources, or none: no key, a failed search and nothing found are all
    the same to the caller, which then lets the LLM search for itself."""
    if not search_key:
        return Found()
    try:
        return await gather(BraveSearch(search_key), subject=subject,
                            scientific_name=scientific_name, common_name=common_name or text)
    except WebSearchError as exc:
        logger.warning("reference search unavailable (%s); the LLM searches instead", exc)
        return Found()


def prompt_block(found: Found) -> str:
    """The sources, as the user turn carries them."""
    if not found.sources:
        return ""
    parts = ["", "Sources (use only these; cite each by its URL):"]
    for i, s in enumerate(found.sources, 1):
        parts.append(f"\n[{i}] {s.title}\nURL: {s.url}\n" + "\n…\n".join(s.passages))
    return "\n".join(parts)


#: Added to a SYSTEM prompt when the sources are given rather than searched for.
EDIT_RULE = (
    "\n- No web search is available. Use ONLY the sources given in the request. Every "
    "URL you give must be one of their URLs, exactly. Leave out whatever they do not "
    "support."
)


def cited(u: Any, given: set[str] | None) -> str:
    """A cited URL, or '' — and, when sources were given, '' for one not among them."""
    found = llm_answer.url(u)
    if not found or given is None:
        return found
    return found if _norm(found) in {_norm(g) for g in given} else ""


def _norm(u: str) -> str:
    return u.split("#")[0].rstrip("/").lower()


def spent(data: dict[str, Any], found: Found) -> dict[str, Any]:
    """What a lookup took: how it searched, and the generation's own usage."""
    return {
        **llm_answer.usage_of(data),
        "mode": "edit" if found.sources else "web_search",
        "our_searches": found.queries,
        "pages": len(found.sources),
    }
