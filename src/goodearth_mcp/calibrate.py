"""Assemble the calibration answer — what this block has learned about itself.

Takes a season's field reports, works out what the model would have predicted
for each, and returns the difference as a per-region correction.

Nothing here is applied silently. The correction comes back as a number the
grower can see, with the observations behind it and an explicit statement of
whether there are yet enough of them to trust it.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from typing import Any

from goodearth_mcp import calibration, crops, frost, gdd, sources
from goodearth_mcp.region import Region

MAX_OBSERVATIONS = 60
RECORD_SPAN_YEARS = 10


class CalibrateError(ValueError):
    """The request cannot be answered as asked."""


async def region_calibration(
    region: Region,
    observations: Any,
    base_temp_f: float = 50.0,
    today: date | None = None,
) -> dict[str, Any]:
    """What this block's own reports say about how the model treats it."""
    today = today or datetime.now(UTC).date()

    if not isinstance(observations, list) or not observations:
        raise CalibrateError("observations must be a non-empty list of field reports")
    if len(observations) > MAX_OBSERVATIONS:
        raise CalibrateError(
            f"{len(observations)} observations is more than one call should carry "
            f"(limit {MAX_OBSERVATIONS})"
        )

    parsed = [calibration.validate_observation(o) for o in observations]

    # Reports can span seasons, and a stage seen in 2024 must be counted
    # against 2024's heat. One archive request covers the whole span.
    years = sorted({o["observed_on"].year for o in parsed})
    span_start = date(min(years), 1, 1)
    span_end = min(date(max(years), 12, 31), today)

    history_task = sources.fetch_daily_history(
        [region.centroid.lat], [region.centroid.lon],
        span_start.isoformat(), span_end.isoformat(),
    )
    frost_task = sources.fetch_daily_history(
        [region.centroid.lat], [region.centroid.lon],
        date(today.year - RECORD_SPAN_YEARS, 1, 1).isoformat(),
        date(today.year - 1, 12, 31).isoformat(),
    )
    history, frost_record = await asyncio.gather(history_task, frost_task, return_exceptions=True)

    if isinstance(history, BaseException) or not history:
        raise CalibrateError(f"could not read the seasons these reports fall in: {history}")

    try:
        dates, tmax, tmin = sources.daily_series(history[0])
    except (sources.UpstreamError, IndexError) as exc:
        raise CalibrateError(f"the season record is unreadable: {exc}") from exc

    curve = gdd.accumulate(tmax, tmin, base_temp_f)

    # ── Stage observations → a bias in heat ──────────────────────────────
    heat_rows: list[dict[str, Any]] = []
    heat_values: list[float] = []
    for o in (x for x in parsed if x["kind"] == "stage"):
        upto = [i for i, d in enumerate(dates) if d <= o["observed_on"].isoformat()]
        acc = None
        if upto:
            trimmed_dates = dates[: upto[-1] + 1]
            trimmed_curve = curve[: upto[-1] + 1]
            got = crops.accumulated_since(trimmed_dates, trimmed_curve, o["set_out"])
            acc = got[0] if got else None

        bias = calibration.heat_bias_from_stage(acc, o["gdd_target"]) if acc is not None else None
        if bias is not None:
            heat_values.append(bias)
        heat_rows.append({
            "crop": o["crop"], "stage": o["stage"],
            "observed_on": o["observed_on"].isoformat(),
            "set_out": o["set_out"].isoformat(),
            "expected_gdd": o["gdd_target"],
            "observed_gdd": acc,
            "bias": round(bias, 4) if bias is not None else None,
            "note": o["note"] or None,
        })

    heat = calibration.summarize(heat_values, calibration.MAX_HEAT_BIAS)

    # ── Frost observations → a bias in days ──────────────────────────────
    predicted_frost = None
    if not isinstance(frost_record, BaseException) and frost_record:
        try:
            f_dates, _fx, f_tmin = sources.daily_series(frost_record[0])
            yrs = list(range(today.year - RECORD_SPAN_YEARS, today.year))
            predicted_frost = frost.summarize_frost_dates(
                frost.frost_dates(f_dates, f_tmin, yrs), today.year
            )
        except (sources.UpstreamError, IndexError, ValueError):
            predicted_frost = None

    frost_rows: list[dict[str, Any]] = []
    frost_values: list[float] = []
    for o in (x for x in parsed if x["kind"] == "frost"):
        delta = None
        if predicted_frost:
            # Compare like with like: the observation's own day-of-season
            # against the median expressed in that same year.
            try:
                median_that_year = date.fromisoformat(predicted_frost["median"]).replace(
                    year=o["observed_on"].year
                )
                delta = float((o["observed_on"] - median_that_year).days)
                frost_values.append(delta)
            except ValueError:
                delta = None
        frost_rows.append({
            "observed_on": o["observed_on"].isoformat(),
            "days_from_median": delta,
            "note": o["note"] or None,
        })

    frost_bias = calibration.summarize(frost_values, float(calibration.MAX_DAY_BIAS))

    corrections: dict[str, Any] = {}
    if heat and heat["applicable"]:
        corrections["heat_multiplier"] = round(1.0 + heat["median"], 4)
    if frost_bias and frost_bias["applicable"]:
        corrections["first_frost_offset_days"] = round(frost_bias["median"])

    return {
        "success": True,
        "as_of": today.isoformat(),
        "region": region.describe(),
        "observations_used": len(parsed),
        "heat": (
            {
                **heat,
                "confidence": calibration.confidence(
                    heat["n"], heat["spread"], calibration.MAX_HEAT_BIAS
                ),
                "reading": _heat_reading(heat),
                "rows": heat_rows,
            }
            if heat else {"rows": heat_rows, "reading": "No usable stage observations yet."}
        ),
        "first_frost": (
            {
                **frost_bias,
                "confidence": calibration.confidence(
                    frost_bias["n"], frost_bias["spread"], float(calibration.MAX_DAY_BIAS)
                ),
                "reading": _frost_reading(frost_bias),
                "predicted_median": predicted_frost["median"] if predicted_frost else None,
                "rows": frost_rows,
            }
            if frost_bias else {"rows": frost_rows, "reading": "No usable frost observations yet."}
        ),
        "corrections": corrections,
        "note": (
            "Nothing here is applied silently. A correction appears only once "
            f"{calibration.MIN_FOR_CORRECTION} usable observations agree, and the "
            "observations behind it are listed so you can see what moved it. "
            "Implausible values are set aside rather than averaged in — a "
            "mis-entered date should not rewrite a block's calendar."
        ),
    }


def _heat_reading(h: dict[str, Any]) -> str:
    pct = h["median"] * 100
    if not h["applicable"]:
        return h["why_not"] or ""
    if abs(pct) < 2:
        return "This ground tracks the model closely — no heat correction warranted."
    hotter = pct > 0
    return (
        f"Stages arrive here having accumulated about {abs(pct):.0f}% "
        f"{'more' if hotter else 'less'} heat than the model credits. "
        f"{'This ground runs warmer than the grid sees' if hotter else 'This ground runs cooler than the grid sees'}"
        ", or the published targets are low for these varieties here."
    )


def _frost_reading(f: dict[str, Any]) -> str:
    if not f["applicable"]:
        return f["why_not"] or ""
    d = f["median"]
    if abs(d) < 2:
        return "Frost arrives here about when the region's record says."
    early = d < 0
    return (
        f"Frost arrives about {abs(d):.0f} days {'earlier' if early else 'later'} here "
        f"than the region's median. "
        f"{'Cold air pools on this ground' if early else 'This ground holds its heat'}."
    )
