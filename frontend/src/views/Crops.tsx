// Crops — the block's plantings and where each one stands.
//
// The ledger is one priced call for the whole block, so adding a ninth
// planting costs arithmetic rather than another round trip. The form validates
// the way the server does, so a grower is corrected here rather than by a
// failed paid call.

import { useCallback, useEffect, useState } from "react";
import CropLedger from "../components/CropLedger";
import Provenance from "../components/Provenance";
import QuoteScroller from "../components/QuoteScroller";
import { cropGddStatus, cropSuitability, plantingWindow, type CropLedgerResult,
  type PlantingWindowResult, type SuitabilityResult, type Verdict } from "../lib/mcp";
import {
  CROP_CATEGORIES, CROP_PRESETS, deletePlanting, listPlantings, makePlanting,
  savePlanting, type CropPreset, type Planting,
} from "../lib/plantings";
import type { SavedRegion } from "../lib/regions";

const short = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

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
  const [fit, setFit] = useState<SuitabilityResult | null>(null);
  const [fitAt, setFitAt] = useState<Date | null>(null);
  const [fitBusy, setFitBusy] = useState(false);
  const [cat, setCat] = useState<CropPreset["category"] | "all">("all");
  const [when, setWhen] = useState<PlantingWindowResult | null>(null);
  const [whenAt, setWhenAt] = useState<Date | null>(null);
  const [whenBusy, setWhenBusy] = useState(false);

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

  // "What can I grow here" is not a lookup — it is this block's own frost-free
  // heat budget against each crop's need. One call rates the whole library.
  const checkFit = useCallback(async () => {
    setFitBusy(true); setError("");
    try {
      const r = await cropSuitability(
        region.region,
        CROP_PRESETS.map((c) => ({
          crop: c.crop, gdd_target: c.gddTarget, base_temp: c.baseTempF,
          frost_hardy: c.frostHardy ?? false, category: c.category, emoji: c.emoji,
        })),
      );
      if (!r.success) { setError(r.error || "Suitability could not be read."); return; }
      setFit(r); setFitAt(new Date());
    } catch (e) { setError((e as Error).message); }
    finally { setFitBusy(false); }
  }, [region]);

  /// Add straight from a chiclet. The set-out defaults to today, which is
  /// right far more often than an empty field is — a grower tapping a crop is
  /// usually putting it in now.
  function addPreset(c: CropPreset) {
    const made = makePlanting(
      c.crop, c.gddTarget, new Date().toISOString().slice(0, 10), region.id, c.baseTempF,
    );
    if (typeof made === "string") { setFormErr(made); return; }
    setFormErr("");
    setPlantings(savePlanting(made).filter((p) => p.regionId === region.id));
  }

  // "How much heat does it need" and "when does it go in" are different
  // questions. This is the second one, from the block's own frost and soil.
  const checkWhen = useCallback(async () => {
    setWhenBusy(true); setError("");
    try {
      const r = await plantingWindow(
        region.region,
        CROP_PRESETS.map((c) => ({
          crop: c.crop, gdd_target: c.gddTarget, base_temp: c.baseTempF,
          frost_hardy: c.frostHardy ?? false, direct_sow: c.directSow ?? false,
          emoji: c.emoji,
          ...(c.minSoilF != null ? { min_soil_f: c.minSoilF } : {}),
          ...(c.startIndoorsWeeks != null ? { start_indoors_weeks: c.startIndoorsWeeks } : {}),
        })),
      );
      if (!r.success) { setError(r.error || "The planting window could not be read."); return; }
      setWhen(r); setWhenAt(new Date());
    } catch (e) { setError((e as Error).message); }
    finally { setWhenBusy(false); }
  }, [region]);

  const verdictOf = (crop: string): Verdict | null =>
    fit?.crops.find((r) => r.crop === crop)?.verdict ?? null;

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
        <div className="rounded-md border border-rule bg-panel">
          <QuoteScroller heading="Reading the ledger" />
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

      {/* ── What grows here ─────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-2.5 flex flex-wrap items-baseline gap-2.5 text-[18px] font-semibold">
        🌾 What grows here
        {!fit && (
          <button onClick={checkFit} disabled={fitBusy}
            className="min-h-11 rounded-full border-[1.5px] border-ink px-4 text-[12.5px] font-semibold active:bg-ink active:text-paper disabled:opacity-40">
            {fitBusy ? "Measuring…" : "Measure this block"}
          </button>
        )}
        {fit && <Provenance tool="goodearth_crop_suitability" at={fitAt} onCost={onCost} />}
      </h2>

      {fit ? (
        <div className="mb-3 rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3">
          <p className="text-[13px]">
            <b className="figure text-[16px]">{fit.budget.frost_free_days} frost-free days</b>
            {fit.budget.gdd_by_base["50"] != null && (
              <> · about <b>{Math.round(fit.budget.gdd_by_base["50"]).toLocaleString()} GDD₅₀</b> inside them</>
            )}
            , median over {fit.budget.seasons_on_record} seasons.
          </p>
          <p className="mt-1 text-[12.5px] text-ink-soft">{fit.summary}</p>
        </div>
      ) : (
        <p className="mb-3 max-w-prose text-[12.5px] leading-relaxed text-ink-soft">
          Two farms in the same county — one on a bench, one in a hollow — do not
          grow the same things. Measuring this block gives its own frost-free
          window and the heat inside it, then rates every crop below against it.
        </p>
      )}

      {/* ── When it goes in ─────────────────────────────────────────── */}
      <h2 className="figure mt-7 mb-2.5 flex flex-wrap items-baseline gap-2.5 text-[18px] font-semibold">
        🌱 When to sow
        {!when && (
          <button onClick={checkWhen} disabled={whenBusy}
            className="min-h-11 rounded-full border-[1.5px] border-ink px-4 text-[12.5px] font-semibold active:bg-ink active:text-paper disabled:opacity-40">
            {whenBusy ? "Reading the frost record…" : "Date this block"}
          </button>
        )}
        {when && <Provenance tool="goodearth_planting_window" at={whenAt} onCost={onCost} />}
      </h2>

      {when ? (
        <>
          <div className="mb-2.5 rounded-md border border-rule border-l-4 border-l-frost bg-panel px-4 py-3">
            <p className="text-[13px]">
              Last spring frost <b>{when.frost.last_spring_median && short(when.frost.last_spring_median)}</b>
              {" · "}first fall frost <b>{when.frost.first_fall_median && short(when.frost.first_fall_median)}</b>
              {" — medians over "}{when.frost.seasons_on_record} seasons.
            </p>
            {Object.keys(when.soil_warming).length > 0 && (
              <p className="mt-1 text-[12.5px] text-ink-soft">
                Soil reaches{" "}
                {Object.entries(when.soil_warming)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([t, d]) => `${Math.round(Number(t))}°F on ${short(d)}`)
                  .join(" · ")}
              </p>
            )}
            {when.sow_now.length > 0 && (
              <p className="mt-1.5 text-[13px]">
                <b>In the window now:</b> {when.sow_now.join(", ")}
              </p>
            )}
          </div>
          <div className="mb-3 overflow-x-auto rounded-md border border-rule bg-panel [-webkit-overflow-scrolling:touch]">
            <table className="w-full text-[13px]">
              <thead><tr>
                {["Crop", "Seed indoors", "Out", "Last sowing", "Window"].map((h) => (
                  <th key={h} className="data border-b-[1.5px] border-ink px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[.1em] text-ink-soft">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {when.crops.filter((r) => cat === "all" ||
                  CROP_PRESETS.find((c) => c.crop === r.crop)?.category === cat).map((r) => (
                  <tr key={r.crop} className={`border-b border-rule last:border-b-0 ${
                    r.state === "will_not_fit" ? "opacity-50" : ""}`}>
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{r.emoji} {r.crop}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.start_seed_indoors ? short(r.start_seed_indoors) : <span className="text-ink-soft">direct sow</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.earliest_out ? short(r.earliest_out) : "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.latest_out ? short(r.latest_out) : "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.state === "will_not_fit"
                        ? <span className="rounded-full bg-clay/15 px-2 py-0.5 text-[11px] font-semibold text-clay">won't fit</span>
                        : r.state === "narrow"
                          ? <span className="rounded-full bg-honey/15 px-2 py-0.5 text-[11px] font-semibold text-honey">{r.window_days}d — narrow</span>
                          : <span className="text-ink-soft">{r.window_days}d</span>}
                      {r.sow_now && <span className="ml-1.5 rounded-full bg-growth/15 px-2 py-0.5 text-[11px] font-semibold text-growth">now</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mb-4 max-w-prose text-[12px] leading-relaxed text-ink-soft">
            A tender crop's "out" date is the <b>median</b> last frost — half of
            seasons frost later than that, so it is a coin toss rather than a
            green light. The last-sowing date uses the season's average heat
            rate, so it flatters the very end of the window: heat comes slower
            in September than in July.
          </p>
        </>
      ) : (
        <p className="mb-3 max-w-prose text-[12.5px] leading-relaxed text-ink-soft">
          Heat requirement says whether a crop <i>can</i> finish here. It says
          nothing about when to start — which is the decision you make with a
          seed packet in hand in February. Dating this block gives three:
          when seed goes in under lights, when the plant can go out, and the
          last day a sowing still beats the frost.
        </p>
      )}

      {/* ── The library ─────────────────────────────────────────────── */}
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {([{ key: "all", label: "All" }, ...CROP_CATEGORIES] as const).map((c) => (
          <button key={c.key} onClick={() => setCat(c.key as typeof cat)}
            className={`min-h-11 rounded-full border px-3.5 text-[12.5px] font-medium ${
              cat === c.key ? "border-ink bg-ink text-paper" : "border-rule active:bg-band"}`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CROP_PRESETS.filter((c) => cat === "all" || c.category === cat).map((c) => {
          const v = verdictOf(c.crop);
          const tone =
            v === "comfortable" ? "border-growth/50 bg-growth/8"
            : v === "tight" ? "border-honey/50 bg-honey/8"
            : v === "marginal" ? "border-honey/60 bg-honey/12"
            : v === "too_short" ? "border-clay/40 bg-clay/8 opacity-60"
            : "border-rule bg-panel";
          const row = fit?.crops.find((r) => r.crop === c.crop);
          const w = when?.crops.find((r) => r.crop === c.crop);
          return (
            <button key={c.crop} onClick={() => addPreset(c)}
              title={[
                row?.note,
                w && `Seed ${w.start_seed_indoors ? short(w.start_seed_indoors) : "direct"} · out ${w.earliest_out ? short(w.earliest_out) : "—"}`,
                `${c.gddTarget} GDD ${c.note}, base ${c.baseTempF}°F`,
              ].filter(Boolean).join(" — ")}
              className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] active:border-ink ${tone}`}>
              <span>{c.emoji}</span>
              <span className="font-medium">{c.crop}</span>
              <span className="data text-[10.5px] text-ink-soft">{c.gddTarget}</span>
              {v === "comfortable" && <span className="text-[11px] text-growth">✓</span>}
              {(v === "tight" || v === "marginal") && <span className="text-[11px] text-honey">⚠</span>}
              {v === "too_short" && <span className="text-[11px] text-clay">✕</span>}
              {w?.sow_now && (
                <span className="rounded-full bg-growth/15 px-1.5 text-[10px] font-semibold text-growth">now</span>
              )}
            </button>
          );
        })}
      </div>

      {fit && (
        <p className="data mt-2 text-[10.5px] text-ink-soft">
          <span className="text-growth">✓ finishes comfortably</span>{" · "}
          <span className="text-honey">⚠ tight — a cool year could take it</span>{" · "}
          <span className="text-clay">✕ will not finish outdoors here</span>
        </p>
      )}

      <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-ink-soft">
        Tap any crop to add it to the ledger, set out today. These are starting
        figures, not published agronomy — a corn hybrid is sold by its relative
        maturity precisely because "corn" has no single number. Edit against
        your own seed packet, and let field reports teach this block its own.
      </p>
    </>
  );
}
