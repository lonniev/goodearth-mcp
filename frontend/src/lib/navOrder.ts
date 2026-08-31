// The rail's order and its collapsed state, remembered.
//
// A grower who checks frost every morning and crops twice a season should not
// have the same rail as one who lives in the crop ledger. The order is theirs,
// so it persists — and like every other preference here it is localStorage
// first, with the Nostr write-through landing alongside the rest.

export const NAV_KEY = "goodearth:nav-order:v1";
export const NAV_COLLAPSED = "goodearth:nav-collapsed:v1";

export function readOrder(): string[] | null {
  try {
    const raw = window.localStorage.getItem(NAV_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : null;
  } catch { return null; }
}

export function writeOrder(keys: string[]): void {
  try { window.localStorage.setItem(NAV_KEY, JSON.stringify(keys)); } catch { /* noop */ }
}

export function readCollapsed(): boolean {
  try { return window.localStorage.getItem(NAV_COLLAPSED) === "1"; } catch { return false; }
}

export function writeCollapsed(v: boolean): void {
  try { window.localStorage.setItem(NAV_COLLAPSED, v ? "1" : "0"); } catch { /* noop */ }
}

/// Apply a saved order to the live item list.
///
/// Reconciles rather than trusts: keys that no longer exist are dropped, and
/// items added since the order was saved are appended rather than vanishing.
/// A stored preference must never be able to hide a view that shipped later.
export function applyOrder<T extends { key: string }>(items: T[], order: string[] | null): T[] {
  if (!order) return items;
  const byKey = new Map(items.map((i) => [i.key, i]));
  const out: T[] = [];
  for (const k of order) {
    const hit = byKey.get(k);
    if (hit) { out.push(hit); byKey.delete(k); }
  }
  return [...out, ...byKey.values()];
}

export function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return arr;
  const c = arr.slice();
  const [item] = c.splice(from, 1);
  c.splice(to, 0, item);
  return c;
}
