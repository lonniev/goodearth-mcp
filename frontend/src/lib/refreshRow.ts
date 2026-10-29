// A ledger row beside what the reference says about the same species.
//
// The 🧠 on a Flora, Fauna or Pests row asks the same lookup the add form asks
// (`plant_profile`, `life_cycle`) and lays each figure the row holds beside the
// reference's. Only the figures that differ come back, each with the change
// that takes the reference's figure. What the grower keeps is theirs; nothing
// is taken unless they take it. Kept pure so it can be tested.

import type { LifeCycleEvent, LifeCycleResult, PlantProfileResult } from "./mcp";
import type { Planting } from "./plantings.ts";
import type { SavedPest } from "./pestModels";
import type { SavedWildlife } from "./wildlifeModels";
import { HUES, MONTHS, type Hue } from "./companions.ts";
import { eventKey, heatStages, wildlifeRows } from "./lifeCycle.ts";

/// One figure that differs: the row's, the reference's, and the change that
/// takes the reference's.
export interface FieldDiff<T> {
  field: string;
  label: string;
  yours: string;
  ai: string;
  take: (row: T) => T;
}

/// The reader's scale, for showing a figure.
export interface Show {
  temp: (f: number) => string;
  dd: (ddF: number) => string;
}

/// Degree days and temperatures closer than this are the same figure: the
/// reference rounds degree days to ten, a form rounds a temperature to one.
const DD_SAME = 1;
const TEMP_SAME = 0.5;

const none = "—";
const months = (m: readonly number[] | undefined | null) =>
  m?.length ? m.map((n) => MONTHS[n - 1]).join(" ") : none;
const yesNo = (b: boolean | undefined | null) => (b == null ? none : b ? "yes" : "no");

function normalMonths(m: readonly number[] | null | undefined): number[] {
  return [...new Set((m ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12))].sort((a, b) => a - b);
}

function near(a: number | undefined | null, b: number, within: number): boolean {
  return a != null && Math.abs(a - b) < within;
}

// ── Flora ────────────────────────────────────────────────────────────────

/// A planting beside its plant's profile on this plot.
export function plantingDiff(p: Planting, r: PlantProfileResult, show: Show): FieldDiff<Planting>[] {
  const prof = r.profile, here = r.on_this_plot;
  if (!prof || !here) return [];
  const out: FieldDiff<Planting>[] = [];
  if (here.gdd_target != null && !near(p.gddTarget, here.gdd_target, DD_SAME)) {
    const v = here.gdd_target;
    out.push({ field: "gddTarget", label: "Heat target", yours: p.gddTarget != null ? show.dd(p.gddTarget) : none,
      ai: show.dd(v), take: (x) => ({ ...x, gddTarget: v }) });
  }
  // The base belongs to the target: a base without the target it counts to
  // is not offered, as the add form does not fill one.
  if (here.gdd_target != null && here.base_temp_f != null && !near(p.baseTempF, here.base_temp_f, TEMP_SAME)) {
    const v = here.base_temp_f;
    out.push({ field: "baseTempF", label: "Base", yours: p.baseTempF != null ? show.temp(p.baseTempF) : none,
      ai: show.temp(v), take: (x) => ({ ...x, baseTempF: v }) });
  }
  if (prof.flower_color && (HUES as readonly string[]).includes(prof.flower_color) && p.flowerColor !== prof.flower_color) {
    const v = prof.flower_color as Hue;
    out.push({ field: "flowerColor", label: "Flower colour", yours: p.flowerColor ?? none, ai: v,
      take: (x) => ({ ...x, flowerColor: v }) });
  }
  if (prof.height_in?.typical != null) {
    const v = Math.round(prof.height_in.typical);
    if (p.heightIn == null || Math.round(p.heightIn) !== v) {
      out.push({ field: "heightIn", label: "Height", yours: p.heightIn != null ? `${Math.round(p.heightIn)} in` : none,
        ai: `${v} in`, take: (x) => ({ ...x, heightIn: v }) });
    }
  }
  const bloom = normalMonths(here.bloom_months);
  if (bloom.length && bloom.join() !== normalMonths(p.bloomMonths).join()) {
    out.push({ field: "bloomMonths", label: "In bloom", yours: months(normalMonths(p.bloomMonths)), ai: months(bloom),
      take: (x) => ({ ...x, bloomMonths: bloom }) });
  }
  if (prof.frost_hardy != null && !!p.frostHardy !== prof.frost_hardy) {
    const v = prof.frost_hardy;
    out.push({ field: "frostHardy", label: "Frost hardy", yours: yesNo(p.frostHardy), ai: yesNo(v),
      take: (x) => ({ ...x, frostHardy: v }) });
  }
  // A perennial is judged on chill and hardiness; an annual has neither.
  if (p.perennial) {
    if (prof.chill_hours != null && p.chillHours !== prof.chill_hours) {
      const v = prof.chill_hours;
      out.push({ field: "chillHours", label: "Chill", yours: p.chillHours != null ? `${p.chillHours} h` : none,
        ai: `${v} h`, take: (x) => ({ ...x, chillHours: v }) });
    }
    if (prof.hardy_to_f != null && !near(p.hardyToF, prof.hardy_to_f, TEMP_SAME)) {
      const v = prof.hardy_to_f;
      out.push({ field: "hardyToF", label: "Hardy to", yours: p.hardyToF != null ? show.temp(p.hardyToF) : none,
        ai: show.temp(v), take: (x) => ({ ...x, hardyToF: v }) });
    }
  }
  return out;
}

