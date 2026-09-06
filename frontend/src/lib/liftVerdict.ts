// When the one-time lift of legacy blocks should stop trying.
//
// Its own module, with no imports, so a test can reach it. The decision it
// makes is small and was wrong in a way that cost a request on every single
// page load — exactly the shape that hides inside a longer function.

/// What to do after a pass at lifting the blocks.
///
/// - `done` — every block is on the record. Mark it and drop the local copy.
/// - `settled` — the rest were refused for a reason that will not change, so
///   stop trying, and KEEP the local copy: a refused block is one this browser
///   is still the only holder of, and forgetting it would be losing it.
/// - `retry` — something transient. Come back to it.
///
/// The bug this replaces: only `landed === total` stopped the lift, and a name
/// clash could never be counted as landed, so the pass re-ran on EVERY load
/// for as long as the clash existed. The branch meant to catch it tested an
/// `error_code` that nothing has ever sent.
export function liftVerdict(
  landed: number, refused: number, total: number,
): "done" | "settled" | "retry" {
  if (total > 0 && landed === total) return "done";
  if (total > 0 && landed + refused === total) return "settled";
  return "retry";
}
