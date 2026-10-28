// A subject's year, told as a short story, with a tick beside each event.
//
// The grower picks a pumpkin, a codling moth or a red-tailed hawk; the service
// looks up its life cycle (`life_cycle`) and dates each event on this plot. The
// key events start ticked, events already tracked are ticked and fixed, and one
// press saves the rest. Shared by Flora, Pests and Fauna: each page decides how
// the chosen events are stored.

import { useEffect, useMemo, useState } from "react";
import { lifeCycle, type LifeCycleEvent, type LifeCycleResult, type LifeCycleSubject } from "../lib/mcp";
import { aboutDate, eventKey, initialChoice, toAdd } from "../lib/lifeCycle";
import type { SavedRegion } from "../lib/regions";
import Provenance from "./Provenance";
import { ErrorBox } from "./ui";

export interface Who {
  taxonId?: number;
  scientificName?: string;
  commonName?: string;
}

export default function LifeCycleStory({
  region, subject, who, setOut, tracked, onCost, onChoose, onTrack, trackLabel,
}: {
  region: SavedRegion;
  subject: LifeCycleSubject;
  who: Who;
  /// A plant's set-out, which moves every stage's date.
  setOut?: string;
  /// Events this subject already has on the record, by `eventKey`.
  tracked: ReadonlySet<string>;
  onCost: (sats: number) => void;
  /// Told whenever the choice changes — Flora saves it with the planting.
  onChoose?: (chosen: LifeCycleEvent[], result: LifeCycleResult) => void;
  /// Given, a button saves the choice — Fauna and Pests.
  onTrack?: (chosen: LifeCycleEvent[], result: LifeCycleResult) => Promise<void>;
  trackLabel?: (n: number) => string;
}) {
  const [result, setResult] = useState<LifeCycleResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [at, setAt] = useState<Date | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const { taxonId, scientificName, commonName } = who;
  useEffect(() => {
    if (!taxonId && !scientificName && !commonName) return;
    let live = true;
    setBusy(true); setError(""); setResult(null);
    void lifeCycle(region.id, subject, {
      ...(taxonId ? { taxon_id: taxonId } : {}),
      ...(scientificName ? { scientific_name: scientificName } : {}),
      ...(commonName ? { common_name: commonName } : {}),
      ...(setOut ? { set_out: setOut } : {}),
    })
      .then((r) => {
        if (!live) return;
        if (!r.success) { setError(r.error || "Its life cycle could not be read."); return; }
        setResult(r); setAt(new Date());
        setChosen(initialChoice(r.events ?? [], tracked));
      })
      .catch((e) => { if (live) setError((e as Error).message); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
    // `tracked` seeds the first choice only; a save must not re-ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region.id, subject, taxonId, scientificName, commonName, setOut]);

  const events = useMemo(() => result?.events ?? [], [result]);
  const adding = useMemo(() => toAdd(events, chosen, tracked), [events, chosen, tracked]);

  useEffect(() => {
    if (result && onChoose) onChoose(adding, result);
    // Report the choice, not every render of the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adding, result]);

  function toggle(e: LifeCycleEvent) {
    const k = eventKey(e.name);
    if (tracked.has(k)) return;
    const next = new Set(chosen);
    if (next.has(k)) next.delete(k); else next.add(k);
    setChosen(next);
  }

  if (busy) {
    return <p className="mt-3 text-[12.5px] text-ink-soft">🧠 Reading its year…</p>;
  }
  if (error && !result) return <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>;
  if (!result || !events.length) return null;

  return (
    <section className="mt-3 rounded-md border border-rule bg-band/40 p-4">
      {result.narrative && (
        <p className="mb-3 max-w-prose text-[13px] leading-relaxed">{result.narrative}</p>
      )}
      <ol className="grid gap-1">
        {events.map((e) => {
          const k = eventKey(e.name);
          const fixed = tracked.has(k);
          const on = fixed || chosen.has(k);
          return (
            <li key={k}>
              <label className={`flex min-h-11 items-start gap-3 rounded px-2 py-1.5 ${
                fixed ? "opacity-70" : "cursor-pointer active:bg-band"}`}
                title={fixed ? "Already tracked" : undefined}>
                <input type="checkbox" className="mt-1 size-4 shrink-0" checked={on}
                  disabled={fixed} onChange={() => toggle(e)} />
                <span className="data w-[4.5rem] shrink-0 pt-0.5 text-[12px] text-ink-soft">
                  {aboutDate(e.on_this_plot)}
                </span>
                <span className="w-6 shrink-0 text-center text-[17px] leading-none">{e.emoji ?? "•"}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-[13.5px] font-semibold">{e.name}</span>
                  {fixed && <span className="ml-1.5 text-ink-soft" aria-label="Already tracked">✓</span>}
                  {e.summary && (
                    <span className="block text-[12px] leading-snug text-ink-soft">{e.summary}</span>
                  )}
                </span>
                {e.source_url && (
                  <a href={e.source_url} target="_blank" rel="noopener noreferrer"
                    onClick={(ev) => ev.stopPropagation()}
                    className="shrink-0 pt-0.5 text-[12px] text-ink-soft underline underline-offset-2"
                    title={e.source_url}>source</a>
                )}
              </label>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {onTrack && (
          <button type="button" disabled={!adding.length || saving}
            onClick={async () => {
              setSaving(true); setError("");
              try { await onTrack(adding, result); }
              catch (err) { setError((err as Error).message); }
              finally { setSaving(false); }
            }}
            className="min-h-11 rounded-full bg-ink px-5 text-[13px] font-semibold text-paper disabled:opacity-40">
            {saving ? "Saving…" : trackLabel ? trackLabel(adding.length) : `Track these ${adding.length}`}
          </button>
        )}
        <Provenance tool="goodearth_life_cycle" at={at} onCost={onCost} />
      </div>
      {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
    </section>
  );
}
