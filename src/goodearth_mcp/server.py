"""Good Earth — region-scoped farm climate analytics MCP server.

Standard DPYC tools (check_balance, purchase_credits, Secure Courier,
Oracle, pricing, constraints) come from ``register_standard_tools`` in the
tollbooth-dpyc wheel. Only domain tools are defined here.

Run locally:
    python -m goodearth_mcp.server
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, date, datetime
from typing import Annotated, Any

from fastmcp import FastMCP
from pydantic import Field
from tollbooth.credential_templates import CredentialTemplate, FieldSpec
from tollbooth.credential_validators import validate_btcpay_creds
from tollbooth.runtime import OperatorRuntime, register_standard_tools
from tollbooth.tool_identity import STANDARD_IDENTITIES, ToolIdentity

from goodearth_mcp import (
    __version__,
    biota,
    block_store,
    calendar_feed,
    catalog,
    feed_store,
    record_cache,
    roster,
    season,
    sources,
    task_store,
)
from goodearth_mcp.almanac_window import AlmanacError
from goodearth_mcp.almanac_window import region_almanac as almanac_impl
from goodearth_mcp.calendar_feed import CalendarError
from goodearth_mcp.calibrate import CalibrateError
from goodearth_mcp.calibrate import region_calibration as calibration_impl
from goodearth_mcp.calibration import CalibrationError
from goodearth_mcp.crop_status import LedgerError
from goodearth_mcp.crop_status import region_crop_ledger as crop_ledger_impl
from goodearth_mcp.crops import CropError
from goodearth_mcp.frost_window import FrostError
from goodearth_mcp.frost_window import region_frost_window as frost_window_impl
from goodearth_mcp.perennial import PerennialError
from goodearth_mcp.perennial_window import PerennialWindowError
from goodearth_mcp.perennial_window import region_tree_window as tree_window_impl
from goodearth_mcp.pest_window import PestWindowError
from goodearth_mcp.pest_window import region_pest_window as pest_window_impl
from goodearth_mcp.pests import PestError
from goodearth_mcp.planting import PlantingError
from goodearth_mcp.planting_window import PlantingWindowError
from goodearth_mcp.planting_window import region_planting_window as planting_impl
from goodearth_mcp.region import Region, RegionError, parse_region
from goodearth_mcp.soil import SoilError
from goodearth_mcp.soil_window import SoilWindowError
from goodearth_mcp.soil_window import region_soil_window as soil_window_impl
from goodearth_mcp.suitability import SuitabilityError
from goodearth_mcp.suitability_window import SuitabilityWindowError
from goodearth_mcp.suitability_window import region_suitability as suitability_impl
from goodearth_mcp.tree_year_window import TreeYearError
from goodearth_mcp.tree_year_window import region_tree_year as tree_year_impl
from goodearth_mcp.wildlife import WildlifeError
from goodearth_mcp.wildlife_window import WildlifeWindowError
from goodearth_mcp.wildlife_window import region_wildlife as wildlife_impl

logger = logging.getLogger(__name__)

# The subscribable calendar lives on the Good Earth site, not here. Serving a
# calendar is a presentation concern and this is a tool service; the site also
# gives subscribers a URL with the farm's name on it rather than the
# infrastructure's.
SITE_HOST = "goodearth.tollbooth-dpyc.com"
SITE = f"https://{SITE_HOST}"

mcp = FastMCP(
    "goodearth-mcp",
    instructions=(
        "Good Earth — region-scoped climate analytics for small specialty-crop "
        "and flower farms, monetized via Tollbooth DPYC Bitcoin Lightning "
        "micropayments.\n\n"
        "## The block is the point\n"
        "A farm is not a pin. Ground is saved once as a BLOCK — a polygon or a "
        "pin, with a name — and every tool then takes that block by its id, its "
        "name or an alias. Geometry travels once, not on every call. Each tool "
        "samples the terrain inside the block and reports an aggregate PLUS the "
        "spread across it, because a bench and a hollow on the same acreage do "
        "not share a frost date.\n\n"
        "Start with goodearth_block_list. If the grower has saved nothing it "
        "answers with a worked example, so there is always ground to stand on; "
        "save theirs with goodearth_block_save and it takes over. What they "
        "grow, watch for and have seen is recorded per block with "
        "goodearth_block_item_save, which is why the season tools need no "
        "collections passed to them.\n\n"
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
CROP_SUITABILITY_UUID      = "bc6ad258-8f9f-5769-a32a-63d817d23ce8"
PLANTING_WINDOW_UUID       = "bf8e80be-1d22-58e9-be2f-5f2f6af8efa3"
CALENDAR_DATASET_UUID      = "3397c55a-8208-503d-a007-aa34975feb44"
CALENDAR_FETCH_UUID        = "670e4e24-90e1-53a6-a409-10375a0470ac"
CALENDAR_LIST_UUID         = "5e006f97-eaba-5ba7-a630-f493242b691d"
CALENDAR_REVOKE_UUID       = "2a8310d1-f65d-56f3-bb99-6b77acd6252a"
PEST_CATALOG_UUID          = "7101e6e8-40a9-58ef-8a2a-32bd2514ae1e"
WILDLIFE_CATALOG_UUID      = "d066a193-3592-5fea-bab6-48aa8057e59c"
TASK_SAVE_UUID             = "4c814e90-07c7-5944-b8cb-f05b619e6d2f"
TASK_LIST_UUID             = "1be9b304-d895-5e80-995f-29838befc305"
TASK_DELETE_UUID           = "87d174df-5cc7-5943-911f-cd41f7d2a000"
TASK_SET_DONE_UUID         = "33e668c1-5609-5bfa-8ba0-a00b882969e5"
REVIEW_ROSTER_UUID         = "bd7b7dfc-2463-5e50-9c12-fa6933cd440a"
PLAN_THE_SEASON_UUID       = "de100c1b-0087-5696-9131-93d02332e5ab"
BLOCK_SAVE_UUID            = "f398ade0-3264-5c55-acf0-cac2ea69be53"
BLOCK_LIST_UUID            = "00680666-0289-548b-b297-3700dfa4e885"
BLOCK_ITEM_SAVE_UUID       = "af45380a-1bcb-54a8-9b81-3569f785c33f"
BLOCK_ITEM_LIST_UUID       = "587e418b-59f5-5400-bc9b-98db6929fec1"
TREE_SUITABILITY_UUID      = "9f065c39-548a-5675-a562-cbf2bb720dd9"
TREE_YEAR_UUID             = "993d83ad-9edd-5690-88fd-298f2137dc24"

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
    ToolIdentity(
        tool_id=PLAN_THE_SEASON_UUID,
        capability="plan_the_season",
        category="read",
        intent="The season-planning interview, for clients that do not surface MCP prompts",
    ),
    ToolIdentity(
        tool_id=REVIEW_ROSTER_UUID,
        capability="review_roster",
        category="heavy",
        intent="Audit a grower's pests, wildlife and observations against what this ground's record actually knows",
    ),
    ToolIdentity(
        tool_id=TASK_SAVE_UUID,
        capability="task_save",
        category="write",
        intent="Create or update one task on a region's list",
    ),
    ToolIdentity(
        tool_id=TASK_LIST_UUID,
        capability="task_list",
        category="read",
        intent="One page of a region's tasks, filtered by timeframe and search, ordered by the database",
    ),
    ToolIdentity(
        tool_id=TASK_DELETE_UUID,
        capability="task_delete",
        category="write",
        intent="Remove one task from a region's list",
    ),
    ToolIdentity(
        tool_id=TASK_SET_DONE_UUID,
        capability="task_set_done",
        category="write",
        intent="Mark one task done or not done",
    ),
    ToolIdentity(
        tool_id=PEST_CATALOG_UUID,
        capability="pest_catalog",
        category="read",
        intent="Which pest stages are modelled for this ground this season, and the insects recorded near it",
    ),
    ToolIdentity(
        tool_id=WILDLIFE_CATALOG_UUID,
        capability="wildlife_catalog",
        category="read",
        intent="Which animals are actually recorded around this ground, by group and by how often they are seen",
    ),
    ToolIdentity(
        tool_id=CROP_SUITABILITY_UUID,
        capability="crop_suitability",
        category="read",
        intent="Which crops finish on this ground, measured against its own frost-free heat budget",
    ),
    ToolIdentity(
        tool_id=TREE_SUITABILITY_UUID,
        capability="tree_suitability",
        category="read",
        intent="Whether a tree survives and gets its chill on this ground, across every winter on record",
    ),
    ToolIdentity(
        tool_id=TREE_YEAR_UUID,
        capability="tree_year",
        category="read",
        intent="When spring reached this block — first leaf and first bloom against their normals — and what the sap did",
    ),
    ToolIdentity(
        tool_id=PLANTING_WINDOW_UUID,
        capability="planting_window",
        category="read",
        intent="When to start seed, when to put it out, and the last day a sowing still finishes",
    ),
    ToolIdentity(
        tool_id=CALENDAR_DATASET_UUID,
        capability="calendar_dataset",
        category="heavy",
        intent="Compute a block's dated season — crop, pest, wildlife, frost and task events — as a dataset",
    ),
    ToolIdentity(
        tool_id=CALENDAR_FETCH_UUID,
        capability="calendar_fetch",
        category="free",
        intent="Read a stored calendar dataset by its feed token, for the site that serves it",
    ),
    ToolIdentity(
        tool_id=CALENDAR_LIST_UUID,
        capability="calendar_list",
        category="free",
        intent="List the calendar feeds this patron has published",
    ),
    ToolIdentity(
        tool_id=CALENDAR_REVOKE_UUID,
        capability="calendar_revoke",
        category="free",
        intent="Stop publishing a calendar feed",
    ),
    ToolIdentity(
        tool_id=BLOCK_SAVE_UUID,
        capability="block_save",
        category="write",
        intent="Save a plot of land — its name, the names you also call it, and its bounds",
    ),
    ToolIdentity(
        tool_id=BLOCK_LIST_UUID,
        capability="block_list",
        # Free on purpose: this is the front door. Every session opens by asking
        # which ground it is working, and an app that cannot answer that without
        # a fare is one that fails for anyone whose balance has run out.
        category="free",
        intent="The plots you have saved, with their bounds",
    ),
    ToolIdentity(
        tool_id=BLOCK_ITEM_SAVE_UUID,
        capability="block_item_save",
        category="write",
        intent="Record what you grow, watch for, or saw on a plot",
    ),
    ToolIdentity(
        tool_id=BLOCK_ITEM_LIST_UUID,
        capability="block_item_list",
        category="read",
        intent="What you grow, watch for, or saw on a plot — including as it stood on a past day",
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



BLOCK_FIELD = Field(
    description=(
        "The ground to answer for: a block you have saved. Its id, its name, "
        'or one of its aliases — e.g. "Frogdale Farm". Save one with '
        "block_save first; geometry travels once, not on every call."
    ),
)


async def _stored_items(npub: str, block_id: str, kind: str, *, season: int | None = None) -> list[dict[str, Any]]:
    """One kind of the block's curated items, shaped as the impls expect them.

    The bookkeeping columns come off here rather than in each caller: an impl
    validating a planting should not have to know that the record also tracks
    which row it came from.
    """
    page = await block_store.list_items(
        npub, block_id, kind, season_year=season, page_size=block_store.MAX_PAGE_SIZE,
    )
    # The row's id survives as `ref`, and only as `ref`. A computed answer has
    # to be able to say WHICH saved item it is about: a grower runs the same
    # crop as several successions and watches one bird for both its arrival and
    # its departure, so nothing a human would name tells two rows apart. It is
    # carried through the arithmetic untouched and never read by it.
    return [
        {**{k: v for k, v in row.items()
            if k not in ("item_id", "kind", "retired", "source")},
         "ref": row.get("item_id")}
        for row in page["items"]
    ]


async def _block_region(npub: str, block: str) -> tuple[Region, dict[str, Any]]:
    """Resolve a block reference to the ground it names.

    Raises rather than returning a failure dict, and that is a billing
    decision as much as a style one: ``paid_tool`` debits before it calls the
    body and rolls back only on an exception, so a returned failure would
    charge a fare for a call that did nothing. An unknown block is the ordinary
    first-run, new-device and post-retire path — it must be free. ``BlockError``
    is a ``ValueError``, which the runtime surfaces with its message intact, so
    the grower still reads exactly what went wrong.
    """
    # Every compute tool resolves its ground through here, which makes this the
    # one place the patron has to be named for the weather cache. The impls
    # below take a Region and know nothing about identity or billing — rightly:
    # a frost calculation has no business holding an npub. Unset, the cache is
    # a no-op that calls straight through to the feeds.
    record_cache.serving(npub)

    found = await block_store.resolve(npub, block)
    geometry = found.get("geometry") or {}
    try:
        return parse_region(geometry), found
    except RegionError as exc:
        # Stored geometry that will not parse — written by an older client, or
        # saved before a validation rule tightened. Say which block, or the
        # grower has no way to know which one to redraw.
        raise block_store.BlockError(
            f"the bounds saved for {found.get('name') or block!r} cannot be read: {exc}"
        ) from exc

# ---------------------------------------------------------------------------
# Domain tools
# ---------------------------------------------------------------------------



# ── The season-planning interview ────────────────────────────────────────
#
# A prompt is how MCP ships a workflow: a client surfaces it as a command and
# the agent inherits the sequence without anyone having explained it. Good
# Earth had the tools for season planning and no shipped order to use them in,
# so every agent invented one — and most reach for data entry rather than
# advice.
#
# The ordering below moves from the grower's decision to its consequences,
# rather than from the available data to a report. That is the whole point of
# it, and it came from a patron who runs a real block.


SEASON_INTERVIEW = """You are helping a grower plan a season on one piece of ground, the way a
knowledgeable neighbour would — not the way a form would. Ask one question at a
time and wait for the answer. Their decisions come first; the data serves them.

