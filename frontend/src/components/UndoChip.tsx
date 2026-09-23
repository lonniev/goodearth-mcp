// What you just removed, and the way back — one mark in the top row.
//
// This stands in place of a confirmation dialog, which means it carries the
// dialog's job: saying plainly what happened. So the panel names each row it
// would put back, rather than offering a bare "Undo" and leaving someone
// wondering what.
//
// A MARK, not a bar. It was a full row under the header on four pages, and on
// nearly every visit it was offering something nobody wanted back. It renders
// nothing at all when the stack is empty, which is what lets it be an icon
// with no count beside it: its being there is the whole signal.
//
// SCOPED TO THE GROUND, not to the page. `UndoEntry` has always carried
// `blockId`. What it no longer filters on is KIND — in the header there is no
// page to scope to, and a grower who deleted a task and walked to Crops should
// still be able to take it back. That only holds because a restore now says so
// (`RESTORED_EVENT`) and whatever page is open re-reads.
//
// Still not a toast that vanishes on a timer. A timed toast is a deadline
// nobody agreed to; on a tablet in a shed the interruption that made you look
// away is exactly as long as the window you had.

import { useCallback, useEffect, useRef, useState } from "react";
import { drop, list, since, type UndoEntry } from "../lib/undo";
import { RESTORED_EVENT, UNDO_EVENT, restored } from "../lib/undoEvents";
import { restore } from "../lib/undoRestore";
import { Glyph, ICON } from "./ui";

export default function UndoChip({ blockId }: {
  /// The ground on screen. Removals from other blocks are not this mark's to
  /// offer back: restoring one would write a row onto ground nobody is
  /// looking at.
  blockId: string;
}) {
  const [entries, setEntries] = useState<UndoEntry[]>(() => list());
  const [busy, setBusy] = useState("");
  const [failed, setFailed] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // The stack is written by the pages, not by this component.
  const refresh = useCallback(() => setEntries(list()), []);
  useEffect(() => {
    window.addEventListener(UNDO_EVENT, refresh);
    window.addEventListener(RESTORED_EVENT, refresh);
    return () => {
      window.removeEventListener(UNDO_EVENT, refresh);
      window.removeEventListener(RESTORED_EVENT, refresh);
    };
  }, [refresh]);

  // Dismissal is RegionPicker's, deliberately: same ref, same outside click,
  // same file to look at when it needs changing.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); setFailed(""); }
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const mine = entries.filter((e) => e.blockId === blockId);
  if (!mine.length) return null;

  async function put(e: UndoEntry) {
    setBusy(e.id); setFailed("");
    try {
      await restore(e);
      setEntries(drop(e.id));
      // Whatever page is open re-reads. Without this the row is back in the
      // record and absent from the screen, which reads as the undo failing.
      restored();
    } catch (err) {
      // The mark said this could be put back. When it cannot, it says so
      // rather than quietly removing the offer.
      setFailed(`${e.label} could not be put back: ${(err as Error).message}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={`Put back — ${mine.length} removed`}
        aria-label={`Put back — ${mine.length} removed`}
        className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-rule text-ink-soft active:bg-band"
      >
        <Glyph path={ICON.undo} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-rule bg-panel p-2 shadow-lg">
          <ul>
            {mine.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => void put(e)}
                  disabled={!!busy}
                  className="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-[13px] disabled:opacity-40 active:bg-band"
                >
                  <span className="flex-1 truncate">{e.label}</span>
                  <span className="data shrink-0 text-[11px] text-ink-soft">
                    {busy === e.id ? "…" : since(e.at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {failed && <p className="px-2 pt-1 text-[12px] text-clay">{failed}</p>}
        </div>
      )}
    </div>
  );
}
