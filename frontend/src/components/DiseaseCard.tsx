// Disease risk — the hours this ground stayed wet, and what they mean.
//
// Degree days are the wrong clock for a fungus, so this card reads nothing
// from the heat curve. It reads hours.
//
// LEADS WITH NOW. Every model also knows how its whole season went, and that
// is the number a card like this wants to show because it is the biggest one
// available — and it is the wrong one. "Six late-blight periods this season"
// on the 11th of September says nothing about whether to cut flowers this
// afternoon. So the season sits behind the models that are clear, and what is
// happening leads.
//
// Only this ground's models. A disease of crops the block does not grow is not
// listed, and not accounted for in a caption either.
//
// Conditions, never a treatment. The models are published ones and the card
// says whose they are; what to do about them belongs to an extension service.

import { useState } from "react";
import Term from "./Term";
import { along, estimatesInfo, order, rowDate, stripAxis, stripMarks, stripMonths, toneOf, TONE_WORD, type StripAxis, type Tone } from "../lib/diseaseRows";
import { growing } from "../lib/cropMatch";
import type { DiseaseRiskResult, DiseaseVerdict } from "../lib/mcp";

const d = (iso: string) =>
  new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

const CHIP: Record<Tone, string> = {
  ahead: "bg-clay/15 text-clay",
  recent: "bg-honey/20 text-ink",
  clear: "bg-band text-ink-soft",
};

