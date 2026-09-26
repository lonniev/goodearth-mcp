// A nudge up or down per day, so a run of days reads as a trend at a glance.
//
// The forecast strip is fourteen equal cards; the numbers on them say whether
// the fortnight is warming or cooling, but only to someone who reads all
// fourteen. Lifting each card by where its day sits in the fortnight's range
// draws the line without drawing a chart — a few pixels, no more, because the
// strip is meant to stay compact.

/// Pixels to lift each value by: the warmest day rises `maxPx`, the coolest
/// sits at 0, the rest in proportion. A missing value, or a fortnight with no
/// spread at all, is not nudged.
export function trendLift(values: (number | null | undefined)[], maxPx: number): number[] {
  const known = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!known.length) return values.map(() => 0);
  const lo = Math.min(...known);
  const span = Math.max(...known) - lo;
  if (span === 0) return values.map(() => 0);
  return values.map((v) =>
    v != null && Number.isFinite(v) ? Math.round(((v - lo) / span) * maxPx) : 0);
}
