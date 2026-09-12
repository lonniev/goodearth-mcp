// Farm bundles, to and from the record.
//
// The arithmetic is in `farmBundle.ts`, where it is tested; this is only the
// calls. Reading pages every kind to exhaustion — a bundle of the first two
// hundred plantings would be a bundle that quietly lost the rest.

import { blockItemList, blockItemSave, type ItemRow } from "./mcp";
import { saveBlock } from "./saveBlock";
import {
  BUNDLE_KINDS, chunks, importName, ITEMS_PER_WRITE, makeBundle,
  type BundleKind, type FarmBundle,
} from "./farmBundle";
import type { SavedRegion } from "./regions";

/// This season's plantings, pests and wildlife on a plot, as a bundle.
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
  return makeBundle(plot, items);
}

export interface Imported {
  plot: SavedRegion;
  saved: number;
  /// Set when the plot landed but some of its items did not.
  error?: string;
}

/// A bundle, as a new plot of the importer's own.
///
/// The plot first, then its items a hundred at a time. If a batch is refused
/// the plot is already on the record, so this reports what landed rather
/// than throwing it away — the grower can see the plot and what is missing.
export async function importBundle(b: FarmBundle, taken: readonly string[]): Promise<Imported> {
  const plot = await saveBlock({
    id: `map-${Date.now().toString(36)}`,
    name: importName(b.plot.name, taken),
    region: b.plot.geometry,
    baseTempF: b.plot.base_temp_f,
    aliases: [],
  });
  let saved = 0;
  for (const kind of BUNDLE_KINDS) {
    for (const batch of chunks(b.items[kind], ITEMS_PER_WRITE)) {
      const r = await blockItemSave(plot.id, kind, { items: batch });
      if (!r.success) {
        return { plot, saved, error: `Some ${kind} items could not be saved: ${r.error ?? "refused"}` };
      }
      saved += r.saved_count ?? batch.length;
    }
  }
  return { plot, saved };
}
