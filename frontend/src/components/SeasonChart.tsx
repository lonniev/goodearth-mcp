// The season heat curve — the Heat Ledger's centrepiece.
//
// Geometry follows frontend/design/heat-ledger-mock.html: normals band behind,
// the actual mean in accrual green, a spread ribbon showing the range across
// the region's ground, the forecast dashed, the projection dotted, the frost
// line in frost blue.
//
// Both axes zoom independently (useChartZoom). Y zoom earns its keep here: the
// spread ribbon is often a couple of percent of a 2,400-GDD axis and is nearly
// invisible at full scale, but it is the whole product — so the reader needs to
// be able to open it up.
//
// Every series comes from goodearth_gdd_season_curve. Nothing is synthesised:
// where the server returned no band or forecast, that element is absent rather
// than guessed at.

import { useMemo } from "react";
import type { SeasonCurveResult } from "../lib/mcp";
import type { LedgerFlag } from "../lib/ledgerFlags";
import { useChartZoom, windowToDomain } from "../lib/useChartZoom";
import ZoomControls from "./ZoomControls";

const W = 740, H = 268, L = 46, R = 716, T = 16, B = 232;

interface Props {
  data: SeasonCurveResult;
  /// Median first frost as a day-index into the curve, when known (T2).
  frostDayIndex?: number | null;
  /// The grower's own model events, placed on the curve. Derived client-side
  /// from thresholds already on the page, so they cost nothing to show.
  flags?: LedgerFlag[];
}

function niceStep(span: number): number {
  const raw = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
}

