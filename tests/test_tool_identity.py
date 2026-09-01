"""Every tool's id must be derived, not typed.

A DPYC tool_id is uuid5(DPYC_NAMESPACE, capability). It is the identity a
pricing model, an ACL entry and an audit record all key on, so a typo does
not fail loudly — it produces a tool nobody has priced and whose spend lands
under a name that matches nothing. Deriving it is the rule; this asserts it.
"""

from __future__ import annotations

import uuid

import pytest
from tollbooth.tool_identity import DPYC_NAMESPACE

from goodearth_mcp.server import TOOL_REGISTRY


def test_every_tool_id_is_uuid5_of_its_capability():
    wrong = {
        identity.capability: (tool_id, str(uuid.uuid5(DPYC_NAMESPACE, identity.capability)))
        for tool_id, identity in TOOL_REGISTRY.items()
        if tool_id != str(uuid.uuid5(DPYC_NAMESPACE, identity.capability))
    }
    assert not wrong, f"tool ids that do not derive from their capability: {wrong}"


def test_capabilities_are_unique():
    caps = [i.capability for i in TOOL_REGISTRY.values()]
    assert len(caps) == len(set(caps))


@pytest.mark.asyncio
async def test_every_declared_tool_is_actually_registered():
    """A ToolIdentity with no live tool is invisible, not broken-looking.

    Adding two tools by inserting them above an existing `@runtime.paid_tool`
    line silently stole the `@tool` decorator sitting above it: the new tool
    took the registration and TWO tools — the new one and the shipped
    `wildlife_calendar` — vanished from tools/list. Nothing failed. The
    module imported, the registry held all 16 identities, ruff and 432 tests
    passed, and a priced tool the Wildlife page depends on was simply gone
    from production until someone happened to call it.

    So the registry is checked against what the server will actually serve.
    """
    from goodearth_mcp.server import mcp

    served = {t.name for t in await mcp.list_tools()}
    declared = {f"goodearth_{i.capability}" for i in TOOL_REGISTRY.values()}
    missing = sorted(declared - served)
    assert not missing, f"declared but never registered with FastMCP: {missing}"
