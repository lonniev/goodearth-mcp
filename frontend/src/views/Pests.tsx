// Pests — where each pest a grower watches for stands on this ground.
//
// The answer a grower acts on is not the whole table, it is what to watch
// for now — so that leads, and the detail follows.
//
// The catalogue below is USA-NPN's, read live for this region. It replaced a
// list of five pests written in this repo, which was one author's guess at
// what a farm cares about, the same for a Vermont lakeshore and a Georgia
// orchard.

import { useCallback, useEffect, useState } from "react";
import Provenance from "../components/Provenance";
import QuoteScroller from "../components/QuoteScroller";
import { Chiclet, Empty, ErrorBox, FIELD, Note, PageTitle, Pill, Section } from "../components/ui";
import { pestCatalog, pestThreshold, type PestCatalogResult, type PestWindowResult } from "../lib/mcp";
import {
  deletePest, listPests, makePest, savePest, type SavedPest,
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
  const [cat, setCat] = useState<PestCatalogResult | null>(null);
  const [catBusy, setCatBusy] = useState(false);
  const [catAt, setCatAt] = useState<Date | null>(null);
  /// Tapping a catalogue entry names the pest and leaves the numbers blank.
  /// The species is a fact about this country; the threshold is the grower's.
  const [pestName, setPestName] = useState("");

  useEffect(() => { setModels(listPests(region.id)); }, [region.id]);

  const run = useCallback(async (list: SavedPest[]) => {
    if (!list.length) { setData(null); return; }
    setBusy(true); setError("");
    try {
      const r = await pestThreshold(region.region, list.map(({ id: _id, regionId: _r, ...m }) => m));
      if (!r.success) { setError(r.error || "What you are watching could not be read."); return; }
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
    setPestName("");
    e.currentTarget.reset();
  }


  const loadCatalog = useCallback(async () => {
    setCatBusy(true);
    try {
      const r = await pestCatalog(region.region);
      if (r.success) { setCat(r); setCatAt(new Date()); }
      else setError(r.error || "The pest catalogue could not be read.");
    } finally { setCatBusy(false); }
  }, [region.region]);

  return (
    <>
      <PageTitle>Pests</PageTitle>

      {error && <ErrorBox>{error}</ErrorBox>}

      {data && data.scout_now.length > 0 && (
        <div className="mb-5 rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
          <span className="eyebrow">Watch for these now</span>
          <ul className="mt-1.5 space-y-1 text-[13px]">
            {data.scout_now.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      )}

      <Section emoji="👀" title="What you're watching" first>
        {models.length > 0 && <Provenance tool="goodearth_pest_threshold" at={ranAt} onCost={onCost} />}
      </Section>

      {data?.summary && <p className="mb-2.5 text-[13px] text-ink-soft">{data.summary}</p>}

      {busy && !data ? (
        <div className="rounded-md border border-rule bg-panel">
          <QuoteScroller heading="Checking what you're watching" />
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
        <Empty>
          Nothing being watched on {region.name} yet. Take one from Nearby below, or add your own.
        </Empty>
      )}

      <Section emoji="➕" title="Watch a pest" />
      <form onSubmit={add} className="rounded-md border border-rule bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[11px] text-ink-soft">Pest
            <input name="pest" placeholder="Aster leafhopper"
              value={pestName} onChange={(e) => setPestName(e.target.value)}
              className={FIELD} /></label>
          <label className="block text-[11px] text-ink-soft">Base °F
            <input name="base" inputMode="numeric" placeholder="50"
              className={FIELD} /></label>
          <label className="block text-[11px] text-ink-soft">Biofix <span className="opacity-60">(optional)</span>
            <input name="biofix" type="date"
              className={FIELD} /></label>
          <label className="block text-[11px] text-ink-soft lg:col-span-1">Stages
            <input name="stages" placeholder="first flight 375, second flight 1400"
              className={FIELD} /></label>
        </div>
        {formErr && <p className="mt-2 text-[12px] text-clay">{formErr}</p>}
        <button className="mt-3 min-h-11 rounded border-[1.5px] border-ink px-4 text-[13px] font-semibold active:bg-ink active:text-paper">
          Start watching
        </button>
      </form>

      <Section emoji="🔭" title="Nearby">
        {!cat && (
          <Pill onClick={loadCatalog} disabled={catBusy} active>
            {catBusy ? "🧠 Reading…" : "🧠 What's here?"}
          </Pill>
        )}
        {cat && <Provenance tool="goodearth_pest_catalog" at={catAt} onCost={onCost} />}
      </Section>

      {cat ? (
        <>
          <p className="eyebrow">Modelled stages</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(cat.events ?? []).map((e) => (
              <Chiclet key={e.model} emoji={e.passed ? "🐛" : "🥚"} name={e.name}
                figure={d(e.date)}
                tone={e.passed ? "border-honey/50 bg-honey/8" : "border-rule bg-panel"}
                title={`${e.name} — due ${d(e.date)} here. Tap to watch it.`}
                onClick={() => setPestName(e.name)} />
            ))}
          </div>
          {(cat.insects_recorded ?? []).length > 0 && (
            <>
              <p className="eyebrow mt-4">Sightings</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(cat.insects_recorded ?? []).slice(0, 18).map((i) => (
                  <Chiclet key={i.name} emoji="🔍" name={i.name} figure={i.observations.toLocaleString()}
                    title={`${i.observations.toLocaleString()} sightings near here. Tap to watch it.`}
                    onClick={() => setPestName(i.name)} />
                ))}
              </div>
            </>
          )}
          <Note>
            Dated stages come from USA-NPN's degree-day forecasts for this region, and
            the sightings from iNaturalist within about {cat.search_span_km} km — species
            are a landscape fact, and one field holds almost no records.{" "}
            {cat.models_unreadable ? `${cat.models_unreadable} of ${cat.models_published} published forecasts give a heat total or a risk level rather than a date, so they are left out rather than guessed at. ` : ""}
            Tapping one names the pest and nothing else. The heat numbers that say
            when it arrives are yours to set against your own extension bulletin —
            Good Earth does not publish entomology or recommend a treatment.
          </Note>
        </>
      ) : (
        <Note>
          USA-NPN models a set of pests nationally and Good Earth reads them for this
          ground, so the answer here is not the answer for an orchard two states south.
          What comes back is a date for the region, not the numbers that time it on
          your ground. Those stay yours.
        </Note>
      )}
    </>
  );
}
