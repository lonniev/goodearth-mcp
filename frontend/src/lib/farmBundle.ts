// Farm bundles — one plot and what is tracked on it, as a file another Good
// Earth patron can open as a plot of their own.
//
// Pure: no fetch, no DOM. What goes out, what is refused on the way back in,
// and the one hazard that makes this more than a JSON.stringify: the record
// UPSERTS on `item_id`. A bundle that kept its ids, opened by the patron who
// made it, would rewrite their own rows in place — on the ORIGINAL plot, since
// an upsert never moves a row to another block — and leave the new plot empty.
// So ids never leave, and never come back in, whatever a hand-edited file says.
//
// What travels: the plot's name, outline and base temperature, this season's
// plantings, pests and wildlife, and every task on the plot, done or not.
// What does not: the npub (a bundle names no patron), the plot's other names
// (a nickname is the sharer's own), and field reports (one grower's dated
// sightings). Tasks carry the same hazard as items — the task record upserts
// on its `id` — so their ids are stripped the same way.
//
// Nothing is capped. The point of a bundle is the whole farm, so every page of
// every kind goes out, and a large file coming in is asked about, not refused.

import type { ItemRow, Region, TaskRow } from "./mcp.ts";
import type { SavedRegion } from "./regions.ts";

export const BUNDLE_FORMAT = "goodearth.farm-bundle";
export const BUNDLE_VERSION = 1;
export const BUNDLE_KINDS = ["planting", "pest", "wildlife"] as const;
export type BundleKind = (typeof BUNDLE_KINDS)[number];

/// Above this the page asks "are you sure" before opening a file. A question,
/// not a limit: a large farm makes a large bundle, and it all comes in.
export const LARGE_BUNDLE_BYTES = 5_000_000;

/// A task as it travels: what needs doing and when, without the record's id.
export interface BundleTask {
  title: string;
  note?: string;
  due?: string;
  starts_at?: string;
  ends_at?: string;
  reminder_only?: boolean;
  done?: boolean;
}

/// `block_store.MAX_ITEMS_PER_CALL`. A page size for writing — the import
/// sends every item, a hundred at a time.
export const ITEMS_PER_WRITE = 100;

const MAX_NAME_LEN = 120;
const MIN_BASE_F = 20;
const MAX_BASE_F = 80;

export interface FarmBundle {
  format: typeof BUNDLE_FORMAT;
  version: number;
  exported_at: string;
  plot: { name: string; geometry: Region; base_temp_f: number };
  items: Record<BundleKind, Record<string, unknown>[]>;
  tasks: BundleTask[];
}

/// The record's bookkeeping, never the grower's content.
const BOOKKEEPING = new Set([
  "item_id", "kind", "season_year", "observed_on", "retired", "retired_at",
  "created_at", "updated_at", "block_id", "npub", "payload_enc",
]);
const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);

/// An item as the grower wrote it: no ids, no bookkeeping, no empties.
export function cleanItem(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (BOOKKEEPING.has(k) || UNSAFE.has(k) || v === undefined || v === null) continue;
    out[k] = v;
  }
  return out;
}

const TASK_TEXT = ["title", "note", "due", "starts_at", "ends_at"] as const;

/// A task with only its own fields — no id, no timestamps, no empties.
/// Undefined when it has no title, which the task record would refuse.
export function cleanTask(row: Record<string, unknown>): BundleTask | undefined {
  const out: Record<string, unknown> = {};
  for (const k of TASK_TEXT) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  if (typeof row.reminder_only === "boolean") out.reminder_only = row.reminder_only;
  if (typeof row.done === "boolean") out.done = row.done;
  return typeof out.title === "string" ? (out as unknown as BundleTask) : undefined;
}

