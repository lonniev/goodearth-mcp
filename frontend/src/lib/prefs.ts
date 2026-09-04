// Viewing preferences.
//
// Per-device rather than per-patron on purpose: a grower may want the bees on
// the tablet in the packing shed and off on the laptop they do accounts on.
// These are display choices, not farm data, so they stay in localStorage and
// are not published to Nostr with the regions and reports.

import type { Unit } from "./units.ts";

export interface Prefs {
  /// Which scale degrees are read in. The record stays Fahrenheit whatever
  /// this says — see lib/units.ts — so switching it is a viewing choice and
  /// never rewrites a threshold someone entered.
  units: Unit;

  /// The foraging bees. On by default — they are an instrument, not a
  /// decoration — but an animated overlay is exactly the kind of thing some
  /// people need gone, and asking them to fight it is not an answer.
  bees: boolean;
}

const KEY = "goodearth:prefs:v1";

export const DEFAULTS: Prefs = { bees: true, units: "F" };

export function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const v = JSON.parse(raw) as Partial<Prefs>;
    // Merge over the defaults so a preference added later is not missing for
    // anyone who saved before it existed.
    return { ...DEFAULTS, ...v };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writePrefs(p: Prefs): Prefs {
  try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* noop */ }
  return p;
}
