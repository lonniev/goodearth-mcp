"""Asking the fleet's LLM a reference question, and reading its answer safely.

Both reference lookups — a plant's profile, a subject's life cycle — ask one
web-searching generation on `tollbooth.llm_route` for one JSON object inside a
named tag, then check every field before anything downstream sees it. The
answer is adversarial input like any other: a field out of range, mistyped or
unsourced comes back absent, never invented.
"""

from __future__ import annotations

import math
import re
from typing import Any

import httpx
from tollbooth.llm_route import (
    TIER_WRITER,
    build_messages_request,
    resolve_route,
    web_search_tool,
)

#: A web-searching generation is slow; a minute and a half is the ceiling.
TIMEOUT_S = 90.0


class AnswerError(ValueError):
    """The reference could not answer. A ValueError, so a paid call refunds."""


async def ask(api_key: str, *, system: str, user: str, max_tokens: int,
              searches: int) -> dict[str, Any]:
    """One web-searching generation, and the raw JSON it answered with."""
    route = resolve_route(api_key=api_key, tier=TIER_WRITER)
    req = build_messages_request(
        route, system=system, user=user, max_tokens=max_tokens,
        tools=[web_search_tool(searches)],
        timeout_seconds=TIMEOUT_S, timeout_max_seconds=TIMEOUT_S,
    )
    async with httpx.AsyncClient(timeout=req["timeout"]) as client:
        resp = await client.post(req["url"], headers=req["headers"], json=req["json"])
    if resp.status_code >= 400:
        # The body may echo request details; the status is all a patron needs.
        raise AnswerError(f"The reference did not answer (HTTP {resp.status_code}).")
    return resp.json()


def tagged(data: dict[str, Any], tag: str) -> str:
    """The text inside the last <tag>…</tag>, across every text block."""
    full = "".join(b.get("text", "") for b in data.get("content", []) if isinstance(b, dict)
                   and b.get("type") == "text")
    found = re.findall(rf"<{tag}>(.*?)</{tag}>", full, re.DOTALL)
    if not found:
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
