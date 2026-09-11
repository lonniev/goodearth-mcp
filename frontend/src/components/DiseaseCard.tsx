// Disease risk — the hours this ground stayed wet, and what they mean.
//
// Degree days are the wrong clock for a fungus, so this card reads nothing
// from the heat curve. It reads hours.
//
// LEADS WITH NOW. Every model also knows how its whole season went, and that
// is the number a card like this wants to show because it is the biggest one
// available — and it is the wrong one. "Six late-blight periods this season"
// on the 11th of September says nothing about whether to cut flowers this
// afternoon. So the season sits behind the models that are quiet, and what is
// happening leads.
//
// Conditions, never a treatment. The models are published ones and the card
// says whose they are; what to do about them belongs to an extension service.

import { useState } from "react";
import Term from "./Term";
import { asideLine, heading, order, rowDate, toneOf, TONE_WORD, type Tone } from "../lib/diseaseRows";
import { growing } from "../lib/cropMatch";
import type { DiseaseRiskResult, DiseaseVerdict } from "../lib/mcp";

const d = (iso: string) =>
  new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

const CHIP: Record<Tone, string> = {
  ahead: "bg-clay/15 text-clay",
  recent: "bg-honey/20 text-ink",
  quiet: "bg-band text-ink-soft",
};

export default function DiseaseCard({ data, plantings = [] }: {
  data: DiseaseRiskResult;
  /// What this block grows, as the grower wrote it. A model is shown when its
  /// own "developed for" list claims one of these.
  plantings?: string[];
}) {
  const [open, setOpen] = useState<string | null>(null);

  const { live, quiet, unclaimed } = order(data, plantings);
  const w = data.wetness;

  return (
    <div
      className={`mb-3 rounded-md border border-rule border-l-4 bg-panel px-4 py-3.5 ${
        live.length ? "border-l-clay" : "border-l-growth"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="figure text-[15.5px] font-semibold">
          {heading(data, plantings)}
        </h3>
        <span className="data text-[12px] text-ink-soft">
          <b className="text-ink">{w.wet_hours.toLocaleString()}</b> wet hours since {d(data.season_from)}
          {" "}
          <Term of="leaf_wetness">estimated</Term>
        </span>
        {w.forecast_note && (
          <span className="data text-[10.5px] text-clay">record only — the forecast did not answer</span>
        )}
      </div>

      {/* The models that have something to say, with the sentence the service
          wrote. One voice, so the page and an agent reading the same answer
          cannot disagree about the same weather. */}
      {live.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {live.map((v) => (
            <Row key={v.model} v={v} open={open === v.model} onOpen={setOpen} plantings={plantings} />
          ))}
        </ul>
      )}

      {/* Risk that is ABSENT is as useful to report as risk that is present,
          and a dry year is the ordinary Vermont answer. These are not hidden —
          they are just not shouted. */}
      {quiet.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {quiet.map((v) => (
            <Row key={v.model} v={v} open={open === v.model} onOpen={setOpen} plantings={plantings} />
          ))}
        </ul>
      )}

      {unclaimed.length > 0 && (
        <p className="data mt-2 text-[10.5px] text-ink-soft">{asideLine(unclaimed)}</p>
      )}

      {data.skipped.length > 0 && (
        <p className="data mt-2 text-[10.5px] text-clay">
          {data.skipped.map((s) => `${s.name}: ${s.reason}`).join(" · ")}
        </p>
      )}

      <p className="data mt-2.5 text-[10px] leading-relaxed text-ink-soft">
        {w.estimator.wet_when}.{" "}
        Published models run against your ground — Good Earth does not publish plant
        pathology and never recommends a treatment.
      </p>
    </div>
  );
}

function Row({ v, open, onOpen, plantings }: {
  v: DiseaseVerdict; open: boolean; onOpen: (k: string | null) => void; plantings: string[];
}) {
  const tone = toneOf(v);
  // Named as the GROWER wrote them. Echoing back the model's "calendula" at
  // someone who saved "Calendula officinalis" quietly corrects them.
  const yours = growing(v.about.crops, plantings);
  return (
    <li>
      <button
        onClick={() => onOpen(open ? null : v.model)}
        aria-expanded={open}
        className="flex min-h-11 w-full flex-wrap items-center gap-x-2.5 gap-y-0.5 rounded px-1 text-left active:bg-band"
      >
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[tone]}`}>
          {TONE_WORD[tone]}
        </span>
        <span className="figure text-[13.5px] font-semibold">{v.disease}</span>
        <span className="data text-[11px] text-ink-soft">{v.about.name}</span>
        <span className="ml-auto data text-[12px]">
          {(() => {
            const r = rowDate(v);
            if (!r) return <span className="text-ink-soft">none this season</span>;
            return r.lead === "from"
              ? <><span className="text-ink-soft">from </span><b>{d(r.date)}</b></>
              : <><span className="text-ink-soft">last </span>{d(r.date)}</>;
          })()}
        </span>
      </button>

      {open && (
        <div className="mt-0.5 rounded bg-band/60 px-3 py-2 text-[12.5px] leading-relaxed">
          {/* `now` is not repeated here. The row above already carries the
              date, in the app's own format — the server writes ISO, correctly
              for an API, and printing both put "Sep 17" and "2026-09-17" one
              line apart. The row IS the now; a reader opens a row for the
              season behind it. */}
          <p>{v.explain}</p>
          {/* Which crops the model was developed against. Every model runs on
              every block, so a flower grower meets "apple scab · from Sep 13"
              and deserves to know it is about apples before it worries them. */}
          <p className="mt-1 text-ink-soft">
            Developed for {v.about.crops.join(", ")}.
            {yours.length > 0 && ` You grow ${yours.join(", ")}.`}
          </p>
          {v.at_decision_point && (
            <p className="mt-1 text-ink-soft">
              {v.severity_total} severity values accrued — the literature's decision point.
              What to decide is your extension service's to say.
            </p>
          )}
          <p className="data mt-1.5 text-[10.5px] text-ink-soft">
            {v.about.asks}. {v.about.citation}.
          </p>
        </div>
      )}
    </li>
  );
}
