// Which stretch of the season a chart mark falls in: the record, the
// seven-day forecast, or the projection beyond it.
//
// A mark placed by heat carries its day as `index`. A mark the grower dates
// (a task, a sowing) carries `index: 0`, which means nothing, so its own
// date is read against the curve's dates instead. Reading the index for
// those put every task on day one of the record, and its card said "this
// already happened" about next week's work.

import type { LedgerFlag } from "./ledgerFlags";
import type { SeasonCurveResult } from "./mcp";

export type Horizon = "recorded" | "forecast" | "projected";

export function horizonOf(
  flag: Pick<LedgerFlag, "anchor" | "date" | "index">,
  curve: Pick<SeasonCurveResult, "curve" | "forecast">,
): Horizon {
  const dates = curve.curve?.dates ?? [];
  if (flag.anchor === "date" && flag.date) {
    const lastRecorded = [...dates].reverse().find((d): d is string => !!d);
    const fc = curve.forecast?.dates ?? [];
    const lastForecast = fc[fc.length - 1];
    if (lastRecorded && flag.date <= lastRecorded) return "recorded";
    if (lastForecast && flag.date <= lastForecast) return "forecast";
    return "projected";
  }
  const recorded = dates.length;
  const forecastEnd = recorded + (curve.forecast?.cumulative.length ?? 0);
  return flag.index < recorded ? "recorded" : flag.index < forecastEnd ? "forecast" : "projected";
}
