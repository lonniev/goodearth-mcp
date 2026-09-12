// One save at a time.
//
// A tester tapped Add, saw nothing happen, tapped again — and had four copies
// of one task. A disabled button is not enough on its own: React applies the
// `disabled` on its next render, and a second tap can land before that. A flag
// set synchronously, before the first await, is what closes the gap.

/// Run `fn` unless a previous run holding the same flag is still in flight.
/// Resolves true when it ran, false when the call was dropped. The flag is
/// cleared however `fn` ends, so a failed save never locks the form.
export async function once(
  flag: { current: boolean }, fn: () => Promise<void>,
): Promise<boolean> {
  if (flag.current) return false;
  flag.current = true;
  try {
    await fn();
    return true;
  } finally {
    flag.current = false;
  }
}
