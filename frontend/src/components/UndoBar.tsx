// What you just removed, and the way back.
//
// This stands in place of a confirmation dialog, which means it carries the
// dialog's job: saying plainly what happened. A control that just says "Undo"
// leaves someone wondering what — and that ambiguity is the one thing that
// would argue the modal back in. So it names the row it would put back.
//
// A CHIP, not a banner. It used to be a full-width bar with its own border
// standing above the form, which is a lot of room for an offer most people
// never take, on the page they came to add something to.
//
// SCOPED TO THE GROUND. `UndoEntry` has carried `blockId` all along and this
// filtered only on kind, so a crop removed on one block offered itself back
// on every other one — an undo for a row that page could not even show.
//
// Still not a toast that vanishes on a timer. A timed toast is a deadline
// nobody agreed to; on a tablet in a shed the interruption that made you look
// away is exactly as long as the window you had.

import { useCallback, useEffect, useState } from "react";

//: Material Design "undo". A glyph rather than the "\u21b6" arrow the button
//: used to carry, which renders as a box in more fonts than it does not.
const UNDO_PATH = "M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 "
  + "3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z";
import { drop, list, offerable, push, since, type UndoEntry } from "../lib/undo";
import { restore } from "../lib/undoRestore";

export default function UndoBar({ kinds, blockId, onRestored }: {
  /// Which kinds this page is responsible for. A page shows the removals it
  /// could put back and not the ones it could not — undoing a task from the
  /// Crops page would restore a row that page cannot then show.
  kinds: UndoEntry["kind"][];
  /// The ground this page is scoped to. Removals from other blocks are not
  /// this page's to offer back: restoring one would write a row the reader is
  /// not looking at, onto ground they may not have open.
  blockId: string;
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

  const mine = offerable(entries, kinds, blockId);
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
    <div className="mb-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          onClick={() => void put(newest)}
          disabled={!!busy}
          title={`Put ${newest.label} back`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rule px-3 text-[12px] text-ink-soft disabled:opacity-40 active:bg-band"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d={UNDO_PATH} />
          </svg>
          {busy === newest.id ? "Putting back…" : <>Undo <b className="font-semibold text-ink">{newest.label}</b></>}
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
                    {busy === e.id ? "…" : "Undo"}
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
