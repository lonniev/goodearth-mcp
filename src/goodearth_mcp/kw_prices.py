"""What a kW of panels costs to put up and what its kWh would sell for — read live.

The Sun page prices an array a grower lays on a spot: a footprint in metres
becomes kW, the spot's yield becomes kWh a day, and two figures turn those
into money — the installed cost per watt and the price of a kWh in the
block's state. Neither figure lives in this code. Prices move, and a number
pasted in today is a lie by spring; both are read from their publishers at
runtime and carried in the answer with the quarter or month they are for.

Three feeds, each one optional on its own:

* **Installed cost** — DOE's Solar Energy Technologies Office benchmarks, the
  table on its page: residential, commercial and utility $/W dc, modeled
  market price, before incentives. Read daily.
* **Sell rate** — EIA's average retail price of electricity, residential, by
  state, latest month (Electric Power Monthly, Table 5.6.A). Needs the
  operator's free EIA key; without one the answer says so and the page lets
  the grower type their own rate.
* **The state** — Nominatim at state zoom, for the code EIA keys by. A place
  does not move states, so it is remembered for good.

What IS in this code is model convention, cited: how much of a footprint is
panel, and which benchmark row an array of a given size is priced by.
"""

from __future__ import annotations

import asyncio
import html
import logging
import re
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any

from goodearth_mcp import record_cache, sources

logger = logging.getLogger(__name__)

#: Ground-coverage ratio of a fixed-tilt ground array — the share of the
#: footprint that is panel, the rest being the row spacing that keeps one
#: row from shading the next. Design guides put mid-latitude fixed-tilt at
#: 0.35–0.45 (NREL, "Land-Use Requirements for Solar Power Plants", 2013;
#: PVWatts' ground-mount default). The middle of that range.
GCR = 0.40

#: Watts of module per square metre of module: efficiency × the 1,000 W/m²
#: modules are rated at. A 2025 module is 22–25 % efficient; the lower end,
#: because a screening estimate should err small.
MODULE_W_PER_M2 = 220.0

#: Watts of array per square metre of ground.
ARRAY_W_PER_M2 = GCR * MODULE_W_PER_M2

#: Which benchmark row prices an array, by its size in kW dc. The benchmark
#: models an 8 kW residential, a 250 kW commercial and a 100 MW utility
#: system; an array is priced by the nearest shape, and the edges are where
#: a project stops being a rooftop-scale job and where it needs a substation.
TIERS = {"residential_max_kw": 25.0, "commercial_max_kw": 1000.0}

#: How long a day's reading of either price is kept, in seconds. The
#: benchmark changes once a year and the tariff once a month; a farm's day of
#: tapping is one read of each.
MEMO_TTL_S = 24 * 3600

PLACE_KIND = "sun_place"

DOE_NAME = "DOE/NLR PV system cost benchmark"
EIA_NAME = "EIA Electric Power Monthly, Table 5.6.A"
NOMINATIM_NAME = "OpenStreetMap Nominatim"


@dataclass(frozen=True)
class Benchmark:
    quarter: str
    residential_usd_per_w: float
    commercial_usd_per_w: float
    utility_usd_per_w: float


@dataclass(frozen=True)
class Retail:
    state_id: str
    period: str
    cents_per_kwh: float


@dataclass(frozen=True)
class Place:
    country_code: str
    state_id: str | None
    state_name: str | None


# ── Parsing ──────────────────────────────────────────────────────────────

_TAG = re.compile(r"<[^>]+>")
_PV_ONLY = re.compile(
    r"(\d{4}Q[1-4])\s*PV-Only\s+Cost\s+Benchmarks\s*</h\d>\s*<table>(.*?)</table>", re.IGNORECASE | re.DOTALL,
)
_ROW = re.compile(r"<tr>(.*?)</tr>", re.DOTALL)
_CELL = re.compile(r"<t[hd][^>]*>(.*?)</t[hd]>", re.DOTALL)
_USD_PER_W = re.compile(r"\$\s*([\d.]+)\s*/\s*W")
_ROWS = {"RPV": "residential_usd_per_w", "CPV": "commercial_usd_per_w", "UPV": "utility_usd_per_w"}


def _text(cell: str) -> str:
    return html.unescape(_TAG.sub("", cell)).strip()


def parse_benchmark(page: str) -> Benchmark | None:
    """The PV-only table's three MMP figures, or None when the page has moved on.

    The table's columns are Type, Size, MSP, MMP, O&M. The modeled market
    price is what a buyer is asked, which is the figure a grower wants; the
    minimum sustainable price is what an installer could survive on.
    """
    m = _PV_ONLY.search(page)
    if not m:
        return None
    quarter, body = m.group(1), m.group(2)
    found: dict[str, float] = {}
    for row in _ROW.findall(body):
        cells = [_text(c) for c in _CELL.findall(row)]
        if len(cells) < 4 or cells[0] not in _ROWS:
            continue
        price = _USD_PER_W.search(cells[3])
        if not price:
            continue
        try:
            found[_ROWS[cells[0]]] = float(price.group(1))
        except ValueError:
            continue
    if len(found) != len(_ROWS):
        return None
    return Benchmark(quarter=quarter, **found)


