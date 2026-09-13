// A word the page uses, and what it means, revealed on demand.
//
// Doctrine is that explanations live in a tooltip and not on the page. The
// `title` attribute is not that tooltip: it needs a hovering mouse, and this
// site is read on a tablet in a shed, where the definition simply never
// appears. So this is a real disclosure — tap the word, get the sentence, tap
// again or press Escape and it is gone.
//
// It exists so that "biofix", "threshold" and "base temperature" can stay on
// screen as the single words they are, instead of dragging a paragraph of
// explanation onto a dashboard behind them.
//
// IT MUST ALWAYS GO AWAY, and it must open when tapped. It toggled on a click,
// the click the iPad drops (the plant picker, then the chart's gesture hint
// that stuck on screen), and closed on an outside mousedown. Now it toggles
// when the finger lifts on it, closes on any outside press, on Escape, and by
// itself once there has been time to read it (`lib/dwell`).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { dwellMs } from "../lib/dwell";
import { define } from "../lib/glossary";

export default function Term({ label, of, children }: {
  /// The word being defined. Omit for a bare ⓘ beside a label that is
  /// already there — a column header, say, which cannot hold a second word.
  label?: ReactNode;
  /// A key in `lib/glossary`. Preferred over prose children: the definitions
  /// used to live as JSX inside whichever view happened to need one, so "base
  /// temperature" was explained on the Crops page and nowhere else, and the
  /// glossary would have been a second copy to drift from.
  of?: string;
  children?: ReactNode;
}) {
  // The shared definition first, then whatever this page adds to it. Both,
  // because the general meaning belongs in one place and "left blank it takes
  // Frogdale Farm's 50 °F" belongs on the form that has the blank.
  const entry = of ? define(of) : undefined;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  /// A lift already toggled it, so the click that may follow must not undo it.
  const toggledByLift = useRef(false);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    // Gone once it has had time to be read — never left up for good.
    const decay = window.setTimeout(() => setOpen(false), dwellMs(panel.current?.textContent ?? ""));
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      window.clearTimeout(decay);
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span ref={box} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        // Its presses are its own: a Term in a sortable table header must not
        // sort the column, or start any gesture on what it sits in.
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => {
          e.stopPropagation();
          toggledByLift.current = true;
          setOpen((v) => !v);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (toggledByLift.current) { toggledByLift.current = false; return; }
          setOpen((v) => !v);   // a keyboard's Enter or Space
        }}
        className={label
          ? "cursor-help border-b border-dotted border-ink-soft/70 text-left"
          : "ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-rule text-[9px] leading-none text-ink-soft align-middle"}
      >
        {/* The content has to agree with the styling above, and it did not:
          * with no `label` the class is a 16px circle — the (i) badge every
          * other explainer in the app uses — while the content fell through to
          * the glossary's own term. So `<Term of="base_temp">` rendered the
          * words "Base temperature" inside a four-by-four badge, overflowing
          * onto the field label beside it. A tester saw it on the Pests form
          * and read it as two labels printed on top of each other. */}
        {label ?? "i"}
      </button>
      {open && (
        <span
          ref={panel}
          role="tooltip"
          // Right-anchored: these sit in table headers and form labels near
          // the right edge, where a left-anchored panel runs off the screen.
          //
          // It resets everything it could inherit, because it is a child of
          // whatever it explains. Inside a table header it took the header's
          // `whitespace-nowrap` and monospace, and ran as one line across the
          // table. So: wrap, the body face, and never wider than the screen.
          className="absolute top-full right-0 z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] whitespace-normal break-words rounded-md border border-rule bg-paper p-2.5 text-left text-[12px] leading-snug font-normal normal-case tracking-normal text-ink shadow-lg [font-family:var(--font-body)]"
        >
          {entry && <span className="block">{entry.said}</span>}
          {children && (
            <span className={entry ? "mt-1.5 block" : undefined}>{children}</span>
          )}
        </span>
      )}
    </span>
  );
}
