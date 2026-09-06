// Choosing several things across several searches, then adding them at once.
//
// The three choosers in this app were one-tap-one-thing, and the tap was not
// even an add: it filled a field and scrolled to a form. A grower who wanted
// six species did that six times.
//
// This is the arithmetic behind a basket that survives searching and paging —
// the part that goes quietly wrong. A basket keyed by name loses to two
// species sharing a common name; one that resets on a new search silently
// discards what the grower already chose, and they only notice at the end.

export interface Chosen {
  /// iNaturalist's taxon id. THE key: two species can share "blackberry", and
  /// the same species found under two searches is one choice, not two.
  taxonId: number;
  name: string;
  scientificName?: string;
  photo?: string | null;
}

/// Add or remove one, by taxon id.
export function toggle(basket: Chosen[], item: Chosen): Chosen[] {
  return basket.some((b) => b.taxonId === item.taxonId)
    ? basket.filter((b) => b.taxonId !== item.taxonId)
    : [...basket, item];
}

export function holds(basket: Chosen[], taxonId: number): boolean {
  return basket.some((b) => b.taxonId === taxonId);
}

/// What a page of results looks like once the basket is taken into account.
/// Kept separate from the fetch so a re-render never re-queries to find out
/// which rows are ticked.
export function markChosen<T extends { taxon_id?: number }>(
  rows: T[], basket: Chosen[],
): (T & { chosen: boolean })[] {
  const ids = new Set(basket.map((b) => b.taxonId));
  return rows.map((r) => ({ ...r, chosen: ids.has(Number(r.taxon_id)) }));
}

/// How many pages a total makes at this size, never fewer than one.
///
/// One rather than zero for an empty result, because "page 1 of 0" is a
/// sentence about nothing and the pager has to render something.
export function pageCount(total: number, size: number): number {
  if (size <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

/// Clamp a page request to what exists. A search that shrinks the result from
/// 2,196 to 13 while the grower is on page 40 must land them on the last page
/// rather than on an empty one.
export function clampPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(1, Math.floor(page) || 1), pageCount(total, size));
}

/// What the add button says. Zero is not a count worth printing, so the caller
/// disables it and this reports the empty case honestly rather than "Add 0".
export function addLabel(basket: Chosen[], where: string): string {
  if (!basket.length) return `Choose some to add to ${where}`;
  const n = basket.length;
  return `Add ${n} ${n === 1 ? "thing" : "things"} to ${where}`;
}

/// What the result line should say, given how the last call went.
///
/// Its own function because the three states got conflated on screen: a call
/// that FAILED rendered "Nothing recorded by that name near here" and "Try a
/// shorter word" underneath its own error, so an unpriced tool read as an
/// empty countryside. Nothing was found because nothing was asked.
export type FinderState =
  | { kind: "busy" }
  | { kind: "failed" }
  | { kind: "empty" }
  | { kind: "results"; shown: number; total: number; page: number; pages: number };

export function finderState(
  { busy, error, rows, total, page, pages }: {
    busy: boolean; error: string; rows: number;
    total: number; page: number; pages: number;
  },
): FinderState {
  // Error first. A failed call knows nothing about how many things are out
  // there, and every other branch here would be guessing on its behalf.
  if (error) return { kind: "failed" };
  if (busy) return { kind: "busy" };
  if (total === 0) return { kind: "empty" };
  return { kind: "results", shown: rows, total, page, pages };
}
