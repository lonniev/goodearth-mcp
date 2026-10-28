// Choosing a subject's life-cycle events, and turning the chosen ones into the
// records each page keeps.
//
// The server (`life_cycle`) answers with every event it can time, each already
// in its record's shape. These are the rules for the chooser — what starts
// ticked, what is already tracked — and for saving what was ticked, kept pure
// so they can be tested.

import type { LifeCycleEvent } from "./mcp";
import type { PlantingStage } from "./plantings.ts";
import { animalKey } from "./husbandry.ts";
import { newItemId } from "./submit.ts";
import type { SavedPest } from "./pestModels";
import type { SavedWildlife } from "./wildlifeModels";

/// How the record names an event, so "First Flight " and "first flight" are one.
export function eventKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/// The events an animal already has on the record, by `eventKey`.
export function trackedFor(
  recorded: readonly { species: string; event: string }[], species: string,
): Set<string> {
  const who = animalKey(species);
  return new Set(recorded.filter((r) => r.event && animalKey(r.species) === who).map((r) => eventKey(r.event)));
}

/// What starts ticked: the key events and anything already tracked.
export function initialChoice(events: LifeCycleEvent[], tracked: ReadonlySet<string>): Set<string> {
  return new Set(
    events.filter((e) => e.key || tracked.has(eventKey(e.name))).map((e) => eventKey(e.name)),
  );
}

/// The ticked events that are not tracked yet — the ones a save adds.
export function toAdd(
  events: LifeCycleEvent[], chosen: ReadonlySet<string>, tracked: ReadonlySet<string>,
): LifeCycleEvent[] {
  return events.filter((e) => chosen.has(eventKey(e.name)) && !tracked.has(eventKey(e.name)));
}

/// "~Mar 4" for an event's date on this plot, or "" when it has none.
export function aboutDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? "" : `~${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/// An animal's chosen events, one wildlife record each.
export function wildlifeRows(
  species: string, events: LifeCycleEvent[], regionId: string,
  extra?: { scientificName?: string; emoji?: string },
): SavedWildlife[] {
  return events.map((e) => ({
    id: newItemId("wl"),
    regionId,
    species,
    event: e.name,
    driver: e.driver,
    ...(e.emoji || extra?.emoji ? { emoji: (e.emoji || extra?.emoji)! } : {}),
    ...(e.summary ? { note: e.summary } : {}),
    ...(e.gdd != null ? { gdd: e.gdd } : {}),
    ...(e.base_temp != null ? { base_temp: e.base_temp } : {}),
    ...(e.daylight_hours != null ? { daylight_hours: e.daylight_hours } : {}),
    ...(e.rising != null ? { rising: e.rising } : {}),
    ...(e.typical_on ? { typical_on: e.typical_on } : {}),
    ...(e.trigger ? { trigger: e.trigger } : {}),
    ...(e.phase ? { phase: e.phase } : {}),
    ...(e.after ? { after: e.after } : {}),
    ...(e.nth != null ? { nth: e.nth } : {}),
    ...(extra?.scientificName ? { scientific_name: extra.scientificName } : {}),
  }) as SavedWildlife);
}

/// A plant's or pest's chosen heat events, as stages sorted by heat.
export function heatStages(events: LifeCycleEvent[]): PlantingStage[] {
  return events
    .filter((e) => e.driver === "heat" && e.gdd != null)
    .map((e) => ({
      stage: e.name, gdd: e.gdd!,
      ...(e.emoji ? { emoji: e.emoji } : {}),
      ...(e.key ? { key: true } : {}),
    }))
    .sort((a, b) => a.gdd - b.gdd);
}

/// A pest's chosen stages as one pest record, every stage at the pest's base.
export function pestRow(
  pest: string, events: LifeCycleEvent[], baseTempF: number, regionId: string,
  extra?: { taxonId?: number; scientificName?: string },
): SavedPest {
  return {
    id: newItemId("pe"),
    regionId,
    pest,
    base_temp: baseTempF,
    stages: heatStages(events).map(({ stage, gdd }) => ({ stage, gdd })),
    ...(extra?.taxonId ? { taxon_id: extra.taxonId } : {}),
    ...(extra?.scientificName ? { scientific_name: extra.scientificName } : {}),
  } as SavedPest;
}

/// A pest's chosen stages, onto its existing record when it has one.
///
/// One record per pest, every stage counted at one base. Stages counted at a
/// different base would be a second scale on one row, so that is said rather
/// than saved; the grower can change the record's base or add the pest anew.
export function pestWithStages(
  existing: SavedPest | undefined, pest: string, events: LifeCycleEvent[], baseTempF: number,
  regionId: string, extra?: { taxonId?: number; scientificName?: string },
): SavedPest | string {
  if (!existing) return pestRow(pest, events, baseTempF, regionId, extra);
  const have = existing.stages ?? [];
  if (have.length && existing.base_temp != null && Math.abs(existing.base_temp - baseTempF) > 0.5) {
    return `${existing.pest} already counts its stages from ${existing.base_temp}°F; `
      + `these count from ${baseTempF}°F.`;
  }
  const known = new Set(have.map((s) => eventKey(s.stage)));
  const added = heatStages(events).filter((s) => !known.has(eventKey(s.stage)))
    .map(({ stage, gdd }) => ({ stage, gdd }));
  return {
    ...existing,
    base_temp: existing.base_temp ?? baseTempF,
    watch: undefined,
    stages: [...have, ...added].sort((a, b) => a.gdd - b.gdd),
  };
}