// ── Pests ────────────────────────────────────────────────────────────────

/// A pest record beside its life cycle: the base its stages count from, and
/// each heat stage by name. A stage the reference has and the row lacks is
/// offered as an addition; a stage only the row has is the grower's, and left.
export function pestDiff(p: SavedPest, r: LifeCycleResult, show: Show): FieldDiff<SavedPest>[] {
  const stages = heatStages(r.events ?? []);
  const out: FieldDiff<SavedPest>[] = [];
  if (r.base_temp_f != null && stages.length && !near(p.base_temp, r.base_temp_f, TEMP_SAME)) {
    const v = r.base_temp_f;
    out.push({ field: "base_temp", label: "Base", yours: p.base_temp != null ? show.temp(p.base_temp) : none,
      ai: show.temp(v), take: (x) => ({ ...x, base_temp: v }) });
  }
  const have = new Map((p.stages ?? []).map((s) => [eventKey(s.stage), s]));
  for (const s of stages) {
    const mine = have.get(eventKey(s.stage));
    if (mine && near(mine.gdd, s.gdd, DD_SAME)) continue;
    const key = eventKey(s.stage);
    out.push({
      field: `stage:${key}`, label: s.stage,
      yours: mine ? show.dd(mine.gdd) : none,
      ai: show.dd(s.gdd),
      take: (x) => {
        const kept = (x.stages ?? []).filter((t) => eventKey(t.stage) !== key);
        return {
          ...x,
          // A watched pest given a stage is counted from then on.
          watch: undefined,
          base_temp: x.base_temp ?? r.base_temp_f ?? undefined,
          stages: [...kept, { stage: mine?.stage ?? s.stage, gdd: s.gdd }].sort((a, b) => a.gdd - b.gdd),
        };
      },
    });
  }
  return out;
}

// ── Fauna ────────────────────────────────────────────────────────────────

/// The reference's event this row tracks, by name.
export function matchingEvent(w: SavedWildlife, r: LifeCycleResult): LifeCycleEvent | null {
  const key = eventKey(w.event);
  return (r.events ?? []).find((e) => eventKey(e.name) === key) ?? null;
}

/// The fields that time an event. A change of clock replaces all of them at
/// once: a heat total on a calendar event times nothing.
const TIMING = ["driver", "gdd", "base_temp", "daylight_hours", "rising", "typical_on",
  "trigger", "phase", "after", "nth", "days", "from", "on"] as const;

