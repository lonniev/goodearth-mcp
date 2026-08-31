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

import { useEffect, useRef, useState } from "react";
import type { LedgerFlag } from "../lib/ledgerFlags";
import type { SeasonCurveResult } from "../lib/mcp";
import {
  guidanceLinks, jurisdictionFor, lookupSpecies,
  type GuidanceLink, type SpeciesInfo,
} from "../lib/species";

const KIND: Record<LedgerFlag["kind"], { label: string; tone: string; source: string }> = {
  crop: {
    label: "Crop target", tone: "text-growth",
    source: "Your planting's degree-day target, counted from its set-out date.",
  },
  pest: {
    label: "Pest threshold", tone: "text-honey",
    source: "Your own pest model. Confirm the figure against a local extension bulletin.",
  },
  wildlife: {
    label: "Wildlife event", tone: "text-frost",
    source: "Your own wildlife threshold — Good Earth times it, it does not publish natural history.",
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
  const box = useRef<HTMLDivElement | null>(null);
  const k = KIND[flag.kind];
  const [info, setInfo] = useState<SpeciesInfo | null>(null);
  const [looking, setLooking] = useState(true);
  const [links, setLinks] = useState<GuidanceLink[]>([]);

  // The subject is the part before the separator: "Codling moth · first egg
  // hatch" is a moth, not an egg hatch.
  const subject = flag.label.split("·")[0].trim();

  useEffect(() => {
    const ac = new AbortController();
    setLooking(true);
    setInfo(null);
    lookupSpecies(subject, ac.signal)
      .then((r) => { if (!ac.signal.aborted) setInfo(r); })
      .catch(() => { /* identity is a bonus; the timing stands without it */ })
      .finally(() => { if (!ac.signal.aborted) setLooking(false); });

    const c = curve.region?.centroid;
    if (c) {
      jurisdictionFor(c.lat, c.lon, ac.signal)
        .then((state) => {
          if (!ac.signal.aborted) setLinks(guidanceLinks(subject, flag.kind, state));
        })
        .catch(() => setLinks(guidanceLinks(subject, flag.kind, null)));
    } else {
      setLinks(guidanceLinks(subject, flag.kind, null));
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

  const recorded = curve.curve?.dates?.length ?? 0;
  const forecastEnd = recorded + (curve.forecast?.cumulative.length ?? 0);
  const horizon =
    flag.index < recorded ? "recorded"
    : flag.index < forecastEnd ? "forecast"
    : "projected";

  const confidence =
    horizon === "recorded"
      ? "This already happened. The date is from the season's own record."
      : horizon === "forecast"
        ? "Inside the seven-day forecast, so this is a forecast date rather than a guess."
        : "Past the forecast, carried forward at the last fortnight's rate. It answers "
          + "'if the season keeps behaving as it has' — read it as a sketch, not a promise.";

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
            {flag.date ? nice(flag.date) : "Beyond the projection"}
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-soft">
            {flag.reached ? "already passed" : "expected"}
            {flag.gdd != null && ` · at ${Math.round(flag.gdd).toLocaleString()} GDD accumulated`}
          </div>
        </div>

        {/* ── What it is ──────────────────────────────────────────── */}
        {looking ? (
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
              No match for "{subject}" in the taxonomy — which usually means the
              name here is a local one. The timing below still stands.
            </span>
          </Row>
        )}

        <Row label="How firm is this?">{confidence}</Row>
        <Row label="Where the threshold came from">{k.source}</Row>

        {flag.baseMismatch != null && (
          <Row label="⚠ Different base temperature" tone="text-clay">
            This threshold counts from {flag.baseMismatch}°F, but this block's curve
            accumulates from {curve.base_temp_f}°F. The flag is shown dimmed and its
            position is approximate — the two are not the same axis. Set the block's
            base to match, or read this one on its own view.
          </Row>
        )}

        {spreadDays != null && spreadDays >= 1 && (
          <Row label="Across your ground">
            The warm and cool ends of this block are about {spreadDays} day
            {spreadDays === 1 ? "" : "s"} apart in timing, so this date is the middle
            of a spread rather than a line across the field. Expect the bench first
            and the hollow last.
          </Row>
        )}

        {/* ── Management: routed, never generated ─────────────────── */}
        {links.length > 0 && (
          <div className="mt-3.5">
            <div className="eyebrow">Where management guidance lives</div>
            <p className="mt-1 text-[13px] leading-relaxed">
              Good Earth does not recommend treatments. Pesticide registration
              is state-specific and changes yearly, and a label rate is law
              rather than advice — so the bulletin below is the authority, not
              this screen.
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

        <Row label="What would sharpen it">
          A field report when you actually see this — the calibration loop turns
          observations into a correction for this block, and after a few of them
          the date stops being the region's and starts being yours.
        </Row>
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
