// What you just removed, and the way back.
//
// This stands in place of a confirmation dialog, which means it carries the
// dialog's job: saying plainly what happened. A bar that just says "Removed"
// leaves someone wondering whether the row is gone for good — and that
// ambiguity is the one thing that would argue the modal back in. So it names
// the row, and the history beneath says how long each has been recoverable.
//
// Not a modal and not a toast that vanishes on a timer. A timed toast is a
// deadline nobody agreed to; on a tablet in a shed the interruption that made
// you look away is exactly as long as the window you had.

import { useCallback, useEffect, useState } from "react";
import { drop, list, push, since, type UndoEntry } from "../lib/undo";
import { restore } from "../lib/undoRestore";

export default function UndoBar({ kinds, onRestored }: {
  /// Which kinds this page is responsible for. A page shows the removals it
  /// could put back and not the ones it could not — undoing a task from the
  /// Crops page would restore a row that page cannot then show.
  kinds: UndoEntry["kind"][];
  /// Re-read the record. The restore is a write; the list on screen is stale
  /// until the page asks again.
  onRestored: () => void;
}) {
  const [entries, setEntries] = useState<UndoEntry[]>(() => list());
  const [busy, setBusy] = useState("");
  const [failed, setFailed] = useState("");
  const [open, setOpen] = useState(false);

  // The stack is written by the page, not by this component, so it is re-read
  // whenever the page re-renders around a change to it.
  const refresh = useCallback(() => setEntries(list()), []);
  useEffect(() => {
    window.addEventListener(UNDO_EVENT, refresh);
    return () => window.removeEventListener(UNDO_EVENT, refresh);
  }, [refresh]);

  const mine = entries.filter((e) => kinds.includes(e.kind));
  if (!mine.length) return null;

  const [newest, ...older] = mine;

  async function put(e: UndoEntry) {
    setBusy(e.id); setFailed("");
    try {
      await restore(e);
      setEntries(drop(e.id));
      onRestored();
    } catch (err) {
      // The bar said this could be put back. When it cannot, it says so here
      // rather than quietly removing the offer.
      setFailed(`${e.label} could not be put back: ${(err as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mb-3 rounded-md border border-rule border-l-4 border-l-clay bg-panel px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="text-[13px]">
          Removed <b>{newest.label}</b>
          <span className="text-ink-soft"> — it can be put back.</span>
        </span>
        <button
          onClick={() => void put(newest)}
          disabled={!!busy}
          className="min-h-11 shrink-0 rounded-full border-[1.5px] border-ink px-3.5 text-[12.5px] font-semibold disabled:opacity-40 active:bg-ink active:text-paper"
        >
          {busy === newest.id ? "Putting back…" : "↶ Undo"}
        </button>
      </div>

      {failed && <p className="mt-1.5 text-[12px] text-clay">{failed}</p>}

      {older.length > 0 && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="data mt-1 text-[11px] text-ink-soft underline decoration-dotted underline-offset-2"
          >
            {open ? "hide" : `${older.length} more removed`}
          </button>
          {open && (
            <ul className="mt-1.5 space-y-1">
              {older.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span>
                    {e.label}
                    <span className="data ml-1.5 text-[11px] text-ink-soft">{since(e.at)}</span>
                  </span>
                  <button
                    onClick={() => void put(e)}
                    disabled={!!busy}
                    className="min-h-11 shrink-0 rounded-full border border-rule px-3 text-[12px] text-ink-soft disabled:opacity-40 active:bg-band"
                  >
                    {busy === e.id ? "…" : "↶ Undo"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/// Fired when a page pushes onto the stack, so a bar already on screen learns
/// about it. The alternative was threading a setter through every view, which
/// is the shape `avatar.ts` already rejected for the same reason.
export const UNDO_EVENT = "goodearth:undo";

/// Record a removal and tell any bar on screen. Pages call this instead of
/// `undo.push` so the two halves cannot drift apart.
///
/// Synchronous on purpose: a page that removes a row and re-renders in the
/// same tick must find the entry already there, or the bar it just earned
/// appears one interaction late.
export function remembered(e: Parameters<typeof push>[0]) {
  push(e);
  window.dispatchEvent(new Event(UNDO_EVENT));
}
