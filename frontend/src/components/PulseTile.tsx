// One tile of the Dashboard's pulse strip, drawn as a small infographic.
//
// It was a 15px emoji over a 28px figure over a sentence, and three of the
// five tiles had nothing under the sentence — tiny glyphs, big numbers, and a
// lot of empty card. Now the glyph is the anchor (a disc on the left), the
// figure and its words sit beside it at reading size, and every tile carries a
// picture of where its figure falls: a range with a marker, or a bar out from
// normal. The picture is what makes the number mean something at a glance.

import type { ReactNode } from "react";

export type Tone = "growth" | "frost" | "clay";

/// Where a figure sits in a range, 0..1, with the range's two ends named.
/// `ticks` are named landmarks inside it — a median, a threshold.
export interface RangeGauge {
  kind: "range";
  pos: number;
  /// The ends' names. Omit both when the ticks carry their own marks.
  lo?: ReactNode;
  hi?: ReactNode;
  /// `mark` is printed under the tick; `label` is its tooltip.
  ticks?: { pos: number; label?: string; mark?: string }[];
  /// Shaded stretches of the strip — the frost bands under a thermometer.
  zones?: { from: number; to: number; className: string }[];
  /// Words under the strip with no tick of their own — a barometer's face.
  labels?: { pos: number; text: string }[];
}

/// A signed departure from normal, -1..1, drawn as a bar out from the centre.
export interface DivergeGauge {
  kind: "diverge";
  value: number;
  lo: ReactNode;
  hi: ReactNode;
}

export type Gauge = RangeGauge | DivergeGauge;

const clamp = (v: number) => Math.min(Math.max(v, 0), 1);

const INK: Record<Tone, string> = {
  growth: "text-growth", frost: "text-frost", clay: "text-clay",
};
const FILL: Record<Tone, string> = {
  growth: "bg-growth", frost: "bg-frost", clay: "bg-clay",
};
const DISC: Record<Tone | "plain", string> = {
  growth: "bg-growth/12", frost: "bg-frost/12", clay: "bg-clay/12", plain: "bg-band",
};

export default function PulseTile({ emoji, value, unit, label, tone, muted, gauge, title }: {
  /// A glyph, or a small drawing where no emoji says the thing.
  emoji: ReactNode;
  value: string;
  unit?: ReactNode;
  label: string;
  tone?: Tone;
  muted?: boolean;
  gauge?: Gauge | null;
  title?: string;
}) {
  const fill = FILL[tone ?? "growth"];
  return (
    <div title={title}
      className={`flex min-w-0 flex-col gap-2 border-l border-rule px-3 py-2.5 first:border-l-0 ${muted ? "opacity-45" : ""}`}>
      <div className="flex items-center gap-2.5 lg:gap-2">
        <span aria-hidden
          className={`flex size-11 shrink-0 items-center justify-center rounded-full text-[26px] leading-none sm:size-12 sm:text-[28px] lg:size-10 lg:text-[23px] ${DISC[tone ?? "plain"]}`}>
          {emoji}
        </span>
        <div className="min-w-0">
          <div className={`figure text-[clamp(17px,1.7vw,21px)] leading-none ${tone ? INK[tone] : ""}`}>
            {value}
            {unit && <small className="ml-1 text-[0.6em] font-normal text-ink-soft">{unit}</small>}
          </div>
          <div className="mt-1 text-[10.5px] leading-snug text-ink-soft">{label}</div>
        </div>
      </div>

      {gauge?.kind === "range" && (
        <div>
          <div className="relative h-[6px] overflow-visible rounded-full bg-band">
            {gauge.zones?.map((z, i) => (
              <span key={`z${i}`} className={`absolute top-0 h-full first:rounded-l-full ${z.className}`}
                style={{ left: `${clamp(z.from) * 100}%`, width: `${(clamp(z.to) - clamp(z.from)) * 100}%` }} />
            ))}
            {gauge.ticks?.map((t, i) => (
              <span key={i} title={t.label}
                className="absolute top-1/2 h-[9px] w-px -translate-y-1/2 bg-ink-soft/50"
                style={{ left: `${clamp(t.pos) * 100}%` }} />
            ))}
            <span className={`absolute top-1/2 size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel ${fill}`}
              style={{ left: `${clamp(gauge.pos) * 100}%` }} />
          </div>
          {(gauge.lo != null || gauge.hi != null) && (
            <div className="data mt-1 flex justify-between gap-2 text-[9.5px] text-ink-soft">
              <span className="truncate">{gauge.lo}</span><span className="truncate">{gauge.hi}</span>
            </div>
          )}
          {(gauge.ticks?.some((t) => t.mark) || gauge.labels?.length) && (
            <div className="data relative mt-1 h-3 text-[9.5px] text-ink-soft">
              {[...(gauge.ticks ?? []).filter((t) => t.mark).map((t) => ({ pos: t.pos, text: t.mark!, title: t.label })),
                ...(gauge.labels ?? []).map((l) => ({ ...l, title: undefined }))].map((t, i) => (
                <span key={i} title={t.title} className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${clamp(t.pos) * 100}%` }}>{t.text}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {gauge?.kind === "diverge" && (
        <div>
          <div className="relative h-[6px] rounded-full bg-band">
            <span className="absolute top-1/2 left-1/2 h-[11px] w-px -translate-y-1/2 bg-ink-soft/60" />
            <span className={`absolute top-0 h-full rounded-full ${fill}`}
              style={gauge.value >= 0
                ? { left: "50%", width: `${clamp(gauge.value) * 50}%` }
                : { right: "50%", width: `${clamp(-gauge.value) * 50}%` }} />
          </div>
          <div className="data mt-1 flex justify-between gap-2 text-[9.5px] text-ink-soft">
            <span className="truncate">{gauge.lo}</span><span>normal</span><span className="truncate">{gauge.hi}</span>
          </div>
        </div>
      )}
    </div>
  );
}
