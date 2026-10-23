// A page's add form, folded to one line until it is wanted.
//
// Flora, Pests, Fauna, Tasks and Field Reports each keep their add form at the
// top, above the record it feeds — but a form nobody is using took most of a
// phone screen before the record began. Folded, it is a [+] and the form's
// name. The form stays mounted while folded, so a half-written entry survives
// a fold, and anything that fills it from elsewhere on the page — a row's
// "plant again", a tapped catalogue stage, the guided tour — opens it first.

import type { ReactNode } from "react";
import { flushSync } from "react-dom";

export default function AddPanel({ label, open, onOpen, aside, children }: {
  /// The form's name, beside the [+]. It names the thing added.
  label: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  /// Anything that belongs on the toggle's row, at its far end.
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className={`flex items-center justify-between gap-2 ${open ? "mb-2" : "mb-4"}`}>
        <button type="button" onClick={() => onOpen(!open)} aria-expanded={open}
          title={open ? `Fold ${label.toLowerCase()}` : `Open ${label.toLowerCase()}`}
          className="flex min-h-11 items-center gap-2.5 rounded-full pr-3 text-left active:bg-band">
          <span aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper">
            <svg viewBox="0 0 24 24" className="inline-block size-5 fill-current">
              <path d={open ? "M5 11h14v2H5z" : "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"} />
            </svg>
          </span>
          <span className="figure text-[17px] font-semibold">{label}</span>
        </button>
        {aside}
      </div>
      <div hidden={!open}>{children}</div>
    </>
  );
}

/// Open a folded form and bring it into view, for anything that fills it from
/// further down the page. Flushed first, because a folded form has no box to
/// scroll to until the fold is gone.
export function showForm(
  onOpen: (open: boolean) => void, id: string, block: ScrollLogicalPosition = "start",
) {
  flushSync(() => onOpen(true));
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block });
}
