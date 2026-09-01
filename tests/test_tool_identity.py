"""Every tool's id must be derived, not typed.

A DPYC tool_id is uuid5(DPYC_NAMESPACE, capability). It is the identity a
pricing model, an ACL entry and an audit record all key on, so a typo does
not fail loudly — it produces a tool nobody has priced and whose spend lands
under a name that matches nothing. Deriving it is the rule; this asserts it.
"""

from __future__ import annotations

import uuid

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
