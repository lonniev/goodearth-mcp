// Which season a date is in, and where that season begins and ends.
//
// METEOROLOGICAL, not astronomical: seasons here are whole calendar months —
// Dec–Feb, Mar–May, Jun–Aug, Sep–Nov — the convention every weather service
// keeps its normals in, and the one a grower's own "spring" means. The
// astronomical dates wander with the solstice and would put a chart's boundary
// on the 20th of a month for no reason a farm cares about.
//
// The span the chart calls "Season" is this quarter, not the whole recorded
// curve. A grower asking for the season in September means autumn, not January
// through December.

export type SeasonName = "Winter" | "Spring" | "Summer" | "Fall";

const NAMES: SeasonName[] = ["Winter", "Spring", "Summer", "Fall"];

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/// Last day of a month, 1-indexed month.
function lastDay(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/// The meteorological season containing `date`, with its first and last day.
///
/// Winter is the awkward one and the reason this is a function rather than a
/// table: it straddles the year end, so December belongs with the NEXT year's
/// January, and January belongs with the PREVIOUS year's December. A lookup
/// keyed on month alone gets the name right and the year wrong, which puts the
/// window a full twelve months from where the reader is standing.
export function seasonBounds(date: string): {
  name: SeasonName; start: string; end: string;
} | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;

  // 12 → 0 (winter), 1..2 → 0, 3..5 → 1, and so on.
  const q = Math.floor((month % 12) / 3);
  const startMonth = ((q * 3) + 11) % 12 + 1;     // 12, 3, 6, 9
  const startYear = month === 12 ? year : q === 0 ? year - 1 : year;
  const endMonth = startMonth === 12 ? 2 : startMonth + 2;
  const endYear = startMonth === 12 ? startYear + 1 : startYear;

  return {
    name: NAMES[q],
    start: iso(startYear, startMonth, 1),
    end: iso(endYear, endMonth, lastDay(endYear, endMonth)),
  };
}
