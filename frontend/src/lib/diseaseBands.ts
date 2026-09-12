// Infection periods, as days on the chart's own axis.
//
// A wet period is not a point on the curve. It is a condition of the DAYS —
// the leaf was wet from Thursday to Sunday, whatever the heat total did in
// that time — so it belongs on the date axis with width, behind everything,
// rather than as one more labelled stem competing with the crops and the pests.
//
// The chart opens on a fortnight, so what a grower normally sees is the one
// band that matters. LAST and NEXT per model, not every period the season
// held: twenty apple-scab washes across one plot is weather wallpaper, and the
// card below already carries the season's count.

import { dayNumber } from "./seasonDays.ts";
import { relevant } from "./diseaseRows.ts";
import type { DiseaseRiskResult, DiseaseVerdict } from "./mcp.ts";
import type { SeasonCurveResult } from "./mcp.ts";

export interface Band {
  key: string;
  /// For the key under the chart, and for a screen reader.
  label: string;
  /// Day indices on the curve's own axis, inclusive.
  from: number;
  to: number;
  /// Drawn from the forecast rather than the record.
  forecast: boolean;
}

const began = (p: DiseaseVerdict["last_period"]) => String(p?.from ?? p?.start ?? "").slice(0, 10);
const ended = (p: DiseaseVerdict["last_period"]) => String(p?.to ?? p?.end ?? "").slice(0, 10);

/// How long the chart's own timeline runs, in days from its first date.
function span(curve: SeasonCurveResult): number {
  const mean = curve.curve?.cumulative_mean?.length ?? 0;
  const fc = curve.forecast?.cumulative?.length ?? 0;
  const proj = curve.projection?.cumulative?.length ?? 0;
  return mean + fc + proj;
}

export function bands(
  curve: SeasonCurveResult | null,
  risk: DiseaseRiskResult | null,
  /// What the block grows. The chart bands the same models the card lists,
  /// so a flower farm is never shown an apple-scab week.
  plantings: readonly string[] = [],
): Band[] {
  const origin = curve?.curve?.dates?.[0];
  if (!curve || !risk || !origin) return [];
  const last = span(curve) - 1;
  if (last < 1) return [];

  const out: Band[] = [];
  for (const v of relevant(risk.diseases, plantings)) {
    for (const [which, period] of [["last", v.last_period], ["next", v.next_period]] as const) {
      if (!period) continue;
      const a = dayNumber(began(period), origin);
      if (a == null) continue;
      // A period with no stated end is one day wide, not a band to nowhere.
      const b = dayNumber(ended(period) || began(period), origin) ?? a;
      // Clipped to the timeline rather than dropped: a period that began
      // before the season's first day still ENDS inside it, and a grower
      // looking at a wet week should not lose it because it started in March.
      const from = Math.max(0, Math.min(a, b));
      const to = Math.min(last, Math.max(a, b));
      if (to < 0 || from > last || to < from) continue;
      out.push({
        key: `${v.model}-${which}`,
        label: v.disease,
        from,
        to,
        forecast: which === "next",
      });
    }
  }
  // Earliest first, so overlapping washes stack in reading order.
  return out.sort((x, y) => x.from - y.from || x.to - y.to);
}
