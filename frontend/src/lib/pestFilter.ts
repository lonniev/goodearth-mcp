// Narrowing the watch list to the rows a question is about.
//
// The same shape as the Plant ledger's filter, deliberately: a grower moving
// between the two pages should not have to learn a second control. What
// differs is the questions, because a pest is read on different terms than a
// planting — what is due soon, what has already been through a stage this
// season, and what is simply being kept an eye on.
//
// Pure predicates over rows the page already holds, so nothing here costs a
// call and all of it is testable without a browser.

import type { PestAssessment } from "./mcp";
import type { SavedPest } from "./pestModels";

export interface PestFilter {
  /// A stage lands within this many days. Blank is off.
  dueDays: string;
  /// At least one stage has already been crossed this season.
  crossed: boolean;
  /// Kept an eye on with no degree-day model at all — voles, slugs, deer.
  watchedOnly: boolean;
}

export const NO_PEST_FILTER: PestFilter = { dueDays: "", crossed: false, watchedOnly: false };

export function isOn(f: PestFilter): boolean {
  return f.crossed || f.watchedOnly || num(f.dueDays) != null;
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

export function matches(
  pest: SavedPest, a: PestAssessment | undefined, f: PestFilter, today = new Date(),
): boolean {
  // A watched creature has no model, so it answers none of the heat questions
  // — but "watched only" is the question that is ABOUT having no model.
  if (f.watchedOnly && !isWatch(pest)) return false;

  const stages = a?.stages ?? [];

  if (f.crossed && !stages.some((s) => s.reached)) return false;

  const due = num(f.dueDays);
  if (due != null) {
    const soon = stages.some((s) => {
      if (s.reached) return false;
      const d = daysOut(s.projected_date, today);
      return d != null && d >= 0 && d <= due;
    });
    if (!soon) return false;
  }
  return true;
}

/// A row kept an eye on rather than counted: the flag, or simply no stages.
///
/// Both, because the record has carried `watch` from the start and rows added
/// from the nearby list before it did carry none.
function isWatch(p: SavedPest): boolean {
  return p.watch === true || !(p.stages ?? []).length;
}

export function summarise(f: PestFilter): string {
  const on: string[] = [];
  const d = num(f.dueDays);
  if (d != null) on.push(`due ≤ ${d}d`);
  if (f.crossed) on.push("crossed");
  if (f.watchedOnly) on.push("watched");
  return on.join(" · ");
}
