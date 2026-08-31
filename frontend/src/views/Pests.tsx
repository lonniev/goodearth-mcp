// Pests — where each model's degree-day stages stand on this ground.
//
// The answer a grower acts on is not the whole table, it is which rows are
// worth walking this week — so that leads, and the detail follows.

import { useCallback, useEffect, useState } from "react";
import Provenance from "../components/Provenance";
import { pestThreshold, type PestWindowResult } from "../lib/mcp";
import {
  deletePest, listPests, makePest, PEST_STARTERS, savePest, type SavedPest,
} from "../lib/pestModels";
import type { SavedRegion } from "../lib/regions";

const d = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function Pests({
  region, onCost,
}: { region: SavedRegion; onCost: (sats: number) => void }) {
  const [models, setModels] = useState<SavedPest[]>(() => listPests(region.id));
  const [data, setData] = useState<PestWindowResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [formErr, setFormErr] = useState("");

  useEffect(() => { setModels(listPests(region.id)); }, [region.id]);

  const run = useCallback(async (list: SavedPest[]) => {
    if (!list.length) { setData(null); return; }
    setBusy(true); setError("");
    try {
      const r = await pestThreshold(region.region, list.map(({ id: _id, regionId: _r, ...m }) => m));
      if (!r.success) { setError(r.error || "The pest models could not be read."); return; }
      setData(r); setRanAt(new Date());
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }, [region]);

  useEffect(() => { void run(models); }, [run, models]);

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const made = makePest(
      String(f.get("pest") ?? ""), Number(f.get("base") || 50),
      String(f.get("stages") ?? ""), region.id,
      String(f.get("biofix") ?? "") || undefined,
    );
    if (typeof made === "string") { setFormErr(made); return; }
    setFormErr("");
    setModels(savePest(made).filter((p) => p.regionId === region.id));
    e.currentTarget.reset();
  }

  function addStarter(s: (typeof PEST_STARTERS)[number]) {
    const made = makePest(
      s.pest, s.base_temp,
      s.stages.map((x) => `${x.stage} ${x.gdd}`).join(", "),
      region.id,
    );
    if (typeof made !== "string") {
      setModels(savePest(made).filter((p) => p.regionId === region.id));
    }
  }

  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">Pests</h1>
        <span className="text-[13px] text-ink-soft">{region.name}</span>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-clay/30 bg-clay/10 p-3 text-[13px] text-clay">{error}</div>
      )}

      {data && data.scout_now.length > 0 && (
        <div className="mb-5 rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
          <span className="eyebrow">Walk these rows this week</span>
          <ul className="mt-1.5 space-y-1 text-[13px]">
            {data.scout_now.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      )}

      <h2 className="figure mb-2.5 flex items-baseline gap-2.5 text-[18px] font-semibold">
        Thresholds
        {models.length > 0 && <Provenance tool="goodearth_pest_threshold" at={ranAt} onCost={onCost} />}
      </h2>

      {data?.summary && <p className="mb-2.5 text-[13px] text-ink-soft">{data.summary}</p>}

      {busy && !data ? (
        <div className="rounded-md border border-rule bg-panel p-8 text-center text-[13px] text-ink-soft">
          Reading thresholds…
        </div>
      ) : data ? (
        <div className="space-y-2.5">
          {data.pests.map((a) => {
            const id = models.find((m) => m.pest === a.pest)?.id;
            return (
              <div key={a.pest} className="rounded-md border border-rule bg-panel px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <h3 className="figure text-[15px] font-semibold">{a.pest}</h3>
                  <span className="data text-[10.5px] text-ink-soft">
                    base {a.base_temp_f}°F · {a.gdd_accumulated?.toLocaleString()} GDD
                    {a.biofix ? ` since ${d(a.biofix)}` : " this season"}
                  </span>
                  {id && (
                    <button onClick={() => setModels(deletePest(id).filter((p) => p.regionId === region.id))}
                      aria-label={`Remove ${a.pest}`} className="ml-auto inline-flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft active:text-clay">×</button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(a.stages ?? []).map((s) => (
                    <span key={s.stage}
                      className={`inline-flex min-h-11 items-center rounded-full px-3.5 text-[12px] ${
                        s.reached ? "bg-honey/15 text-honey" : "bg-band text-ink-soft"}`}>
                      {/* The remaining-GDD figure was in a title attribute,
                          which is unreachable with a finger — it belongs in
                          the chip itself. */}
                      {s.stage} {s.gdd.toLocaleString()}
                      {s.reached
                        ? " ✓"
                        : s.projected_date
                          ? ` · ${d(s.projected_date)}`
                          : ` · ${Math.round(s.gdd_remaining)} to go`}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-rule bg-panel/60 p-6 text-[13px] text-ink-soft">
          No pest models on {region.name} yet. Add one below, or start from a shape and edit it.
        </div>
      )}

      <h2 className="figure mt-7 mb-2.5 text-[18px] font-semibold">Add a model</h2>
      <form onSubmit={add} className="rounded-md border border-rule bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[11px] text-ink-soft">Pest
            <input name="pest" placeholder="Aster leafhopper"
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" /></label>
          <label className="block text-[11px] text-ink-soft">Base °F
            <input name="base" inputMode="numeric" placeholder="50"
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" /></label>
          <label className="block text-[11px] text-ink-soft">Biofix <span className="opacity-60">(optional)</span>
            <input name="biofix" type="date"
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" /></label>
          <label className="block text-[11px] text-ink-soft lg:col-span-1">Stages
            <input name="stages" placeholder="first flight 375, second flight 1400"
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" /></label>
        </div>
        {formErr && <p className="mt-2 text-[12px] text-clay">{formErr}</p>}
        <button className="mt-3 min-h-11 rounded border-[1.5px] border-ink px-4 text-[13px] font-semibold active:bg-ink active:text-paper">
          Add model
        </button>
      </form>

      <div className="mt-5">
        <span className="eyebrow">Start from a shape</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PEST_STARTERS.map((s) => (
            <button key={s.pest} onClick={() => addStarter(s)}
              className="data min-h-11 rounded-full border border-rule bg-panel px-4 text-[12px] text-ink-soft active:border-ink active:text-ink">
              + {s.pest}
            </button>
          ))}
        </div>
        <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-ink-soft">
          These are shapes to edit, not published thresholds. Degree-day models
          vary by region and biotype — confirm every number against your own
          extension bulletin before you spray or skip a scouting round. Good
          Earth computes when <em>your</em> model arrives on <em>your</em>
          ground; it does not publish entomology.
        </p>
      </div>
    </>
  );
}
