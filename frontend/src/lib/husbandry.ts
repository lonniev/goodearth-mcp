// A cycle: one start, and the milestones counted from it.
//
// A broody hen is not one event. She goes down on a clutch, and twenty-one
// days later it hatches — a date the grower observed and a date this service
// can work out, and neither is much use without the other. Lambing, kidding,
// farrowing and queen-rearing are all that shape: something happened, and
// things follow from it at known intervals.
//
// So the interval driver is entered as a CYCLE rather than as a lone event.
// The start is a date the grower stood there and saw; each milestone is a
// count of days from it. They save together, in one write and one fare,
// because half a cycle is not a thing anyone wanted to record.
//
// **The counts are the grower's.** There is no table here pairing a hen with
// twenty-one days. Twenty-one is right for a chicken and wrong for a muscovy,
// it moves with the breed, and a shepherd's own records beat any average — so
// this file does arithmetic and remembers what they chose last time, which is
// the part a service is actually good for.

import type {
  WildlifeCatalogResult, WildlifeEventInput, WildlifeRow,
} from "./mcp";
import { makeWildlife, type SavedWildlife } from "./wildlifeModels.ts";

/// One animal the composer can offer, from wherever it was learned.
export interface Pick {
  name: string;
  scientificName?: string;
  /// How many of these iNaturalist has recorded around this block. Undefined
  /// for one that is only in the grower's own record — a laying flock is not
  /// wildlife anybody submits sightings of.
  observations?: number;
  emoji?: string;
  photo?: string | null;
  /// USA-NPN publishes a life cycle for it, so its habits can be asked for.
  hasHabits?: boolean;
  /// Already on this block's record. These lead the list: the animal a grower
  /// is recording a second brood for is one they have named before.
  yours?: boolean;
}