export default function SeasonChart({ data, frostDayIndex = null, flags = [] }: Props) {
  const { zoom, zoomX, zoomY, reset, isZoomed, svgRef } = useChartZoom();
  const clipId = "ge-plot-clip";

  const view = useMemo(() => {
    const mean = data.curve?.cumulative_mean ?? [];
    const dates = data.curve?.dates ?? [];
    if (mean.length < 2) return null;

    const fc = data.forecast?.cumulative ?? [];
    const proj = data.projection?.cumulative ?? [];
    const band = data.normals?.band ?? [];
    const spread = data.accumulated_gdd;

    const totalDays = mean.length + fc.length + proj.length;
    const gFull = Math.max(...mean, ...fc, ...proj, ...band.map((b) => b.max), 1);

    // Domain windows after zoom.
    const [dLo, dHi] = windowToDomain(zoom.x, 0, totalDays - 1);
    const [gLo, gHi] = windowToDomain(zoom.y, 0, gFull * 1.04);

    const x = (d: number) => L + ((d - dLo) * (R - L)) / Math.max(dHi - dLo, 1e-6);
    const y = (g: number) => B - ((g - gLo) * (B - T)) / Math.max(gHi - gLo, 1e-6);
    const line = (pts: [number, number][]) =>
      pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");

    let bandPath = "";
    if (band.length > 1) {
      const n = Math.min(band.length, mean.length);
      const up = band.slice(0, n).map((b, i) => `${x(i).toFixed(1)} ${y(b.max).toFixed(1)}`);
      const dn = band.slice(0, n).reverse().map((b, i) =>
        `${x(n - 1 - i).toFixed(1)} ${y(b.min).toFixed(1)}`);
      bandPath = `M${up.join(" L")} L${dn.join(" L")} Z`;
    }

    // The spread ribbon: min/max ground scaled along the curve's own shape.
    let ribbon = "";
    if (spread && spread.spread > 0 && spread.mean > 0) {
      const lo = spread.min / spread.mean, hi = spread.max / spread.mean;
      const up = mean.map((g, i) => `${x(i).toFixed(1)} ${y(g * hi).toFixed(1)}`);
      const dn = [...mean].reverse().map((g, i) =>
        `${x(mean.length - 1 - i).toFixed(1)} ${y(g * lo).toFixed(1)}`);
      ribbon = `M${up.join(" L")} L${dn.join(" L")} Z`;
    }

    const actual: [number, number][] = mean.map((g, i) => [i, g]);
    const last = mean.length - 1;
    const fcPts: [number, number][] = fc.length
      ? [[last, mean[last]], ...fc.map((g, i) => [last + 1 + i, g] as [number, number])] : [];
    const projStart = fcPts.length ? fcPts[fcPts.length - 1] : ([last, mean[last]] as [number, number]);
    const projPts: [number, number][] = proj.length
      ? [projStart, ...proj.map((g, i) => [projStart[0] + 1 + i, g] as [number, number])] : [];

    // Month ticks, thinned to whatever fits the visible window. Zoomed in far
    // enough, fall back to day ticks — a one-week window with no labels is
    // just a squiggle.
    const ticks: { d: number; label: string }[] = [];
    const visDays = dHi - dLo;
    if (visDays > 45) {
      let lastM = "";
      dates.forEach((iso, i) => {
        const m = iso.slice(0, 7);
        if (m !== lastM) {
          lastM = m;
          if (i >= dLo - 1 && i <= dHi + 1) {
            ticks.push({ d: i, label: new Date(iso + "T12:00:00")
              .toLocaleString("en-US", { month: "short" }).toUpperCase() });
          }
        }
      });
    } else {
      const stride = Math.max(Math.round(visDays / 6), 1);
      for (let i = Math.max(Math.ceil(dLo), 0); i <= Math.min(Math.floor(dHi), dates.length - 1); i += stride) {
        ticks.push({ d: i, label: new Date(dates[i] + "T12:00:00")
          .toLocaleString("en-US", { month: "short", day: "numeric" }) });
      }
    }

    const step = niceStep(gHi - gLo);
    const gridLines: number[] = [];
    for (let g = Math.ceil(gLo / step) * step; g <= gHi; g += step) gridLines.push(Math.round(g));

    const rangeLabel = dates.length
      ? `${dates[Math.max(Math.round(dLo), 0)] ?? ""} → ${
          dates[Math.min(Math.round(dHi), dates.length - 1)] ?? "projection"
        } · ${Math.round(gLo).toLocaleString()}–${Math.round(gHi).toLocaleString()} GDD`
      : "";

    return { x, y, line, bandPath, ribbon, actual, fcPts, projPts, ticks, gridLines, last, mean, rangeLabel };
  }, [data, zoom]);

  if (!view) {
    return (
      <div className="rounded-md border border-rule bg-panel p-6 text-sm text-ink-soft">
        Not enough of the season on record yet to draw a curve.
      </div>
    );
  }

  const { x, y, line, bandPath, ribbon, actual, fcPts, projPts, ticks, gridLines, last, mean, rangeLabel } = view;
  const todayGdd = mean[last];

  return (
    <div className="overflow-x-auto rounded-md border border-rule bg-panel px-2.5 pt-3.5 pb-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`block h-auto w-full min-w-[560px] touch-none select-none ${isZoomed ? "cursor-grab" : ""}`}
        role="img"
        aria-label={`Cumulative growing degree days, base ${data.base_temp_f} degrees Fahrenheit, against the ${data.normals?.span_years ?? 0}-season range`}
      >
        {/* Everything data-bearing is clipped to the plot, so a zoomed line
            cannot run out over the axis labels. */}
        <defs>
          <clipPath id={clipId}>
            <rect x={L} y={T} width={R - L} height={B - T} />
          </clipPath>
        </defs>

        {gridLines.map((g) => (
          <g key={g}>
            <line x1={L} x2={R} y1={y(g)} y2={y(g)} stroke="var(--color-rule)" strokeWidth={1} strokeDasharray="1 4" />
            <text x={L - 6} y={y(g) + 3} textAnchor="end" fontSize={9} fill="var(--color-ink-soft)" fontFamily="var(--font-data)">
              {g.toLocaleString()}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {bandPath && <path d={bandPath} fill="var(--color-band)" />}
          {ribbon && <path d={ribbon} fill="var(--color-growth)" opacity={0.18} />}
          <path d={line(actual)} fill="none" stroke="var(--color-growth)" strokeWidth={2.5} />
          {fcPts.length > 1 && (
            <path d={line(fcPts)} fill="none" stroke="var(--color-growth)" strokeWidth={2.5} strokeDasharray="6 4" />
          )}
          {projPts.length > 1 && (
            <path d={line(projPts)} fill="none" stroke="var(--color-ink-soft)" strokeWidth={1.6} strokeDasharray="2 5" />
          )}
          {frostDayIndex != null && (
            <line x1={x(frostDayIndex)} x2={x(frostDayIndex)} y1={T} y2={B} stroke="var(--color-frost)" strokeWidth={1.6} strokeDasharray="7 4" />
          )}
            {/* The grower's own calendar, on the curve that produces it.
              Stems alternate length so neighbouring flags do not collide, and
              a flag whose threshold is counted from a different base
              temperature is dimmed rather than quietly misplaced. */}
          {flags.map((f, i) => {
            const cx = x(f.index);
            if (cx < L - 4 || cx > R + 4) return null;
            const cy = f.gdd != null ? y(f.gdd) : B - 8;
            const stem = 16 + (i % 3) * 13;
            const tone =
              f.kind === "crop" ? "var(--color-growth)"
              : f.kind === "pest" ? "var(--color-honey)"
              : "var(--color-frost)";
            return (
              <g key={`${f.label}-${f.index}`} opacity={f.baseMismatch ? 0.45 : f.reached ? 1 : 0.75}>
                <line x1={cx} y1={cy} x2={cx} y2={cy - stem} stroke={tone} strokeWidth={1} />
                <circle cx={cx} cy={cy} r={3.5} fill={tone} stroke="var(--color-panel)" strokeWidth={1.2} />
                <text x={cx + 4} y={cy - stem - 2} fontSize={9} fill={tone} fontFamily="var(--font-data)">
                  {f.emoji} {f.label.length > 22 ? f.label.slice(0, 21) + "…" : f.label}
                </text>
              </g>
            );
          })}

        <circle cx={x(last)} cy={y(todayGdd)} r={4.5} fill="var(--color-ink)" />
          <text x={x(last) + 7} y={y(todayGdd) + 4} fontSize={10} fontWeight={600} fill="var(--color-ink)">
            today · {Math.round(todayGdd).toLocaleString()}
          </text>
        </g>

        {frostDayIndex != null && (
          <text x={x(frostDayIndex) - 5} y={T + 10} textAnchor="end" fontSize={9.5} fill="var(--color-frost)" fontFamily="var(--font-data)">
            MEDIAN FIRST FROST
          </text>
        )}

        {ticks.map((t) => (
          <g key={t.d}>
            <line x1={x(t.d)} x2={x(t.d)} y1={B} y2={B + 4} stroke="var(--color-ink-soft)" />
            <text x={x(t.d) + 2} y={B + 16} fontSize={9} fill="var(--color-ink-soft)" fontFamily="var(--font-data)" letterSpacing="1">
              {t.label}
            </text>
          </g>
        ))}
        <line x1={L} x2={R} y1={B} y2={B} stroke="var(--color-ink)" strokeWidth={1.5} />
      </svg>

      <ZoomControls onZoomX={zoomX} onZoomY={zoomY} onReset={reset} isZoomed={isZoomed} range={rangeLabel} />

      <div className="flex flex-wrap gap-3.5 px-2 pt-2 pb-1 text-[11.5px] text-ink-soft">
        {data.normals && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-4.5 bg-band" />{data.normals.span_years}-season range
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-4.5 border-t-[3px] border-growth" />this season (mean)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-4.5 bg-growth opacity-25" />across your ground
        </span>
        {data.forecast && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-4.5 border-t-[3px] border-dashed border-growth" />7-day forecast
          </span>
        )}
        {data.projection && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-4.5 border-t-[3px] border-dotted border-ink-soft" />projection at the recent rate
          </span>
        )}
      </div>
    </div>
  );
}
