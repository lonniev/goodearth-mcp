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

from datetime import date
from typing import Any

from goodearth_mcp import frost, gdd

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
# ground in midsummer. Same reasoning as frost.season_start — searching
# the whole calendar year finds the wrong season's answer. Written for the
# north; a southern block reads each six months on (`gdd.hemisphere`).
COOLING_SEARCH = ((7, 1), (12, 31))  # autumn crossings: Jul 1 to the year's end
WARMING_SEARCH = ((2, 1), (7, 31))   # spring crossings: Feb 1 to Jul 31


def _in_season(iso: str, direction: str, lat: float) -> bool:
    """Whether a date falls in the half of this ground's year the crossing
    belongs to."""
    first, last = COOLING_SEARCH if direction == "cooling" else WARMING_SEARCH
    return gdd.within(date.fromisoformat(iso), gdd.hemisphere(first, lat), gdd.hemisphere(last, lat))


def by_season(
    dates: list[str], temps: list[float | None], lat: float,
) -> dict[date, tuple[list[str], list[float | None]]]:
    """A daily record cut into seasons, each keyed by its first day — the
    midwinter `gdd.season_start` names, so a southern spring that runs from
    August into January stays one season."""
    out: dict[date, tuple[list[str], list[float | None]]] = {}
    for d, t in zip(dates, temps, strict=False):
        bucket = out.setdefault(gdd.season_start(date.fromisoformat(d), lat), ([], []))
        bucket[0].append(d)
        bucket[1].append(t)
    return out


def crossing(
    dates: list[str],
    temps: list[float | None],
    threshold_f: float,
    direction: str,
    lat: float | None,
    persist_days: int = PERSIST_DAYS,
) -> str | None:
    """The first date the series crosses the threshold *and stays* across.

    A *crossing* rather than a *reading*: the soil must have been on the other
    side first, and must then hold the new side for ``persist_days``. Without
    the persistence rule a late-May cold snap reads as the autumn crossing —
    which would tell a grower to plant garlic in the spring. (Observed: the
    2024 record crossed up through 60 °F on May 18 and dipped below again on
    May 30, and the naive rule reported May 30 as the cooling crossing.)

    ``lat`` holds the search to the crossing's own half of that ground's year;
    ``None`` searches every day given, for a forecast already inside one season.
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
        if lat is not None and not _in_season(d, direction, lat):
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


def typical_crossing(iso_dates: list[str], lat: float, season: date) -> dict[str, Any] | None:
    """Median, earliest and latest crossing date across seasons, placed in
    the season that begins on ``season``.

    Each crossing is counted in days from its own season's midwinter, so a
    southern spring crossing in January stays after the October ones, and
    lands in the year it belongs to.
    """
    got = frost.typical_around(season, [
        gdd.season_offset(day, gdd.season_start(day, lat))
        for day in map(date.fromisoformat, iso_dates)
    ])
    return {**got, "years_on_record": len(iso_dates)} if got else None


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
