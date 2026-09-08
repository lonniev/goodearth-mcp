// The submission guard, wired to React. The decisions are in `submit.ts`.

import { useCallback, useRef, useState } from "react";
import { IDLE, failed, landed, newItemId, press, type SubmitState } from "./submit";

export interface Submitter {
  /// True while a write is in flight. Bind it to the control's `disabled`.
  busy: boolean;
  /// Run one write. Ignored outright while another is going.
  ///
  /// The key names the row. It is stable until the write succeeds, so a second
  /// press is an edit of the first row rather than a duplicate beside it.
  run: (write: (key: string) => Promise<unknown>) => void;
}

/// Guard one form's writes.
///
/// `onError` is where a failure goes — every view already holds a message
/// slot, and swallowing the throw to keep the busy flag honest would otherwise
/// lose it. `prefix` matches the ids the record already carries: `pl` for a
/// planting, `wl` for a watch.
export function useSubmit(
  prefix: string, onError?: (message: string) => void,
): Submitter {
  const [busy, setBusy] = useState(false);
  // A ref, not state. Two presses in the same tick both read the state of the
  // render they were dispatched from, so a state flag cannot stop the second —
  // which is the whole fault. The state exists only to redraw the control.
  const at = useRef<SubmitState>(IDLE);

  const run = useCallback((write: (key: string) => Promise<unknown>) => {
    const next = press(at.current, () => newItemId(prefix));
    if (!next) return;
    at.current = next;
    setBusy(true);
    void write(next.key)
      .then(() => { at.current = landed(at.current); })
      .catch((e: unknown) => {
        at.current = failed(at.current);
        onError?.(String(e instanceof Error ? e.message : e));
      })
      .finally(() => setBusy(false));
  }, [prefix, onError]);

  return { busy, run };
}
