# Good Earth

Region-scoped climate analytics for small specialty-crop and flower farms,
monetized with Tollbooth DPYC™ Bitcoin Lightning micropayments.

Sibling of the [Good Brew](https://cafe.tollbooth-dpyc.com) store.

- **For growers:** the web app at <https://goodearth.tollbooth-dpyc.com>
- **For AI agents:** the MCP server at `https://goodearth-mcp.fastmcp.app/mcp`
  (streamable HTTP) — the same tools the web app calls.

## Connect an AI agent

Any MCP client that takes a remote server URL can connect; there is no
account and no API key.

| Client | How |
|---|---|
| Claude.ai / Claude Desktop | Customize → Connectors → Add custom connector → `https://goodearth-mcp.fastmcp.app/mcp` (leave the OAuth fields blank) |
| Claude Code | `claude mcp add --transport http goodearth https://goodearth-mcp.fastmcp.app/mcp`, or in a project's `.mcp.json`: `{"mcpServers": {"goodearth": {"type": "http", "url": "https://goodearth-mcp.fastmcp.app/mcp"}}}` |
| Cursor | `.cursor/mcp.json`: `{"mcpServers": {"goodearth": {"url": "https://goodearth-mcp.fastmcp.app/mcp"}}}` |
| VS Code | `.vscode/mcp.json`: `{"servers": {"goodearth": {"type": "http", "url": "https://goodearth-mcp.fastmcp.app/mcp"}}}` |

`server.json` at the repo root is the entry for the official
[MCP Registry](https://registry.modelcontextprotocol.io), as
`io.github.lonniev/goodearth-mcp` — the namespace the rest of the DPYC fleet
is listed under. `.github/workflows/publish-mcp-registry.yml` publishes it on
every `v*` tag, logging in with GitHub OIDC and taking the version from the
tag, so there is no key to keep. A test holds the committed `version` to
`pyproject.toml`.

### First connection walkthrough

1. Ask the grower for their **Nostr npub** — never their nsec.
2. `goodearth_request_npub_proof(patron_npub=…)` sends them a DM. They reply
   from their Nostr client; then call `goodearth_receive_npub_proof(patron_npub=…,
   nonce=…)` **once** with the nonce the request returned. The connection then
   holds the npub: pass only `npub` on every paid call.
3. `goodearth_check_balance`; top up with `goodearth_purchase_credits` (a
   Lightning invoice the grower pays) and `goodearth_check_payment`.
4. `goodearth_block_list` — their saved ground, or a worked example to start from.

Free with no proof: `goodearth_service_status` and the `goodearth_oracle_*`
tools. `goodearth_check_price` previews a fare. The server's own
`instructions` repeat all of this for an agent that connects cold.

## The idea

**A farm is not a point.** A bench and a hollow on the same acreage do not
share a frost date, and every free weather calculator answers for a pin.

Good Earth answers for *ground*. A grower saves a plot once as a **block** —
a GeoJSON polygon or a `{lat, lon, radius_m}` pin, with a name — using
`goodearth_block_save`. Every other tool then takes that `block` by its id,
its name, an alias, or any part of its name that only one block has. Each tool
samples the terrain inside the block and returns an aggregate **plus the
spread across it**. That spread is the product: it tells a grower whether one
planting date serves the whole block.

Blocks may overlap or nest: a bed inside a field is its own block. What a
grower grows, watches for and has seen is recorded per block with
`goodearth_block_item_save`, so the season tools need no lists passed in.

```
      YOU (operator, human in the loop)
        │                         │
        │ set & tune prices       │ drive credential intake
        ▼                         ▼
  ┌───────────────┐        ┌──────────────────────────────────────────────┐
  │ Pricing Studio│ prices │        Good Earth — OPERATOR MCP              │
  │    (iOS)      ├───────▶│        FastMCP · deployed on Horizon          │
  └───────────────┘  Neon  │  ┌────────────────────────────────────────┐  │
                           │  │ region · sources · gdd · season        │  │
   Patron (Citizen)        │  │ @runtime.paid_tool(FROZEN_UUID) tools   │  │
   + MCP client  ─────────▶│  ├────────────────────────────────────────┤  │
   (Claude, the SPA) npub  │  │ tollbooth-dpyc SDK (the wheel)          │  │
                    +sats  │  │  ledger · vault (AES-256-GCM) · pricing │  │
                           │  │  ConstraintGate · Secure Courier·audit  │  │
                           │  └────────────────────────────────────────┘  │
                           └───┬─────────┬──────────┬───────────┬─────────┘
                               ▼         ▼          ▼           ▼
                         Neon Postgres  BTCPay▶  Sponsor     Nostr relays
                         (your schema)  Lightning Authority   proofs·courier
                         ledger+pricing invoices  certify +    DMs·audit
                                                  provision        │
                     Open-Meteo archive ◀── domain   │             ▼
                     forecast · elevation   calls    └──▶ DPYC Oracle +
                                                          dpyc-community
```

## How the spread is actually produced

This is the design decision the whole product rests on, so it is stated
plainly rather than buried.

The free gridded temperature feeds resolve about **2 km** at best (archived
high-resolution model runs) and **9 km** for the ERA5 reanalysis. Two sample
points on one farm can land in the same cell and return byte-identical numbers —
reporting that as "the range across your region" would be a lie dressed as
data. Terrain, however, resolves at **90 m**, and terrain is what varies
within a farm.

So Good Earth reads the *regional signal* from the gridded feeds and derives
*within-region variation* from elevation:

| Effect | Applies to | Why |
|---|---|---|
| Lapse rate (3.57 °F / 1000 ft) | max and min | Higher ground is colder |
| Cold-air drainage (capped at 6 °F) | **min only** | Dense cold air pools in hollows on the still, clear nights when frost happens |

Every response carries the native resolution of each feed it used, so a
grower is never sold precision the data does not contain.

## Tools

Every tool below takes a saved `block` unless noted.

| Tool | Answers |
|---|---|
| **Ground** | |
| `goodearth_block_save` | Save a plot (polygon or pin) with a name and aliases; many beds in one call |
| `goodearth_block_list` | The saved blocks and their bounds — or a worked example when none are saved yet |
| `goodearth_block_transform` | Propose bed layouts inside a plot; writes nothing |
| `goodearth_block_item_save`, `goodearth_block_item_list` | What is grown, watched for, seen, or held as seed on a block |
| `goodearth_forget_my_ground` | Delete every block and everything recorded on it (free) |
| **Season** | |
| `goodearth_gdd_season_curve` | Heat accumulation season to date, against the last ten seasons |
| `goodearth_frost_window` | When frost normally arrives on this ground, and whether it is coming this week |
| `goodearth_soil_temp_projection` | When the soil crosses a planting threshold |
| `goodearth_planting_window` | When to start seed, when to set it out, and the last day it still finishes |
| `goodearth_crop_gdd_status` | Where each planting stands, and whether it finishes before frost |
| `goodearth_crop_suitability` | Which crops finish on this ground, and with how much room to spare |
| `goodearth_almanac` | The sky's record for this ground — normal, actual, and what is coming |
| `goodearth_drying_window` | When the dew burns off, the dry days ahead, and the next rain |
| `goodearth_sunlight` | Hours of direct sun across the block, month by month, and what a solar panel would make |
| **Pests, disease and wildlife** | |
| `goodearth_pest_catalog`, `goodearth_pest_threshold` | Which pest stages are modelled here, and where their degree-day stages stand |
| `goodearth_disease_risk` | Hours of leaf wetness, and what the disease models make of them |
| `goodearth_nearby_species` | What is recorded near this ground, a page at a time |
| `goodearth_wildlife_catalog`, `goodearth_wildlife_calendar` | Which animals are recorded around this ground, and when they arrive |
| **Trees and companions** | |
| `goodearth_tree_suitability` | Whether a tree survives and gets its chill on this ground |
| `goodearth_tree_year` | When spring reached this ground, and what the sap did |
| `goodearth_companions` | Companions for one planting — synergy by cited family rules (iNaturalist taxonomy), or a design from the grower's own flower colour, height and bloom |
| **Planning** | |
| `goodearth_plan_the_season` | The season-planning interview, as a workflow to follow (takes no block) |
| `goodearth_review_roster` | Audit a roster against what this ground's record knows |
| `goodearth_calibration` | Turn a block's own field reports into a correction on the model |
| `goodearth_task_save`, `goodearth_task_list`, `goodearth_task_set_done`, `goodearth_task_delete` | The farm's task list |
| **Calendar feeds** | |
| `goodearth_calendar_dataset` | Compute a block's dated season and store it for publishing as a calendar feed |
| `goodearth_calendar_fetch`, `goodearth_calendar_list`, `goodearth_calendar_revoke` | Read, list, and stop publishing feeds (free) |

Standard DPYC tools (`check_balance`, `purchase_credits`, Secure Courier,
Oracle, pricing, constraints) come from the wheel via
`register_standard_tools` — none of it is reimplemented here.

## Data sources

All public. Every one is free, and only the EIA feed needs a key: an optional
`eia_api_key` the operator delivers by Secure Courier, so the Sun page can
quote what a kWh sells for in the block's state.

| Source | Role | Native resolution |
|---|---|---|
| Open-Meteo archived model runs | Observed daily max/min, running season | ~2 km |
| Open-Meteo archive (ERA5) | Fallback daily record; hourly radiation for sunlight | ~9 km |
| Daymet v4 (NASA ORNL) | Deep daily history for the normals, North America | 1 km |
| Open-Meteo forecast | 7-day extension | ~2–11 km by model |
| Open-Meteo elevation (SRTM) | Terrain downscaling | ~90 m |
| Copernicus GLO-30 DEM, Meta/WRI canopy height, CGLS land cover | Terrain, trees and shade for sunlight | 30 m, 1 m, 100 m |
| iNaturalist, GBIF, USA National Phenology Network | Species recorded nearby; family and genus for Companions; phenology | — |
| EIA retail electricity prices, DOE PV cost benchmarks, Nominatim | What a kWh sells for and a kW costs, by state | — |

A whole-region season read costs **three** upstream requests regardless of
sample count: sample points are folded onto the archive's own grid so a
distinct cell is fetched once, and the ten-season normals band is one span
request sliced locally rather than ten separate calls.

## Onboarding roadmap

1. **Nostr keypair** — generate one (`nak key generate`); the nsec is the
   single env var the server needs (`TOLLBOOTH_NOSTR_OPERATOR_NSEC`).
2. **Sponsor Authority** — register; it provisions your Neon database.
3. **Secure Courier** — deliver `btcpay_host`, `btcpay_api_key`,
   `btcpay_store_id` (and, optionally, `eia_api_key`) via
   `goodearth_request_credential_channel`. Never as env vars, never in code.
4. **Set prices in Pricing Studio** — new tools start unpriced and nobody
   can call an unpriced tool.
5. **Deploy on Horizon** — `fastmcp.json` is already wired.

**Get [Pricing Studio](https://github.com/lonniev/tollbooth-pricing-studio)
(iOS).** It reads and writes the pricing model live in Neon, so prices never
live in code — surge, happy-hour, loyalty discounts and free trials are the
thing a flat paywall can never give you.

## The SPA

`frontend/` carries the Good Earth app (the taxsort-mcp pattern — one repo,
React app inside). Sign-in and the Nostr profile panel come from the fleet's
shared `@tollbooth-dpyc/web` package. There are no accounts: a grower is an
npub.

A grower's blocks, what is recorded on them, tasks and published calendar
feeds are stored in the operator's Neon database under their npub. A block's
name, aliases and boundary are encrypted with the SDK's vault cipher; the items
recorded on a block (crop names, species, field reports) are stored in the
clear so they can be sorted and searched. `goodearth_forget_my_ground` deletes
all of it; the grower's balance and purchase history stay with the patron.

## Develop

```bash
uv venv --python python3.12          # coincurve has no 3.14 wheel
uv pip install -e ".[dev]"
ruff check .
pytest -v
python -m goodearth_mcp.server       # runs the validate_operator_tools guard

cd frontend && npm install && npm run build
```

## License

Apache-2.0
