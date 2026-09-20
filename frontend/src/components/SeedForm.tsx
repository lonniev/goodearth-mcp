// A packet, as its label reads.
//
// The packet's figures, or the grower's own germination test, as recorded.
// Nothing is supplied from elsewhere and nothing is recommended: what a lot's
// age or germination means for a sowing is the grower's to judge.
//
// It has no plant field. This opens inside a plant's own row on the ledger, so
// the plant is already named and asking again was the redundancy that put the
// shelf in a room of its own.
//
// Each field is as wide as what goes in it. A three-digit day count and a
// four-digit year were being given the same quarter of the row as a variety
// name, which is how a form comes to look like a wall.

import { useRef, useState } from "react";
import { lookUp } from "../lib/growstuff";
import { makeSeedLot, type SeedInput, type SeedLot } from "../lib/seeds";
import QuantityField from "./QuantityField";
import { CELL, ICON, IconButton } from "./ui";

export default function SeedForm({ crop, taxonId, varieties, units, onSave, busy }: {
  /// The plant this packet is seed of, from the row this opened on.
  crop: string;
  taxonId?: number;
  /// Varieties of this plant the grower has already named, offered back.
  ///
  /// Their own words and no catalogue's: Growstuff's search cannot be trusted
  /// for this — asked for "kale" it answers with calendula and valerian too,
  /// and a list that offers those under Blueberry is worse than a blank box.
  varieties?: readonly string[];
  /// Units this grower has used, from their own lots.
  units?: readonly string[];
  onSave: (lot: SeedLot) => Promise<string | null>;
  busy?: boolean;
}) {
  const [err, setErr] = useState("");
  /// Days to maturity is the one field a lookup can fill, so it is the one
  /// field this form holds rather than reads at submit.
  const [dtm, setDtm] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
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
      packedFor: get("packed"), quantity: qty, unit,
      source: get("source"), lot: get("lot"),
    };
    const made = makeSeedLot({ ...input, taxonId });
    if (typeof made === "string") { setErr(made); return; }
    setErr("");
    const failed = await onSave(made);
    if (failed) { setErr(failed); return; }
    el.reset();
    // A reset does not clear a held field.
    setDtm(""); setQty(""); setUnit(""); setNothingFound(false);
  }

  return (
    <form id="new-seed" ref={form} onSubmit={(e) => void add(e)}
      className="mt-2 rounded-md border border-rule bg-panel p-3">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5">
        <label className="block min-w-[10rem] flex-1 text-[11px] text-ink-soft">
          Variety
          <input name="variety" list="seed-varieties" placeholder="Benary's Giant"
            className={CELL} />
          {varieties?.length ? (
            <datalist id="seed-varieties">
              {varieties.map((v) => <option key={v} value={v} />)}
            </datalist>
          ) : null}
        </label>

        {/* The button is a sibling of the label, never inside it: a tap
            inside a label can be handed to the label's own input. */}
        <span className="block w-[7.5rem] text-[11px] text-ink-soft">
          <span className="flex items-center gap-1.5">
            <label htmlFor="seed-dtm">Days</label>
            <button type="button" onClick={() => void look()} disabled={looking}
              className="ml-auto min-h-9 underline decoration-dotted underline-offset-2 disabled:opacity-40">
              {looking ? "…" : "Look it up"}
            </button>
          </span>
          <input id="seed-dtm" name="dtm" inputMode="numeric" placeholder="75" className={CELL}
            value={dtm} onChange={(e) => { setDtm(e.target.value); setNothingFound(false); }} />
        </span>
        {nothingFound && !looking && (
          <span className="text-[11px] text-ink-soft opacity-60">nothing published</span>
        )}

        <label className="block w-[6.5rem] text-[11px] text-ink-soft">
          Germination %
          <input name="germ" type="number" min={0} max={100} step={1} placeholder="88"
            className={CELL} />
        </label>
        {/* Named in full, because "Tested on" beside a date said nothing about
            WHAT was tested — the germination above it, by the seller or by the
            grower. */}
        <label className="block w-[10rem] text-[11px] text-ink-soft">
          Germination tested
          <input name="tested" type="date" className={CELL} />
        </label>

        <label className="block w-[6.5rem] text-[11px] text-ink-soft">
          Packed for
          <input name="packed" type="number" min={1900} max={2200} step={1}
            placeholder={String(new Date().getFullYear())} className={CELL} />
        </label>

        <span className="w-[11rem]">
          <QuantityField id="seed-qty" label="Inventory count"
            amount={qty} unit={unit} units={units}
            onAmount={setQty} onUnit={setUnit} />
        </span>

        <label className="block w-[9rem] text-[11px] text-ink-soft">
          Supplier
          <input name="source" placeholder="a seed house" className={CELL} />
        </label>
        <label className="block w-[8rem] text-[11px] text-ink-soft">
          Supplier&rsquo;s lot
          <input name="lot" placeholder="Z-114" className={CELL} />
        </label>
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
