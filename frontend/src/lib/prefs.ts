// A grower's settings.
//
// Most follow the grower's account from device to device — units, the chart
// order, the array they size, what their kWh sells for — as Good Earth's
// properties (`goodearth_mcp/properties.py`), kept by the wheel and settled on
// sign-in by tollbooth-web. Two stay on the screen they were set on: a grower
// may want the bees on the tablet in the packing shed and off on the laptop
// they do accounts on, and the same for the season theme.
//
// They are all stored here, under one key, as before: each account property
// is a mirror over its field, so nothing a grower chose moves or is lost.

import { mirrorProperty, propertyChanged } from "@tollbooth-dpyc/web";
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

  /// The order the season charts are stacked in, as measure keys.
  ///
  /// Per-device like the rest of this file, and empty by default meaning "the
  /// order they ship in". It is a list of names rather than a full layout so
  /// that a measure added later can join the end instead of vanishing — see
  /// `mergeOrder`, which is where that is actually enforced.
  chartOrder: string[];

  /// The array laid on a Sun spot, metres east–west by north–south. A
  /// grower sizing one array taps a dozen spots to compare them, and it
  /// should be the same array at each.
  array: { w: number; l: number };

  /// What this grower's utility pays for a kWh, ¢, when it is not the state's
  /// retail price the operator reads — a net-metering credit is often less.
  /// Null takes the read figure.
  sellCents: number | null;
}

const KEY = "goodearth:prefs:v1";

export const DEFAULTS: Prefs = {
  bees: true, units: "F", theme: "follow", chartOrder: [], array: { w: 24, l: 12 }, sellCents: null,
};

/// The season to actually paint, resolving "follow" against today on the
/// plot being worked, at latitude `lat`.
export function themeOf(p: Prefs, lat: number, now?: Date): Season {
  return p.theme === "follow" ? seasonOf(now, lat) : p.theme;
}

export function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const v = JSON.parse(raw) as Partial<Prefs>;
    // Merge over the defaults so a preference added later is not missing for
    // anyone who saved before it existed.
    return {
      ...DEFAULTS, ...v,
      // A stored value of the wrong shape is worse than none: the chart list
      // would try to sort itself by something that is not a list of names.
      chartOrder: Array.isArray(v.chartOrder)
        ? v.chartOrder.filter((k) => typeof k === "string")
        : [],
      array: v.array && Number.isFinite(v.array.w) && Number.isFinite(v.array.l) ? v.array : DEFAULTS.array,
      sellCents: typeof v.sellCents === "number" && Number.isFinite(v.sellCents) ? v.sellCents : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

const listeners = new Set<() => void>();

/** Hear every change to the settings on this page. Returns an unsubscribe. */
export function onPrefsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The stored text, for a snapshot that stays the same while nothing changed. */
export function prefsSnapshot(): string {
  try { return window.localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}

function storePrefs(p: Prefs): Prefs {
  try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* noop */ }
  listeners.forEach((fn) => fn());
  return p;
}

/**
 * The fields that follow the account, by property name: how to read each from
 * the settings, and how to put it back. A `null` kWh price is "none set", which
 * the account keeps as its default.
 */
const ACCOUNT: Record<string, { get: (p: Prefs) => unknown; put: (p: Prefs, v: unknown) => Prefs }> = {
  units: { get: (p) => p.units, put: (p, v) => ({ ...p, units: v === "C" ? "C" : "F" }) },
  chart_order: {
    get: (p) => p.chartOrder,
    put: (p, v) => ({ ...p, chartOrder: Array.isArray(v) ? v.filter((k) => typeof k === "string") : [] }),
  },
  array_w_m: { get: (p) => p.array.w, put: (p, v) => ({ ...p, array: { ...p.array, w: num(v) ?? p.array.w } }) },
  array_l_m: { get: (p) => p.array.l, put: (p, v) => ({ ...p, array: { ...p.array, l: num(v) ?? p.array.l } }) },
  sell_cents: { get: (p) => p.sellCents, put: (p, v) => ({ ...p, sellCents: num(v) }) },
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

for (const [name, field] of Object.entries(ACCOUNT)) {
  mirrorProperty(name, {
    read: () => (prefsSnapshot() ? field.get(readPrefs()) : undefined),
    write: (v) => void storePrefs(field.put(readPrefs(), v)),
  });
}

/** Store the settings, and keep each account field that changed with the account. */
export function writePrefs(p: Prefs): Prefs {
  const before = readPrefs();
  storePrefs(p);
  for (const [name, field] of Object.entries(ACCOUNT)) {
    const was = field.get(before);
    const now = field.get(p);
    if (JSON.stringify(was) !== JSON.stringify(now)) propertyChanged(name, now === null ? "" : now);
  }
  return p;
}