/// Two spellings of one animal.
///
/// Case, spacing and accents, the same three things `block_store.norm` folds
/// server-side. Spacing is not fussiness: names reach the record from a
/// catalogue, from a chiclet and from a grower's own typing, and
/// "domestic  chicken" with two spaces would otherwise sit in the list beside
/// "Domestic chicken" as a second animal, each holding half the history.
const key = (name: string) =>
  (name ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .trim().toLowerCase().replace(/\s+/g, " ");

/// The one list the animal is chosen from.
///
/// Two sources, because neither is enough alone. `wildlife_catalog` knows what
/// is recorded around this ground and how much of it; the grower's own record
/// knows about the flock in the barn, which no naturalist submits sightings
/// of. A name in both is one animal, and it keeps the catalogue's figures.
export function mergeSpecies(
  catalog: WildlifeCatalogResult | null,
  recorded: readonly SavedWildlife[],
): Pick[] {
  const by = new Map<string, Pick>();

  for (const g of catalog?.groups ?? []) {
    for (const s of g.species ?? []) {
      const k = key(s.name);
      if (!k || by.has(k)) continue;
      by.set(k, {
        name: s.name,
        scientificName: s.scientific_name,
        observations: s.observations,
        emoji: s.emoji,
        photo: s.photo,
        hasHabits: s.has_habits,
      });
    }
  }

  for (const m of recorded) {
    const k = key(m.species ?? "");
    if (!k) continue;
    const had = by.get(k);
    // Marked, not replaced. The catalogue's count and photograph are worth
    // keeping on an animal the grower also happens to track.
    by.set(k, had
      ? { ...had, yours: true }
      : {
          name: m.species, scientificName: m.scientific_name,
          emoji: m.emoji ?? undefined, yours: true,
        });
  }

  return [...by.values()].sort((a, b) => {
    if (!!a.yours !== !!b.yours) return a.yours ? -1 : 1;
    return (b.observations ?? 0) - (a.observations ?? 0);
  });
}

/// Narrow the list as the grower types. Substring, not regex: this runs on
/// every keystroke over a list already in hand, and a half-typed regex is a
/// syntax error rather than a search.
export function filterSpecies(all: readonly Pick[], q: string): Pick[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [...all];
  return all.filter((p) =>
    p.name.toLowerCase().includes(needle)
    || (p.scientificName ?? "").toLowerCase().includes(needle));
}

// ── What the grower has called things before ─────────────────────────────

/// Event labels already on this block's record, most-used first.
///
/// The suggestion has to come from somewhere, and a shipped list of husbandry
/// vocabulary would be the natural-history table wearing a different hat. What
/// this grower has already typed is theirs, is spelled the way they spell it,
/// and is the thing they are most likely to want again.
export function labelsUsed(recorded: readonly SavedWildlife[]): string[] {
  const seen = new Map<string, number>();
  for (const m of recorded) {
    const label = (m.event ?? "").trim();
    if (!label) continue;
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
}

/// What this animal's interval was, last time the grower set one.
///
/// The default for a second brood is what the first brood used. Not a fact
/// about chickens — a fact about THIS grower's chickens, which is the only
/// kind of fact this file is willing to hold.
export function lastInterval(
  recorded: readonly SavedWildlife[], species: string,
): number | undefined {
  const k = key(species);
  const rows = recorded.filter(
    (m) => key(m.species ?? "") === k && m.driver === "interval"
      && Number.isFinite(m.days));
  return rows.length ? rows[rows.length - 1].days : undefined;
}

// ── The cycle ────────────────────────────────────────────────────────────

export interface Milestone {
  label: string;
  days: number;
}

export interface CycleDraft {
  species: string;
  scientificName?: string;
  taxonId?: number;
  emoji?: string;
  role?: string;
  note?: string;
  /// What was seen, and the day it was seen. The one real observation a cycle
  /// is built on.
  startLabel: string;
  startOn: string;
  steps: Milestone[];
}

/// MM-DD, the shape a calendar event is stored in.
export function monthDay(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(5) : "";
}

/// The events a cycle becomes: the start, then one row per milestone.
///
/// The start is a `calendar` row and each milestone an `interval` counted from
/// the start's date — the pair proven to publish on the feed. Returns the
/// grower's own words on the first thing that will not validate, so the form
/// corrects them here rather than a paid call refusing later.
export function cycleRows(
  d: CycleDraft, regionId: string,
): SavedWildlife[] | string {
  if (!d.species.trim()) return "Which animal?";
  if (!d.startLabel.trim()) return "What happened — 'laying on eggs', 'bred'?";
  const on = monthDay(d.startOn);
  if (!on) return "Pick the day it happened.";

  const shared = {
    species: d.species.trim(),
    ...(d.emoji ? { emoji: d.emoji } : {}),
    ...(d.note ? { note: d.note } : {}),
  };
  // Applied after validation rather than through it: `role` and the taxon
  // reference are the grower's bookkeeping about the animal, not part of what
  // makes an event datable, and `WildlifeEventInput` is the shape the server
  // validates.
  const reference = {
    ...(d.taxonId ? { taxon_id: d.taxonId } : {}),
    ...(d.scientificName ? { scientific_name: d.scientificName } : {}),
    ...(d.role ? { role: d.role } : {}),
  };

  const inputs: WildlifeEventInput[] = [
    { ...shared, event: d.startLabel.trim(), driver: "calendar", typical_on: on },
    ...d.steps.map((s) => ({
      ...shared,
      event: s.label.trim(),
      driver: "interval" as const,
      days: s.days,
      from: d.startOn,
    })),
  ];

  const out: SavedWildlife[] = [];
  for (const input of inputs) {
    // Validated the way the server does, one row at a time. A cycle whose
    // third milestone is malformed must not save the first two: the write is
    // all-or-nothing downstream, and it should be all-or-nothing here too.
    const made = makeWildlife(input, regionId);
    if (typeof made === "string") return made;
    out.push({ ...made, ...reference });
  }
  return out;
}

/// The same cycle, started again on a new day.
///
/// Poultry set several times a season, so a brood is not annual. The clone
/// carries the labels and the counts — the grower already decided those — and
/// takes a fresh start date. Ids are dropped, because these are new rows: the
/// previous cycle stays in the record as the history of what actually
/// happened.
export function nextCycle(
  rows: readonly SavedWildlife[], startOn: string,
): CycleDraft | string {
  const start = rows.find((r) => r.driver === "calendar");
  const steps = rows.filter((r) => r.driver === "interval" && Number.isFinite(r.days));
  if (!start && !steps.length) return "There is no cycle here to start again.";
  if (!monthDay(startOn)) return "Pick the day it started.";

  const first = start ?? steps[0];
  return {
    species: first.species,
    scientificName: first.scientific_name,
    taxonId: first.taxon_id,
    emoji: first.emoji ?? undefined,
    startLabel: start?.event ?? "started",
    startOn,
    steps: steps.map((s) => ({ label: s.event, days: s.days as number })),
  };
}

/// Which saved rows belong to one animal's cycle.
///
/// Grouped by species, because that is the only thing a start and its
/// milestones are guaranteed to share — the labels differ by definition and
/// the ids are per row.
export function cycleOf(
  recorded: readonly SavedWildlife[], species: string,
): SavedWildlife[] {
  const k = key(species);
  return recorded.filter((m) => key(m.species ?? "") === k);
}

// ── What to be looking for ───────────────────────────────────────────────

export interface Due {
  row: WildlifeRow;
  /// Days from today. Negative for a day that has already passed.
  daysAway: number;
  /// The grower has recorded seeing it. It stays on the list for the season,
  /// because "it hatched on the 24th, two days early" is the whole point of
  /// keeping the record — but it stops asking to be marked.
  settled: boolean;
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to + "T12:00:00") - Date.parse(from + "T12:00:00")) / 86_400_000);

/// The watch list: what is coming, and what has just been and gone.
///
/// `wildlife_calendar`'s own `due_soon` answers the first half. It cannot
/// answer the second, and it should not: a row whose day has passed carries
/// `reached_on` and drops out of the projection entirely, which is correct
/// arithmetic and useless to a grower on the morning after a hatch was due.
/// The question they have then is "did it?", and that question is the one
/// thing this service can turn into a record worth having.
export function dueList(
  events: readonly WildlifeRow[],
  observedRefs: ReadonlySet<string>,
  today: string,
  { ahead = 21, back = 14 }: { ahead?: number; back?: number } = {},
): Due[] {
  const out: Due[] = [];
  for (const row of events) {
    const when = row.projected_date ?? row.reached_on;
    if (!when) continue;
    const daysAway = daysBetween(today, when);
    if (daysAway > ahead || daysAway < -back) continue;
    out.push({
      row, daysAway,
      settled: !!row.ref && observedRefs.has(row.ref),
    });
  }
  // Soonest first, and a day already past leads: it is the one that needs an
  // answer, where a date three weeks out needs nothing at all today.
  return out.sort((a, b) => a.daysAway - b.daysAway);
}

/// A cycle can be started again when something in it counts days.
export function repeatable(rows: readonly SavedWildlife[]): boolean {
  return rows.some((r) => r.driver === "interval" && Number.isFinite(r.days));
}
