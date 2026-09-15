// The seed shelf — each lot the grower holds, and what its packet says.
//
// The packet's figures, or the grower's own germination test, as recorded.
// Nothing is supplied from elsewhere and nothing is recommended: what a lot's
// age or germination means for a sowing is the grower's to judge.

import { useState } from "react";
import { makeSeedLot, onHand, type SeedInput, type SeedLot } from "../lib/seeds";
import { Empty, FIELD, ICON, IconButton, TrashGlyph } from "./ui";

export default function SeedShelf({ lots, crops, taxonOf, onSave, onRetire, busy }: {
  lots: SeedLot[];
  /// The ledger's crop names, offered as the phone's own suggestions.
  crops: string[];
  /// The plant a crop name already is on the ledger, so a lot joins it.
  taxonOf: (crop: string) => number | undefined;
  onSave: (lot: SeedLot) => Promise<string | null>;
  onRetire: (lot: SeedLot) => void;
  busy?: boolean;
}) {
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const get = (k: string) => String(f.get(k) ?? "");
    const input: SeedInput = {
      crop: get("crop"), variety: get("variety"),
      daysToMaturity: get("dtm"), germinationPct: get("germ"), testedOn: get("tested"),
      packedFor: get("packed"), quantity: get("qty"), unit: get("unit"),
      source: get("source"), lot: get("lot"),
    };
    const made = makeSeedLot({ ...input, taxonId: taxonOf(input.crop) });
    if (typeof made === "string") { setErr(made); return; }
    setErr("");
    const failed = await onSave(made);
    if (failed) { setErr(failed); return; }
    setSaved(`${made.crop}${made.variety ? ` · ${made.variety}` : ""} — on the shelf.`);
    form.reset();
  }

  return (
    <>
      <form id="new-seed" onSubmit={(e) => void add(e)}
        className="mb-3 rounded-md border border-rule bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[11px] text-ink-soft">
            Crop
            <input name="crop" list="seed-crops" placeholder="Zinnia" className={FIELD} />
            <datalist id="seed-crops">
              {crops.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label className="block text-[11px] text-ink-soft">
            Variety <span className="opacity-60">(optional)</span>
            <input name="variety" placeholder="Benary's Giant" className={FIELD} />
          </label>
          <label className="block text-[11px] text-ink-soft">
            Days to maturity <span className="opacity-60">(optional)</span>
            <input name="dtm" inputMode="numeric" placeholder="75" className={FIELD} />
          </label>
          <label className="block text-[11px] text-ink-soft">
            Germination % <span className="opacity-60">(optional)</span>
            <input name="germ" inputMode="decimal" placeholder="88" className={FIELD} />
          </label>
          <label className="block text-[11px] text-ink-soft">
            Tested on <span className="opacity-60">(optional)</span>
            <input name="tested" type="date" className={FIELD} />
          </label>
          <label className="block text-[11px] text-ink-soft">
            Packed for <span className="opacity-60">(year)</span>
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
          {saved && !err && <p className="text-[12px] text-growth">{saved}</p>}
          <div className="ml-auto">
            <IconButton path={ICON.add} label="Seed lot" form="new-seed"
              title="Add a seed lot" disabled={busy} />
          </div>
        </div>
      </form>

      {lots.length === 0 ? (
        <Empty>No seed lots on this plot yet.</Empty>
      ) : (
        <div className="mb-3 overflow-x-auto rounded-md border border-rule bg-panel [-webkit-overflow-scrolling:touch]">
          <table className="w-full text-[13px]">
            <thead><tr>
              {["Crop", "Variety", "Days", "Germination", "Packed for", "On hand", "From", ""].map((h) => (
                <th key={h} className="data border-b-[1.5px] border-ink px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[.1em] text-ink-soft">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lots.map((l) => (
                <tr key={l.id} className="border-b border-rule last:border-b-0">
                  <td className="px-3 py-2 font-semibold whitespace-nowrap">{l.crop}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.variety ?? ""}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.daysToMaturity ?? ""}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {l.germinationPct != null && <>{l.germinationPct}%</>}
                    {l.testedOn && <span className="data ml-1.5 text-[11px] text-ink-soft">{l.testedOn}</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{l.packedFor ?? ""}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{onHand(l)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-ink-soft">
                    {[l.source, l.lot].filter(Boolean).join(" · ")}
                  </td>
                  <td className="px-1 py-1 text-right">
                    <button onClick={() => onRetire(l)} aria-label={`Remove ${l.crop} seed`}
                      title="Remove this lot"
                      className="inline-flex h-11 w-11 items-center justify-center text-ink-soft active:text-clay">
                      <TrashGlyph />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
