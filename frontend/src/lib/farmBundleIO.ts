// Farm bundles, to and from the record.
//
// The arithmetic is in `farmBundle.ts`, where it is tested; this is only the
// calls. Reading pages every kind to exhaustion — a bundle of the first two
// hundred plantings would be a bundle that quietly lost the rest.

import { blockItemList, blockItemSave, taskList, taskSave, type ItemRow, type TaskRow } from "./mcp";
import { saveBlock } from "./saveBlock";
import {
  BUNDLE_KINDS, chunks, importName, ITEMS_PER_WRITE, makeBundle,
  type BundleKind, type FarmBundle,
} from "./farmBundle";
import type { SavedRegion } from "./regions";

/// This season's plantings, pests and wildlife on a plot, and all its tasks.
export async function exportPlot(plot: SavedRegion): Promise<FarmBundle> {
  const season = new Date().getFullYear();
  const items: Partial<Record<BundleKind, ItemRow[]>> = {};
  for (const kind of BUNDLE_KINDS) {
    const rows: ItemRow[] = [];
    for (let page = 0; ; page += 1) {
      const r = await blockItemList(plot.id, kind, { season, page, page_size: 200 });
      if (!r.success) throw new Error(r.error || `The ${kind} list could not be read.`);
      rows.push(...(r.items ?? []));
      if (page + 1 >= (r.pages ?? 1)) break;
    }
    items[kind] = rows;
  }
  // "all" is every task on the plot, done or not — the timeframe filters on
  // due dates and nothing else.
  const tasks: TaskRow[] = [];
  for (let page = 0; ; page += 1) {
    const r = await taskList(plot.id, { timeframe: "all", page, page_size: 200 });
    if (!r.success) throw new Error(r.error || "The task list could not be read.");
    tasks.push(...(r.rows ?? []));
    if (page + 1 >= (r.pages ?? 1)) break;
  }
  return makeBundle(plot, items, tasks);
}

export interface Imported {
  plot: SavedRegion;
  /// Items and tasks that landed.
  saved: number;
  tasks: number;
  /// Set when the plot landed but some of what it carried did not.
  error?: string;
}

/// Tasks are saved one per call, so a few go at once. Enough to keep a long
/// list moving; few enough not to look like a flood to the service.
const TASKS_AT_ONCE = 4;

/// A bundle, as a new plot of the importer's own.
///
/// The plot first, then its items a hundred at a time, then its tasks. If
/// something is refused the plot is already on the record, so this reports
/// what landed rather than throwing it away — the grower can see the plot and
/// what is missing.
export async function importBundle(
  b: FarmBundle, taken: readonly string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Imported> {
  const total = BUNDLE_KINDS.reduce((n, k) => n + b.items[k].length, 0) + b.tasks.length;
  const plot = await saveBlock({
    id: `map-${Date.now().toString(36)}`,
    name: importName(b.plot.name, taken),
    region: b.plot.geometry,
    baseTempF: b.plot.base_temp_f,
    aliases: [],
  });
  let saved = 0;
  onProgress?.(0, total);
  for (const kind of BUNDLE_KINDS) {
    for (const batch of chunks(b.items[kind], ITEMS_PER_WRITE)) {
      const r = await blockItemSave(plot.id, kind, { items: batch });
      if (!r.success) {
        return { plot, saved, tasks: 0, error: `Some ${kind} items could not be saved: ${r.error ?? "refused"}` };
      }
      saved += r.saved_count ?? batch.length;
      onProgress?.(saved, total);
    }
  }

  let tasks = 0;
  const failed: string[] = [];
  for (const group of chunks(b.tasks, TASKS_AT_ONCE)) {
    const results = await Promise.all(group.map((t) =>
      // No task_id, ever: the task record upserts on it.
      taskSave(plot.id, { ...t }).catch((e: Error) => ({ success: false, error: e.message }))));
    results.forEach((r, i) => {
      if (r.success) tasks += 1;
      else failed.push(group[i].title);
    });
    onProgress?.(saved + tasks + failed.length, total);
  }
  saved += tasks;
  return failed.length
    ? { plot, saved, tasks, error: `${failed.length} task${failed.length === 1 ? "" : "s"} could not be saved: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}.` }
    : { plot, saved, tasks };
}
