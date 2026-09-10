// Which window a named span asks for.
//
// Kept out of the chart because this is the decision, not the drawing: "the
// Season button shows autumn" and "today sits in the middle of the fortnight"
// are claims about arithmetic, and inside a component they could only ever be
// checked by looking at a picture.
//
// Every count is in DAYS against the DOMAIN, which is longer than the recorded
// curve whenever a dated task reaches past it. Measuring against the array
// instead would make each button lie by the ratio between the two — "Week"
// quietly showing a fortnight is a wrong reading that looks right.

import { dateFor, dayNumber } from "./seasonDays.ts";
import { seasonBounds } from "./meteoSeason.ts";
import { daysFor } from "./useChartZoom.ts";

export interface SpanContext {
  /// Day index of the last recorded day — where the reader is standing.
  today: number;
  /// The date day zero of the timeline falls on.
  origin: string;
  domLo: number;
  domHi: number;
}

/// `"full"` means the whole domain; otherwise a day count and the index it is
/// centred on.
export type SpanTarget = "full" | { days: number; anchor: number };

export function spanTarget(key: string, ctx: SpanContext): SpanTarget {
  // The whole timeline, however far a dated task stretches it.
  if (key === "annual") return "full";

  if (key === "season") {
    // The meteorological quarter today falls in, centred on the QUARTER
    // rather than on today. A season has its own middle; sliding it to sit
    // under the reader would show half of it and half of the next one.
    const b = seasonBounds(dateFor(ctx.today, ctx.origin) ?? "");
    if (!b) return "full";
    const lo = dayNumber(b.start, ctx.origin);
    const hi = dayNumber(b.end, ctx.origin);
    if (lo == null || hi == null) return "full";
    return { days: hi - lo + 1, anchor: (lo + hi) / 2 - ctx.domLo };
  }

  const days = daysFor(key);
  if (days == null) return "full";
  return { days, anchor: ctx.today - ctx.domLo };
}
