"""Asking the fleet's LLM a reference question, and reading its answer safely.

Both reference lookups — a plant's profile, a subject's life cycle — ask one
generation on `tollbooth.llm_route` for one JSON object inside a named tag: an
edit of sources our own search found (`reference_search`), or a web search of
its own when there are none, then check every field before anything downstream sees it. The
answer is adversarial input like any other: a field out of range, mistyped or
unsourced comes back absent, never invented.
"""

from __future__ import annotations

import logging
import math
import re
import time
from collections.abc import Awaitable
from typing import Any, TypeVar

import httpx
from tollbooth.llm_route import (
    TIER_WRITER,
    build_messages_request,
    error_message,
    llm_failure_situation,
    model_for,
    resolve_route,
    web_search_tool,
)

logger = logging.getLogger(__name__)

T = TypeVar("T")

#: How long one generation may take. A model that reasons first is slow: grok-4.5
#: took about 83 s for a hawk, and a free Nemotron with room to think ran past
#: the old 90 s ceiling every time, so each attempt was abandoned unanswered
#: (2026-10-29). Each subject is looked up once and kept, so waiting for it is
#: cheaper than asking again.
TIMEOUT_S = 300.0

#: Web searches one reference lookup may make. Sampled 2026-10-28 on a common
#: bird and an obscure fungus: two or three searches found everything there
#: was; more only read further pages that said nothing new, at about 30,000
#: input tokens each.
MAX_SEARCHES = 3


#: Output tokens one answer may take, thinking included. A reasoning model
#: thinks before it answers, and its thinking counts here: on 2026-10-29 a free
#: Nemotron spent all of a 3,000-token cap thinking and stopped ("length")
#: before writing a word. A model stops when it is done, so the cap is a
#: ceiling, not a spend: grok-4.5 took about 4,900 for a hawk.
MAX_TOKENS = 12_000


class AnswerError(ValueError):
    """The reference could not answer. A ValueError, so a paid call refunds."""


async def ask(api_key: str, *, system: str, user: str, max_tokens: int,
              searches: int, model: str = TIER_WRITER) -> dict[str, Any]:
    """One generation, and the raw JSON it answered with. With ``searches`` 0 it
    may not search: it edits the sources the user turn carries. ``model`` is a
    tier or a slug — the operator's property for this use."""
    route = resolve_route(api_key=api_key, model=model_for(model))
    req = build_messages_request(
        route, system=system, user=user, max_tokens=max_tokens,
        tools=[web_search_tool(searches)] if searches > 0 else None,
        timeout_seconds=TIMEOUT_S, timeout_max_seconds=TIMEOUT_S,
    )
    async with httpx.AsyncClient(timeout=req["timeout"]) as client:
        resp = await client.post(req["url"], headers=req["headers"], json=req["json"])
    if resp.status_code >= 400:
        # Said in the SDK's words: an empty provider account, a bad key and a
        # retired model each read as what they are, safely. The raw status and
        # body stay here, in the operator's log.
        try:
            body: object = resp.json()
        except ValueError:
            body = resp.text
        situation = llm_failure_situation(status=resp.status_code, body=body)
        logger.warning("reference LLM refused: HTTP %s %s (%s)", resp.status_code,
                       situation.error_code, error_message(body)[:200])
        raise AnswerError(situation.message)
    data = resp.json()
    logger.info("reference LLM: %s", usage_of(data))
    return data


def usage_of(data: dict[str, Any]) -> dict[str, Any]:
    """What one generation spent: model, web searches, tokens. Kept with the
    answer, so whether the search cap is right is read from real lookups."""
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    tool_use = usage.get("server_tool_use") if isinstance(usage.get("server_tool_use"), dict) else {}
    searches = tool_use.get("web_search_requests")
    if searches is None:
        searches = sum(1 for b in data.get("content", []) if isinstance(b, dict)
                       and b.get("type") == "server_tool_use" and b.get("name") == "web_search")
    # The provider counts prompt-cache reads and writes apart from the rest of
    # the input; billed input is all three. 2026-10-29: a lookup reported 113
    # input tokens that OpenRouter's log showed as 3,825.
    cached = int(usage.get("cache_read_input_tokens") or 0)
    written = int(usage.get("cache_creation_input_tokens") or 0)
    # How the output divided between thinking and the answer, so a cap or a
    # reasoning setting is sized from real lookups rather than guessed.
    blocks = [b for b in data.get("content", []) if isinstance(b, dict)]
    details = usage.get("output_tokens_details") if isinstance(usage.get("output_tokens_details"), dict) else {}
    return {
        "model": str(data.get("model") or ""),
        "searches": int(searches or 0),
        "input_tokens": int(usage.get("input_tokens") or 0) + cached + written,
        "cached_input_tokens": cached,
        "output_tokens": int(usage.get("output_tokens") or 0),
        "reasoning_tokens": details.get("reasoning_tokens"),
        "thinking_chars": sum(len(str(b.get("thinking") or "")) for b in blocks if b.get("type") == "thinking"),
        "answer_chars": sum(len(str(b.get("text") or "")) for b in blocks if b.get("type") == "text"),
        "stop_reason": str(data.get("stop_reason") or ""),
    }


class Steps:
    """How long each step of one lookup took — logged as each starts and ends,
    so a step that never ends shows in the log as the last one started."""

    def __init__(self, key: str) -> None:
        self.key = key
        self.took: dict[str, float] = {}

    async def run(self, name: str, step: Awaitable[T]) -> T:
        logger.info("lookup %s: %s…", self.key, name)
        start = time.monotonic()
        try:
            return await step
        finally:
            self.took[name] = round(time.monotonic() - start, 1)
            logger.info("lookup %s: %s took %.1fs", self.key, name, self.took[name])


def tagged(data: dict[str, Any], tag: str) -> str:
    """The text inside the last <tag>…</tag>, across every text block."""
    full = "".join(b.get("text", "") for b in data.get("content", []) if isinstance(b, dict)
                   and b.get("type") == "text")
    found = re.findall(rf"<{tag}>(.*?)</{tag}>", full, re.DOTALL)
    if not found:
        if data.get("stop_reason") == "max_tokens":
            raise AnswerError("The reference ran out of room before it answered; nothing was charged.")
        raise AnswerError(f"The reference answered without a {tag}.")
    return found[-1].strip()


def number(v: Any, lo: float, hi: float) -> float | None:
    """A finite number in range, or nothing. A bool is not a number."""
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        return None
    return float(v) if lo <= v <= hi else None


def whole(v: Any, lo: int, hi: int) -> int | None:
    n = number(v, lo, hi)
    return round(n) if n is not None else None


def text(v: Any, limit: int = 300) -> str:
    """A string, whitespace collapsed and cut to ``limit``; anything else is ''."""
    if not isinstance(v, str):
        return ""
    return re.sub(r"\s+", " ", v).strip()[:limit]


def url(v: Any) -> str:
    """An http(s) URL with nothing a page could misuse, or ''."""
    u = text(v, 500)
    return u if re.match(r"^https?://[^\s<>\"']+$", u) else ""


def one_of(v: Any, allowed: tuple[str, ...]) -> str | None:
    t = text(v, 20).lower()
    return t if t in allowed else None
