"""Good Earth — region-scoped farm climate analytics MCP server.

Standard DPYC tools (check_balance, purchase_credits, Secure Courier,
Oracle, pricing, constraints) come from ``register_standard_tools`` in the
tollbooth-dpyc wheel. Only domain tools are defined here.

Run locally:
    python -m goodearth_mcp.server
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastmcp import FastMCP
from pydantic import Field
from tollbooth.credential_templates import CredentialTemplate, FieldSpec
from tollbooth.credential_validators import validate_btcpay_creds
from tollbooth.runtime import OperatorRuntime, register_standard_tools
from tollbooth.tool_identity import STANDARD_IDENTITIES, ToolIdentity

from goodearth_mcp import __version__, season, sources
from goodearth_mcp.frost_window import FrostError
from goodearth_mcp.frost_window import region_frost_window as frost_window_impl
from goodearth_mcp.region import RegionError, parse_region

logger = logging.getLogger(__name__)

mcp = FastMCP(
    "goodearth-mcp",
    instructions=(
        "Good Earth — region-scoped climate analytics for small specialty-crop "
        "and flower farms, monetized via Tollbooth DPYC Bitcoin Lightning "
        "micropayments.\n\n"
        "## The region is the point\n"
        "A farm is not a pin. Every tool takes a GeoJSON polygon or "
        "{lat, lon, radius_m}, samples the terrain inside it, and reports an "
        "aggregate PLUS the spread across it — because a bench and a hollow on "
        "the same acreage do not share a frost date.\n\n"
        "## Onboarding\n"
        "Call goodearth_get_operator_onboarding_status to check readiness.\n"
        "1. Register with an Authority (provides a Neon database automatically)\n"
        "2. Deliver operator secrets via Secure Courier:\n"
        "   - btcpay_host, btcpay_api_key, btcpay_store_id\n"
        "   Call goodearth_request_credential_channel to start.\n\n"
        "## Pricing\n"
        "Tool prices are set dynamically by the operator's pricing model. Use "
        "`goodearth_check_price` to preview costs and `goodearth_check_balance` "
        "to see your balance."
    ),
)

# ---------------------------------------------------------------------------
# Tool registry
# ---------------------------------------------------------------------------

# Frozen UUIDs — minted once at tool birth via capability_uuid() and never
# changed. Renaming a capability later leaves these intact, so the pricing
# rows in Neon stay keyed correctly. The full Good Earth catalog is declared
# here so each identity is minted exactly once; only the tools that are
# actually implemented are registered below.
GDD_SEASON_CURVE_UUID      = "886ebfd6-dde4-5297-9145-2154caefb943"
REGION_CLIMATE_BUNDLE_UUID = "2a6cda20-40e0-5aea-8b3a-3f8310937f05"  # T2
FROST_WINDOW_UUID          = "2b611018-f61d-5d72-bc8e-27abb605b669"
DLI_CURVE_UUID             = "b111cfd0-1bef-5cf4-907c-37bbf8d2d96a"  # T3
WATER_BALANCE_UUID         = "c4ec3643-1e8b-59bc-a239-82353c4a0f52"  # T3
SOIL_TEMP_PROJECTION_UUID  = "03764cdc-c9d9-5396-9eb1-9b7f56da08f6"  # T4
CROP_GDD_STATUS_UUID       = "a8f72831-77df-57d4-9e6a-dcf81b06832e"  # T4
FINISH_BEFORE_FROST_UUID   = "b5f11328-8d8f-58db-ba89-11f8cbcc3314"  # T4
PEST_THRESHOLD_UUID        = "79463a63-2076-5376-a357-673c4adb33f0"  # T5
CALIBRATION_UUID           = "2e7c72db-e886-53be-b948-bcc97a57986d"  # T6

_DOMAIN_TOOLS = [
    ToolIdentity(
        tool_id=GDD_SEASON_CURVE_UUID,
        capability="gdd_season_curve",
        category="read",
        intent="Growing degree day accumulation across a region, against recent seasons",
    ),
    ToolIdentity(
        tool_id=FROST_WINDOW_UUID,
        capability="frost_window",
        category="read",
        intent="First-frost dates for a region, and this week's risk to its coldest ground",
    ),
]

TOOL_REGISTRY: dict[str, ToolIdentity] = {ti.tool_id: ti for ti in _DOMAIN_TOOLS}

# ---------------------------------------------------------------------------
# OperatorRuntime
# ---------------------------------------------------------------------------

runtime = OperatorRuntime(
    tool_registry={**STANDARD_IDENTITIES, **TOOL_REGISTRY},
    operator_credential_template=CredentialTemplate(
        service="goodearth-operator",
        version=1,
        description="Operator credentials for BTCPay Lightning payments",
        fields={
            "btcpay_host": FieldSpec(
                required=True, sensitive=True,
                description="The URL of your BTCPay Server instance (e.g. https://btcpay.example.com).",
            ),
            "btcpay_api_key": FieldSpec(
                required=True, sensitive=True,
                description="Your BTCPay Server API key. Generate one under Account > Manage Account > API Keys.",
            ),
            "btcpay_store_id": FieldSpec(
                required=True, sensitive=True,
                description="Your BTCPay Store ID. Find it under Stores > Settings > General.",
            ),
        },
    ),
    operator_credential_greeting=(
        "Hi — I'm Good Earth, region-scoped climate analytics for small farms. "
        "You (or your AI agent) requested a credential channel."
    ),
    service_name="Good Earth",
    credential_validator=validate_btcpay_creds,
)

tool = register_standard_tools(
    mcp,
    "goodearth",
    runtime,
    service_name="goodearth-mcp",
    service_version=__version__,
)


# ---------------------------------------------------------------------------
# Domain tools
# ---------------------------------------------------------------------------


@tool
@runtime.paid_tool(GDD_SEASON_CURVE_UUID)
async def gdd_season_curve(
    region: Annotated[
        dict[str, Any],
        Field(
            description=(
                "The ground to answer for. Either a GeoJSON Polygon (bare "
                "geometry or a Feature wrapping one) or a pin: "
                '{"lat": 44.48, "lon": -73.21, "radius_m": 800}.'
            ),
        ),
    ],
    base_temp: Annotated[
        float,
        Field(
            description=(
                "Crop base temperature in °F — the threshold below which the "
                "crop does not accumulate heat. 50 °F is the field-corn "
                "convention; cool-season crops use 32-40 °F."
            ),
        ),
    ] = 50.0,
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Growing degree day accumulation across a region, season to date.

    Returns accumulation with its spread across your ground, the band of the
    last ten seasons to read it against, a 7-day forecast extension, and a
    projection at the recent rate.

    The spread is the answer's point: it says how much the same field varies
    from bench to hollow, which is what decides whether one planting date
    serves the whole block.

    Args:
        region: GeoJSON Polygon or {lat, lon, radius_m}.
        base_temp: Crop base temperature in °F (20-80).
    """
    try:
        parsed = parse_region(region)
    except RegionError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_region"}

    try:
        return await season.region_season_curve(parsed, base_temp)
    except season.SeasonError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        # Upstream feeds are outside our control; everything else is a bug
        # and must surface rather than be swallowed into a tidy error string.
        logger.warning("gdd_season_curve failed: %s", exc)
        return {
            "success": False,
            "error": f"A weather feed did not answer: {exc}",
            "error_code": "upstream_unavailable",
        }