def parse_retail(payload: Any) -> Retail | None:
    """The first row of EIA's answer — the latest month, as the request sorted it."""
    try:
        row = payload["response"]["data"][0]
        cents = float(row["price"])
        period, state = str(row["period"]), str(row["stateid"])
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    if not (0 < cents < 200) or not period or not state:
        return None
    return Retail(state_id=state, period=period, cents_per_kwh=round(cents, 2))


def parse_place(payload: Any) -> Place | None:
    """Country and state from Nominatim's address, as EIA codes them."""
    address = payload.get("address") if isinstance(payload, dict) else None
    if not isinstance(address, dict):
        return None
    country = str(address.get("country_code") or "").lower()
    if not country:
        return None
    iso = str(address.get("ISO3166-2-lvl4") or "")
    state_id = iso.partition("-")[2] or None
    name = address.get("state") or address.get("province") or address.get("region")
    return Place(country_code=country, state_id=state_id, state_name=str(name) if name else None)


def tier_for(kw: float) -> str:
    """Which benchmark row an array of this size is priced by."""
    if kw <= TIERS["residential_max_kw"]:
        return "residential"
    if kw <= TIERS["commercial_max_kw"]:
        return "commercial"
    return "utility"


# ── Reading, remembered ───────────────────────────────────────────────────

_memo: dict[str, tuple[float, Any]] = {}


def _held(key: str) -> Any:
    hit = _memo.get(key)
    if hit and time.monotonic() - hit[0] < MEMO_TTL_S:
        return hit[1]
    return None


def _hold(key: str, value: Any) -> None:
    _memo[key] = (time.monotonic(), value)


async def place_for(lat: float, lon: float) -> Place | None:
    """The block's country and state, remembered per 0.01° — a place does not move."""
    subject = f"{lat:.2f},{lon:.2f}"
    row = await record_cache.remembered(PLACE_KIND, subject)
    if isinstance(row, dict) and row.get("country_code"):
        return Place(
            country_code=str(row["country_code"]),
            state_id=row.get("state_id") or None,
            state_name=row.get("state_name") or None,
        )
    place = parse_place(await sources.fetch_reverse_place(lat, lon))
    if place is None:
        raise sources.UpstreamError("Nominatim named no country for this place")
    await record_cache.remember(PLACE_KIND, subject, asdict(place))
    return place


async def benchmark() -> Benchmark:
    """The day's reading of the DOE table."""
    held = _held("benchmark")
    if held is not None:
        return held
    found = parse_benchmark(await sources.fetch_pv_benchmark_page())
    if found is None:
        raise sources.UpstreamError("the PV cost benchmark page no longer carries the table")
    _hold("benchmark", found)
    return found


async def retail_for(state_id: str, api_key: str) -> Retail:
    """The day's reading of a state's retail price. The key is never in a message."""
    held = _held(f"retail|{state_id}")
    if held is not None:
        return held
    try:
        payload = await sources.fetch_retail_price(state_id, api_key)
    except sources.UpstreamError as exc:
        raise sources.UpstreamError(f"EIA did not answer for {state_id}: {_bare(exc)}") from None
    found = parse_retail(payload)
    if found is None:
        raise sources.UpstreamError(f"EIA returned no residential price for {state_id}")
    _hold(f"retail|{state_id}", found)
    return found


def _bare(exc: Exception) -> str:
    """An upstream message with any query string cut off, so a key cannot ride along."""
    return str(exc).split("?", 1)[0]


async def read(lat: float, lon: float, eia_key: str = "") -> dict[str, Any]:
    """The `kw_prices` block of a Sun answer. A feed that fails is a null with a reason."""
    place, bench = await asyncio.gather(place_for(lat, lon), benchmark(), return_exceptions=True)
    reasons: dict[str, str] = {}

    if isinstance(bench, BaseException):
        logger.info("kw_prices: no benchmark (%s)", bench)
        reasons["install"] = str(bench) if isinstance(bench, sources.UpstreamError) else "the benchmark could not be read"
        bench = None

    sell: Retail | None = None
    if isinstance(place, BaseException) or place is None:
        if isinstance(place, BaseException):
            logger.info("kw_prices: no place (%s)", place)
        reasons["sell"] = "the block's state could not be named"
        place = None
    elif place.country_code != "us" or not place.state_id:
        reasons["sell"] = "EIA prices electricity for the United States only; this block is elsewhere"
    elif not eia_key:
        reasons["sell"] = "no EIA key on file"
    else:
        try:
            sell = await retail_for(place.state_id, eia_key)
        except sources.UpstreamError as exc:
            logger.info("kw_prices: no retail price (%s)", exc)
            reasons["sell"] = str(exc)

    return {
        "place": asdict(place) if place else None,
        "sell": None if sell is None else {
            "cents_per_kwh": sell.cents_per_kwh,
            "sector": "residential",
            "period": sell.period,
            "state_id": sell.state_id,
            "source": EIA_NAME,
        },
        "install": None if bench is None else {
            "residential_usd_per_w": bench.residential_usd_per_w,
            "commercial_usd_per_w": bench.commercial_usd_per_w,
            "utility_usd_per_w": bench.utility_usd_per_w,
            "quarter": bench.quarter,
            "basis": "modeled market price, $/W dc, before incentives",
            "source": DOE_NAME,
        },
        "reasons": reasons,
        "array_w_per_m2": ARRAY_W_PER_M2,
        "tiers": dict(TIERS),
        "as_of": datetime.now(UTC).isoformat(timespec="seconds"),
    }
