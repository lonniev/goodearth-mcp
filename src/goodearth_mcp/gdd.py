"""Growing degree days, and the terrain downscaling that gives them spread.

Growing degree days are the crop's clock. A planting needs a number of
accumulated degree-days above a base temperature to reach a stage, and that
number is far steadier across seasons than any calendar date. This module
turns observed and forecast daily temperatures into that clock, for a whole
region rather than a point.

The spread problem, stated plainly: the reanalysis archive resolves about
9 km, so every sample point on one farm returns the *same* numbers. Reporting
that as "min/mean/max across your region" would be a lie dressed as data.
Terrain, however, resolves at 90 m, and terrain is what actually varies
within a farm. So the coarse field sets the region's level and elevation
sets the variation around it — a bench runs warmer than the hollow below it
by an amount the lapse rate predicts, and the hollow pools cold air on the
still, clear nights when frost happens.

Nothing here knows about billing, npubs, or MCP.
"""

from __future__ import annotations

from datetime import date, timedelta

# Standard environmental lapse rate: temperature falls ~6.5 °C per km of
# elevation gain, which is 3.566 °F per 1000 ft — expressed here per metre.
LAPSE_F_PER_M = 6.5 * 1.8 / 1000.0

# Cold-air drainage: on calm, clear nights dense cold air slides downhill and
# pools in low ground, so hollows run colder at dawn than the lapse rate alone
# predicts while benches run warmer. The effect is on the daily MINIMUM only —
# it is a nocturnal process — and is the reason two beds a hundred metres
# apart can differ by a full frost date. Scaled by how far a point sits below
# the region's high ground, capped so a steep bowl doesn't produce nonsense.
DRAINAGE_F_PER_M = 0.020
MAX_DRAINAGE_F = 6.0


def downscale(
    tmax_f: float,
    tmin_f: float,
    point_elev_m: float,
    grid_elev_m: float,
    region_max_elev_m: float,
) -> tuple[float, float]:
    """Adjust one day's max/min from the grid cell's height to the point's.

    ``grid_elev_m`` is the elevation the upstream model believes the cell
    sits at; ``point_elev_m`` is the real terrain height at the sample. The
    difference is what the coarse feed cannot see.

    Returns the corrected ``(tmax_f, tmin_f)``.
    """
    delta_m = point_elev_m - grid_elev_m
    lapse = -LAPSE_F_PER_M * delta_m

    # Depth below the region's high ground drives the pooling term.
    below_m = max(region_max_elev_m - point_elev_m, 0.0)
    drainage = min(below_m * DRAINAGE_F_PER_M, MAX_DRAINAGE_F)

    return (tmax_f + lapse, tmin_f + lapse - drainage)


def daily_gdd(tmax_f: float, tmin_f: float, base_f: float, upper_f: float | None = None) -> float:
    """One day's growing degree days by the standard averaging method.

    The day's mean is taken after clamping both bounds to the base (and to
    ``upper_f`` when the crop has a ceiling): a night at 20 °F below base
    does not un-grow the plant, so the negative half must not be allowed to
    cancel a warm afternoon. Never negative.
    """
    lo = max(tmin_f, base_f)
    hi = max(tmax_f, base_f)
    if upper_f is not None:
        lo = min(lo, upper_f)
        hi = min(hi, upper_f)
    return max(((hi + lo) / 2.0) - base_f, 0.0)


def accumulate(
    tmax: list[float | None],
    tmin: list[float | None],
    base_f: float,
    upper_f: float | None = None,
) -> list[float]:
    """Running GDD total across a daily series.

    A day missing either bound contributes nothing and the total carries
    forward flat, which reads honestly on a curve — a gap in the record
    should look like a pause, not a dip.
    """
    total = 0.0
    out: list[float] = []
    for hi, lo in zip(tmax, tmin, strict=False):
        if hi is not None and lo is not None:
            total += daily_gdd(hi, lo, base_f, upper_f)
        out.append(round(total, 1))
    return out


