"""A paid tool that could not answer keeps no fare, and keeps its error code."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from goodearth_mcp import server, sources
from goodearth_mcp.region import parse_region

NPUB = "npub1" + "q" * 58
TOOL_ID = "refusal-test-tool"


def _charged(monkeypatch: pytest.MonkeyPatch, answer: dict[str, Any]) -> tuple[Any, AsyncMock]:
    """A tool under the real wrapper, its debit stubbed and its refund watched."""
    monkeypatch.setattr(server.runtime, "debit_or_deny", AsyncMock(return_value=7))
    monkeypatch.setattr(server.runtime, "inject_low_balance_warning", AsyncMock(side_effect=lambda r, _n: r))
    for name in (
        "fire_and_forget_demand_increment",
        "fire_and_forget_supply_increment",
        "fire_and_forget_notarize_if_stale",
    ):
        monkeypatch.setattr(server.runtime, name, lambda *_a, **_k: None)
    monkeypatch.setattr(server.runtime, "mcp_name_for", lambda _t: "goodearth_test")
    refund = AsyncMock()
    monkeypatch.setattr(server.runtime, "rollback_debit", refund)

    @server.runtime.paid_tool(TOOL_ID)
    async def a_tool(npub: str = "") -> dict[str, Any]:
        return dict(answer)

    return a_tool, refund


@pytest.mark.parametrize("code", ["upstream_unavailable", "persistence_unavailable", "invalid_request"])
async def test_a_returned_refusal_refunds_once_and_keeps_its_code(monkeypatch, code):
    tool, refund = _charged(monkeypatch, {"success": False, "error": "No.", "error_code": code})
    result = await tool(npub=NPUB)
    refund.assert_awaited_once_with(TOOL_ID, NPUB)
    assert result["error_code"] == code
    assert result["error"] == "No. Nothing was charged."


async def test_an_answer_keeps_its_fare(monkeypatch):
    tool, refund = _charged(monkeypatch, {"success": True, "value": 1})
    assert (await tool(npub=NPUB))["value"] == 1
    refund.assert_not_awaited()


async def test_a_tool_with_no_patron_refunds_nobody(monkeypatch):
    monkeypatch.setattr(server.runtime, "debit_or_deny", AsyncMock(return_value=0))
    refund = AsyncMock()
    monkeypatch.setattr(server.runtime, "rollback_debit", refund)

    @server.runtime.paid_tool(TOOL_ID)
    async def no_patron(token: str) -> dict[str, Any]:
        return {"success": False, "error": "Unknown feed.", "error_code": "not_found"}

    result = await no_patron(token="abc")
    refund.assert_not_awaited()
    assert result["error"] == "Unknown feed."


@pytest.mark.parametrize("tool_name", ["gdd_season_curve", "almanac"])
async def test_a_feed_outage_is_reported_as_one_and_refunded(monkeypatch, tool_name):
    """The grower's 503: the block was fine, so the answer must not say it was not."""
    region = parse_region({"lat": 44.48, "lon": -73.21, "radius_m": 900})

    async def down(*_a, **_k):
        raise sources.UpstreamError("https://archive-api.open-meteo.com/v1/archive returned HTTP 503")

    monkeypatch.setattr(sources, "_history_any_feed", down)
    monkeypatch.setattr(sources, "fetch_elevations", AsyncMock(return_value=[100.0] * 9))
    monkeypatch.setattr(server, "_block_region", AsyncMock(return_value=(region, {})))
    _tool, refund = _charged(monkeypatch, {})

    result = await getattr(server, tool_name)(block="a", npub=NPUB)

    assert result["error_code"] == "upstream_unavailable"
    assert "HTTP 503" in result["error"]
    assert result["error"].endswith("Nothing was charged.")
    refund.assert_awaited_once()
