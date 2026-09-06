// Rearranging a row of chiclets, as arithmetic.
//
// The DOM glue — pointer capture, hit-testing, the threshold that tells a drag
// from a tap — lives in the component. What can be got wrong silently lives
// here, where a test can reach it: an item moved to the wrong index, a saved
// order that quietly drops a measure added later, a drop position computed off
// the wrong edge.

/// Move one item, returning a new list.
///
/// `to` is the index the item should END UP at, counted in the final list.
/// That is the useful definition and not the obvious one: splicing out first
/// shifts every later index down by one, so a naive implementation moves an
/// item one place short whenever it travels right.
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return [...list];
  if (from < 0 || from >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

/// Which slot a pointer at `x` is over, given each chiclet's centre.
///
/// Nearest centre rather than "inside a box", because the gaps between
/// chiclets are not nobody's land — a finger between two of them is closer to
/// one, and a drag that stalls in a gap reads as broken.
export function dropIndex(centers: number[], x: number): number {
  if (!centers.length) return 0;
  let best = 0;
  let dist = Math.abs(x - centers[0]);
  for (let i = 1; i < centers.length; i++) {
    const d = Math.abs(x - centers[i]);
    if (d < dist) { dist = d; best = i; }
  }
  return best;
}

/// The order to actually use, given what was saved and what exists now.
///
/// **A saved order must never decide what exists.** Humidity was added after
/// people had already arranged their charts; taking the saved list as the
/// whole truth would have hidden it from everyone who had ever dragged a
/// chiclet, with no error and nothing to notice. So the saved order sorts what
/// it knows and anything new joins the end.
///
/// It cuts the other way too: a measure that is removed leaves a name behind
/// in somebody's saved order, and that name must not survive as a gap.
export function mergeOrder(saved: string[], all: string[]): string[] {
  const known = new Set(all);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of saved) {
    if (known.has(k) && !seen.has(k)) { out.push(k); seen.add(k); }
  }
  for (const k of all) {
    if (!seen.has(k)) { out.push(k); seen.add(k); }
  }
  return out;
}
