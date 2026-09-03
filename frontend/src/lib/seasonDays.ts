// Days on the season timeline.
//
// The chart is a chosen span of TIME that happens to carry the accumulated GDD
// for that span. Everything on it — the curve, the band, a planting's bar, a
// task — is placed by date. Some of those dates are stated by the grower and
// some are computed by asking the curve when a heat threshold is crossed, but
// by the time anything is drawn they are all just dates.
//
// So one conversion, in one place. Three copies of "which day is this date"
// existed before this module: the flag builder, the frost line in HeatLedger,
// and the almanac overlay, which skipped the question entirely and assumed two
// series that both "count from the same Jan 1" line up by index. That is three
// chances for a mark to land on the wrong day, and a chart a grower plans from
// cannot afford one.
//
// Day numbers are integers counted from an origin, at UTC noon so a daylight
// saving boundary cannot round a date to its neighbour.

const MS_PER_DAY = 86_400_000;

/// Midday UTC on an ISO date, which is what makes the arithmetic safe.
///
/// Parsing "2026-03-08" as midnight and adding days lands on 23:00 the previous
/// evening in a zone that springs forward, and rounding then loses a day. Noon
/// has eleven hours of slack in either direction.
function noon(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).getTime();
}

/// Is this a date this module can work with?
export function isDate(iso: string | null | undefined): iso is string {
  return typeof iso === "string" && !Number.isNaN(noon(iso));
}

/// Whole days from `origin` to `iso`. Negative before the origin — which is the
/// point: a task dated last winter has a place on the timeline, it is simply to
/// the left of where the curve begins.
export function dayNumber(iso: string, origin: string): number | null {
  if (!isDate(iso) || !isDate(origin)) return null;
  return Math.round((noon(iso) - noon(origin)) / MS_PER_DAY);
}

/// The inverse: which date is this many days from the origin.
export function dateFor(day: number, origin: string): string | null {
  if (!isDate(origin) || !Number.isFinite(day)) return null;
  return new Date(noon(origin) + Math.round(day) * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/// The date at a fractional day, rounded to the nearest whole day.
///
/// A computed crossing lands between two daily samples — "the curve reaches
/// 1200 GDD 3.4 days in" — and the fraction is kept for positioning, where it
/// is real. Only the label needs a date.
export function dateAt(day: number, origin: string): string | null {
  return dateFor(Math.round(day), origin);
}


/// How long the timeline must be to hold everything on it.
///
/// The curve occupies days `0..seriesHi`, but a task dated next January is
/// still a real day and belongs somewhere. So the domain is the union of the
/// series and every mark, padded so an edge mark is not clipped in half.
///
/// When nothing falls outside the curve — the ordinary case — this returns
/// exactly the series bounds and the chart behaves as it always did. That
/// property matters: growing the domain rescales every zoom fraction with it,
/// so it must not happen by accident.
export function timelineDomain(
  seriesHi: number, marks: readonly (number | null | undefined)[], pad = 4,
): { lo: number; hi: number; extended: boolean } {
  let lo = 0;
  let hi = Math.max(seriesHi, 1);
  for (const m of marks) {
    if (m == null || !Number.isFinite(m)) continue;
    lo = Math.min(lo, m);
    hi = Math.max(hi, m);
  }
  // Pad only the side that actually reached. A task next January is no reason
  // to open four empty days before the season started.
  const top = Math.max(seriesHi, 1);
  const grewLeft = lo < 0;
  const grewRight = hi > top;
  return {
    lo: grewLeft ? Math.floor(lo) - pad : 0,
    hi: grewRight ? Math.ceil(hi) + pad : top,
    extended: grewLeft || grewRight,
  };
}
