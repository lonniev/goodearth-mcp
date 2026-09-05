// Viewing preferences.
//
// Per-device rather than per-patron on purpose: a grower may want the bees on
// the tablet in the packing shed and off on the laptop they do accounts on.
// These are display choices, not farm data, so they stay in localStorage and
// are not published to Nostr with the regions and reports.

import { seasonOf, type Season } from "./season.ts";
import type { Unit } from "./units.ts";

/// "follow" tracks the calendar; the four seasons are a deliberate choice to
/// stay in one.
export type ThemeChoice = Season | "follow";

export interface Prefs {
  /// Which season the page wears. Per-device like the rest of this file: a
  /// grower who likes winter on the shed tablet is not asking for it on the
  /// laptop, and it is a viewing choice rather than farm data.
  theme: ThemeChoice;

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

export const DEFAULTS: Prefs = { bees: true, units: "F", theme: "follow" };

/// The season to actually paint, resolving "follow" against today.
export function themeOf(p: Prefs, now?: Date): Season {
  return p.theme === "follow" ? seasonOf(now) : p.theme;
}

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
