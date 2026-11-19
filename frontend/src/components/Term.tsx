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
// itself once there has been time to read it (`dwellMs`, in the web package).

import type { ReactNode } from "react";
import { Term as Disclosure } from "@tollbooth-dpyc/web/react";
import { define } from "../lib/glossary";

// The mechanics described above live in the shared web package's `Term` now
// (the lift, the outside press, Escape, the reading-time decay), so every site
// that defines its words behaves the same. What stays here is Good Earth's:
// its glossary, and its look.
const LOOK = {
  word: "cursor-help border-b border-dotted border-ink-soft/70 text-left",
  badge: "ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-rule text-[0.5625rem] leading-none text-ink-soft align-middle",
  // It resets what it could inherit, because it is a child of whatever it
  // explains: inside a table header it took the header's nowrap and monospace.
  panel: "mt-1 w-64 rounded-md border border-rule bg-paper p-2.5 text-[0.75rem] leading-snug text-ink shadow-lg [font-family:var(--font-body)]",
  extra: "mt-1.5",
};

export default function Term({ label, of, children, align = "right" }: {
  /// Which edge of the word the panel lines up with. A word near the left of
  /// the screen needs "left", or a right-anchored panel runs off that side.
  align?: "left" | "right";
  /// The word being defined. Omit for a bare ⓘ beside a label that is
  /// already there — a column header, say, which cannot hold a second word.
  label?: ReactNode;
  /// A key in `lib/glossary`. Preferred over prose children, so a word is
  /// explained the same way on every page that uses it.
  of?: string;
  /// What this page adds to the shared meaning ("left blank it takes
  /// Frogdale Farm's 50 °F" belongs on the form that has the blank).
  children?: ReactNode;
}) {
  const entry = of ? define(of) : undefined;
  return (
    <Disclosure label={label} said={entry?.said} align={align} badgeLabel={entry?.term} classNames={LOOK}>
      {children}
    </Disclosure>
  );
}