export default function DiseaseCard({ data, plantings = [] }: {
  data: DiseaseRiskResult;
  /// What this block grows, as the grower wrote it. A model is shown when its
  /// own "developed for" list claims one of these.
  plantings?: string[];
}) {
  const [open, setOpen] = useState<string | null>(null);

  const { live, clear } = order(data, plantings);
  const w = data.wetness;
  const axis = stripAxis(data);

  return (
    <div
      className={`mb-3 rounded-md border border-rule border-l-4 bg-panel px-4 py-3.5 ${
        live.length ? "border-l-clay" : "border-l-growth"
      }`}
    >
      {/* The estimates, listed — not a score of them. "4 of 4 models reporting
          risk" and the wet-hour total were the arithmetic, not the answer, so
          they live in the (i) with the rule that counts an hour wet and the
          line that says whose models these are. */}
      {/* One grid for the heading and every row, so the season strips share a
          column and their months line up down the card. The heading sits in
          the first column and the month names over the strips, which is room
          the card already had: the strips cost no height on a wide screen. */}
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[max-content_minmax(0,1fr)_max-content]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:col-span-3 sm:grid sm:grid-cols-subgrid">
        <h3 className="figure text-[15.5px] font-semibold">
          Disease Estimates
          <Term>
            {estimatesInfo(data, plantings)}. An hour counts as wet when {w.estimator.wet_when} —
            estimated, never measured. Each strip is the season: grey where a period qualified,
            clay where the forecast has one coming, and the dark tick is today. Published models run against your ground; Good Earth
            does not publish plant pathology and never recommends a treatment.
          </Term>
        </h3>
        {axis ? <Months axis={axis} /> : <span />}
        {w.forecast_note && (
          <span className="data text-[10.5px] text-clay">record only — the forecast did not answer</span>
        )}
      </div>

      {/* The models that have something to say, with the sentence the service
          wrote. One voice, so the page and an agent reading the same answer
          cannot disagree about the same weather. */}
      {live.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1.5 sm:col-span-3 sm:grid sm:grid-cols-subgrid">
          {live.map((v) => (
            <Row key={v.model} v={v} axis={axis} open={open === v.model} onOpen={setOpen} plantings={plantings} />
          ))}
        </ul>
      )}

      {/* Risk that is ABSENT is as useful to report as risk that is present,
          and a dry year is the ordinary Vermont answer. These are not hidden —
          they are just not shouted. */}
      {clear.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5 sm:col-span-3 sm:grid sm:grid-cols-subgrid">
          {clear.map((v) => (
            <Row key={v.model} v={v} axis={axis} open={open === v.model} onOpen={setOpen} plantings={plantings} />
          ))}
        </ul>
      )}

      </div>

      {data.skipped.length > 0 && (
        <p className="data mt-2 text-[10.5px] text-clay">
          {data.skipped.map((s) => `${s.name}: ${s.reason}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Row({ v, axis, open, onOpen, plantings }: {
  v: DiseaseVerdict; axis: StripAxis | null; open: boolean; onOpen: (k: string | null) => void; plantings: string[];
}) {
  const tone = toneOf(v);
  // Named as the GROWER wrote them. Echoing back the model's "calendula" at
  // someone who saved "Calendula officinalis" quietly corrects them.
  const yours = growing(v.about.crops, plantings);
  return (
    <li className="sm:col-span-3 sm:grid sm:grid-cols-subgrid">
      <button
        onClick={() => onOpen(open ? null : v.model)}
        aria-expanded={open}
        className="flex min-h-11 w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded px-1 text-left active:bg-band sm:col-span-3 sm:grid sm:grid-cols-subgrid"
      >
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[tone]}`}>
          {TONE_WORD[tone]}
        </span>
        <span className="figure text-[13.5px] font-semibold">{v.disease}</span>
        <span className="data text-[11px] text-ink-soft">{v.about.name}</span>
        {/* A falling barometer's window crosses the period this model
            projects. The model is unchanged — it has no pressure term — but
            these are the wet hours likeliest to come, perhaps sooner or
            heavier than forecast. */}
        {v.next_period?.front_due && (
          <span className="text-[13px]"
            title="A front is due: the barometer falls fast across this projected period, so its wet hours are the likeliest to come — perhaps sooner or heavier than forecast. The model itself is unchanged.">
            🌀
          </span>
        )}
        </span>
        {axis ? <Season v={v} axis={axis} /> : <span className="hidden sm:block" />}
        <span className="ml-auto data text-[12px] sm:text-right">
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
        <div className="mt-0.5 rounded bg-band/60 sm:col-span-3 px-3 py-2 text-[12.5px] leading-relaxed">
          {/* `now` is not repeated here. The row above already carries the
              date, in the app's own format — the server writes ISO, correctly
              for an API, and printing both put "Sep 17" and "2026-09-17" one
              line apart. The row IS the now; a reader opens a row for the
              season behind it. */}
          <p>{v.explain}</p>
          {/* Which crops the model was developed against. Every model runs on
              every block, so a flower grower meets "apple scab · from Sep 13"
              and deserves to know it is about apples before it worries them. */}
          {/* Only what concerns this ground: the grower's own crops when the
              record names them. The model's full list is shown only when the
              record names none, and is then how a reader judges relevance. */}
          <p className="mt-1 text-ink-soft">
            {yours.length > 0
              ? `Watched here for your ${yours.join(", ")}.`
              : `Developed for ${v.about.crops.join(", ")}.`}
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

/// The month names over the strips, at the strips' own scale. The right margin
/// is the count's column beside each strip (w-7 + gap-2), so the two line up.
function Months({ axis }: { axis: StripAxis }) {
  const ms = stripMonths(axis);
  return (
    <span className="relative mr-9 hidden h-4 self-end sm:block" aria-hidden>
      {ms.map((m) => (
        <span key={m.label} className="data absolute top-0 -translate-x-1/2 text-[9.5px] text-ink-soft"
          style={{ left: `${m.at * 100}%` }}>{m.label}</span>
      ))}
    </span>
  );
}

/// The model's whole season on one line: each qualifying period where it
/// fell, the forecast's ones in the row's own warning colour, today as a tick,
/// and the count at the end. The row's date says what is happening now; the
/// strip says whether this is the first time or the tenth.
function Season({ v, axis }: { v: DiseaseVerdict; axis: StripAxis }) {
  const marks = stripMarks(v, axis);
  if (!marks) return <span className="hidden sm:block" />;
  const now = along(axis, axis.today);
  const n = v.season_count;
  return (
    <span className="flex min-w-0 grow basis-48 items-center gap-2"
      title={n ? `${n} qualifying period${n === 1 ? "" : "s"} this season`
        + (v.severity_total != null ? ` · ${v.severity_total} severity values of the 18 that mark a decision point` : "")
        : "nothing qualifying this season"}>
      <span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-band" aria-hidden>
        {stripMonths(axis).map((m) => (
          <span key={m.label} className="absolute inset-y-0 w-px bg-rule" style={{ left: `${m.at * 100}%` }} />
        ))}
        {/* What lies past today is the forecast's, and is shaded as such. */}
        <span className="absolute inset-y-0 right-0 bg-ink/5" style={{ left: `${now * 100}%` }} />
        {marks.map((k) => (
          <span key={k.from + k.to}
            className={`absolute inset-y-0.5 rounded-sm ${k.forecast ? "bg-clay" : "bg-ink-soft/60"}`}
            style={{ left: `${k.left * 100}%`, width: `max(3px, ${k.width * 100}%)` }} />
        ))}
        <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${now * 100}%` }} />
      </span>
      <span className="data w-7 shrink-0 text-right text-[10.5px] text-ink-soft">{n ? `${n}×` : "—"}</span>
    </span>
  );
}
