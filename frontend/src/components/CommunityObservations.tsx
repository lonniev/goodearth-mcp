// Community Observations, folded: a heading with a [v], one line under it,
// and the picker list behind the [v].
//
// The list is long — hundreds of species, a page of twenty at a time — and on
// Flora, Pests and Fauna it sat open at the foot of every visit. Folded, the
// page ends at what the grower is working on, and the finder is one tap away.
// It is also only asked for once it is opened: the nearby read is a call, and
// a folded list makes none.

import { useState, type ReactNode } from "react";
import type { Target } from "../lib/tour/targets";
import { Glyph, ICON } from "./ui";

export default function CommunityObservations({ blockName, tour, children }: {
  blockName: string;
  /// The name the guided tour points at the heading by.
  tour?: Target;
  /// The finder, drawn only while the fold is open.
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-7">
      <h2 data-tour={tour} className="figure text-[18px] font-semibold">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className="flex min-h-11 items-center gap-2.5 text-left">
          <span className="mr-0.5" aria-hidden="true">🔭</span>
          Community Observations
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-rule text-ink-soft transition-transform ${
            open ? "rotate-180" : ""}`}>
            <Glyph path={ICON.chevron} size={18} />
          </span>
        </button>
      </h2>
      <p className="mb-2.5 text-[12.5px] text-ink-soft">
        What people have recorded near {blockName}, ready to add.
      </p>
      {open && children}
    </section>
  );
}