export function makeBundle(
  plot: SavedRegion,
  items: Partial<Record<BundleKind, ItemRow[]>>,
  tasks: readonly TaskRow[] = [],
  now: Date = new Date(),
): FarmBundle {
  const cleaned = {} as FarmBundle["items"];
  for (const k of BUNDLE_KINDS) {
    cleaned[k] = (items[k] ?? []).map((r) => cleanItem(r as Record<string, unknown>));
  }
  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exported_at: now.toISOString(),
    plot: { name: plot.name, geometry: plot.region, base_temp_f: plot.baseTempF },
    items: cleaned,
    tasks: tasks.map((t) => cleanTask(t as unknown as Record<string, unknown>))
      .filter((t): t is BundleTask => !!t),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/// A pin or a polygon the service can parse. The server checks again; this
/// is so a bad file is refused before anything is written.
export function validGeometry(g: unknown): g is Region {
  if (!isObj(g)) return false;
  if ("lat" in g || "lon" in g) {
    return num(g.lat) && g.lat >= -90 && g.lat <= 90
      && num(g.lon) && g.lon >= -180 && g.lon <= 180
      && num(g.radius_m) && g.radius_m > 0 && g.radius_m <= 50_000;
  }
  if (g.type !== "Polygon" || !Array.isArray(g.coordinates)) return false;
  const ring = g.coordinates[0];
  return Array.isArray(ring) && ring.length >= 4 && ring.every((p) =>
    Array.isArray(p) && p.length >= 2
      && num(p[0]) && p[0] >= -180 && p[0] <= 180
      && num(p[1]) && p[1] >= -90 && p[1] <= 90);
}

export type ReadResult =
  | { bundle: FarmBundle; skipped: string[] }
  | { error: string };

/// A file someone else made, read as untrusted.
export function readBundle(text: string): ReadResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { error: "That file is not a farm bundle — it is not JSON." }; }
  if (!isObj(raw) || raw.format !== BUNDLE_FORMAT) {
    return { error: "That file is not a Good Earth farm bundle." };
  }
  if (!num(raw.version) || raw.version > BUNDLE_VERSION) {
    return { error: "That bundle was made by a newer Good Earth. Reload the page and try again." };
  }

  const plot = raw.plot;
  if (!isObj(plot)) return { error: "That bundle has no plot in it." };
  const name = typeof plot.name === "string" ? plot.name.trim() : "";
  if (!name || name.length > MAX_NAME_LEN) return { error: "That bundle's plot has no usable name." };
  if (!validGeometry(plot.geometry)) return { error: "That bundle's plot outline is not one Good Earth can read." };
  const base = num(plot.base_temp_f) && plot.base_temp_f >= MIN_BASE_F && plot.base_temp_f <= MAX_BASE_F
    ? plot.base_temp_f : 50;

  const items = {} as FarmBundle["items"];
  for (const k of BUNDLE_KINDS) items[k] = [];
  const skipped: string[] = [];
  const given = raw.items ?? {};
  if (!isObj(given)) return { error: "That bundle's items are not a list Good Earth can read." };
  for (const [kind, list] of Object.entries(given)) {
    if (!(BUNDLE_KINDS as readonly string[]).includes(kind)) { skipped.push(kind); continue; }
    if (!Array.isArray(list) || !list.every(isObj)) {
      return { error: `That bundle's ${kind} list is not one Good Earth can read.` };
    }
    items[kind as BundleKind] = list.map(cleanItem);
  }

  const givenTasks = raw.tasks ?? [];
  if (!Array.isArray(givenTasks) || !givenTasks.every(isObj)) {
    return { error: "That bundle's tasks are not a list Good Earth can read." };
  }
  const tasks: BundleTask[] = [];
  for (const t of givenTasks) {
    const clean = cleanTask(t);
    if (!clean) return { error: "That bundle has a task with no title." };
    tasks.push(clean);
  }

  return {
    bundle: {
      format: BUNDLE_FORMAT, version: raw.version,
      exported_at: typeof raw.exported_at === "string" ? raw.exported_at : "",
      plot: { name, geometry: plot.geometry, base_temp_f: base },
      items,
      tasks,
    },
    skipped,
  };
}

const fold = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/// The name the new plot takes: the bundle's own, unless one of the
/// importer's plots already answers to it.
export function importName(name: string, taken: readonly string[]): string {
  const have = new Set(taken.map(fold));
  const fit = (s: string) => s.slice(0, MAX_NAME_LEN);
  if (!have.has(fold(name))) return fit(name);
  for (let n = 1; ; n += 1) {
    const tail = n === 1 ? " (shared)" : ` (shared ${n})`;
    const candidate = fit(name.slice(0, MAX_NAME_LEN - tail.length) + tail);
    if (!have.has(fold(candidate))) return candidate;
  }
}

export function chunks<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export function bundleFileName(name: string): string {
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${slug || "plot"}.goodearth.json`;
}

/// "3 plantings · 1 pest · 2 wildlife", or that nothing is tracked.
export function countLine(b: FarmBundle): string {
  const n = (k: BundleKind) => b.items[k].length;
  const parts = [
    n("planting") && `${n("planting")} planting${n("planting") === 1 ? "" : "s"}`,
    n("pest") && `${n("pest")} pest${n("pest") === 1 ? "" : "s"}`,
    n("wildlife") && `${n("wildlife")} wildlife`,
    b.tasks.length && `${b.tasks.length} task${b.tasks.length === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "nothing tracked yet";
}