const CLOCK: Record<string, string> = {
  heat: "heat", daylight: "day length", interval: "days from", calendar: "date",
  condition: "weather", moon: "moon",
};

function timing(w: Partial<SavedWildlife>, show: Show): string {
  switch (w.driver) {
    case "heat": return w.gdd != null ? `${show.dd(w.gdd)}${w.base_temp != null ? ` from ${show.temp(w.base_temp)}` : ""}` : none;
    case "daylight": return w.daylight_hours != null ? `${w.daylight_hours} h ${w.rising === false ? "falling" : "rising"}` : none;
    case "calendar": return w.on ?? w.typical_on ?? none;
    case "moon": return w.phase ? `${w.nth ?? 1}× ${w.phase.replace("_", " ")} after ${w.after ?? "Jan 1"}` : none;
    case "interval": return w.days != null ? `${w.days} days from ${w.from ?? none}` : none;
    case "condition": {
      const t = w.trigger;
      if (!t) return none;
      return [t.after && `after ${t.after}`, t.min_night_f != null && `nights ≥ ${show.temp(t.min_night_f)}`,
        t.min_day_f != null && `days ≥ ${show.temp(t.min_day_f)}`, t.wet && "wet"].filter(Boolean).join(", ") || none;
    }
    default: return none;
  }
}

function sameTiming(a: Partial<SavedWildlife>, b: Partial<SavedWildlife>): boolean {
  return TIMING.every((k) => {
    const x = a[k], y = b[k];
    if (typeof x === "number" && typeof y === "number") return Math.abs(x - y) < DD_SAME;
    return JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  });
}

/// A Fauna row beside the reference's event of the same name, or null when
/// the reference has no such event for this creature.
export function wildlifeDiff(w: SavedWildlife, r: LifeCycleResult, show: Show): FieldDiff<SavedWildlife>[] | null {
  const e = matchingEvent(w, r);
  if (!e) return null;
  const ai = wildlifeRows(w.species, [e], w.regionId)[0];
  const out: FieldDiff<SavedWildlife>[] = [];
  if (!sameTiming(w, ai)) {
    out.push({
      field: "timing", label: `When (${CLOCK[ai.driver] ?? ai.driver})`,
      yours: w.driver === ai.driver ? timing(w, show) : `${CLOCK[w.driver] ?? w.driver}: ${timing(w, show)}`,
      ai: timing(ai, show),
      take: (x) => {
        const next = { ...x } as Record<string, unknown>;
        for (const k of TIMING) delete next[k];
        for (const k of TIMING) if (ai[k] !== undefined) next[k] = ai[k];
        return next as unknown as SavedWildlife;
      },
    });
  }
  if (ai.note && ai.note !== w.note) {
    const v = ai.note;
    out.push({ field: "note", label: "Note", yours: w.note || none, ai: v, take: (x) => ({ ...x, note: v }) });
  }
  return out;
}

/// The row with every taken change applied, in order.
export function applyTaken<T>(row: T, diffs: readonly FieldDiff<T>[], taken: ReadonlySet<string>): T {
  return diffs.filter((d) => taken.has(d.field)).reduce((x, d) => d.take(x), row);
}

/// What to look a row's species up by: the picked taxon when the row has one,
/// else the name as typed — the same keys the add form asks with.
export function lookupBy(name: string, ref: { taxonId?: number; scientificName?: string; commonName?: string }): {
  taxon_id?: number; scientific_name?: string; common_name?: string; text?: string;
} {
  if (ref.taxonId || ref.scientificName) {
    return {
      ...(ref.taxonId ? { taxon_id: ref.taxonId } : {}),
      ...(ref.scientificName ? { scientific_name: ref.scientificName } : {}),
      common_name: ref.commonName || name,
    };
  }
  return { text: name };
}
