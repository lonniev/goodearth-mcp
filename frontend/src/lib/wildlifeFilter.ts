// Narrowing the year to the rows a question is about.
//
// The third table to get one, and deliberately the same three shapes as the
// pests': a number, a "has it happened", and a "this one carries no clock".
// A grower moving between the three pages should be learning the page, not
// the control.
//
// Pure predicates over rows the page already holds, so nothing here costs a
// call and all of it is testable without a browser.

import type { WildlifeRow } from "./mcp";
import type { SavedWildlife } from "./wildlifeModels";

export interface WildlifeFilter {
  /// The event lands within this many days. Blank is off.
  dueDays: string;
  /// It has already arrived this year.
  happened: boolean;
  /// A creature on the roster with no dated event at all.
  rosterOnly: boolean;
}

export const NO_WILDLIFE_FILTER: WildlifeFilter = {
  dueDays: "", happened: false, rosterOnly: false,
};

export function isOn(f: WildlifeFilter): boolean {
  return f.happened || f.rosterOnly || num(f.dueDays) != null;
}

function num(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function daysOut(iso: string | null | undefined, today: Date): number | null {
  if (!iso) return null;
  // Noon, so a timezone west of UTC cannot turn today's date into yesterday.
  const then = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const from = new Date(`${today.toLocaleDateString("en-CA")}T12:00:00`);
  return Math.round((then.getTime() - from.getTime()) / 86_400_000);
}

/// A roster entry names a creature and no event, so it has no clock to read.
function isRoster(w: SavedWildlife): boolean {
  return !w.driver;
}

export function matches(
  watch: SavedWildlife, row: WildlifeRow | undefined, f: WildlifeFilter, today = new Date(),
): boolean {
  if (f.rosterOnly && !isRoster(watch)) return false;
  if (f.happened && !row?.reached_on) return false;

  const due = num(f.dueDays);
  if (due != null) {
    // Already arrived is not "due". An interval event reports a window, and
    // the day it OPENS is the one a grower is waiting for.
    if (row?.reached_on) return false;
    const d = row?.days_away
      ?? daysOut(row?.projected_date ?? row?.window?.from, today);
    if (d == null || d < 0 || d > due) return false;
  }
  return true;
}

export function summarise(f: WildlifeFilter): string {
  const on: string[] = [];
  const d = num(f.dueDays);
  if (d != null) on.push(`due ≤ ${d}d`);
  if (f.happened) on.push("happened");
  if (f.rosterOnly) on.push("roster");
  return on.join(" · ");
}
