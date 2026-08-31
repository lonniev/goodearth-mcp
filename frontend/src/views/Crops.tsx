// Crops — the block's plantings and where each one stands.
//
// The ledger is one priced call for the whole block, so adding a ninth
// planting costs arithmetic rather than another round trip. The form validates
// the way the server does, so a grower is corrected here rather than by a
// failed paid call.

import { useCallback, useEffect, useState } from "react";
import CropLedger from "../components/CropLedger";
import Provenance from "../components/Provenance";
import { cropGddStatus, type CropLedgerResult } from "../lib/mcp";
import {
  CROP_PRESETS, deletePlanting, listPlantings, makePlanting, savePlanting, type Planting,
} from "../lib/plantings";
import type { SavedRegion } from "../lib/regions";

export default function Crops({
  region, onCost,
}: {
  region: SavedRegion;
  onCost: (sats: number) => void;
}) {
  const [plantings, setPlantings] = useState<Planting[]>(() => listPlantings(region.id));
  const [ledger, setLedger] = useState<CropLedgerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [formErr, setFormErr] = useState("");

  useEffect(() => { setPlantings(listPlantings(region.id)); }, [region.id]);

  const run = useCallback(async (list: Planting[]) => {
    if (!list.length) { setLedger(null); return; }
    setBusy(true); setError("");
    try {
      const r = await cropGddStatus(
        region.region,
        list.map((p) => ({
          crop: p.crop, gdd_target: p.gddTarget, set_out: p.setOut,
          ...(p.baseTempF != null ? { base_temp: p.baseTempF } : {}),
        })),
        region.baseTempF,
      );
      if (!r.success) { setError(r.error || "The ledger could not be read."); return; }
      setLedger(r); setRanAt(new Date());
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }, [region]);

  useEffect(() => { void run(plantings); }, [run, plantings]);

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const base = f.get("base") ? Number(f.get("base")) : undefined;
    const made = makePlanting(
      String(f.get("crop") ?? ""), Number(f.get("target")),
      String(f.get("setout") ?? ""), region.id, base,
    );
    if (typeof made === "string") { setFormErr(made); return; }
    setFormErr("");
    setPlantings(savePlanting(made).filter((p) => p.regionId === region.id));
    e.currentTarget.reset();
  }

  const remove = (id: string) =>
    setPlantings(deletePlanting(id).filter((p) => p.regionId === region.id));

  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">Crops</h1>
        <span className="text-[13px] text-ink-soft">{region.name}</span>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-clay/30 bg-clay/10 p-3 text-[13px] text-clay">{error}</div>
      )}

      <h2 className="figure mb-2.5 flex items-baseline gap-2.5 text-[18px] font-semibold">
        Crop ledger
        {plantings.length > 0 && (
          <Provenance tool="goodearth_crop_gdd_status" at={ranAt} onCost={onCost} />
        )}
      </h2>

      {ledger?.summary && (
        <p className="mb-2.5 text-[13px] text-ink-soft">
          {ledger.summary}
          {ledger.first_frost && (
            <> Median first frost {new Date(ledger.first_frost.median + "T12:00:00")
              .toLocaleDateString("en-US", { month: "short", day: "numeric" })}.</>
          )}
        </p>
      )}

      {busy && !ledger ? (
        <div className="rounded-md border border-rule bg-panel p-8 text-center text-[13px] text-ink-soft">
          Reading the ledger…
        </div>
      ) : ledger ? (
        <CropLedger rows={ledger.plantings} plantings={plantings} onDelete={remove} />
      ) : (
        <div className="rounded-md border border-dashed border-rule bg-panel/60 p-6 text-[13px] text-ink-soft">
          No plantings on {region.name} yet. Add one below and the ledger will
          tell you where it stands and whether it finishes before frost.
        </div>
      )}

      {/* ── Add a planting ─────────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-2.5 text-[18px] font-semibold">Add a planting</h2>
      <form onSubmit={add} className="rounded-md border border-rule bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[11px] text-ink-soft">
            Crop
            <input name="crop" list="ge-crop-presets" placeholder="Zinnia · succession 4"
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] text-ink focus:border-honey focus:outline-none" />
          </label>
          <label className="block text-[11px] text-ink-soft">
            GDD target
            <input name="target" inputMode="numeric" placeholder="780"
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] text-ink focus:border-honey focus:outline-none" />
          </label>
          <label className="block text-[11px] text-ink-soft">
            Set out
            <input name="setout" type="date"
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] text-ink focus:border-honey focus:outline-none" />
          </label>
          <label className="block text-[11px] text-ink-soft">
            Base °F <span className="opacity-60">(optional)</span>
            <input name="base" inputMode="numeric" placeholder={String(region.baseTempF)}
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] text-ink focus:border-honey focus:outline-none" />
          </label>
        </div>

        <datalist id="ge-crop-presets">
          {CROP_PRESETS.map((c) => <option key={c.crop} value={c.crop} />)}
        </datalist>

        {formErr && <p className="mt-2 text-[12px] text-clay">{formErr}</p>}

        <button className="mt-3 min-h-11 rounded border-[1.5px] border-ink px-4 text-[13px] font-semibold active:bg-ink active:text-paper">
          Add to the ledger
        </button>
      </form>

      <div className="mt-5">
        <span className="eyebrow">Typical targets to start from</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CROP_PRESETS.map((c) => (
            <span key={c.crop}
              className="data rounded-full border border-rule bg-panel px-2.5 py-1 text-[11px] text-ink-soft"
              title={`${c.gddTarget} GDD ${c.note}, base ${c.baseTempF}°F`}>
              {c.crop} {c.gddTarget}
            </span>
          ))}
        </div>
        <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-ink-soft">
          These are typical extension figures, not promises. Every farm runs a
          little different — field reports are what teach this block its own.
        </p>
      </div>
    </>
  );
}
