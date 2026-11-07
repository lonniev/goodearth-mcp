"""The water balance: rain against what the air pulls out, and the soil's own reading.

Two numbers answer "is this ground dry?", and they answer it differently.

**The balance** is a running tally of rain minus reference evapotranspiration
(FAO-56 ET0), day by day. Below zero, the air has taken more than the sky gave.
It is a tally, not a soil bucket: it knows nothing of this soil's texture, how
much it holds, what runs off or what drains through. Its value is the trend.

**Modelled soil moisture** is the weather model's own soil, as volumetric water
(m³ of water per m³ of soil). It does carry a soil, but the model's, on a grid
far coarser than a plot. Read as two layers: the topsoil a seed sits in
(0–9 cm), and the root zone below it (9–81 cm).

Neither is measured on the ground. A station's soil probe is, and the page puts
it beside these when the plot has one.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any

#: The model's five layers as (field, top cm, bottom cm).
LAYERS: tuple[tuple[str, float, float], ...] = (
    ("soil_moisture_0_to_1cm", 0, 1),
    ("soil_moisture_1_to_3cm", 1, 3),
    ("soil_moisture_3_to_9cm", 3, 9),
    ("soil_moisture_9_to_27cm", 9, 27),
    ("soil_moisture_27_to_81cm", 27, 81),
)

#: The two depths a grower reads, each a thickness-weighted mean of its layers.
TOPSOIL_CM = (0.0, 9.0)
ROOT_ZONE_CM = (9.0, 81.0)

NOTE = (
    "The balance is rain minus reference evapotranspiration (FAO-56 ET0, a short "
    "grass crop), added up day by day. It is a tally, not a soil bucket: it knows "
    "nothing of this soil's texture, runoff or drainage. Soil moisture is the "
    "weather model's soil at the block's centre, on a grid kilometres wide. Neither "
    "is measured on your ground."
)


def _num(v: Any) -> float | None:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def depth_mean(values: dict[str, float | None], top: float, bottom: float) -> float | None:
    """The thickness-weighted mean of the layers inside [top, bottom), or None."""
    total = weight = 0.0
    for field, lo, hi in LAYERS:
        if lo < top or hi > bottom:
            continue
        v = values.get(field)
        if v is None:
            continue
        total += v * (hi - lo)
        weight += hi - lo
    return round(total / weight, 3) if weight else None


def _depths(values: dict[str, float | None]) -> dict[str, float | None]:
    return {"topsoil": depth_mean(values, *TOPSOIL_CM), "root_zone": depth_mean(values, *ROOT_ZONE_CM)}


def daily_soil(hourly: dict[str, Any]) -> dict[str, dict[str, float | None]]:
    """Each day's mean soil moisture, by layer and then by depth."""
    times = hourly.get("time") or []
    sums: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for field, _lo, _hi in LAYERS:
        for t, v in zip(times, hourly.get(field) or [], strict=False):
            n = _num(v)
            if n is not None:
                sums[str(t)[:10]][field].append(n)
    return {
        day: _depths({f: sum(vs) / len(vs) for f, vs in layers.items()})
        for day, layers in sums.items()
    }


def soil_at(hourly: dict[str, Any], hour: str) -> dict[str, float | None]:
    """Soil moisture by depth at the latest hour not after `hour`."""
    times = [str(t) for t in hourly.get("time") or []]
    idx = max((i for i, t in enumerate(times) if t <= hour), default=None)
    if idx is None:
        return {"topsoil": None, "root_zone": None}
    values = {}
    for field, _lo, _hi in LAYERS:
        series = hourly.get(field) or []
        values[field] = _num(series[idx]) if idx < len(series) else None
    return _depths(values)


def assess(daily: dict[str, Any], hourly: dict[str, Any], *, today: str, now_at: str) -> dict[str, Any]:
    """The days, the running balance through them, and where it stands today."""
    dates = [str(d) for d in daily.get("time") or []]
    rain = daily.get("precipitation_sum") or []
    et0 = daily.get("et0_fao_evapotranspiration") or []
    soil = daily_soil(hourly)

    days: list[dict[str, Any]] = []
    balance = 0.0
    for i, d in enumerate(dates):
        r = _num(rain[i]) if i < len(rain) else None
        e = _num(et0[i]) if i < len(et0) else None
        net = round(r - e, 1) if r is not None and e is not None else None
        if net is not None:
            balance += net
        days.append({
            "date": d,
            "rain_mm": round(r, 1) if r is not None else None,
            "et0_mm": round(e, 1) if e is not None else None,
            "net_mm": net,
            "balance_mm": round(balance, 1),
            "forecast": d > today,
            **soil.get(d, {"topsoil": None, "root_zone": None}),
        })

    past = [x for x in days if x["date"] <= today]
    ahead = [x for x in days if x["date"] > today]
    at_today = past[-1]["balance_mm"] if past else 0.0
    week_ago = next((x for x in reversed(past) if x["date"] <= _days_before(today, 7)), None)
    now_soil = soil_at(hourly, now_at)
    root_then = week_ago["root_zone"] if week_ago else None
    return {
        "days": days,
        "today": {
            "date": today,
            "balance_mm": at_today,
            "since": past[0]["date"] if past else today,
            "rain_mm": round(sum(x["rain_mm"] or 0 for x in past), 1),
            "et0_mm": round(sum(x["et0_mm"] or 0 for x in past), 1),
            **now_soil,
            "root_zone_week_change": (
                round(now_soil["root_zone"] - root_then, 3)
                if now_soil["root_zone"] is not None and root_then is not None else None
            ),
        },
        "ahead": {
            "until": ahead[-1]["date"] if ahead else today,
            "rain_mm": round(sum(x["rain_mm"] or 0 for x in ahead), 1),
            "et0_mm": round(sum(x["et0_mm"] or 0 for x in ahead), 1),
            "balance_change_mm": round((ahead[-1]["balance_mm"] - at_today), 1) if ahead else 0.0,
        },
    }


def _days_before(day: str, n: int) -> str:
    return (date.fromisoformat(day) - timedelta(days=n)).isoformat()
