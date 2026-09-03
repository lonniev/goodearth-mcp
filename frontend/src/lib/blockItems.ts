// The grower's record, read from the server.
//
// Plantings, pest models, the wildlife roster and field observations are all
// items on a block, npub-scoped and stored by the operator. This module is how
// the views reach them, and it exists because the previous arrangement lost
// them in plain sight: the migration lifted every row to the server and then
// cleared the browser key, while the views went on reading that emptied key.
// Nothing was lost — the server had it all — but the app showed a farm with
// nothing on it, which is worse than showing an error.
//
// One hook for all four kinds. They differ only in payload, so four loaders
// would have been four chances to drift.

import { useCallback, useEffect, useState } from "react";
import { blockItemList, blockItemSave, type ItemKind, type ItemRow } from "./mcp";

export type { ItemKind };

/// Rows carry the server's bookkeeping alongside the grower's payload. Views
/// want their own shape, so each caller supplies the two mappings and this
/// module never learns what a planting is.
export interface ItemCodec<T> {
  /// Server row → the shape this view works in.
  from: (row: ItemRow) => T;
  /// The view's shape → what to store. Omit `item_id` to mint a new row.
  to: (value: T) => Record<string, unknown>;
}

export interface ItemsHandle<T> {
  items: T[];
  /// True only on the first load, so a refresh does not blank the page.
  loading: boolean;
  error: string;
  save: (value: T) => Promise<void>;
  retire: (itemId: string) => Promise<void>;
  reload: () => Promise<void>;
}

/// Read one kind of item for one block, and write it back.
///
/// `season` is passed through for the kinds that are scoped to one — leave it
/// undefined for observations, which are dated rather than seasonal.
export function useBlockItems<T>(
  block: string,
  kind: ItemKind,
  codec: ItemCodec<T>,
  season?: number,
): ItemsHandle<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { from, to } = codec;

  const reload = useCallback(async () => {
    if (!block) { setItems([]); setLoading(false); return; }
    try {
      const page = await blockItemList(block, kind, {
        ...(season != null ? { season } : {}),
        page_size: 200,
      });
      if (page?.success) {
        setItems((page.items ?? []).map(from));
        setError("");
      } else {
        // A block the server does not know is not an error worth shouting
        // about — it is what a grower sees before they have saved any ground.
        setError(page?.error_code === "no_such_block" ? "" : (page?.error ?? ""));
        setItems([]);
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [block, kind, season, from]);

  useEffect(() => { setLoading(true); void reload(); }, [reload]);

  const save = useCallback(async (value: T) => {
    const res = await blockItemSave(block, kind, {
      items: [to(value)],
      ...(season != null ? { season } : {}),
    });
    if (!res?.success) throw new Error(res?.error ?? "could not save");
    await reload();
  }, [block, kind, season, to, reload]);

  const retire = useCallback(async (itemId: string) => {
    const res = await blockItemSave(block, kind, { retire_ids: [itemId] });
    if (!res?.success) throw new Error(res?.error ?? "could not remove");
    await reload();
  }, [block, kind, reload]);

  return { items, loading, error, save, retire, reload };
}
