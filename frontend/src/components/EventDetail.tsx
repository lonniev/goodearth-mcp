// One event on the ledger, opened.
//
// The narrative is COMPOSED, not fetched. Everything a grower needs to judge a
// flag is already on the page: what the threshold is, where it came from, what
// the curve says, and how firm that is. Sending it to a model to be written up
// would cost a fare and add nothing but adjectives — and would risk asserting
// agronomy the rest of this app is careful not to claim.
//
// What the modal does add is the part a flag on a curve cannot show: whether
// the date is measured or projected, and how much to trust it.

import { useEffect, useRef } from "react";
import type { LedgerFlag } from "../lib/ledgerFlags";
import type { SeasonCurveResult } from "../lib/mcp";

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
