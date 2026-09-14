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
| Claude.ai / Claude Desktop | Settings → Connectors → Add custom connector → `https://goodearth-mcp.fastmcp.app/mcp` |
| Claude Code | `claude mcp add --transport http goodearth https://goodearth-mcp.fastmcp.app/mcp` |
| Cursor | `.cursor/mcp.json`: `{"mcpServers": {"goodearth": {"url": "https://goodearth-mcp.fastmcp.app/mcp"}}}` |

### First connection walkthrough

1. Ask the grower for their **Nostr npub** — never their nsec.
2. `goodearth_request_npub_proof(patron_npub=…)` sends them a DM. They reply
   from their Nostr client; then call `goodearth_receive_npub_proof(patron_npub=…,
   dpop_token=…)` **once**, and pass `npub` + `dpop_token` on every paid call.
3. `goodearth_check_balance`; top up with `goodearth_purchase_credits` (a
   Lightning invoice the grower pays) and `goodearth_check_payment`.
4. `goodearth_block_list` — their saved ground, or a worked example to start from.

Free with no proof: `goodearth_service_status` and the `goodearth_oracle_*`
tools. `goodearth_check_price` previews a fare. The server's own
`instructions` repeat all of this for an agent that connects cold.

## The idea

**A farm is not a point.** A bench and a hollow on the same acreage do not
share a frost date, and every free weather calculator answers for a pin.

Good Earth answers for *ground*. Every tool accepts a GeoJSON polygon or a
`{lat, lon, radius_m}` pin, samples the terrain inside it, and returns an
aggregate **plus the spread across it**. That spread is the product: it tells
a grower whether one planting date serves the whole block.

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

The free gridded temperature feeds resolve about **9 km**. Two sample points
on one farm land in the same cell and return byte-identical numbers —
reporting that as "the range across your region" would be a lie dressed as
data. Terrain, however, resolves at **90 m**, and terrain is what varies
within a farm.

So Good Earth reads the *regional signal* from the coarse feed and derives
*within-region variation* from elevation:

| Effect | Applies to | Why |
|---|---|---|
| Lapse rate (3.57 °F / 1000 ft) | max and min | Higher ground is colder |
| Cold-air drainage (capped at 6 °F) | **min only** | Dense cold air pools in hollows on the still, clear nights when frost happens |

Every response carries the native resolution of each feed it used, so a
grower is never sold precision the data does not contain.

## Tools

| Tool | Phase | Answers |
|---|---|---|
| `goodearth_gdd_season_curve` | **T1 — shipped** | Heat accumulation across a region, vs the last 10 seasons |
| `goodearth_region_climate_bundle` | T2 | Heat + water + light in one priced call |
| `goodearth_frost_window` | T2 | First-frost dates and near-term risk, with drainage spread |
| `goodearth_dli_curve`, `goodearth_water_balance` | T3 | Light and water lenses |
| `goodearth_soil_temp_projection`, `goodearth_crop_gdd_status`, `goodearth_finish_before_frost` | T4 | Per-planting timing |
| `goodearth_pest_threshold` | T5 | Model GDD vs accumulated; crossing dates |
| `goodearth_calibration` | T6 | Per-region bias correction from patron field reports |

Standard DPYC tools (`check_balance`, `purchase_credits`, Secure Courier,
Oracle, pricing, constraints) come from the wheel via
`register_standard_tools` — none of it is reimplemented here.

## Data sources

All free, all public, no API key.

| Source | Role | Native resolution |
|---|---|---|
| Open-Meteo archive (ERA5) | Observed daily max/min | ~9 km |
| Open-Meteo forecast | 7-day extension | ~11 km |
| Open-Meteo elevation (SRTM) | Terrain downscaling | ~90 m |

A whole-region season read costs **three** upstream requests regardless of
sample count: sample points are folded onto the archive's own grid so a
distinct cell is fetched once, and the ten-season normals band is one span
request sliced locally rather than ten separate calls.

## Onboarding roadmap

1. **Nostr keypair** — generate one (`nak key generate`); the nsec is the
   single env var the server needs (`TOLLBOOTH_NOSTR_OPERATOR_NSEC`).
2. **Sponsor Authority** — register; it provisions your Neon database.
3. **Secure Courier** — deliver `btcpay_host`, `btcpay_api_key`,
   `btcpay_store_id` via `goodearth_request_credential_channel`. Never as
   env vars, never in code.
4. **Set prices in Pricing Studio** — new tools start unpriced and nobody
   can call an unpriced tool.
5. **Deploy on Horizon** — `fastmcp.json` is already wired.

**Get [Pricing Studio](https://github.com/lonniev/tollbooth-pricing-studio)
(iOS).** It reads and writes the pricing model live in Neon, so prices never
live in code — surge, happy-hour, loyalty discounts and free trials are the
thing a flat paywall can never give you.

## The SPA

`frontend/` carries the Good Earth app (the taxsort-mcp pattern — one repo,
React app inside). Sign-in, the proof envelope, and the Nostr profile panel
are the fleet's existing modules, borrowed rather than rewritten. Patron
state lives on Nostr as NIP-44-encrypted NIP-78 events under the
`goodearth/*` namespace — no accounts, and the farm's data never lives on
the operator's server.

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
