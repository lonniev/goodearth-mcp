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
import {
  blockItemList, blockItemSave, type ItemKind, type ItemRow, type ItemSort,
} from "./mcp";

export type { ItemKind, ItemSort };

/// How a view wants the record ordered and narrowed.
///
/// All of it is applied by the DATABASE, over every row the block holds rather
/// than over the page in hand. That became possible when the grower's content
/// moved into columns Postgres can read; while it was sealed, a name only
/// existed inside a ciphertext and could not be an ORDER BY.
export interface ItemQuery {
  /// Regex over the name and the event. Set only when the grower asks for it
  /// — never while they are still typing.
  search?: string;
  sortCol?: ItemSort;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

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
  /// Where this page sits in the whole record. `total` counts every matching
  /// row, not the ones in hand, so "12 plantings" stays true on page two.
  total: number;
  page: number;
  pages: number;
  /// The record has no such block. The browser is asking about ground the
  /// server does not know — usually a stale active region after a device
  /// switch, which is a different thing from having nothing planted.
  unknownBlock: boolean;
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
  /// Omit entirely and the hook behaves exactly as it always did: one page of
  /// 200 in the record's own order. A view adopts sorting when it is ready to,
  /// not when this signature changes.
  query?: ItemQuery,
): ItemsHandle<T> {
  const [items, setItems] = useState<T[]>([]);
  const [count, setCount] = useState({ total: 0, page: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unknownBlock, setUnknownBlock] = useState(false);

  const { from, to } = codec;

  const reload = useCallback(async () => {
    if (!block) { setItems([]); setLoading(false); return; }
    try {
      const page = await blockItemList(block, kind, {
        ...(season != null ? { season } : {}),
        ...(query?.search ? { search: query.search } : {}),
        ...(query?.sortCol ? { sort_col: query.sortCol } : {}),
        ...(query?.sortDir ? { sort_dir: query.sortDir } : {}),
        ...(query?.page != null ? { page: query.page } : {}),
        page_size: query?.pageSize ?? 200,
      });
      if (page?.success) {
        setItems((page.items ?? []).map(from));
        setCount({
          total: page.total ?? 0, page: page.page ?? 0, pages: page.pages ?? 1,
        });
        setError("");
        setUnknownBlock(false);
      } else if (page?.error_code === "no_such_block") {
        // Say it. This was swallowed as "what a grower sees before they have
        // saved any ground", which is wrong twice: a grower with no ground has
        // no block to ask about, so this never fires for them — and when it
        // DOES fire, it means this browser is pointed at ground the record has
        // never heard of. Rendering that as an empty page is the same lie an
        // unreachable record was: a claim that nothing grows here.
        setUnknownBlock(true);
        setError("");
        setItems([]);
      } else {
        setError(page?.error ?? "");
        setItems([]);
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
    // Every field is named rather than depending on the object, which a caller
    // rebuilds on each render — that would refetch forever.
  }, [block, kind, season, from,
      query?.search, query?.sortCol, query?.sortDir, query?.page, query?.pageSize]);

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

  return { items, ...count, loading, error, unknownBlock, save, retire, reload };
}
