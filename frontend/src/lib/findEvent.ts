// Find a tracked event on the season chart by what the grower types.
//
// "muskra" → "Muskrats come out of hibernation", and the chart recentres on
// it. A season carries dozens of marks and most sit far from today, so a name
// is the quickest way to one.
//
// Pure, so the choice between several matches is tested rather than seen:
// a match at the START of a word beats one inside a word ("rat" finds Rats
// before Muskrats), and among equals the one nearest today wins — a grower
// typing a name almost always means this year's next one.

export const MIN_QUERY = 2;

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function findEvent<T extends { label: string; index: number }>(
  flags: readonly T[], query: string, today: number,
): T | null {
  const q = fold(query);
  if (q.length < MIN_QUERY) return null;
  let best: { f: T; rank: number; dist: number } | null = null;
  for (const f of flags) {
    const label = fold(f.label);
    const at = label.indexOf(q);
    if (at < 0) continue;
    const wordStart = at === 0 || /[\s\-·(]/.test(label[at - 1]);
    const rank = wordStart ? 0 : 1;
    const dist = Math.abs(f.index - today);
    if (!best || rank < best.rank || (rank === best.rank && dist < best.dist)) {
      best = { f, rank, dist };
    }
  }
  return best?.f ?? null;
}
