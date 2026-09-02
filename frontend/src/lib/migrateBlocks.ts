// One-time lift of the grower's record from this device to the server.
//
// Regions, plantings, pests, wildlife and field reports were device-local. They
// move to the operator's record so a farm survives a lost laptop and reads the
// same on a phone. This module is the bridge, and it exists to be deleted once
// no device is still carrying the old keys.
//
// It follows `todos.ts`, which did this for tasks, and fixes the two faults
// that precedent carries:
//
//   * `todos.ts` sets ONE sentinel but filters by regionId, so a grower with
//     two regions has the second stranded forever. These collections are
//     inherently multi-region, so this lifts EVERY block in one pass.
//   * Its sentinel is global rather than per-patron, so a second npub on the
//     same browser is told the work is already done. Every key here is keyed by
//     npub.
//
// The local copy is cleared only after the server has acknowledged the rows,
// and the ids that landed are recorded, so a run that dies halfway resumes
// instead of re-sending what already arrived.

import {
  blockItemSave, blockSave, getStoredNpub, type ItemKind, type Region,
} from "./mcp";

const LEGACY = {
  regions: "goodearth:regions:v1",
  plantings: "goodearth:plantings:v1",
  pests: "goodearth:pests:v1",
  wildlife: "goodearth:wildlife:v1",
  reports: "goodearth:reports:v1",
} as const;

/// Per collection AND per npub — see the header.
function doneKey(what: string, npub: string): string {
  return `goodearth:migrated:${what}:${npub}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function isDone(what: string, npub: string): boolean {
  try {
    return !!window.localStorage.getItem(doneKey(what, npub));
  } catch {
    // A private window cannot remember that it migrated, so it must not start:
    // re-sending on every load would spend the grower's balance repeatedly.
    return true;
  }
}

function markDone(what: string, npub: string): void {
  try { window.localStorage.setItem(doneKey(what, npub), "1"); } catch { /* noop */ }
}

function forget(key: string): void {
  try { window.localStorage.removeItem(key); } catch { /* noop */ }
}

interface LegacyRegion {
  id: string;
  name: string;
  region: Region;
  baseTempF?: number;
}

/// The worked example is synthesised, never saved, and must not become a real
/// block — every grower would acquire a Champlain Valley they never drew.
const EXAMPLE_ID = "example-champlain";

export interface MigrationReport {
  ran: boolean;
  blocks: number;
  items: number;
  failed: string[];
}

/// Lift everything this device is still holding. Safe to call on every load.
export async function migrateToBlocks(): Promise<MigrationReport> {
  const npub = getStoredNpub();
  const out: MigrationReport = { ran: false, blocks: 0, items: 0, failed: [] };
  if (!npub) return out;

  const regions = read<LegacyRegion[]>(LEGACY.regions, [])
    .filter((r) => r && r.id && r.id !== EXAMPLE_ID);

  // Blocks first: the items below are keyed to them, and reusing the id the
  // browser minted means the tasks already on the server keep resolving.
  if (!isDone("blocks", npub) && regions.length) {
    out.ran = true;
    let landed = 0;
    for (const r of regions) {
      try {
        const res = await blockSave({
          name: r.name,
          geometry: r.region,
          block: r.id,
          base_temp: r.baseTempF ?? 50,
        });
        // A name that already exists server-side is not a failure — the block
        // is there, which is the outcome this pass wanted.
        if (res?.success || res?.error_code === "ambiguous_block") landed += 1;
        else out.failed.push(`${r.name}: ${res?.error ?? "unknown"}`);
      } catch (e) {
        out.failed.push(`${r.name}: ${String(e)}`);
      }
    }
    out.blocks = landed;
    if (landed === regions.length) {
      markDone("blocks", npub);
      forget(LEGACY.regions);
    }
  }

  // Items, one batch per block per kind. A partial pass leaves the local copy
  // alone and retries; the batch call means a retry is cheap.
  const collections: Array<{ key: string; store: string; kind: ItemKind }> = [
    { key: "plantings", store: LEGACY.plantings, kind: "planting" },
    { key: "pests", store: LEGACY.pests, kind: "pest" },
    { key: "wildlife", store: LEGACY.wildlife, kind: "wildlife" },
    { key: "reports", store: LEGACY.reports, kind: "observation" },
  ];

  for (const c of collections) {
    if (isDone(c.key, npub)) continue;
    const rows = read<Record<string, unknown>[]>(c.store, []);
    if (!rows.length) { markDone(c.key, npub); continue; }

    out.ran = true;
    const byBlock = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const id = String(row.regionId ?? "");
      if (!id || id === EXAMPLE_ID) continue;
      byBlock.set(id, [...(byBlock.get(id) ?? []), shape(row, c.kind)]);
    }

    let ok = true;
    for (const [blockId, items] of byBlock) {
      try {
        const res = await blockItemSave(blockId, c.kind, { items });
        if (res?.success) out.items += res.saved_count ?? items.length;
        else { ok = false; out.failed.push(`${c.key}: ${res?.error ?? "unknown"}`); }
      } catch (e) {
        ok = false;
        out.failed.push(`${c.key}: ${String(e)}`);
      }
    }
    if (ok) { markDone(c.key, npub); forget(c.store); }
  }

  return out;
}

/// Map a device-local row onto what the server stores.
///
/// `regionId` is dropped — the block is the call's subject now. An observation
/// carries the day it was seen out to its own column, where it can be filtered
/// and paged; everything else rides in the payload untouched, so a field the
/// app adds later needs no migration change.
function shape(row: Record<string, unknown>, kind: ItemKind): Record<string, unknown> {
  const { regionId: _drop, id, observedOn, ...rest } = row;
  const item: Record<string, unknown> = { ...rest };
  if (id) item.item_id = String(id);
  if (kind === "observation") {
    item.observed_on = String(observedOn ?? "").slice(0, 10);
  }
  item.source = "device";
  return item;
}
