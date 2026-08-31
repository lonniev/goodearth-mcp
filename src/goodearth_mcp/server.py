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
from goodearth_mcp.almanac_window import AlmanacError
from goodearth_mcp.almanac_window import region_almanac as almanac_impl
from goodearth_mcp.calibrate import CalibrateError
from goodearth_mcp.calibrate import region_calibration as calibration_impl
from goodearth_mcp.calibration import CalibrationError
from goodearth_mcp.crop_status import LedgerError
from goodearth_mcp.crop_status import region_crop_ledger as crop_ledger_impl
from goodearth_mcp.crops import CropError
from goodearth_mcp.frost_window import FrostError
from goodearth_mcp.frost_window import region_frost_window as frost_window_impl
from goodearth_mcp.pest_window import PestWindowError
from goodearth_mcp.pest_window import region_pest_window as pest_window_impl
from goodearth_mcp.pests import PestError
from goodearth_mcp.region import RegionError, parse_region
from goodearth_mcp.soil import SoilError
from goodearth_mcp.soil_window import SoilWindowError
from goodearth_mcp.soil_window import region_soil_window as soil_window_impl
from goodearth_mcp.wildlife import WildlifeError
from goodearth_mcp.wildlife_window import WildlifeWindowError
from goodearth_mcp.wildlife_window import region_wildlife as wildlife_impl

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
SOIL_TEMP_PROJECTION_UUID  = "03764cdc-c9d9-5396-9eb1-9b7f56da08f6"
CROP_GDD_STATUS_UUID       = "a8f72831-77df-57d4-9e6a-dcf81b06832e"
FINISH_BEFORE_FROST_UUID   = "b5f11328-8d8f-58db-ba89-11f8cbcc3314"  # T4
PEST_THRESHOLD_UUID        = "79463a63-2076-5376-a357-673c4adb33f0"
CALIBRATION_UUID           = "2e7c72db-e886-53be-b948-bcc97a57986d"
ALMANAC_UUID               = "ca2ca4ce-69ed-559a-9a7d-12425716dbae"
WILDLIFE_CALENDAR_UUID     = "b8948acf-27c1-5e72-aeae-b7029567f364"

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
    ToolIdentity(
        tool_id=CROP_GDD_STATUS_UUID,
        capability="crop_gdd_status",
        category="heavy",
        intent="Heat to target and projected date for every planting on a block, with a frost verdict",
    ),
    ToolIdentity(
        tool_id=SOIL_TEMP_PROJECTION_UUID,
        capability="soil_temp_projection",
        category="read",
        intent="When soil at planting depth crosses a threshold on this ground",
    ),
    ToolIdentity(
        tool_id=PEST_THRESHOLD_UUID,
        capability="pest_threshold",
        category="read",
        intent="Where a pest model's degree-day stages stand on this ground, and when the next arrives",
    ),
    ToolIdentity(
        tool_id=CALIBRATION_UUID,
        capability="calibration",
        category="write",
        intent="Turn a block's own field reports into a per-region correction on the model",
    ),
    ToolIdentity(
        tool_id=ALMANAC_UUID,
        capability="almanac",
        category="heavy",
        intent="Temperature, dew point, rain, sun and moon for a region — normal, actual and forecast",
    ),
    ToolIdentity(
        tool_id=WILDLIFE_CALENDAR_UUID,
        capability="wildlife_calendar",
        category="read",
        intent="When a grower's own wildlife events arrive on this ground — heat, daylight or calendar driven",
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


@tool
@runtime.paid_tool(CROP_GDD_STATUS_UUID)
async def crop_gdd_status(
    region: Annotated[
        dict[str, Any],
        Field(description="GeoJSON Polygon or {lat, lon, radius_m} — the ground these plantings are on."),
    ],
    plantings: Annotated[
        list[dict[str, Any]],
        Field(
            description=(
                "The block's plantings. Each is "
                '{"crop": "Lisianthus", "gdd_target": 1050, "set_out": "2026-07-06"} '
                'with an optional "base_temp" in °F when the crop counts from '
                "something other than the block default."
            ),
        ),
    ],
    base_temp: Annotated[
        float,
        Field(description="Default base temperature in °F for plantings that do not set their own."),
    ] = 50.0,
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Where every planting on a block stands, and whether it finishes before frost.

    Returns, per planting: heat accumulated since set-out against its target,
    the projected date it reaches that target at the season's recent rate, and
    a verdict on whether that lands before the median first frost.

    One call answers the whole block. The season curve and the frost record are
    shared across plantings, so asking about eight beds costs one round trip
    rather than eight.

    Args:
        region: GeoJSON Polygon or {lat, lon, radius_m}.
        plantings: The block's plantings.
        base_temp: Default base temperature in °F.
    """
    try:
        parsed = parse_region(region)
    except RegionError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_region"}

    try:
        return await crop_ledger_impl(parsed, plantings, base_temp)
    except (LedgerError, CropError) as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("crop_gdd_status failed: %s", exc)
        return {
            "success": False,
            "error": f"A weather feed did not answer: {exc}",
            "error_code": "upstream_unavailable",
        }


@tool
@runtime.paid_tool(SOIL_TEMP_PROJECTION_UUID)
async def soil_temp_projection(
    region: Annotated[
        dict[str, Any],
        Field(description="GeoJSON Polygon or {lat, lon, radius_m}."),
    ],
    threshold: Annotated[
        float,
        Field(description="The soil temperature in °F that opens or closes the window. Garlic goes in below about 60."),
    ] = 60.0,
    direction: Annotated[
        str,
        Field(description="'cooling' for an autumn window, 'warming' for a spring one."),
    ] = "cooling",
    band: Annotated[
        str,
        Field(description="'planting' for 7-28 cm (~3-11 in, the default) or 'shallow' for 0-7 cm."),
    ] = "planting",
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """When the soil on this ground crosses a planting threshold.

    Returns the near-term forecast at planting depth, the date it crosses
    within that horizon if it does, and when the crossing normally happens
    here — so a grower knows both "plant this week?" and "how long have I got?".

    Soil lags air by weeks and is the steadier signal. It is what decides
    whether a clove or a seed should go in, not one warm afternoon.

    Args:
        region: GeoJSON Polygon or {lat, lon, radius_m}.
        threshold: Soil temperature in °F.
        direction: 'cooling' (autumn) or 'warming' (spring).
        band: Soil depth band.
    """
    try:
        parsed = parse_region(region)
    except RegionError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_region"}

    try:
        return await soil_window_impl(parsed, threshold, direction, band)
    except (SoilWindowError, SoilError) as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("soil_temp_projection failed: %s", exc)
        return {"success": False, "error": f"A weather feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(PEST_THRESHOLD_UUID)
async def pest_threshold(
    region: Annotated[
        dict[str, Any],
        Field(description="GeoJSON Polygon or {lat, lon, radius_m}."),
    ],
    pests: Annotated[
        list[dict[str, Any]],
        Field(
            description=(
                "The pest models to evaluate, from your extension service. Each is "
                '{"pest": "Aster leafhopper", "base_temp": 50, "biofix": "2026-05-01", '
                '"stages": [{"stage": "second flight", "gdd": 1850}]}. '
                "biofix is optional; without it the count runs from Jan 1."
            ),
        ),
    ],
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Where a pest model's degree-day stages stand on this ground.

    Returns, per model: heat accumulated since its biofix, which stages have
    been crossed, and the projected date of the next one — plus a short list of
    which pests are worth walking the rows for this week.

    Good Earth computes when your models arrive on your ground. It does not
    publish entomology: the thresholds are yours, because the authoritative
    numbers belong to your extension service and vary by region and biotype.

    Args:
        region: GeoJSON Polygon or {lat, lon, radius_m}.
        pests: Your pest models.
    """
    try:
        parsed = parse_region(region)
    except RegionError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_region"}

    try:
        return await pest_window_impl(parsed, pests)
    except (PestWindowError, PestError) as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("pest_threshold failed: %s", exc)
        return {"success": False, "error": f"A weather feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(CALIBRATION_UUID)
async def calibration(
    region: Annotated[
        dict[str, Any],
        Field(description="GeoJSON Polygon or {lat, lon, radius_m} — the block these reports are from."),
    ],
    observations: Annotated[
        list[dict[str, Any]],
        Field(
            description=(
                "The block's field reports. A frost report is "
                '{"kind": "frost", "observed_on": "2026-10-02"}. A crop stage is '
                '{"kind": "stage", "observed_on": "2026-07-31", "crop": "Dahlia", '
                '"stage": "first bloom", "gdd_target": 1200, "set_out": "2026-05-24"}. '
                "Both accept an optional note."
            ),
        ),
    ],
    base_temp: Annotated[
        float,
        Field(description="Base temperature in °F the stage targets are counted at."),
    ] = 50.0,
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Turn a block's own field reports into a correction on the model.

    Every other tool here answers from a 9 km grid refined by a physical
    terrain model. What that cannot know is the part that makes a farm
    particular — the hedgerow, the pond, the outlet the cold air drains
    through. Your observations measure exactly that gap.

    Returns two corrections, kept separate because they fix different things:
    a bias in *heat* from crop stages (this ground accumulates more or less
    than the grid credits) and a bias in *days* from observed frost (this
    ground frosts earlier or later than the region).

    Nothing is applied silently. A correction appears only once several
    observations agree, implausible values are set aside rather than averaged
    in, and the reports behind every figure come back with it.

    Args:
        region: GeoJSON Polygon or {lat, lon, radius_m}.
        observations: The block's field reports.
        base_temp: Base temperature in °F.
    """
    try:
        parsed = parse_region(region)
    except RegionError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_region"}

    try:
        return await calibration_impl(parsed, observations, base_temp)
    except (CalibrateError, CalibrationError) as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("calibration failed: %s", exc)
        return {"success": False, "error": f"A weather feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(ALMANAC_UUID)
async def almanac(
    region: Annotated[
        dict[str, Any],
        Field(description="GeoJSON Polygon or {lat, lon, radius_m}."),
    ],
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """The sky's own record for this ground — normal, actual, and what is coming.

    Degree days say what the season is doing to the plants. This says what the
    season is doing: temperature, dew point, rain, wind, sunshine and day
    length, each against what is normal here, what has actually happened, and
    the fortnight ahead. Plus the sun and moon, which are astronomy and so are
    computed exactly rather than forecast.

    Growers read these together with the heat. A week of high dew points is
    disease weather whatever the degree-day total says, and a dry August is an
    irrigation decision that heat accumulation cannot make for you.

    One call covers every measure — three upstream requests regardless.

    Args:
        region: GeoJSON Polygon or {lat, lon, radius_m}.
    """
    try:
        parsed = parse_region(region)
    except RegionError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_region"}

    try:
        return await almanac_impl(parsed)
    except AlmanacError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("almanac failed: %s", exc)
        return {"success": False, "error": f"A weather feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(WILDLIFE_CALENDAR_UUID)
async def wildlife_calendar(
    region: Annotated[
        dict[str, Any],
        Field(description="GeoJSON Polygon or {lat, lon, radius_m}."),
    ],
    events: Annotated[
        list[dict[str, Any]],
        Field(
            description=(
                "The events to time, with your own thresholds. Heat-driven: "
                '{"species": "Woodchuck", "event": "emergence", "driver": "heat", '
                '"gdd": 120, "base_temp": 43}. Daylight-driven: '
                '{"species": "Robin", "event": "first arrival", "driver": "daylight", '
                '"daylight_hours": 11.5, "rising": true}. From your own record: '
                '{"species": "Grey squirrel", "event": "nut caching", '
                '"driver": "calendar", "typical_on": "09-15"}. All accept an '
                "optional emoji and note."
            ),
        ),
    ],
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """When the other creatures working your season arrive.

    A farm is not only its crops. Robins arrive, woodchucks wake, squirrels
    start caching. The same drivers that time a crop time the animals — heat
    accumulation, day length, and the calendar the sun keeps — so they can be
    computed for your ground rather than read off a regional average.

    Three clocks, because animals do not all run on one: a degree-day
    threshold, a photoperiod threshold (migration runs on this, which is why it
    barely moves between a warm year and a cold one), or a date from your own
    record.

    The thresholds are yours. Good Earth works out when they arrive here; it
    does not publish natural history.

    Args:
        region: GeoJSON Polygon or {lat, lon, radius_m}.
        events: Your wildlife events.
    """
    try:
        parsed = parse_region(region)
    except RegionError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_region"}

    try:
        return await wildlife_impl(parsed, events)
    except (WildlifeWindowError, WildlifeError) as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("wildlife_calendar failed: %s", exc)
        return {"success": False, "error": f"A weather feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


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
