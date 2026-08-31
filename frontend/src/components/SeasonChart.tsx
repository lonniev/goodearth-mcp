// The season heat curve — the Heat Ledger's centrepiece.
//
// Geometry follows frontend/design/heat-ledger-mock.html: normals band behind,
// the actual mean in accrual green, a spread ribbon around it showing the range
// across the region's ground, the forecast dashed, the projection dotted, and
// the frost line in frost blue.
//
// Every series here comes from goodearth_gdd_season_curve. Nothing is
// synthesised: when the server did not return a band or a forecast, that
// element is simply absent rather than guessed at.

import { useMemo } from "react";
import type { SeasonCurveResult } from "../lib/mcp";

const W = 740, H = 268, L = 46, R = 716, T = 16, B = 232;

interface Props {
  data: SeasonCurveResult;
  /// Median first frost as a day-index into the curve, when known (T2).
  frostDayIndex?: number | null;
}

function niceCeil(v: number): number {
  const step = v > 2000 ? 500 : v > 800 ? 250 : 100;
  return Math.max(Math.ceil(v / step) * step, step);
}

export default function SeasonChart({ data, frostDayIndex = null }: Props) {
  const view = useMemo(() => {
    const mean = data.curve?.cumulative_mean ?? [];
    const dates = data.curve?.dates ?? [];
    if (mean.length < 2) return null;

    const fc = data.forecast?.cumulative ?? [];
    const proj = data.projection?.cumulative ?? [];
    const band = data.normals?.band ?? [];
    const spread = data.accumulated_gdd;

    const totalDays = mean.length + fc.length + proj.length;
    const gMax = niceCeil(
      Math.max(
        ...mean, ...fc, ...proj,
        ...band.map((b) => b.max),
      ),
    );

    const x = (d: number) => L + (d * (R - L)) / Math.max(totalDays - 1, 1);
    const y = (g: number) => B - (g * (B - T)) / gMax;
    const line = (pts: [number, number][]) =>
      pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");

    // Normals band — min/max envelope across the last N seasons.
    let bandPath = "";
    if (band.length > 1) {
      const n = Math.min(band.length, mean.length);
      const up = band.slice(0, n).map((b, i) => `${x(i).toFixed(1)} ${y(b.max).toFixed(1)}`);
      const dn = band.slice(0, n).reverse().map((b, i) =>
        `${x(n - 1 - i).toFixed(1)} ${y(b.min).toFixed(1)}`,
      );
      bandPath = `M${up.join(" L")} L${dn.join(" L")} Z`;
    }

    // Spread ribbon — the min/max ground within the region, scaled along the
    // curve's own shape. This is the product; it gets its own fill.
    let ribbon = "";
    if (spread && spread.spread > 0 && spread.mean > 0) {
      const lo = spread.min / spread.mean, hi = spread.max / spread.mean;
      const up = mean.map((g, i) => `${x(i).toFixed(1)} ${y(g * hi).toFixed(1)}`);
      const dn = [...mean].reverse().map((g, i) =>
        `${x(mean.length - 1 - i).toFixed(1)} ${y(g * lo).toFixed(1)}`,
      );
      ribbon = `M${up.join(" L")} L${dn.join(" L")} Z`;
    }

    const actual: [number, number][] = mean.map((g, i) => [i, g]);
    const last = mean.length - 1;
    const fcPts: [number, number][] = fc.length
      ? [[last, mean[last]], ...fc.map((g, i) => [last + 1 + i, g] as [number, number])]
      : [];
    const projStart = fcPts.length ? fcPts[fcPts.length - 1] : ([last, mean[last]] as [number, number]);
    const projPts: [number, number][] = proj.length
      ? [projStart, ...proj.map((g, i) => [projStart[0] + 1 + i, g] as [number, number])]
      : [];

    // Month ticks from the real dates, one per month change.
    const ticks: { d: number; label: string }[] = [];
    let lastMonth = "";
    dates.forEach((iso, i) => {
      const m = iso.slice(0, 7);
      if (m !== lastMonth) {
        lastMonth = m;
        ticks.push({
          d: i,
          label: new Date(iso + "T12:00:00").toLocaleString("en-US", { month: "short" }).toUpperCase(),
        });
      }
    });

    const gridLines = Array.from({ length: 4 }, (_, i) => Math.round((gMax / 4) * (i + 1)));

    return { x, y, line, bandPath, ribbon, actual, fcPts, projPts, ticks, gridLines, last, mean, gMax };
  }, [data]);

  if (!view) {
    return (
      <div className="rounded-md border border-rule bg-panel p-6 text-sm text-ink-soft">
        Not enough of the season on record yet to draw a curve.
      </div>
    );
  }

  const { x, y, line, bandPath, ribbon, actual, fcPts, projPts, ticks, gridLines, last, mean } = view;
  const todayGdd = mean[last];

  return (
    <div className="overflow-x-auto rounded-md border border-rule bg-panel px-2.5 pt-3.5 pb-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full min-w-[560px]"
        role="img"
        aria-label={`Cumulative growing degree days, base ${data.base_temp_f} degrees Fahrenheit, against the ${data.normals?.span_years ?? 0}-season range`}
      >
        {bandPath && <path d={bandPath} fill="var(--color-band)" />}

        {gridLines.map((g) => (
          <g key={g}>
            <line x1={L} x2={R} y1={y(g)} y2={y(g)} stroke="var(--color-rule)" strokeWidth={1} strokeDasharray="1 4" />
            <text x={L - 6} y={y(g) + 3} textAnchor="end" fontSize={9} fill="var(--color-ink-soft)" fontFamily="var(--font-data)">
              {g}
            </text>
          </g>
        ))}

        {ticks.map((t) => (
          <g key={t.d}>
            <line x1={x(t.d)} x2={x(t.d)} y1={B} y2={B + 4} stroke="var(--color-ink-soft)" />
            <text x={x(t.d) + 2} y={B + 16} fontSize={9} fill="var(--color-ink-soft)" fontFamily="var(--font-data)" letterSpacing="1">
              {t.label}
            </text>
          </g>
        ))}
        <line x1={L} x2={R} y1={B} y2={B} stroke="var(--color-ink)" strokeWidth={1.5} />

        {ribbon && <path d={ribbon} fill="var(--color-growth)" opacity={0.18} />}
        <path d={line(actual)} fill="none" stroke="var(--color-growth)" strokeWidth={2.5} />
        {fcPts.length > 1 && (
          <path d={line(fcPts)} fill="none" stroke="var(--color-growth)" strokeWidth={2.5} strokeDasharray="6 4" />
        )}
        {projPts.length > 1 && (
          <path d={line(projPts)} fill="none" stroke="var(--color-ink-soft)" strokeWidth={1.6} strokeDasharray="2 5" />
        )}

        {frostDayIndex != null && (
          <>
            <line x1={x(frostDayIndex)} x2={x(frostDayIndex)} y1={T} y2={B} stroke="var(--color-frost)" strokeWidth={1.6} strokeDasharray="7 4" />
            <text x={x(frostDayIndex) - 5} y={T + 10} textAnchor="end" fontSize={9.5} fill="var(--color-frost)" fontFamily="var(--font-data)">
              MEDIAN FIRST FROST
            </text>
          </>
        )}

        <circle cx={x(last)} cy={y(todayGdd)} r={4.5} fill="var(--color-ink)" />
        <text x={x(last) + 7} y={y(todayGdd) + 4} fontSize={10} fontWeight={600} fill="var(--color-ink)">
          today · {Math.round(todayGdd).toLocaleString()}
        </text>
      </svg>

      <div className="flex flex-wrap gap-3.5 px-2 pt-2 pb-1 text-[11.5px] text-ink-soft">
        {data.normals && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-4.5 bg-band" />
            {data.normals.span_years}-season range
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-4.5 border-t-[3px] border-growth" />
          this season (mean)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-4.5 border-t-[3px] border-growth opacity-40" />
          across your ground
        </span>
        {data.forecast && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-4.5 border-t-[3px] border-dashed border-growth" />
            7-day forecast
          </span>
        )}
        {data.projection && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-4.5 border-t-[3px] border-dotted border-ink-soft" />
            projection at the recent rate
          </span>
        )}
      </div>
    </div>
  );
}