def season_start(today: date) -> date:
    """January 1 of the season in progress.

    Good Earth counts from the calendar year rather than a last-frost date
    because last frost is itself one of the things the grower is asking
    about; deriving the clock from the answer would be circular.
    """
    return date(today.year, 1, 1)


def normals_years(today: date, span: int = 10) -> list[tuple[str, str]]:
    """Date ranges for the same season window across the previous ``span`` years.

    Used to build the band a current season is judged against. Ten years,
    not thirty: the archive is one HTTP call per year and a priced call has
    to answer while the grower is still looking at it. The window is
    immutable once past, so these are the responses worth caching hardest.
    """
    start = season_start(today)
    ranges: list[tuple[str, str]] = []
    for back in range(1, span + 1):
        y = today.year - back
        try:
            s = start.replace(year=y)
            e = today.replace(year=y)
        except ValueError:
            # Feb 29 in a non-leap year — step back a day rather than skip
            # the whole year, which would silently thin the band.
            e = today.replace(year=y, day=today.day - 1)
            s = start.replace(year=y)
        ranges.append((s.isoformat(), e.isoformat()))
    return ranges


def band(curves: list[list[float]]) -> list[dict[str, float]] | None:
    """Per-day min/mean/max across several seasons' accumulation curves.

    This is the grey band a season is read against — "am I ahead or behind,
    and by how much compared to how much years normally differ."
    """
    if not curves:
        return None
    n = min(len(c) for c in curves)
    if n == 0:
        return None
    out: list[dict[str, float]] = []
    for i in range(n):
        day = [c[i] for c in curves]
        out.append(
            {
                "min": round(min(day), 1),
                "mean": round(sum(day) / len(day), 1),
                "max": round(max(day), 1),
            }
        )
    return out


def project(current_total: float, recent_daily: list[float], days_ahead: int) -> list[float]:
    """Extend accumulation past the forecast horizon at the recent daily rate.

    A straight-line carry on the last fortnight's average, explicitly not a
    forecast — it answers "if the season keeps behaving as it has been",
    which is the question a grower asking about a target date is really
    asking. Labelled as a projection everywhere it surfaces.
    """
    if not recent_daily or days_ahead <= 0:
        return []
    rate = sum(recent_daily) / len(recent_daily)
    return [round(current_total + rate * (i + 1), 1) for i in range(days_ahead)]


def daily_increments(curve: list[float]) -> list[float]:
    """Per-day GDD from a cumulative curve."""
    return [round(max(curve[i] - curve[i - 1], 0.0), 2) for i in range(1, len(curve))]


def date_series(start: date, count: int) -> list[str]:
    """``count`` ISO dates beginning at ``start``."""
    return [(start + timedelta(days=i)).isoformat() for i in range(count)]


def yearly_curves(
    dates: list[str],
    tmax: list[float | None],
    tmin: list[float | None],
    today: date,
    span: int,
    base_f: float,
) -> list[list[float]]:
    """Split one long archive span into per-season accumulation curves.

    The band needs the same calendar window from each of the last ``span``
    seasons. Asking the archive once for the whole span and slicing it here
    costs one upstream request instead of ``span`` of them — which matters,
    because a burst of long-range requests is exactly what a free feed's
    rate limiter exists to stop.
    """
    by_date: dict[str, tuple[float, float]] = {}
    for d, hi, lo in zip(dates, tmax, tmin, strict=False):
        if hi is not None and lo is not None:
            by_date[d] = (hi, lo)

    curves: list[list[float]] = []
    for back in range(1, span + 1):
        year = today.year - back
        day = date(year, 1, 1)
        try:
            end = today.replace(year=year)
        except ValueError:
            end = today.replace(year=year, day=today.day - 1)

        highs: list[float | None] = []
        lows: list[float | None] = []
        while day <= end:
            pair = by_date.get(day.isoformat())
            highs.append(pair[0] if pair else None)
            lows.append(pair[1] if pair else None)
            day += timedelta(days=1)

        if any(h is not None for h in highs):
            curves.append(accumulate(highs, lows, base_f))
    return curves