1. Which plot, farm or field are we working on? Resolve it with block_list and
   name the block in every later call; if they have not saved it yet, draw it
   with block_save first. Match it against their saved
   regions, or help them draw a new one.

2. What are they already growing, or planning to grow?

3. Only if they want suggestions: call `goodearth_crop_suitability` and say what
   this ground's own frost-free window and heat budget will carry. Those are
   starting figures to edit against their seed packet, not agronomy.

4. For each crop, establish the sowing window — no earlier than, no later than —
   and the harvest timeframe. `goodearth_planting_window` answers this for their
   coordinates.

5. Add them with `goodearth_crop_gdd_status` so they sit on the same timeline.

6. Pests and creatures to guard against. **Call `goodearth_review_roster`
   before you say anything about which pests belong here.** Left to itself an
   agent recites range knowledge from its training data, which is unverifiable
   and confidently wrong exactly at the margins. The tool answers from what
   USA-NPN models for these coordinates and what iNaturalist has recorded
   nearby, and it returns three things: entries the record does not know,
   entries the record knows well that are missing, and observations that cannot
   be right. Propose; never remove anything on the grower's behalf.

7. The welcome arrivals — pollinators, butterflies, and yes, skunks.
   `goodearth_wildlife_catalog` says what is actually recorded around them, and
   passing a species name returns the life-cycle phenophases USA-NPN tracks it
   through. When they arrive on THIS ground is a threshold the grower sets.

