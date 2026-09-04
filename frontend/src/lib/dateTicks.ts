// The date axis, at whatever resolution the window deserves.
//
// A chart zoomed to six weeks showed two labels — MAY and JUN — because the
// tick loop only ever emitted months. So the closer you looked, the less the
// axis told you, which is backwards: zooming in is a request for MORE detail.
//
// The divisions subdivide as the window narrows: months, then weeks, then
// days. Each level keeps the one above it as a MAJOR tick, so the eye can see
// where a month begins while reading individual days inside it — the way a
// ruler shows centimetres without hiding the millimetres.
//
// **It stops at days, deliberately.** Every series behind these charts is
// daily: one maximum, one minimum, one total per date. Offering hour divisions
// would draw an axis finer than anything that could ever be plotted on it, and
// this codebase's standing rule is that a grower is never shown precision the
// data does not contain. If an hourly feed is ever plotted here, add the level
// then and it will have something to say.

export interface DateTick {
  /// Day number in the chart's own domain — whatever `isoAt` indexes.
  d: number;
  label: string;
  /// A month boundary at week or day resolution, or January at month
  /// resolution. Drawn stronger, so the coarse structure survives the detail.
  major?: boolean;
}

/// Read a date as UTC noon.
///
/// Noon, because a date parsed at midnight lands on the previous day in any
/// timezone west of Greenwich, which would put a Sunday's label on Saturday.
const at = (iso: string) => new Date(iso + "T12:00:00Z");

const MONTH = (iso: string) =>
  at(iso).toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();

const DAY_OF_MONTH = (iso: string) =>
  at(iso).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/// "Sat 2", composed rather than formatted.
///
/// `toLocaleString({weekday, day})` renders en-US as "2 Sat" — the day first —
/// which reads as a date in some other order and is wrong on an axis whose
/// neighbours are "Sep 8". The two parts are asked for separately and joined.
const WEEKDAY = (iso: string) => {
  const d = at(iso);
  const wd = d.toLocaleString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${wd} ${d.getUTCDate()}`;
};

/// Which unit a window of this many days should be divided by.
///
/// The thresholds are set so a level never emits more than roughly a dozen
/// labels — past that they collide and the axis is less readable than the one
/// with too few.
export function unitFor(visibleDays: number): "month" | "week" | "day" {
  if (visibleDays > 70) return "month";
  if (visibleDays > 16) return "week";
  return "day";
}

/// Ticks for the visible window.
///
/// `isoAt` maps a domain day to its ISO date, or null where the domain reaches
/// past anything dated — a timeline that scrolls beyond the record still gets
/// an axis, it simply skips what it cannot name.
export function dateTicks(
  lo: number,
  hi: number,
  isoAt: (d: number) => string | null | undefined,
): DateTick[] {
  const span = Math.max(hi - lo, 0);
  const unit = unitFor(span);
  const out: DateTick[] = [];

  const from = Math.floor(lo) - 1;
  const to = Math.ceil(hi) + 1;

  // Seeded from the day BEFORE the window, so the first date examined is not
  // mistaken for a month boundary. Without this, a window opening on 1 May
  // began at 30 April with no history and labelled it "APR" — a month tick on
  // the last day of the month, immediately followed by the real "MAY".
  let lastMonth = (isoAt(from - 1) || "").slice(0, 7);
  for (let d = from; d <= to; d++) {
    const iso = isoAt(d);
    if (!iso) continue;
    const month = iso.slice(0, 7);
    const newMonth = month !== lastMonth;

    if (unit === "month") {
      if (!newMonth) continue;
      lastMonth = month;
      // A January tick carries its year: a timeline running past one season is
      // otherwise ambiguous about which one you are reading.
      const jan = iso.slice(5, 7) === "01";
      out.push({ d, label: jan ? `${MONTH(iso)} ${iso.slice(0, 4)}` : MONTH(iso), major: jan });
      continue;
    }

    if (unit === "week") {
      // Mondays, plus the first of the month wherever it falls — so a month
      // boundary is never missed just because it landed midweek.
      const monday = at(iso).getUTCDay() === 1;
      const first = iso.slice(8, 10) === "01";
      if (!monday && !first) { if (newMonth) lastMonth = month; continue; }
      lastMonth = month;
      out.push({ d, label: first ? MONTH(iso) : DAY_OF_MONTH(iso), major: first });
      continue;
    }

    // Days. Strided when the window is at the wide end of this level, so a
    // sixteen-day view does not print sixteen labels on top of each other.
    const stride = span > 10 ? 2 : 1;
    if ((d - from) % stride !== 0 && !newMonth) { continue; }
    if (newMonth) lastMonth = month;
    out.push({
      d,
      label: newMonth ? MONTH(iso) : WEEKDAY(iso),
      major: newMonth,
    });
  }
  return out;
}
