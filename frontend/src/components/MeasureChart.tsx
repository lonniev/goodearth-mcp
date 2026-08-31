// One measure, three horizons: what is normal here, what has happened, and
// what is coming.
//
// Small and stacked rather than one crowded chart, because the measures do not
// share a unit — degrees, inches and hours on one axis is a picture nobody can
// read. Each keeps the same shape so the eye learns it once: grey band behind
// is the normal range, the solid line is this season, dashed is the forecast.

import { useMemo } from "react";
import type { Measure } from "../lib/mcp";
import { useChartZoom, windowToDomain } from "../lib/useChartZoom";
import ZoomControls from "./ZoomControls";

const W = 740, H = 150, L = 46, R = 726, T = 10, B = 118;

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
  const { zoom, zoomX, zoomY, reset, isZoomed, svgRef } = useChartZoom();

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
      const n = Math.min(band.length, act.length || band.length);
      const up = band.slice(0, n).map((b, i) => `${x(i).toFixed(1)} ${y(b.max).toFixed(1)}`);
      const dn = band.slice(0, n).reverse().map((b, i) => `${x(n - 1 - i).toFixed(1)} ${y(b.min).toFixed(1)}`);
      bandPath = `M${up.join(" L")} L${dn.join(" L")} Z`;
    }

    const ticks: { i: number; label: string }[] = [];
    const combined = [...dates, ...forecastDates];
    let lastM = "";
    combined.forEach((iso, i) => {
      const m = iso.slice(0, 7);
      if (m !== lastM && i >= dLo - 1 && i <= dHi + 1) {
        lastM = m;
        ticks.push({ i, label: new Date(iso + "T12:00:00").toLocaleString("en-US", { month: "short" }).toUpperCase() });
      } else if (m !== lastM) { lastM = m; }
    });

    const mid = (vLo + vHi) / 2;
    const gridVals = [vLo + (vHi - vLo) * 0.15, mid, vHi - (vHi - vLo) * 0.15];

    return { x, y, path, bandPath, ticks, gridVals, act, fc, total };
  }, [measure, zoom, dates, forecastDates]);

  if (!view) {
    return (
      <div className="rounded-md border border-rule bg-panel p-4 text-[12.5px] text-ink-soft">
        {emoji} {label} — not enough on record yet.
      </div>
    );
  }

  const { x, y, path, bandPath, ticks, gridVals, act, fc } = view;
  const decimals = measure.unit === "in" ? 2 : measure.unit === "hours" ? 1 : 0;

  return (
    <div className="rounded-md border border-rule bg-panel px-2.5 pt-2.5 pb-1.5">
      <div className="mb-1 flex flex-wrap items-baseline gap-2 px-1">
        <span className="figure text-[15px] font-semibold">
          {emoji && <span className="mr-1.5">{emoji}</span>}{label}
        </span>
        {measure.accumulates ? (
          <span className="text-[12.5px] text-ink-soft">
            <b className="figure text-ink">{measure.actual_total?.toFixed(2)} {measure.unit}</b> so far
            {measure.normal_total != null && ` · normally ${measure.normal_total.toFixed(2)} by now`}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-soft">
            <b className="figure text-ink">{measure.latest?.toFixed(decimals)} {measure.unit}</b> latest
            {measure.normal_today && ` · normal ${measure.normal_today.mean.toFixed(decimals)}`}
          </span>
        )}
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
        className={`ge-chart block h-auto w-full min-w-[520px] touch-none select-none ${isZoomed ? "cursor-grab" : ""}`}
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
              {g.toFixed(decimals)}
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

        {ticks.map((t) => (
          <text key={t.i} x={x(t.i) + 2} y={B + 14} fontSize={9} fill="var(--color-ink-soft)" fontFamily="var(--font-data)">
            {t.label}
          </text>
        ))}
        <line x1={L} x2={R} y1={B} y2={B} stroke="var(--color-ink)" strokeWidth={1.2} />
      </svg>

      {zoomable && (
        <ZoomControls onZoomX={zoomX} onZoomY={zoomY} onReset={reset} isZoomed={isZoomed} />
      )}
    </div>
  );
}