8. Which of these chores go on their task list? Add them with
   `goodearth_task_save`.

Throughout: this service computes against their ground. It does not publish
agronomy, entomology or natural history, and it never recommends a treatment —
pesticide registration is jurisdiction-specific and a label rate is law. Route
them to their extension service for that, and say plainly that its word counts
and yours does not."""


@mcp.prompt(name="plan_the_season")
def season_interview_prompt() -> str:
    """Walk a grower through planning a season on their own ground."""
    return SEASON_INTERVIEW

@tool
@runtime.paid_tool(GDD_SEASON_CURVE_UUID)
async def gdd_season_curve(
    block: Annotated[str, BLOCK_FIELD],
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
        block: The ground to answer for — its id, its name, or an alias.
        base_temp: Crop base temperature in °F (20-80).
    """
    parsed, _found = await _block_region(npub, block)

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
    block: Annotated[str, BLOCK_FIELD],
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
        block: The ground to answer for — its id, its name, or an alias.
    """
    parsed, _found = await _block_region(npub, block)

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
    block: Annotated[str, BLOCK_FIELD],
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
        block: The ground to answer for — its id, its name, or an alias.
        plantings: The block's plantings.
        base_temp: Default base temperature in °F.
    """
    parsed, _found = await _block_region(npub, block)

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
    block: Annotated[str, BLOCK_FIELD],
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
        block: The ground to answer for — its id, its name, or an alias.
        threshold: Soil temperature in °F.
        direction: 'cooling' (autumn) or 'warming' (spring).
        band: Soil depth band.
    """
    parsed, _found = await _block_region(npub, block)

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
    block: Annotated[str, BLOCK_FIELD],
    pests: Annotated[
        list[dict[str, Any]],
        Field(
            description=(
                "The pests to evaluate, in any of three shapes.\n"
                "1. Your own thresholds, from an extension bulletin: "
                '{"pest": "Aster leafhopper", "base_temp": 50, "biofix": "2026-05-01", '
                '"stages": [{"stage": "second flight", "gdd": 1850}]}. '
                "biofix is optional; without it the count runs from Jan 1.\n"
                '2. A published model, cited rather than restated: '
                '{"pest": "Japanese beetle", "model": "usa-npn"} — the dates come '
                "from USA-NPN for your ground, and re-resolve each season instead "
                "of freezing whatever was pasted in.\n"
                '3. Something you simply keep an eye out for: '
                '{"pest": "Vole", "watch": true} — no stages, no dates.\n'
                "Do NOT invent degree-day figures to fill shape 1. Use 2 or 3."
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
    which pests to go and look for this week.

    Good Earth computes when your models arrive on your ground. It does not
    publish entomology: the thresholds are yours, because the authoritative
    numbers belong to your extension service and vary by region and biotype.

    Args:
        block: The ground to answer for — its id, its name, or an alias.
        pests: Your pest models.
    """
    parsed, _found = await _block_region(npub, block)

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
    block: Annotated[str, BLOCK_FIELD],
    season: Annotated[
        int | None,
        Field(description="Which season's reports to calibrate against. Defaults to this one."),
    ] = None,
    observations: Annotated[
        list[dict[str, Any]] | None,
        Field(
            description=(
                "Optional. Omit and this reads the field reports already recorded "
                "for the block. Pass a list to calibrate against those instead, "
                "without recording them: a frost report is "
                '{"kind": "frost", "observed_on": "2026-10-02"}; a crop stage is '
                '{"kind": "stage", "observed_on": "2026-07-31", "crop": "Dahlia", '
                '"stage": "first bloom", "gdd_target": 1200, "set_out": "2026-05-24"}. '
                "Both accept an optional note."
            ),
        ),
    ] = None,
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
        block: The ground to answer for — its id, its name, or an alias.
        observations: The block's field reports.
        base_temp: Base temperature in °F.
    """
    parsed, _found = await _block_region(npub, block)

    try:
        year = season if season is not None else datetime.now(UTC).year
        seen = observations
        if seen is None:
            # Bounded by the season on purpose: unbounded, this would quietly
            # calibrate this year's ground against every observation ever
            # recorded, and a correction drawn from six seasons of weather is
            # not a correction for this one.
            seen = await _stored_items(npub, _found["block_id"], "observation")
            seen = [o for o in seen if str(o.get("observed_on", "")).startswith(str(year))]
        if not seen:
            return {"success": False, "error_code": "no_observations",
                    "error": (f"No field reports recorded for {year} on this ground — "
                              "file some observations first, and they will sharpen the model.")}
        return await calibration_impl(parsed, seen, float(base_temp))
    except (CalibrateError, CalibrationError) as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("calibration failed: %s", exc)
        return {"success": False, "error": f"A weather feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(ALMANAC_UUID)
async def almanac(
    block: Annotated[str, BLOCK_FIELD],
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
        block: The ground to answer for — its id, its name, or an alias.
    """
    parsed, _found = await _block_region(npub, block)

    try:
        return await almanac_impl(parsed)
    except AlmanacError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("almanac failed: %s", exc)
        return {"success": False, "error": f"A weather feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(PLAN_THE_SEASON_UUID)
async def plan_the_season(
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """The season-planning interview, as a workflow to follow.

    The same text the `plan_the_season` MCP prompt carries. It exists twice
    because prompt support is uneven: a client that surfaces prompts offers
    this as a command, and one that does not can still reach it by calling a
    tool. Both read one constant, so they cannot drift into two different
    interviews.

    Follow the returned steps in order, asking one question at a time. The
    ordering is the point — it moves from the grower's decision to its
    consequences rather than from the available data to a report.
    """
    return {"success": True, "interview": SEASON_INTERVIEW}


@tool
@runtime.paid_tool(REVIEW_ROSTER_UUID)
async def review_roster(
    block: Annotated[str, BLOCK_FIELD],
    pests: Annotated[
        list[dict[str, Any]] | None,
        Field(description='The pests being watched: [{"pest": "Codling moth"}, ...].'),
    ] = None,
    wildlife: Annotated[
        list[dict[str, Any]] | None,
        Field(description='The creatures being tracked: [{"species": "American robin"}, ...].'),
    ] = None,
    observations: Annotated[
        list[dict[str, Any]] | None,
        Field(
            description=(
                'Field reports to sanity-check: [{"kind": "frost", "observed_on": '
                '"2026-07-04"}, {"kind": "pest", "species": "Walrus", "observed_on": '
                '"2026-06-03"}].'
            ),
        ),
    ] = None,
    season: Annotated[
        int | None,
        Field(description="Which season's roster to audit. Defaults to this one."),
    ] = None,
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Audit a roster against what this ground's record actually knows.

    Asked "are these the right pests to watch?", an agent will answer from its
    own training data — unverifiable, different per model, and confidently
    wrong exactly at the margins where a review matters. This answers from the
    record instead: the degree-day models USA-NPN publishes for these
    coordinates, and what iNaturalist has recorded nearby.

    Three findings:

    - **out_of_range** — listed, and this ground's record does not know it.
    - **absent** — the record knows it well and the roster does not list it.
    - **implausible** — an observation that cannot be right, with what makes it
      wrong. This is the one that matters: observations feed
      ``goodearth_calibration``, which shifts the heat and frost bias for the
      whole block, so a junk entry degrades every later answer rather than
      merely showing a wrong row.

    **Every reason is about the RECORD, never about the animal.** "Not recorded
    within 16 km" is a fact; "does not live here" is natural history, which
    Good Earth does not publish. Nothing is removed — the grower who genuinely
    saw the odd thing is precisely the case worth learning from, so findings are
    proposed and the patron decides.

    Args:
        block: The ground to answer for — its id, its name, or an alias.
        pests: The pests being watched.
        wildlife: The creatures being tracked.
        observations: Field reports to sanity-check.
    """
    parsed, _found = await _block_region(npub, block)

    try:
        pest_cat, wild_cat, frost_res = await asyncio.gather(
            catalog.region_pest_catalog(parsed),
            catalog.region_wildlife_catalog(parsed),
            frost_window_impl(parsed),
            return_exceptions=True,
        )
        if isinstance(pest_cat, BaseException):
            pest_cat = {"events": [], "insects_recorded": []}
        if isinstance(wild_cat, BaseException):
            wild_cat = {"groups": []}
        frost = None
        if not isinstance(frost_res, BaseException) and isinstance(frost_res, dict):
            f = frost_res.get("first_frost") or {}
            frost = {
                "last_spring_median": (frost_res.get("last_spring") or {}).get("median"),
                "first_fall_median": f.get("median"),
            }
        # The roster is read from the record rather than assembled by the
        # caller. That is what lets an agent audit a season it did not set up —
        # and what makes accepting a finding an ordinary item write rather than
        # a separate tool.
        block_id = _found["block_id"]
        year = season if season is not None else datetime.now(UTC).year
        stored_pests = pests if pests is not None else await _stored_items(npub, block_id, "pest", season=year)
        stored_wild = wildlife if wildlife is not None else await _stored_items(npub, block_id, "wildlife", season=year)
        stored_obs = observations if observations is not None else await _stored_items(npub, block_id, "observation")
        return {"success": True, "block_id": block_id, "block_name": _found.get("name", ""),
                **roster.review(
                    region_label=_found.get("name") or parsed.describe().get("kind", "this ground"),
                    pests=stored_pests, wildlife=stored_wild, observations=stored_obs,
                    pest_catalog=pest_cat, wildlife_catalog=wild_cat, frost=frost,
                    today=datetime.now(UTC).date(),
                )}
    except (biota.BiotaError, OSError) as exc:
        logger.warning("review_roster failed: %s", exc)
        return {"success": False, "error": f"The record could not be read: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(TASK_SAVE_UUID)
async def task_save(
    region_id: Annotated[str, Field(description="The saved region this task belongs to.")],
    title: Annotated[str, Field(description="What needs doing.")],
    task_id: Annotated[str, Field(description="Omit to create; pass an existing id to update.")] = "",
    note: Annotated[str, Field(description="Optional detail.")] = "",
    due: Annotated[str, Field(description="YYYY-MM-DD. The day it is for.")] = "",
    starts_at: Annotated[str, Field(description="Optional HH:MM on the due date.")] = "",
    ends_at: Annotated[str, Field(description="Optional HH:MM on the due date.")] = "",
    reminder_only: Annotated[
        bool,
        Field(description="True publishes a reminder; false publishes an entry that takes the slot."),
    ] = True,
    done: bool = False,
    npub: Annotated[str, Field(description="Required. Your Nostr public key (npub1...).")] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Create or update one task.

    Single-day by design: one date and optional clock times on it. No
    recurrence and no multi-day spans — a farm list is a list of days.

    Args:
        region_id: Which saved region the task belongs to.
        title: What needs doing.
    """
    try:
        tid = await task_store.save(
            npub, region_id, title, task_id=task_id, note=note,
            due=due or None, starts_at=starts_at or None, ends_at=ends_at or None,
            reminder_only=reminder_only, done=done,
        )
        return {"success": True, "id": tid}
    except task_store.TaskError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except OSError as exc:
        logger.warning("task_save failed: %s", exc)
        return {"success": False, "error": f"The task could not be stored: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(TASK_LIST_UUID)
async def task_list(
    region_id: Annotated[str, Field(description="The saved region whose tasks to list.")],
    timeframe: Annotated[
        str, Field(description="day, week, month, season or all. 'season' means this farm's season."),
    ] = "all",
    search: Annotated[
        str, Field(description="Optional POSIX regular expression, matched against title and note."),
    ] = "",
    sort_col: Annotated[
        str, Field(description="due, title, done, starts, created or updated."),
    ] = "due",
    sort_dir: Annotated[str, Field(description="asc or desc.")] = "asc",
    page: Annotated[int, Field(description="Zero-based page number.")] = 0,
    page_size: Annotated[int, Field(description="Rows per page, capped at 200.")] = 20,
    season_start: Annotated[
        str, Field(description="Optional YYYY-MM-DD, so 'season' means the grower's season."),
    ] = "",
    npub: Annotated[str, Field(description="Required. Your Nostr public key (npub1...).")] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """One page of a region's tasks, ordered and filtered by the database.

    The sorting, the timeframe filter and the search all happen in SQL, so a
    long list costs one page rather than the whole table.

    ``sort_col`` names a column rather than supplying one: it indexes a fixed
    map and falls back to the due date, so an unrecognised value gives the
    default order rather than an error — and can never reach the query.

    Args:
        region_id: The saved region whose tasks to list.
        timeframe: day, week, month, season or all.
        search: Optional POSIX regular expression.
    """
    try:
        start = date.fromisoformat(season_start) if season_start else None
        return {"success": True, **await task_store.listing(
            npub, region_id, timeframe=timeframe, search=search,
            sort_col=sort_col, sort_dir=sort_dir, page=page, page_size=page_size,
            season_start=start,
        )}
    except (task_store.TaskError, ValueError) as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except OSError as exc:
        logger.warning("task_list failed: %s", exc)
        return {"success": False, "error": f"The task list could not be read: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(TASK_DELETE_UUID)
async def task_delete(
    task_id: Annotated[str, Field(description="The task's id.")],
    npub: Annotated[str, Field(description="Required. Your Nostr public key (npub1...).")] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Remove one task.

    Scoped to the caller's npub in the WHERE clause, so a known id is not on
    its own enough to delete somebody else's task.

    Args:
        task_id: The task's id.
    """
    try:
        return {"success": True, "removed": await task_store.delete(npub, task_id)}
    except OSError as exc:
        logger.warning("task_delete failed: %s", exc)
        return {"success": False, "error": f"The task could not be removed: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(TASK_SET_DONE_UUID)
async def task_set_done(
    task_id: Annotated[str, Field(description="The task's id.")],
    done: Annotated[bool, Field(description="True to tick it off.")] = True,
    npub: Annotated[str, Field(description="Required. Your Nostr public key (npub1...).")] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Mark one task done, or put it back.

    Args:
        task_id: The task's id.
        done: True to tick it off.
    """
    try:
        return {"success": True, "changed": await task_store.set_done(npub, task_id, done)}
    except OSError as exc:
        logger.warning("task_set_done failed: %s", exc)
        return {"success": False, "error": f"The task could not be updated: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(PEST_CATALOG_UUID)
async def pest_catalog(
    block: Annotated[str, BLOCK_FIELD],
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Which pest stages are modelled for this ground this season.

    Read from the USA-NPN degree-day forecasts rather than from a list in
    this service, so a model they publish next season appears here without
    anyone editing anything, and a Georgia orchard gets Georgia's dates.

    Only layers measured to encode a day of year become dated events. Some
    carry accumulated heat instead, and one of those reads 281 in Vermont —
    a convincing 8 October that is really a heat sum. Those are counted and
    named as unreadable rather than rendered as dates.

    The insects recorded nearby come from iNaturalist and are a landscape
    fact: one field holds almost no observations, so the search is widened
    to the surrounding country and the answer says how far.

    Args:
        block: The ground to answer for — its id, its name, or an alias.
    """
    parsed, _found = await _block_region(npub, block)
    try:
        return await catalog.region_pest_catalog(parsed)
    except catalog.CatalogError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (biota.BiotaError, OSError) as exc:
        logger.warning("pest_catalog failed: %s", exc)
        return {"success": False, "error": f"A species feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(WILDLIFE_CATALOG_UUID)
async def wildlife_catalog(
    block: Annotated[str, BLOCK_FIELD],
    species: Annotated[
        str,
        Field(
            description=(
                "Optional. A scientific name from a previous catalogue answer, e.g. "
                "'Strix varia'. Given one, this returns that animal's life-cycle "
                "phenophases instead of the regional list."
            ),
        ),
    ] = "",
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Which animals are actually recorded around this ground.

    Birds, mammals, amphibians and reptiles observed near here, ranked by how
    often each has been seen — so the answer for a Vermont lakeshore is not
    the answer for a Georgia orchard, and neither is a roster someone typed.

    Species are a landscape fact. A nine-hectare field contains almost no
    observations of anything, so the search widens to the surrounding country
    and the response reports how wide it looked; treating that footprint as
    the farm would be the dishonest version.

    The ranking measures observers as much as animals — a roadside is better
    recorded than a back field — so the counts travel with the answer.

    Pass a scientific name as `species` and this answers with that animal's
    life-cycle phenophases instead — nest building, nestlings, fledged young,
    calls or song, emergence above ground. Those come from USA-NPN, which
    publishes them; they are not written into this service. Roughly half the
    species recorded around a farm have them, and one that does not returns an
    empty list rather than a guess, because "not tracked" and "does nothing"
    are different claims.

    Good Earth times an event you set. It does not publish natural history.

    Args:
        block: The ground to answer for — its id, its name, or an alias.
        species: Optional scientific name, for that animal's habits.
    """
    parsed, _found = await _block_region(npub, block)
    try:
        if species.strip():
            return await catalog.region_species_habits(species)
        return await catalog.region_wildlife_catalog(parsed)
    except catalog.CatalogError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (biota.BiotaError, OSError) as exc:
        logger.warning("wildlife_catalog failed: %s", exc)
        return {"success": False, "error": f"A species feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(WILDLIFE_CALENDAR_UUID)
async def wildlife_calendar(
    block: Annotated[str, BLOCK_FIELD],
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
        block: The ground to answer for — its id, its name, or an alias.
        events: Your wildlife events.
    """
    parsed, _found = await _block_region(npub, block)

    try:
        return await wildlife_impl(parsed, events)
    except (WildlifeWindowError, WildlifeError) as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("wildlife_calendar failed: %s", exc)
        return {"success": False, "error": f"A weather feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(CROP_SUITABILITY_UUID)
async def crop_suitability(
    block: Annotated[str, BLOCK_FIELD],
    crops: Annotated[
        list[dict[str, Any]],
        Field(
            description=(
                "The crops to judge, with your own requirements. Each is "
                '{"crop": "Field corn", "gdd_target": 2600, "base_temp": 50} '
                'with optional "frost_hardy", "category" and "emoji".'
            ),
        ),
    ],
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Which crops finish on this ground, and with how much room to spare.

    "What can I grow?" is not a lookup. Two farms in the same county, one on a
    bench and one in a hollow, have different answers — so this measures the
    block's own frost-free window and the heat it accumulates inside it, then
    judges each crop's requirement against that.

    The answer that matters is not yes or no but MARGIN: how much season is
    left after the crop is done, in the days a grower plans in. A crop that
    finishes on the last warm day of an average year fails in half of them.

    Requirements are yours. Published degree-day figures vary by cultivar and
    maturity group; Good Earth computes against your ground rather than
    publishing agronomy.

    Args:
        block: The ground to answer for — its id, its name, or an alias.
        crops: The crops to judge.
    """
    parsed, _found = await _block_region(npub, block)

    try:
        return await suitability_impl(parsed, crops)
    except (SuitabilityWindowError, SuitabilityError) as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("crop_suitability failed: %s", exc)
        return {"success": False, "error": f"A weather feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(TREE_SUITABILITY_UUID)
async def tree_suitability(
    block: Annotated[str, BLOCK_FIELD],
    trees: Annotated[
        list[dict[str, Any]],
        Field(
            description=(
                "The trees to judge, with the figures from their nursery tags. "
                'Each is {"tree": "Honeycrisp apple", "chill_hours": 800, '
                '"hardy_to_f": -30} with optional "category" and "emoji". Both '
                "figures are optional: a tree with neither is recorded and "
                "reported as unrated rather than refused."
            ),
        ),
    ],
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Whether a tree survives and gets its chill on this ground.

    A tree is not asked "does it finish before frost" — that is a question only
    something that must finish in one season can be asked. It is asked two
    others, both settled before it goes in the ground:

    * **Will it survive?** Every winter on record has a coldest night; a
      cultivar has a limit. The answer is how often the first went below the
      second.
    * **Will it fruit?** A deciduous fruit tree needs chill hours to break
      dormancy cleanly. The answer is how many winters on record delivered them.

    Both come back as a FREQUENCY across the record rather than a yes. A tree
    that survives nine winters in ten is a different proposition from one that
    survives five, and any single word hides the difference.

    Chill is counted as hours in the 32-45 °F band between 1 November and
    15 February — the window the published chill-hour figures were derived
    against. A wider window would bank more hours against a requirement
    calibrated to a narrower one and report a tree comfortable where it is not.

    The requirements are yours. Hardiness limits and chill hours are cultivar
    figures that vary widely within a species; Good Earth computes what this
    ground delivered against them and does not publish agronomy.

    Args:
        block: The ground to answer for — its id, its name, or an alias.
        trees: The trees to judge, with their own requirements.
    """
    parsed, _found = await _block_region(npub, block)

    try:
        return await tree_window_impl(parsed, trees)
    except (PerennialWindowError, PerennialError) as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("tree_suitability failed: %s", exc)
        return {"success": False, "error": f"A weather feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(TREE_YEAR_UUID)
async def tree_year(
    block: Annotated[str, BLOCK_FIELD],
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """When spring reached this ground, and what the sap did.

    **First leaf and first bloom**, from USA-NPN's Spring Index, dated for this
    block and set against its own thirty-year normal. "Spring is early this
    year" is a headline; "leaf-out reached this block seven days before its
    normal" is something to act on.

    First bloom is also when the pollen starts. That is a restatement of what
    bloom is, not a pollen forecast — Good Earth has no pollen feed, models
    none, and says nothing about what anyone should do about it.

    **The sap run**, for a block with maple, birch or walnut on it. Sap moves
    on freeze and thaw rather than on warmth: a night below freezing followed
    by a day above it. Counted off this ground's own season record, so it
    costs no extra call. A block with nothing tappable gets no sap section —
    the count would be just as true there and would answer a question nobody
    on that ground asked.

    The trees are read from the block's own record; nothing needs passing.

    Args:
        block: The ground to answer for — its id, its name, or an alias.
    """
    parsed, found = await _block_region(npub, block)

    plants = await _stored_items(npub, found["block_id"], "crop") if found else []

    try:
        return await tree_year_impl(parsed, plants)
    except TreeYearError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("tree_year failed: %s", exc)
        return {"success": False, "error": f"A feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


@tool
@runtime.paid_tool(CALENDAR_DATASET_UUID)
async def calendar_dataset(
    block: Annotated[str, BLOCK_FIELD],
    token: Annotated[
        str,
        Field(description="Pass an existing feed's token to REFRESH it in place; omit to create one."),
    ] = "",
    season: Annotated[
        int | None,
        Field(description="Which season to publish. Defaults to this one."),
    ] = None,
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Compute this block's dated season as a dataset, and store it for publishing.

    Every dated thing this block knows about: crop targets, pest stages,
    wildlife and husbandry dates, the frost record, and your tasks. Returned as
    structured rows — a calendar is one rendering of them, and a caller wanting
    a table or a notification wants the same data.

    An iCalendar rendering is stored alongside under a feed token, which the
    Good Earth site serves at a subscribable URL. Point any iCal or Google
    Calendar client at it and the season appears next to the school run and the
    market stall, which is where a grower will actually see it.

    This is the computed act: it reads the weather feeds and rebuilds
    everything. Pass the same token again to recompute in place — subscribers
    keep their subscription and the events update rather than duplicating.

    Nothing is passed in but the block: what it grows, what it watches for and
    what is due are read from the record. That is what makes a refresh safe —
    while those collections travelled as arguments, nobody could recompute an
    existing feed without knowing what had been handed to it the first time,
    so a refresh silently published a smaller season than the one it replaced.

    Args:
        block: The ground to publish — its id, its name, or an alias.
        token: An existing feed token to refresh in place.
        season: Which season to publish. Defaults to this one.
    """
    parsed, found = await _block_region(npub, block)
    block_id = found["block_id"]
    year = season if season is not None else datetime.now(UTC).year
    base_temp = float(found.get("base_temp_f") or 50.0)
    region_name = found.get("name") or "My block"

    async def _items(kind: str) -> list[dict[str, Any]]:
        page = await block_store.list_items(
            npub, block_id, kind, season_year=year, page_size=block_store.MAX_PAGE_SIZE,
        )
        return [
            {k: v for k, v in row.items() if k not in ("item_id", "kind", "retired", "source")}
            for row in page["items"]
        ]

    try:
        plantings = await _items("planting")
        pests = await _items("pest")
        wildlife_events = await _items("wildlife")
        tasks = await task_store.listing(
            npub, block_id, timeframe="season", page_size=task_store.MAX_PAGE_SIZE,
        )
        todos = tasks.get("rows") or []
    except (block_store.BlockError, task_store.TaskError) as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except OSError as exc:
        logger.error("calendar_dataset could not read the record: %s", exc)
        return {"success": False, "error": "The record is unreachable right now.",
                "error_code": "persistence_unavailable"}

    # A pest may reference a published model rather than restate it. Those
    # dates come from USA-NPN for this ground, not from the heat curve, so they
    # are resolved before the feed is built and travel as dated events.
    referenced: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    try:
        referenced, unresolved = await catalog.resolve_referenced_models(parsed, pests)
    except (biota.BiotaError, OSError) as exc:
        # A forecast that will not answer must not cost the grower the rest of
        # their calendar. Say which models went unresolved and build the rest.
        logger.warning("referenced pest models did not resolve: %s", exc)
        unresolved = [{"pest": str(p.get("pest") or "?"),
                       "reason": f"the published forecast did not answer: {exc}"}
                      for p in pests if p.get("model")]

    feed_token = token.strip() or calendar_feed.new_token()
    try:
        built = await calendar_feed.build_feed(
            parsed, region_name, feed_token,
            plantings=plantings, pest_models=pests, wildlife_events=wildlife_events,
            todos=todos, base_temp_f=base_temp, referenced=referenced,
        )
    except (CalendarError, CropError, PestError, WildlifeError) as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("calendar_subscribe failed: %s", exc)
        return {"success": False, "error": f"A weather feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}

    try:
        await feed_store.save(
            feed_token, npub, region_name,
            built["ics"], built["total"], built["computed_on"],
        )
    except Exception as exc:  # noqa: BLE001 — persistence is the operator's
        logger.error("calendar feed save failed: %s", exc)
        return {"success": False, "error": "The feed could not be stored.",
                "error_code": "persistence_unavailable"}

    return {
        "success": True,
        "token": feed_token,
        "url": f"{SITE}/calendar/{feed_token}.ics",
        "webcal_url": f"webcal://{SITE_HOST}/calendar/{feed_token}.ics",
        "region_name": region_name or "My block",
        "events": built["events"],
        "entries": built["counts"],
        "total": built["total"],
        # What could not be dated, and why. A grower with forty good rows and
        # one incomplete pest entry gets forty rows published and the one
        # named — rather than a refusal that makes a partially-known season
        # unpublishable, which is most seasons.
        "skipped": built.get("skipped") or [],
        # Models the grower referenced that this ground has no published layer
        # for. Named rather than dropped: "NPN publishes nothing for this here"
        # is an answer, and a silent omission is not.
        "unresolved_models": unresolved,
        "computed_on": built["computed_on"],
        "note": (
            "Subscribe with the webcal link, or paste the https one into "
            "Google Calendar's 'From URL'. Call this tool again with the same "
            "token to recompute against current weather; subscribers update "
            "rather than duplicating."
        ),
    }


@tool
@runtime.paid_tool(CALENDAR_FETCH_UUID)
async def calendar_fetch(
    token: Annotated[str, Field(description="The feed token from calendar_dataset.")],
) -> dict[str, Any]:
    """Read a stored calendar dataset by its feed token.

    This exists for the Good Earth site, which serves the subscribable URL: a
    calendar client speaks HTTP and knows nothing about MCP, JSON-RPC or npub
    proofs, so the site fetches through here and renders the response as
    text/calendar.

    The unguessable token is the credential — there is nowhere in an iCalendar
    subscription to put a proof. Serving is a separate act from computing, and
    every read is counted so the operator can see how hard a feed is worked.
    """
    t = token.strip()
    if not t or len(t) > 64 or not all(c in "0123456789abcdef" for c in t):
        return {"success": False, "error": "Unknown feed.", "error_code": "not_found"}
    try:
        row = await feed_store.load(t)
    except Exception as exc:  # noqa: BLE001
        logger.error("calendar feed read failed: %s", exc)
        return {"success": False, "error": "Temporarily unavailable.",
                "error_code": "persistence_unavailable"}
    if not row:
        return {"success": False, "error": "Unknown feed.", "error_code": "not_found"}

    # Count the read. A failure here must never withhold a calendar the
    # subscriber is entitled to.
    try:
        await feed_store.note_fetch(t)
    except Exception as exc:  # noqa: BLE001
        logger.warning("calendar fetch accounting failed: %s", exc)

    return {
        "success": True,
        "ics": row["ics"],
        "region_name": row.get("region_name"),
        "entry_count": row.get("entry_count"),
        "computed_on": str(row.get("computed_on") or ""),
    }


@tool
@runtime.paid_tool(CALENDAR_LIST_UUID)
async def calendar_list(
    npub: Annotated[str, Field(description="Required. Your Nostr public key.")] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """The calendar feeds you have published, and how often each is polled."""
    try:
        rows = await feed_store.list_for(npub)
    except Exception as exc:  # noqa: BLE001
        logger.error("calendar list failed: %s", exc)
        return {"success": False, "error": "Could not read your feeds.",
                "error_code": "persistence_unavailable"}
    return {
        "success": True,
        "feeds": [
            {**r, "url": f"{SITE}/calendar/{r['token']}.ics"} for r in rows
        ],
        "count": len(rows),
    }


@tool
@runtime.paid_tool(CALENDAR_REVOKE_UUID)
async def calendar_revoke(
    token: Annotated[str, Field(description="The feed token to stop publishing.")],
    npub: Annotated[str, Field(description="Required. Your Nostr public key.")] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Stop publishing a feed. Subscribers stop receiving updates. Free."""
    try:
        gone = await feed_store.revoke(token.strip(), npub)
    except Exception as exc:  # noqa: BLE001
        logger.error("calendar revoke failed: %s", exc)
        return {"success": False, "error": "Could not revoke that feed.",
                "error_code": "persistence_unavailable"}
    return {
        "success": True,
        "revoked": gone,
        "note": "Revoked." if gone else "No such feed of yours — nothing changed.",
    }


@tool
@runtime.paid_tool(PLANTING_WINDOW_UUID)
async def planting_window(
    block: Annotated[str, BLOCK_FIELD],
    crops: Annotated[
        list[dict[str, Any]],
        Field(
            description=(
                "The crops to date, with your own requirements. Each is "
                '{"crop": "Tomato", "gdd_target": 1300, "base_temp": 50} plus '
                'any of "frost_hardy", "direct_sow", "min_soil_f" (germination '
                'soil temperature) and "start_indoors_weeks".'
            ),
        ),
    ],
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """When to start seed, when to put it out, and the last day it still finishes.

    Heat requirement answers whether a crop CAN finish here. It says nothing
    about when to start, which is the decision actually made with a seed packet
    in hand in February. This answers three separate questions:

    Start seed indoors — counted back from the day it can go out, for a
    transplanted crop. Out — the earliest the frost record and the soil allow,
    whichever is later; a tender crop waits for the last spring frost, a hardy
    one uses the shoulder before it, a direct sowing waits for the soil, which
    lags the air by weeks. Latest — the last day a sowing still has enough heat
    left to beat the first fall frost, which is what decides whether an August
    succession is worth the seed.

    All from this block's own record rather than a zone map. The requirements
    are yours.

    Args:
        block: The ground to answer for — its id, its name, or an alias.
        crops: The crops to date.
    """
    parsed, _found = await _block_region(npub, block)

    try:
        return await planting_impl(parsed, crops)
    except (PlantingWindowError, PlantingError) as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_request"}
    except (sources.UpstreamError, OSError) as exc:
        logger.warning("planting_window failed: %s", exc)
        return {"success": False, "error": f"A weather feed did not answer: {exc}",
                "error_code": "upstream_unavailable"}


# ---------------------------------------------------------------------------
# Blocks — the grower's saved ground, and what is curated on it
# ---------------------------------------------------------------------------
#
# Appended at the end of the module ON PURPOSE. Inserting a tool between an
# existing `@tool` and its `@runtime.paid_tool` re-binds the orphaned `@tool` to
# the new function and silently unregisters the old one — this repo lost two
# shipped tools that way. New tools go here, at the bottom, always.


@tool
@runtime.paid_tool(BLOCK_SAVE_UUID)
async def block_save(
    name: Annotated[
        str,
        Field(description="What you call this ground, e.g. 'Frogdale Farm'."),
    ],
    geometry: Annotated[
        dict[str, Any],
        Field(description="Its bounds: a GeoJSON Polygon, or {lat, lon, radius_m}."),
    ],
    block: Annotated[
        str,
        Field(description="Omit to create. Pass an existing block's id to update it."),
    ] = "",
    aliases: Annotated[
        list[str] | None,
        Field(description="Other names you call it, so you can ask for it either way."),
    ] = None,
    base_temp: Annotated[
        float,
        Field(description="The base temperature this ground's growing degree days count from."),
    ] = 50.0,
    retired: Annotated[
        bool,
        Field(description="True to retire it. Nothing is deleted — its record stays readable."),
    ] = False,
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Save a plot of land, so every other tool can work it by name.

    Its area and sample count are measured here from the bounds you give, and
    returned — they are facts about the geometry, so there is nothing for you to
    keep in step.
    """
    try:
        parsed = parse_region(geometry)
    except RegionError as exc:
        return {"success": False, "error": str(exc), "error_code": "invalid_region"}

    described = parsed.describe()
    try:
        stored = await block_store.save_block(
            npub, name=name, geometry=geometry, block_id=block,
            aliases=aliases, base_temp_f=base_temp,
            area_ha=round(described.get("area_km2", 0.0) * 100.0, 4),
            sample_count=parsed.sample_count,
            retired=retired,
        )
    except OSError as exc:
        logger.error("block_save persistence failed: %s", exc)
        return {
            "success": False,
            "error": "The record is unreachable right now — try again shortly.",
            "error_code": "persistence_unavailable",
        }

    return {"success": True, "block": stored, "region": described}


@tool
@runtime.paid_tool(BLOCK_LIST_UUID)
async def block_list(
    include_retired: Annotated[
        bool,
        Field(description="Include ground you have retired."),
    ] = False,
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """The ground you have saved, with its bounds.

    The blocks themselves and nothing else — what grows on them, what you watch
    for, and what you have seen are their own listing, so this answer stays the
    same size whether you farm one plot or forty.

    A grower who has saved nothing gets the worked example, marked as such, so
    there is always somewhere to stand.
    """
    try:
        blocks = await block_store.list_blocks(npub, include_retired=include_retired)
    except OSError as exc:
        logger.error("block_list persistence failed: %s", exc)
        return {
            "success": False,
            "error": "The record is unreachable right now — try again shortly.",
            "error_code": "persistence_unavailable",
        }

    seeded = not blocks
    if seeded:
        blocks = [dict(block_store.EXAMPLE_BLOCK)]
    return {
        "success": True,
        "blocks": blocks,
        "count": len(blocks),
        "seeded": seeded,
        "note": (
            "This is the worked example — save your own ground and it replaces it."
            if seeded else ""
        ),
    }


@tool
@runtime.paid_tool(BLOCK_ITEM_SAVE_UUID)
async def block_item_save(
    block: Annotated[
        str,
        Field(description="The ground this belongs to — its id, its name, or an alias."),
    ],
    kind: Annotated[
        str,
        Field(description="One of: planting, pest, wildlife, observation."),
    ],
    items: Annotated[
        list[dict[str, Any]] | None,
        Field(
            description=(
                "What to record, as a list. A planting is {crop, gdd_target, set_out}; "
                "a pest is a model as pest_threshold takes it; wildlife is an event as "
                "wildlife_calendar takes it; an observation is {observed_on, tag, note} "
                "plus whatever you saw. Pass item_id to amend something already recorded."
            )
        ),
    ] = None,
    retire_ids: Annotated[
        list[str] | None,
        Field(description="Ids to retire. They stay readable as history; nothing is deleted."),
    ] = None,
    season: Annotated[
        int | None,
        Field(description="The season year these belong to. Defaults to this one."),
    ] = None,
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """Record what you grow, watch for, or saw on a plot.

    A whole batch in one call, because an afternoon in the field produces
    several notes at once and each one should not be its own fare.
    """
    try:
        found = await block_store.resolve(npub, block)
        saved = await block_store.save_items(
            npub, found["block_id"], kind, list(items or []), season_year=season,
        )
        retired = await block_store.retire_items(npub, list(retire_ids or []))
    except OSError as exc:
        logger.error("block_item_save persistence failed: %s", exc)
        return {
            "success": False,
            "error": "The record is unreachable right now — try again shortly.",
            "error_code": "persistence_unavailable",
        }

    return {
        "success": True,
        "block_id": found["block_id"],
        "block_name": found.get("name", ""),
        "kind": kind.strip().lower(),
        "saved": saved,
        "saved_count": len(saved),
        "retired_count": retired,
    }


@tool
@runtime.paid_tool(BLOCK_ITEM_LIST_UUID)
async def block_item_list(
    block: Annotated[
        str,
        Field(description="The ground to read — its id, its name, or an alias."),
    ],
    kind: Annotated[
        str,
        Field(description="One of: planting, pest, wildlife, observation."),
    ],
    season: Annotated[
        int | None,
        Field(description="Limit to one season year. Ignored for observations."),
    ] = None,
    since: Annotated[
        str,
        Field(description="Only observations on or after this date (YYYY-MM-DD)."),
    ] = "",
    until: Annotated[
        str,
        Field(description="Only observations on or before this date (YYYY-MM-DD)."),
    ] = "",
    as_of: Annotated[
        str,
        Field(
            description=(
                "Read the record as it STOOD on this date (YYYY-MM-DD) — what was "
                "live then, including anything you have retired since."
            )
        ),
    ] = "",
    include_retired: Annotated[
        bool,
        Field(description="Include what you have retired."),
    ] = False,
    search: Annotated[
        str,
        Field(
            description=(
                "Case-insensitive regex over the name and the event, e.g. "
                "'migration' finds both of a bird's. Empty matches everything."
            )
        ),
    ] = "",
    sort_col: Annotated[
        str,
        Field(
            description=(
                "Order by one of: name, event, driver, starts_on, target_gdd, "
                "observed_on, season, created, updated. Omit for the default "
                "order — sightings newest first, everything else by when it "
                "was added."
            )
        ),
    ] = "",
    sort_dir: Annotated[str, Field(description="'asc' or 'desc'.")] = "asc",
    page: Annotated[int, Field(description="Zero-based page number.")] = 0,
    page_size: Annotated[int, Field(description="Rows per page, up to 200.")] = 50,
    npub: Annotated[
        str,
        Field(description="Required. Your Nostr public key (npub1...) for credit billing."),
    ] = "",
    dpop_token: str = "",
) -> dict[str, Any]:
    """What you grow, watch for, or saw on a plot — a page at a time.

    `as_of` is how a past season answers: the record as it stood that day,
    rather than as it stands now.

    Sorting and searching happen in the database, over as many rows as the
    block holds rather than the page you are looking at.
    """
    try:
        found = await block_store.resolve(npub, block)
        result = await block_store.list_items(
            npub, found["block_id"], kind,
            season_year=season, since=since, until=until, as_of=as_of,
            include_retired=include_retired, search=search,
            sort_col=sort_col, sort_dir=sort_dir,
            page=page, page_size=page_size,
        )
    except OSError as exc:
        logger.error("block_item_list persistence failed: %s", exc)
        return {
            "success": False,
            "error": "The record is unreachable right now — try again shortly.",
            "error_code": "persistence_unavailable",
        }

    return {
        "success": True,
        "block_id": found["block_id"],
        "block_name": found.get("name", ""),
        **result,
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
