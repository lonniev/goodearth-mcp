// One event on the ledger, opened.
//
// Two halves, and the line between them is deliberate.
//
// The TIMING half is composed from what is already on the page — whether the
// date is recorded, forecast or projected, and therefore how much to trust it.
// Sending that to a model would cost a fare and add adjectives.
//
// The IDENTITY half is fetched, because a grower new to a pest genuinely does
// not know what it is: scientific name, a cited encyclopaedia summary, a
// photograph, and links that can be checked.
//
// What is NOT here is treatment. Pesticide registration is jurisdiction-
// specific and changes annually; a label rate is law, not guidance. A
// generated recommendation could be out of date, off-label, or illegal to
// follow, and this would be the one screen in the app where confident wrongness
// costs a grower their crop or their certification. So instead of answering
// "what is the usual treatment", it ROUTES — names the jurisdiction and hands
// over the extension service whose bulletin is actually authoritative there.

import { useUnits } from "./Units";
import { useEffect, useRef, useState } from "react";
import type { LedgerFlag } from "../lib/ledgerFlags";
import type { SeasonCurveResult } from "../lib/mcp";
import { horizonOf } from "../lib/eventHorizon";
import {
  guidanceLinks, jurisdictionFor, lookupSpecies,
  type GuidanceLink, type SpeciesInfo,
} from "../lib/species";

const KIND: Record<LedgerFlag["kind"], { label: string; tone: string; source: string }> = {
  crop: {
    label: "Crop target", tone: "text-growth",
    source: "The degree-days your planting needs, counted from when it went in.",
  },
  pest: {
    label: "Pest threshold", tone: "text-honey",
    source: "Your degree-day figure for this pest — check it against your extension bulletin.",
  },
  wildlife: {
    label: "Fauna event", tone: "text-frost",
    source: "Your degree-day figure for this animal.",
  },
  task: {
    label: "Your task", tone: "text-ink-soft",
    source: "You chose the date and it's not tied to GDDs.",
  },
};

const nice = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

