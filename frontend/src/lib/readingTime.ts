// When an answer's numbers were actually read.
//
// Normally that is the moment the call was made, and the provenance line says
// "read 9:14" without further comment. But when the weather service is busy,
// the server serves the last reading it holds rather than failing the page —
// and then "read 9:14" is a small lie about figures taken at 6:12.
//
// The server marks those numbers with `as_of` on the provenance entry they
// came from. An answer is only as fresh as its oldest part, so the earliest
// mark wins: a season stitched from a fresh forecast and a stale record is a
// stale answer.

/// Any tool result that carries a provenance block. Deliberately loose — it is
/// a shape a dozen result types happen to share, not a type any of them is.
export interface Provenanced {
  sources?: { as_of?: string }[];
}

export function readingTime(result: Provenanced | null | undefined): Date | null {
  let oldest: Date | null = null;
  for (const s of result?.sources ?? []) {
    if (!s?.as_of) continue;
    const at = new Date(s.as_of);
    // An unparseable mark is no mark. The server already refuses to invent
    // one, and this must not invent one either by rendering "Invalid Date".
    if (Number.isNaN(at.getTime())) continue;
    if (!oldest || at < oldest) oldest = at;
  }
  return oldest;
}
