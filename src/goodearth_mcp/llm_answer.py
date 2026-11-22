"""Good Earth's settings for asking the fleet's LLM a reference question.

Both reference lookups (a plant's profile, a subject's life cycle) ask one
generation for one JSON object inside a named tag: an edit of sources our own
search found (`reference_search`), or a web search of its own when there are none.
Sending it and reading the answer safely is the SDK's (`tollbooth.llm_call`); what
stays here is what Good Earth measured: how long, how many searches, how many tokens.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable
from typing import Any, TypeVar

from tollbooth import llm_call
from tollbooth.llm_route import TIER_WRITER

logger = logging.getLogger(__name__)

T = TypeVar("T")

#: How long one generation may take. Measured 2026-10-29 at low reasoning
#: effort: the robin, the eggplant and the Japanese beetle each took 16–21 s;
#: at the model's default effort a bluebird took 132 s. Sized from the first,
#: with room for a slow provider: a lookup that needs more is thinking too long.
TIMEOUT_S = 90.0

#: Web searches one reference lookup may make. Sampled 2026-10-28 on a common
#: bird and an obscure fungus: two or three searches found everything there
#: was; more only read further pages that said nothing new, at about 30,000
#: input tokens each.
MAX_SEARCHES = 3


#: Output tokens one answer may take, thinking included. Measured 2026-10-29
#: at low reasoning effort: 1,047–1,598; at default effort a bluebird took
#: 7,538 and a free Nemotron filled 12,000 without answering. A ceiling sized
#: from the first, two and a half times the largest.
MAX_TOKENS = 4_000


async def ask(api_key: str, *, system: str, user: str, max_tokens: int,
              searches: int, model: str = TIER_WRITER, effort: str = "default") -> dict[str, Any]:
    """One reference generation, in the measured time. With ``searches`` 0 it may not
    search: it edits the sources the user turn carries."""
    return await llm_call.ask(api_key, system=system, user=user, max_tokens=max_tokens, model=model,
                              effort=effort, searches=searches, timeout_s=TIMEOUT_S, purpose="reference LLM")


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
