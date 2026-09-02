"""The shipped season-planning interview.

A prompt is a workflow the protocol carries, so its ORDER is the artefact.
These pin the two properties that make it worth shipping rather than leaving
each agent to invent one.
"""

from __future__ import annotations

import pytest

from goodearth_mcp.server import mcp


async def _text() -> str:
    p = await mcp.get_prompt("plan_the_season")
    rendered = await p.render({})
    msgs = getattr(rendered, "messages", rendered)
    return "".join(getattr(getattr(m, "content", None), "text", "") for m in msgs)


@pytest.mark.asyncio
async def test_the_prompt_is_shipped():
    assert "plan_the_season" in [p.name for p in await mcp.list_prompts()]


@pytest.mark.asyncio
async def test_the_audit_comes_before_any_claim_about_pests():
    """The whole reason the tool exists.

    An agent left to itself answers "which pests belong here" from its own
    training data — unverifiable, different per model, and confidently wrong
    exactly at the margins. The prompt must send it to the record first.
    """
    t = await _text()
    assert "goodearth_review_roster" in t
    assert t.index("goodearth_review_roster") < t.index("recites range knowledge")


@pytest.mark.asyncio
async def test_the_sequence_runs_decision_then_consequence():
    """Ordering is the artefact: which ground, what are you growing, what the
    ground says about it — not a tour of the available data."""
    t = await _text()
    order = ["Which plot", "already growing", "sowing window",
             "review_roster", "task list"]
    found = [t.index(s) for s in order]
    assert found == sorted(found), dict(zip(order, found, strict=True))


@pytest.mark.asyncio
async def test_the_prompt_carries_the_service_doctrine():
    """A workflow that omitted these would invite the agent to break them."""
    t = await _text()
    assert "never recommends a treatment" in t
    assert "does not publish" in t
    assert "Propose; never remove" in t
