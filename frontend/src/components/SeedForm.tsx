// A packet, as its label reads.
//
// The packet's figures, or the grower's own germination test, as recorded.
// Nothing is supplied from elsewhere and nothing is recommended: what a lot's
// age or germination means for a sowing is the grower's to judge.
//
// It has no crop field. This opens inside a plant's own row on the ledger, so
// the plant is already named and asking again was the redundancy that put the
// shelf in a room of its own.

import { useRef, useState } from "react";
import { lookUp } from "../lib/growstuff";
import { makeSeedLot, type SeedInput, type SeedLot } from "../lib/seeds";
import { FIELD, ICON, IconButton } from "./ui";

export default function SeedForm({ crop, taxonId, onSave, busy }: {
  /// The plant this packet is seed of, from the row this opened on.
  crop: string;
  taxonId?: number;
  onSave: (lot: SeedLot) => Promise<string | null>;
  busy?: boolean;
}) {
  const [err, setErr] = useState("");
  /// Days to maturity is the one field a lookup can fill, so it is the one
  /// field this form holds rather than reads at submit.
  const [dtm, setDtm] = useState("");
  const [looking, setLooking] = useState(false);
  const [nothingFound, setNothingFound] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  /// Ask the growers' commons what this crop takes, from the plant this row is
  /// on and the variety already typed. A miss leaves the field alone.
  async function look() {
    setErr(""); setNothingFound(false); setLooking(true);
    try {
      const f = form.current ? new FormData(form.current) : null;
      const found = await lookUp({ crop, variety: String(f?.get("variety") ?? "").trim() });
      if (found?.daysToMaturity != null) setDtm(String(found.daysToMaturity));
      else setNothingFound(true);
    } finally {
      setLooking(false);
    }
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    const f = new FormData(el);
    const get = (k: string) => String(f.get(k) ?? "");
    const input: SeedInput = {
      crop, variety: get("variety"),
      daysToMaturity: dtm, germinationPct: get("germ"), testedOn: get("tested"),
      packedFor: get("packed"), quantity: get("qty"), unit: get("unit"),
      source: get("source"), lot: get("lot"),
    };
    const made = makeSeedLot({ ...input, taxonId });
    if (typeof made === "string") { setErr(made); return; }
    setErr("");
    const failed = await onSave(made);
    if (failed) { setErr(failed); return; }
    el.reset();
    // A reset does not clear a held field.
    setDtm(""); setNothingFound(false);
  }

  return (
    <form id="new-seed" ref={form} onSubmit={(e) => void add(e)}
      className="mt-2 rounded-md border border-rule bg-panel p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-[11px] text-ink-soft">
          Variety
          <input name="variety" placeholder="Benary's Giant" className={FIELD} />
        </label>
        {/* The button is a sibling of the label, never inside it: a tap
            inside a label can be handed to the label's own input. */}
        <div className="block text-[11px] text-ink-soft">
          <div className="flex items-center gap-2">
            <label htmlFor="seed-dtm">Days to maturity</label>
            <button type="button" onClick={() => void look()} disabled={looking}
              className="ml-auto min-h-9 underline decoration-dotted underline-offset-2 disabled:opacity-40">
              {looking ? "Looking…" : "Look it up"}
            </button>
            {nothingFound && !looking && <span className="opacity-60">nothing published</span>}
          </div>
          <input id="seed-dtm" name="dtm" inputMode="numeric" placeholder="75" className={FIELD}
            value={dtm} onChange={(e) => { setDtm(e.target.value); setNothingFound(false); }} />
        </div>
        <label className="block text-[11px] text-ink-soft">
          Germination %
          <input name="germ" inputMode="decimal" placeholder="88" className={FIELD} />
        </label>
        <label className="block text-[11px] text-ink-soft">
          Tested on
          <input name="tested" type="date" className={FIELD} />
        </label>
        <label className="block text-[11px] text-ink-soft">
          Packed for
          <input name="packed" inputMode="numeric" placeholder={String(new Date().getFullYear())} className={FIELD} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px] text-ink-soft">
            On hand
            <input name="qty" inputMode="decimal" placeholder="500" className={FIELD} />
          </label>
          <label className="block text-[11px] text-ink-soft">
            Unit
            <input name="unit" placeholder="seeds, g, oz" className={FIELD} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px] text-ink-soft">
            From
            <input name="source" placeholder="supplier" className={FIELD} />
          </label>
          <label className="block text-[11px] text-ink-soft">
            Lot
            <input name="lot" placeholder="Z-114" className={FIELD} />
          </label>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {err && <p className="text-[12px] text-clay">{err}</p>}
        <div className="ml-auto">
          <IconButton path={ICON.add} label="Seed lot" form="new-seed"
            title="Add a seed lot" disabled={busy} />
        </div>
      </div>
    </form>
  );
}
