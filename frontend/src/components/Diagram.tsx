// The furniture the three explainers share.
//
// Two rules, and they are the same rule the charts already follow.
//
// **The STRUCTURE is drawn and the CREATURES are not.** An axis, an arc, a
// marker, a curve — those are geometry, and geometry is what SVG is good for.
// A caterpillar drawn out of ellipses comes out dead every time, so the
// organisms are the emoji this app already uses on every page: the 🐛 on the
// Pests table and the 🍎 on the Crops ledger are the same characters here, so
// a reader who arrives at the real page recognises what they were shown.
//
// **A diagram earns its place by carrying something.** These are not
// decoration around prose — the plant explainer's whole argument is that the
// stages sit at fixed HEAT and therefore at moving DATES, and that is a claim
// you can only make in a picture. Where a sentence would do, there is a
// sentence.

import type { ReactNode } from "react";

/// One stage on a run: what it is, and the number it sits at.
export interface Stage {
  emoji: string;
  label: string;
  /// Where along the run, 0–1. The reader's eye reads position; the figure
  /// underneath says what the position means.
  at: number;
  figure?: string;
}

/// A horizontal run of stages against a single measured quantity.
///
/// Used for heat, which is the axis both the plant and the pest actually
/// answer to. The axis is unlabelled by number on purpose: the point is the
/// ORDER and the spacing, and a fake scale would invite someone to read a
/// value off a drawing.
export function StageRun({ stages, axis, foot }: {
  stages: Stage[];
  /// What the axis measures, said once, at its right-hand end.
  axis: string;
  foot?: ReactNode;
}) {
  return (
    <div className="my-4 overflow-x-auto overscroll-x-contain">
      <div className="min-w-[520px]">
        {/* Geometry, in one place and in reading order: label above, emoji
            below it, the run, then the figure. Drawn once with these
            overlapping — the label sat inside the emoji's box and the axis
            caption sat on top of the last two figures — which a screenshot
            showed and a type-check never could. */}
        <svg viewBox="0 0 720 136" className="block h-auto w-full" role="img"
          aria-label={`${axis}: ${stages.map((s) => s.label).join(", then ")}`}>
          <line x1={40} x2={664} y1={78} y2={78}
            stroke="var(--color-rule)" strokeWidth={2} />
          <path d="M664 78 l-9 -5 v10 z" fill="var(--color-rule)" />
          <text x={664} y={124} textAnchor="end" fontSize={10.5}
            fontFamily="var(--font-data)" fill="var(--color-ink-soft)">
            {axis}
          </text>

          {stages.map((s) => {
            const x = 40 + s.at * 624;
            return (
              <g key={s.label}>
                <line x1={x} x2={x} y1={70} y2={86}
                  stroke="var(--color-growth)" strokeWidth={2} />
                <text x={x} y={22} textAnchor="middle" fontSize={11}
                  fontFamily="var(--font-body)" fill="var(--color-ink)">
                  {s.label}
                </text>
                <text x={x} y={54} textAnchor="middle" fontSize={22}>{s.emoji}</text>
                {s.figure && (
                  <text x={x} y={104} textAnchor="middle" fontSize={10.5}
                    fontFamily="var(--font-data)" fill="var(--color-ink-soft)">
                    {s.figure}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {foot && <p className="mt-1 text-[12px] text-ink-soft">{foot}</p>}
    </div>
  );
}

/// A year that closes, for something that lives through more than one.
///
/// A tree's year is a loop and a crop's is a line, and drawing them the same
/// way would be the diagram telling the reader they are the same kind of
/// thing. They are not, which is the whole of the tree page.
export function YearWheel({ stages, centre, foot }: {
  stages: Stage[];
  /// What sits in the middle — the thing the loop is about.
  centre: ReactNode;
  foot?: ReactNode;
}) {
  const R = 96;
  const cx = 160;
  const cy = 160;
  // Noon at the top, running clockwise, so January sits where a reader
  // expects the year to start on a clock face.
  const point = (at: number, r: number) => {
    const a = (at * 2 * Math.PI) - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };

  return (
    <div className="my-4 flex flex-wrap items-center gap-x-8 gap-y-3">
      <svg viewBox="0 0 320 320" className="h-[240px] w-[240px] shrink-0" role="img"
        aria-label={`The year: ${stages.map((s) => s.label).join(", then ")}`}>
        <circle cx={cx} cy={cy} r={R} fill="none"
          stroke="var(--color-rule)" strokeWidth={2} />
        {stages.map((s) => {
          const [mx, my] = point(s.at, R);
          const [tx, ty] = point(s.at, R + 30);
          return (
            <g key={s.label}>
              <circle cx={mx} cy={my} r={4} fill="var(--color-growth)" />
              <text x={tx} y={ty} textAnchor="middle" fontSize={20}>{s.emoji}</text>
              <text x={tx} y={ty + 16} textAnchor="middle" fontSize={10}
                fontFamily="var(--font-body)" fill="var(--color-ink)">
                {s.label}
              </text>
            </g>
          );
        })}
        <text x={cx} y={cy} textAnchor="middle" fontSize={13}
          fontFamily="var(--font-display)" fontWeight={700} fill="var(--color-ink)">
          {centre}
        </text>
      </svg>
      {foot && <p className="max-w-sm text-[13px] leading-relaxed text-ink-soft">{foot}</p>}
    </div>
  );
}

/// The claim a page is making, before the picture that makes it.
export function Claim({ children }: { children: ReactNode }) {
  return (
    <p className="figure mb-3 text-[17px] leading-snug font-semibold text-ink">
      {children}
    </p>
  );
}

/// Three facts, not three paragraphs.
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-3">
      {items.map(([term, said]) => (
        <div key={term}>
          <dt className="eyebrow">{term}</dt>
          <dd className="mt-0.5 text-[13px] leading-relaxed">{said}</dd>
        </div>
      ))}
    </dl>
  );
}