@tool
@runtime.paid_tool(FROST_WINDOW_UUID)
async def frost_window(
    region: Annotated[
        dict[str, Any],
        Field(
            description=(
                "The ground to answer for. Either a GeoJSON Polygon (bare "
                "geometry or a Feature wrapping one) or a pin: "
                '{"lat": 44.48, "lon": -73.21, "radius_m": 800}.'
            ),
        ),
    ],
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """When frost normally arrives on this ground, and whether it is coming this week.

    Returns first-frost dates from the last ten seasons, how far the region's
    own terrain spreads that, and a night-by-night assessment of the coming
    forecast for the *coldest* ground rather than the average.

    The spread is the answer's point. Frost forms on still, clear nights when
    cold air drains off high ground and pools in low, so a single forecast low
    is optimistic for a hollow and pessimistic for a bench on the same block.

    Args:
        region: GeoJSON Polygon or {lat, lon, radius_m}.
    """
    try:
        parsed = parse_region(region)
    except RegionError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_region"}

    try:
        return await frost_window_impl(parsed)
    except FrostError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("frost_window failed: %s", exc)
        return {
            "success": False,
            "error": f"A weather feed did not answer: {exc}",
            "error_code": "upstream_unavailable",
        }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """Main entry point for the server."""
    from tollbooth import validate_operator_tools

    missing = validate_operator_tools(mcp, "goodearth")
    if missing:
        import sys

        print(f"⚠ Missing base-catalog tools: {', '.join(missing)}", file=sys.stderr)
    mcp.run()


if __name__ == "__main__":
    main()