export default function EventDetail({
  flag, curve, onClose,
}: {
  flag: LedgerFlag;
  curve: SeasonCurveResult;
  onClose: () => void;
}) {
  const u = useUnits();
  const box = useRef<HTMLDivElement | null>(null);
  const k = KIND[flag.kind];
  const [info, setInfo] = useState<SpeciesInfo | null>(null);
  const [looking, setLooking] = useState(true);
  const [links, setLinks] = useState<GuidanceLink[]>([]);

  // The subject is the part before the separator: "Codling moth · first egg
  // hatch" is a moth, not an egg hatch.
  const subject = flag.label.split("·")[0].trim();

  const isTask = flag.kind === "task";

  useEffect(() => {
    const ac = new AbortController();
    setInfo(null);
    // A task names work, not a living thing: no species to look up and no
    // extension bulletin to route to. A "no match in the taxonomy" row, or
    // pesticide guidance, under "Buy seeds" would say nothing.
    if (flag.kind === "task") { setLooking(false); setLinks([]); return () => ac.abort(); }
    setLooking(true);
    // Constrained to the kingdom the flag is about. Unconstrained, iNaturalist
    // ranks by observation count across all life and a plant can lose its own
    // name to an insect or a fish that shares it.
    lookupSpecies(subject, ac.signal, flag.kind === "crop" ? "plants" : "animals")
      .then((r) => { if (!ac.signal.aborted) setInfo(r); })
      .catch(() => { /* identity is a bonus; the timing stands without it */ })
      .finally(() => { if (!ac.signal.aborted) setLooking(false); });

    const c = curve.region?.centroid;
    const kind = flag.kind;
    if (c) {
      jurisdictionFor(c.lat, c.lon, ac.signal)
        .then((state) => {
          if (!ac.signal.aborted) setLinks(guidanceLinks(subject, kind, state));
        })
        .catch(() => setLinks(guidanceLinks(subject, kind, null)));
    } else {
      setLinks(guidanceLinks(subject, kind, null));
    }
    return () => ac.abort();
  }, [subject, flag.kind, curve.region]);

  // Escape closes, and focus moves in — a modal a keyboard cannot leave is a trap.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    box.current?.focus();
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const horizon = horizonOf(flag, curve);
  // A task's day is the grower's to set and to tick off. Past it and still on
  // the chart means it is not marked done, since done tasks leave the chart.
  const overdue = isTask && horizon === "recorded";

  const confidence =
    isTask
      ? overdue
        ? "Past due and not marked done."
        : "You recorded this fixed date."
      : horizon === "recorded"
      ? "It's happened, by this season's record."
      : horizon === "forecast"
        ? "Fairly sure: it's within the 7-day forecast."
        : "A rough guess, assuming the last two weeks' warmth holds.";

  const spread = curve.accumulated_gdd;
  const spreadDays =
    spread && spread.spread > 0 && curve.curve?.cumulative_mean
      ? (() => {
          const m = curve.curve.cumulative_mean;
          if (m.length < 15) return null;
          const rate = (m[m.length - 1] - m[m.length - 15]) / 14;
          return rate > 0 ? Math.round(spread.spread / rate) : null;
        })()
      : null;

  return (
    <div
      className="fixed inset-0 z-[900] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={flag.label}
    >
      <div
        ref={box}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-lg overflow-auto rounded-t-xl border border-rule bg-panel p-5 shadow-xl outline-none sm:rounded-xl"
      >
        <div className="flex items-start gap-3">
          <span className="text-[30px] leading-none">{flag.emoji ?? "•"}</span>
          <div className="min-w-0 flex-1">
            <div className={`eyebrow ${k.tone}`}>{k.label}</div>
            <h2 className="figure text-[20px] font-semibold leading-tight">{flag.label}</h2>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="-mt-1 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded text-[20px] text-ink-soft active:bg-band">
            ×
          </button>
        </div>

        <div className="mt-4 rounded-md border border-rule bg-paper/60 px-3.5 py-3">
          <div className="figure text-[17px]">
            {flag.date ? nice(flag.date) : "Further out than we can project"}
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-soft">
            {isTask ? (overdue ? "due · not done yet" : "due")
              : flag.reached ? "already passed" : "expected"}
            {flag.gdd != null && ` · at ${Math.round(flag.gdd).toLocaleString()} GDD accumulated`}
          </div>
        </div>

        {/* ── What it is ──────────────────────────────────────────── */}
        {isTask ? null : looking ? (
          <Row label="What it is"><span className="text-ink-soft">Looking it up…</span></Row>
        ) : info ? (
          <div className="mt-3.5">
            <div className="eyebrow">What it is</div>
            <div className="mt-1 flex gap-3">
              {info.photo && (
                <img src={info.photo.url} alt={info.commonName ?? info.scientificName}
                  className="h-20 w-20 shrink-0 rounded-md border border-rule object-cover" />
              )}
              <div className="min-w-0">
                <div className="text-[13px]">
                  <b>{info.commonName ?? info.scientificName}</b>
                  {info.commonName && (
                    <span className="ml-1.5 italic text-ink-soft">{info.scientificName}</span>
                  )}
                </div>
                {info.summary && (
                  <p className="mt-1 text-[12.5px] leading-relaxed">
                    {info.summary.length > 420 ? info.summary.slice(0, 419) + "…" : info.summary}
                  </p>
                )}
              </div>
            </div>
            <p className="data mt-1.5 flex flex-wrap gap-x-3 text-[10.5px]">
              {info.wikipediaUrl && (
                <a href={info.wikipediaUrl} target="_blank" rel="noreferrer"
                  className="text-frost underline">Wikipedia</a>
              )}
              <a href={info.inatUrl} target="_blank" rel="noreferrer"
                className="text-frost underline">iNaturalist</a>
              {info.photo?.attribution && (
                <span className="text-ink-soft">{info.photo.attribution.slice(0, 70)}</span>
              )}
            </p>
          </div>
        ) : (
          <Row label="What it is">
            <span className="text-ink-soft">
              Not in the species lists — likely a local name — but the timing holds.
            </span>
          </Row>
        )}

        <Row label="How confident?">{confidence}</Row>
        <Row label="How determined?">{k.source}</Row>

        {flag.baseMismatch != null && (
          <Row label="⚠ Different base temperature" tone="text-clay">
            Placed roughly: this counts heat from {u.showTemp(flag.baseMismatch)} and your
            ground from {u.showTemp(curve.base_temp_f)} — match your base to place it exactly.
          </Row>
        )}

        {!isTask && spreadDays != null && spreadDays >= 1 && (
          <Row label="Across your ground">
            Your warm and cool spots run about {spreadDays} day{spreadDays === 1 ? "" : "s"} apart,
            so expect it on warm ground first.
          </Row>
        )}

        {/* ── Management: routed, never generated ─────────────────── */}
        {links.length > 0 && (
          <div className="mt-3.5">
            <div className="eyebrow">Treatment advice</div>
            <p className="mt-1 text-[13px] leading-relaxed">
              Follow the bulletin below: treatment rules vary by state, and the label is the law.
            </p>
            <div className="mt-2 flex flex-col gap-1.5">
              {links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer"
                  className="flex min-h-11 items-center rounded-md border border-rule bg-paper/60 px-3 text-[12.5px] font-medium text-ink active:border-ink">
                  🔗 {l.label}
                  {l.note && <span className="ml-2 hidden font-normal text-ink-soft sm:inline">— {l.note}</span>}
                </a>
              ))}
            </div>
          </div>
        )}

        {!isTask && (
          <Row label="Make it more accurate">
            Report when you see it, and the dates learn your ground.
          </Row>
        )}
      </div>
    </div>
  );
}

function Row({ label, children, tone }: {
  label: string; children: React.ReactNode; tone?: string;
}) {
  return (
    <div className="mt-3.5">
      <div className={`eyebrow ${tone ?? ""}`}>{label}</div>
      <p className="mt-1 text-[13px] leading-relaxed">{children}</p>
    </div>
  );
}
