"""Soil temperature — the clock that decides a planting window.

Air temperature tells you whether a plant grows. Soil temperature tells you
whether a seed or a clove should go in the ground at all, and it is the slower,
steadier signal: soil lags air by weeks and does not care about one warm
afternoon.

Two windows matter, in opposite directions:

* **Cooling through** a threshold in autumn — garlic goes in once the soil
  drops below about 60 °F, early enough to root and too late to sprout.
* **Warming through** a threshold in spring — warm-season crops wait for it.

Both are answered the same way: find the date the soil crosses the threshold,
using the forecast where it reaches and the previous seasons' record beyond it.

Pure domain logic. No billing, no npubs, no MCP.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

# Open-Meteo's soil bands. 7-28 cm brackets the 4-inch depth growers speak in
# (10 cm), so it is the default — but the band is reported rather than the
# nominal inch figure, because claiming "4 inch soil" from a 7-28 cm mean
# would be precision the feed does not have.
BANDS = {
    "shallow": {"hourly": "soil_temperature_6cm", "archive": "soil_temperature_0_to_7cm_mean",
                "label": "0–7 cm (surface, ~1–3 in)"},
    "planting": {"hourly": "soil_temperature_18cm", "archive": "soil_temperature_7_to_28cm_mean",
                 "label": "7–28 cm (planting depth, ~3–11 in)"},
}
DEFAULT_BAND = "planting"

MIN_THRESHOLD_F = 25.0
MAX_THRESHOLD_F = 95.0


class SoilError(ValueError):
    """The request cannot be answered as asked."""


def validate(threshold_f: Any, direction: Any, band: Any) -> tuple[float, str, str]:
    """Check the caller's parameters. Tool input is treated as adversarial."""
    try:
        t = float(threshold_f)
    except (TypeError, ValueError) as exc:
        raise SoilError(f"threshold must be a number in °F, got {threshold_f!r}") from exc
    if not MIN_THRESHOLD_F <= t <= MAX_THRESHOLD_F:
        raise SoilError(
            f"threshold must be between {MIN_THRESHOLD_F:.0f} and {MAX_THRESHOLD_F:.0f} °F, "
            f"got {t:.1f} — Good Earth works in Fahrenheit"
        )

    d = str(direction or "cooling").lower()
    if d not in {"cooling", "warming"}:
        raise SoilError("direction must be 'cooling' (autumn) or 'warming' (spring)")

    b = str(band or DEFAULT_BAND).lower()
    if b not in BANDS:
        raise SoilError(f"band must be one of {', '.join(BANDS)}")

    return t, d, b


# A seasonal crossing has to STICK. Spring soil bounces across a threshold
# several times during May cold snaps, and autumn does the same in reverse, so
# a single day on the new side is noise. Five consecutive days is the rule
# extension services already phrase their planting advice in ("soil below X for
# five straight days"), which makes the answer legible to a grower who has
# heard it that way for years.
PERSIST_DAYS = 5

# A crossing only means something inside its own half of the year. Persistence
# alone is not enough: a genuine five-day cool spell in June is a real dip, but
# it is not the AUTUMN crossing, and reporting it as one would put garlic in the
# ground in midsummer. Same reasoning as frost.FALL_SEARCH_START — searching
# the whole calendar year finds the wrong season's answer.
COOLING_SEARCH_FROM = (7, 1)   # autumn crossings: Jul 1 onward
WARMING_SEARCH_FROM = (2, 1)   # spring crossings: Feb 1 onward…
WARMING_SEARCH_TO = (7, 31)    # …and no later than Jul 31


def _in_season(iso: str, direction: str) -> bool:
    """Whether a date falls in the half of the year this crossing belongs to."""
    d = date.fromisoformat(iso)
    md = (d.month, d.day)
    if direction == "cooling":
        return md >= COOLING_SEARCH_FROM
    return WARMING_SEARCH_FROM <= md <= WARMING_SEARCH_TO


def crossing(
    dates: list[str],
    temps: list[float | None],
    threshold_f: float,
    direction: str,
    persist_days: int = PERSIST_DAYS,
    seasonal: bool = True,
) -> str | None:
    """The first date the series crosses the threshold *and stays* across.

    A *crossing* rather than a *reading*: the soil must have been on the other
    side first, and must then hold the new side for ``persist_days``. Without
    the persistence rule a late-May cold snap reads as the autumn crossing —
    which would tell a grower to plant garlic in the spring. (Observed: the
    2024 record crossed up through 60 °F on May 18 and dipped below again on
    May 30, and the naive rule reported May 30 as the cooling crossing.)
    """
    def on_new_side(t: float) -> bool:
        return t <= threshold_f if direction == "cooling" else t >= threshold_f

    seen_other_side = False
    for i, (d, t) in enumerate(zip(dates, temps, strict=False)):
        if t is None:
            continue
        if not on_new_side(t):
            seen_other_side = True
            continue
        if not seen_other_side:
            continue
        if seasonal and not _in_season(d, direction):
            continue
        available = min(persist_days, len(temps) - i)
        window = [x for x in temps[i : i + persist_days] if x is not None]
        # A missing day is not evidence against a run — the archive drops the
        # occasional reading — but a mostly-empty window is not evidence FOR
        # one either. Half the window must be present, and every reading in it
        # must be on the new side.
        if len(window) * 2 >= available and window and all(on_new_side(x) for x in window):
            return d
    return None


def _month_day(iso: str) -> tuple[int, int]:
    """Sort key by calendar date, not day-of-year — see frost._month_day."""
    d = date.fromisoformat(iso)
    return (d.month, d.day)


def typical_crossing(iso_dates: list[str], reference_year: int) -> dict[str, Any] | None:
    """Median, earliest and latest crossing date across seasons."""
    if not iso_dates:
        return None
    keys = sorted(_month_day(d) for d in iso_dates)
    n = len(keys)
    if n % 2:
        median_key = keys[n // 2]
    else:
        lo = date(reference_year, *keys[n // 2 - 1])
        hi = date(reference_year, *keys[n // 2])
        mid = lo + timedelta(days=(hi - lo).days // 2)
        median_key = (mid.month, mid.day)

    def to_date(k: tuple[int, int]) -> str:
        return date(reference_year, k[0], k[1]).isoformat()

    return {
        "median": to_date(median_key),
        "earliest": to_date(keys[0]),
        "latest": to_date(keys[-1]),
        "years_on_record": n,
    }


def daily_means(hours: list[str], temps: list[float | None]) -> tuple[list[str], list[float | None]]:
    """Collapse an hourly soil series to daily means.

    Soil at depth barely moves within a day, so the daily mean is the honest
    resolution — an hourly figure invites reading noise as signal.
    """
    buckets: dict[str, list[float]] = {}
    order: list[str] = []
    for h, t in zip(hours, temps, strict=False):
        day = str(h)[:10]
        if day not in buckets:
            buckets[day] = []
            order.append(day)
        if isinstance(t, (int, float)):
            buckets[day].append(float(t))
    means: list[float | None] = []
    for day in order:
        vals = buckets[day]
        means.append(round(sum(vals) / len(vals), 1) if vals else None)
    return order, means
