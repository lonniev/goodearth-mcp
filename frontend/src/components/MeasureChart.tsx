// One measure, three horizons: what is normal here, what has happened, and
// what is coming.
//
// Small and stacked rather than one crowded chart, because the measures do not
// share a unit — degrees, inches and hours on one axis is a picture nobody can
// read. Each keeps the same shape so the eye learns it once: grey band behind
// is the normal range, the solid line is this season, dashed is the forecast.

import { useUnits } from "./Units";
import { useMemo } from "react";
import type { Measure } from "../lib/mcp";
import { dateTicks, labelFits, spaceTicks } from "../lib/dateTicks";
import { drawWidth } from "../lib/chartBox";
import { useBoxWidth } from "../lib/useBoxWidth";
import { useChartZoom, windowToDomain } from "../lib/useChartZoom";
import ZoomControls, { AxisZoom } from "./ZoomControls";

/// Height, gutters and type are pixels; the WIDTH is the box's own. It was a
/// fixed 740-unit drawing held at a 520 px minimum, which on a phone ran each
/// chart 229 px past the right edge of its card — cutting off exactly the
/// recent weeks and the forecast.
const H = 150, L = 46, RIGHT_PAD = 14, T = 10, B = 118;

export default function MeasureChart({
  measure, dates, forecastDates, label, emoji, color = "var(--color-growth)", zoomable = true,
}: {
  measure: Measure;
  dates: string[];
  forecastDates: string[];
  label: string;
  emoji?: string;
  color?: string;
  zoomable?: boolean;
}) {
  const u = useUnits();
  const { ref: box, width: boxW } = useBoxWidth<HTMLDivElement>();
  const W = drawWidth(boxW);
  const R = W - RIGHT_PAD;
  // The gutters are fixed pixels, so the drag zones are this drawing's own
  // fractions rather than the 740-wide defaults.
  const { zoom, zoomX, zoomY, reset, isZoomed, svgRef } =
    useChartZoom({ plotLeft: L / W, plotBottom: B / H });

  const view = useMemo(() => {
    const act = measure.actual ?? [];
    const fc = measure.forecast ?? [];
    const band = measure.normal ?? [];
    const all = [...act, ...fc, ...band.flatMap((b) => [b.min, b.max])]
      .filter((v): v is number => typeof v === "number");
    if (all.length < 2) return null;

    const total = act.length + fc.length;
    const lo0 = Math.min(...all), hi0 = Math.max(...all);
    const pad = (hi0 - lo0) * 0.08 || 1;

    const [dLo, dHi] = windowToDomain(zoom.x, 0, Math.max(total - 1, 1));
    const [vLo, vHi] = windowToDomain(zoom.y, lo0 - pad, hi0 + pad);

    const x = (i: number) => L + ((i - dLo) * (R - L)) / Math.max(dHi - dLo, 1e-6);
    const y = (v: number) => B - ((v - vLo) * (B - T)) / Math.max(vHi - vLo, 1e-6);

    const path = (vals: (number | null)[], offset = 0) => {
      let d = "", pen = false;
      vals.forEach((v, i) => {
        if (v == null) { pen = false; return; }
        d += `${pen ? "L" : "M"}${x(i + offset).toFixed(1)} ${y(v).toFixed(1)}`;
        pen = true;
      });
      return d;
    };

    let bandPath = "";
    if (band.length > 1) {
      // As far right as the chart goes. The band used to stop at the last
      // recorded day, which left the forecast with nothing behind it —
      // exactly where a reader is asking "is that a lot?". A server that
      // still sends the shorter band simply draws the shorter band.
      const n = Math.min(band.length, total);
      const up = band.slice(0, n).map((b, i) => `${x(i).toFixed(1)} ${y(b.max).toFixed(1)}`);
      const dn = band.slice(0, n).reverse().map((b, i) => `${x(n - 1 - i).toFixed(1)} ${y(b.min).toFixed(1)}`);
      bandPath = `M${up.join(" L")} L${dn.join(" L")} Z`;
    }

    // Months, then weeks, then days, chosen by how much is on screen. This
    // used to emit month labels only, so a six-week window showed two labels
    // and nothing between them — the closer you looked, the less it said.
    const combined = [...dates, ...forecastDates];
    const ticks = spaceTicks(
      dateTicks(dLo, dHi, (d) => combined[d] ?? null)
        .map((t) => ({ i: t.d, label: t.label, major: t.major }))
        // On the plot, and wholly inside the drawing: a label half past the
        // right edge reads as a different word.
        .filter((t) => x(t.i) >= L - 1 && labelFits(x(t.i) + 2, t.label, W)),
      (t) => x(t.i) + 2,
    );

    const mid = (vLo + vHi) / 2;
    const gridVals = [vLo + (vHi - vLo) * 0.15, mid, vHi - (vHi - vLo) * 0.15];

    return { x, y, path, bandPath, ticks, gridVals, act, fc, total };
  }, [measure, zoom, dates, forecastDates, W, R]);

  if (!view) {
    return (
      <div className="rounded-md border border-rule bg-panel p-4 text-[12.5px] text-ink-soft">
        {emoji} {label} — not enough on record yet.
      </div>
    );
  }

  const { x, y, path, bandPath, ticks, gridVals, act, fc } = view;
  const decimals = measure.unit === "in" ? 2 : measure.unit === "hours" ? 1 : 0;
  // Inches, hours and mph mean the same thing in both scales; only a degree
  // series is converted, and its axis says which scale it is in. The shape is
  // untouched — a linear rescale of the labels, not of the data.
  const degrees = measure.unit === "°F";
  const show = (v: number) => (degrees ? u.temp(v) : v).toFixed(decimals);
  const unitLabel = degrees ? u.tempUnit.trim() : measure.unit;

  return (
    <div className="rounded-md border border-rule bg-panel px-2.5 pt-2.5 pb-1.5">
      <div className="mb-1 flex flex-wrap items-baseline gap-2 px-1">
        <span className="figure text-[15px] font-semibold">
          {emoji && <span className="mr-1.5">{emoji}</span>}{label}
        </span>
        {measure.accumulates ? (
          <span className="text-[12.5px] text-ink-soft">
            <b className="figure text-ink">{measure.actual_total?.toFixed(2)} {unitLabel}</b> so far
            {measure.normal_total != null && ` · normally ${measure.normal_total.toFixed(2)} by now`}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-soft">
            <b className="figure text-ink">{measure.latest != null ? show(measure.latest) : "—"} {unitLabel}</b> latest
            {measure.normal_today && ` · normal ${show(measure.normal_today.mean)}`}
          </span>
        )}
      </div>

      {/* The value control sits beside the value axis it scales. It used to be
          a button in the row below labelled "GDD" — on a chart of degrees,
          inches or hours. */}
      <div className="flex items-stretch">
      {zoomable && <AxisZoom onZoom={zoomY} label={unitLabel || label} />}
      <div ref={box} className="min-w-0 flex-1">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
        className={`ge-chart block h-auto w-full touch-none select-none ${isZoomed ? "cursor-grab" : ""}`}
        role="img" aria-label={`${label}, this season against the normal range`}>
        <defs>
          <clipPath id={`clip-${label.replace(/\W/g, "")}`}>
            <rect x={L} y={T} width={R - L} height={B - T} />
          </clipPath>
        </defs>

        {gridVals.map((g, i) => (
          <g key={i}>
            <line x1={L} x2={R} y1={y(g)} y2={y(g)} stroke="var(--color-rule)" strokeWidth={1} strokeDasharray="1 4" />
            <text x={L - 6} y={y(g) + 3} textAnchor="end" fontSize={9} fill="var(--color-ink-soft)" fontFamily="var(--font-data)">
              {show(g)}
            </text>
          </g>
        ))}

        <g clipPath={`url(#clip-${label.replace(/\W/g, "")})`}>
          {bandPath && <path d={bandPath} fill="var(--color-band)" />}
          <path d={path(act)} fill="none" stroke={color} strokeWidth={1.8} />
          {fc.length > 0 && (
            <path d={path(fc, act.length)} fill="none" stroke={color} strokeWidth={1.8} strokeDasharray="5 3" />
          )}
        </g>

        {/* A month boundary is drawn darker than the days inside it, so the
            coarse structure survives the detail — a ruler shows centimetres
            without hiding the millimetres. */}
        {ticks.map((t) => (
          <text key={t.i} x={x(t.i) + 2} y={B + 14} fontSize={9}
            fill={t.major ? "var(--color-ink)" : "var(--color-ink-soft)"}
            fontFamily="var(--font-data)">
            {t.label}
          </text>
        ))}
        <line x1={L} x2={R} y1={B} y2={B} stroke="var(--color-ink)" strokeWidth={1.2} />
      </svg>
      </div>
      </div>

      {zoomable && (
        <ZoomControls onZoomX={zoomX} onReset={reset} isZoomed={isZoomed} />
      )}
    </div>
  );
}
