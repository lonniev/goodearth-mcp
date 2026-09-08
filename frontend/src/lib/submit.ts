// One press, one row.
//
// A grower pressed save on the planting form and got four identical Winter
// wheat rows, all set out 2026-09-05. Two things had to be true for that, and
// fixing either alone leaves the other:
//
//  * nothing disabled the control while the write was in flight, and the
//    handler was `void store(made)` — fire-and-forget, so a second press
//    started a second write beside the first rather than waiting on it;
//  * every press minted a fresh `pl-<timestamp>-<random>` id, so the four
//    writes named four different rows. `save_items` upserts on
//    `(npub, item_id)` and would have collapsed them into one row written four
//    times — it was never given the chance.
//
// The id is the real fix. A disabled control loses the race on a slow link and
// does nothing about a write that arrives twice through a retry. An id that
// stays put for as long as the draft does means the second write lands ON the
// first row. The in-flight flag is worth having as well, because it keeps the
// grower from paying two fares for one intention.
//
// The key rotates only after a write SUCCEEDS. A failed write leaves it in
// place: pressing again then edits the row that was going to be written rather
// than adding a second one beside it.
//
// Baskets are not this. `saveMany` writes several rows under one call and one
// fare, so no single key could name them; those keep the ids their makers
// mint and need only the in-flight guard the views already have.

/// A fresh id for a record row.
///
/// Five makers each held their own copy of this expression, and all five drew
/// four decimal digits from `Math.random`. Ten thousand values is not enough:
/// minting five hundred ids in one millisecond — which is what a basket does —
/// produced 489 distinct ones in a test written to assert it would not. The
/// duplicates are not harmless, because `save_items` upserts on
/// `(npub, item_id)`: a collision does not fail, it QUIETLY OVERWRITES the row
/// that got there first, and the grower is left with a basket of six that
/// saved five.
///
/// Thirty-two bits from the platform's CSPRNG instead. The moment stays in the
/// id because a row's id is read by people looking at a record.
export function newItemId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomSuffix()}`;
}

function randomSuffix(): string {
  const g = globalThis.crypto;
  if (g?.getRandomValues) {
    return [...g.getRandomValues(new Uint8Array(4))]
      .map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Nothing shipping lacks web crypto. This keeps a test runner or an old
  // embedded view working rather than throwing, and it is still far wider than
  // the four digits that caused the trouble.
  return Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
}

/// Name the row this submission will write.
///
/// The makers mint an id so a validated row is complete on the spot. That id
/// is a fresh one per call, which is what turned four presses into four rows,
/// so the submitter's key replaces it and only the first press of a draft
/// mints anything at all.
export function withId<T extends { id: string }>(row: T, key: string): T {
  return { ...row, id: key };
}

export interface SubmitState {
  /// The row this submission will name. Empty until the first press.
  key: string;
  inFlight: boolean;
}

export const IDLE: SubmitState = { key: "", inFlight: false };

/// A press. Returns the state to move to, or null when the press is ignored
/// because a write is already going.
export function press(s: SubmitState, mint: () => string): SubmitState | null {
  if (s.inFlight) return null;
  return { key: s.key || mint(), inFlight: true };
}

/// The write landed. The next press is a different row.
export function landed(_s: SubmitState): SubmitState {
  return IDLE;
}

/// The write failed. The key stays.
export function failed(s: SubmitState): SubmitState {
  return { key: s.key, inFlight: false };
}
