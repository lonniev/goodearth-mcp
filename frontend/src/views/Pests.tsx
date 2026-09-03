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
import { Chiclet, Empty, ErrorBox, FIELD, Note, PageTitle, Pill, Section, StatusChip } from "../components/ui";
import { useBlockItems } from "../lib/blockItems";
import { pestCatalog, pestThreshold, type PestCatalogResult, type PestWindowResult } from "../lib/mcp";
import {
  makePest, pestCodec, type SavedPest,
} from "../lib/pestModels";
import type { SavedRegion } from "../lib/regions";

const d = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function Pests({
  region, onCost,
}: { region: SavedRegion; onCost: (sats: number) => void }) {
  // Read from the grower's record under their npub, not from this browser.
  const { items: models, save: storePest, retire: retirePest,
          loading: modelsLoading, error: modelsError,
          unknownBlock: modelsUnknown } =
    useBlockItems<SavedPest>(region.id, "pest", pestCodec);
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


  const run = useCallback(async (list: SavedPest[]) => {
    if (!list.length) { setData(null); return; }
    setBusy(true); setError("");
    try {
      const r = await pestThreshold(region.id, list.map(({ id: _id, regionId: _r, ...m }) => m));
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
    void storePest(made).catch((e) => setFormErr(String(e.message ?? e)));
    setPestName("");
    e.currentTarget.reset();
  }


  const loadCatalog = useCallback(async () => {
    setCatBusy(true);
    try {
      const r = await pestCatalog(region.id);
      if (r.success) { setCat(r); setCatAt(new Date()); }
      else setError(r.error || "The pest catalogue could not be read.");
    } finally { setCatBusy(false); }
  }, [region.id]);

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

      {/* Rows shaped like the wildlife calendar's: an icon, the name and its
          detail on one baseline, the data underneath. These were stacked cards
          with a heading inside, which is why the page read as a different app
          from its neighbours. */}
      {busy && !data ? (
        <div className="rounded-md border border-rule bg-panel">
          <QuoteScroller heading="Checking what you're watching" />
        </div>
      ) : data ? (
        <ul className="space-y-2">
          {data.pests.map((a) => {
            const id = models.find((m) => m.pest === a.pest)?.id;
            const due = (a.stages ?? []).some((x) => !x.reached);
            return (
              <li key={a.pest}
                className="flex items-start gap-3 rounded-md border border-rule bg-panel px-3.5 py-2.5">
                <span className="text-[22px] leading-none">{due ? "🥚" : "🐛"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <b className="text-[13.5px]">{a.pest}</b>
                    <span className="text-[13px] text-ink-soft">base {a.base_temp_f}°F</span>
                  </div>
                  <div className="data mt-0.5 text-[11px] text-ink-soft">
                    {a.gdd_accumulated?.toLocaleString()} GDD
                    {a.biofix ? ` since ${d(a.biofix)}` : " this season"}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(a.stages ?? []).map((st) => (
                      <StatusChip key={st.stage} tone={st.reached ? "reached" : "pending"}>
                        {/* The remaining-GDD figure was in a title attribute,
                            which is unreachable with a finger. */}
                        <span>{st.stage} <span className="data text-[10.5px] text-ink-soft">{st.gdd.toLocaleString()}</span></span>
                        {st.reached
                          ? <span className="text-honey">✓</span>
                          : <span className="data text-[10.5px] text-ink-soft">
                              · {st.projected_date ? d(st.projected_date) : `${Math.round(st.gdd_remaining)} to go`}
                            </span>}
                      </StatusChip>
                    ))}
                  </div>
                </div>
                {id && (
                  <button onClick={() => void retirePest(id)}
                    aria-label={`Remove ${a.pest}`}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[18px] text-ink-soft active:text-clay">×</button>
                )}
              </li>
            );
          })}
        </ul>
      ) : modelsLoading ? (
        <Empty>Reading what you have on {region.name}…</Empty>
      ) : modelsUnknown ? (
        <ErrorBox>This browser is set to ground the record does not have. Pick the block again from Favorites, or save it on the Map.</ErrorBox>
      ) : modelsError ? (
        <ErrorBox>Could not read your record for {region.name}: {modelsError}</ErrorBox>
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
