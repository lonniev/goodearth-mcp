// Soil window — when the ground is ready, not when the air is.
//
// Soil lags air by weeks and is the steadier signal, which is why it decides a
// planting date where a warm afternoon does not.
//
// The two questions — "does it cross this week?" and "how long have I got?" —
// used to be two paragraphs, and answering them meant holding four dates in
// your head and subtracting. They are the same shape of fact: a date somewhere
// ahead of today. So they go on one line, in order, and the reader compares
// them by looking.

import { useUnits } from "./Units";
import { dateFor } from "../lib/seasonDays";
import { soilTrack, type SoilTrack } from "../lib/soilTrack";
import type { SoilWindowResult } from "../lib/mcp";

const d = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function SoilCard({ data }: { data: SoilWindowResult }) {
  const u = useUnits();
  const track = soilTrack(data);

  return (
    <div className="mb-3 rounded-md border border-rule bg-panel px-4 py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="figure text-[15.5px] font-semibold">
          Soil {data.direction === "cooling" ? "cooling through" : "warming through"}{" "}
          {u.showTemp(data.threshold_f)}
        </h3>
        {data.current_soil_f != null && (
          <span className="data text-[12px] text-ink-soft">
            now <b className="text-ink">{u.showTemp(data.current_soil_f)}</b>
          </span>
        )}
        <span className="data ml-auto text-[10px] text-ink-soft">{data.band.label}</span>
      </div>

      {track
        ? <Track track={track} threshold={data.threshold_f} />
        : (
          // No line to draw is not a reason to say nothing.
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
            {data.near_term?.note ?? data.note}
          </p>
        )}
    </div>
  );
}

const W = 720, H = 108, L = 8, R = 712, T = 20, B = 76;

/// Today, the forecast, and the years — left to right.
///
/// The forecast is a real line on a real temperature scale, because inside it
/// the answer is a reading. Past its end the drawing stops pretending: the
/// normal window is a band, not a curve, and the median a tick inside it.
function Track({ track, threshold }: { track: SoilTrack; threshold: number }) {
  const u = useUnits();
  const { lo, hi, origin, forecast, horizon, crossing, typical, loF, hiF } = track;

  const x = (day: number) => L + ((day - lo) * (R - L)) / Math.max(hi - lo, 1);
  const y = (f: number) => B - ((f - loF) * (B - T)) / Math.max(hiF - loF, 1e-6);

  const line = forecast
    .map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)} ${y(p.f).toFixed(1)}`)
    .join(" ");

  const label = (day: number) => dateFor(day, origin);

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full"
        role="img"
        aria-label={
          `Soil at planting depth against ${Math.round(threshold)} degrees. `
          + (crossing ? `Crosses ${d(crossing.date)}. ` : "Does not cross inside the forecast. ")
          + (typical ? `Normally ${d(typical.median.date)}, between ${d(typical.earliest.date)} and ${d(typical.latest.date)}.` : "")
        }>
        {/* The years, behind everything: the band the crossing usually falls in. */}
        {typical && (
          <>
            <rect x={x(typical.earliest.day)} y={T - 6}
              width={Math.max(x(typical.latest.day) - x(typical.earliest.day), 2)}
              height={B - T + 12} fill="var(--color-band)" opacity={0.75} rx={3} />
            <line x1={x(typical.median.day)} x2={x(typical.median.day)} y1={T - 6} y2={B + 6}
              stroke="var(--color-ink)" strokeWidth={1.5} />
            <text x={x(typical.median.day)} y={T - 10} textAnchor="middle"
              fontSize={10.5} fontWeight={700} fill="var(--color-ink)"
              fontFamily="var(--font-data)">
              normally {d(typical.median.date)}
            </text>
          </>
        )}

        {/* The threshold the whole card is about. */}
        <line x1={L} x2={R} y1={y(threshold)} y2={y(threshold)}
          stroke="var(--color-clay)" strokeWidth={1.5} strokeDasharray="6 4" />
        <text x={R} y={y(threshold) - 4} textAnchor="end" fontSize={10}
          fill="var(--color-clay)" fontFamily="var(--font-data)"
          paintOrder="stroke" stroke="var(--color-panel)" strokeWidth={3} strokeLinejoin="round">
          {u.showTemp(threshold)}
        </text>

        {/* The forecast — a reading, so it is drawn as one. */}
        {line && <path d={line} fill="none" stroke="var(--color-growth)" strokeWidth={2.5}
          strokeLinejoin="round" strokeLinecap="round" />}

        {crossing && (
          <>
            <circle cx={x(crossing.day)} cy={y(threshold)} r={4.5} fill="var(--color-clay)" />
            <text x={x(crossing.day)} y={y(threshold) + 16} textAnchor="middle" fontSize={10.5}
              fontWeight={700} fill="var(--color-clay)" fontFamily="var(--font-data)"
              paintOrder="stroke" stroke="var(--color-panel)" strokeWidth={3} strokeLinejoin="round">
              {d(crossing.date)}
            </text>
          </>
        )}

        {/* Today. */}
        {forecast.length > 0 && (
          <>
            <circle cx={x(forecast[0].day)} cy={y(forecast[0].f)} r={4} fill="var(--color-ink)" />
            <text x={x(forecast[0].day)} y={B + 18} textAnchor="start" fontSize={10}
              fill="var(--color-ink-soft)" fontFamily="var(--font-data)">today</text>
          </>
        )}

        {/* Where the reading stops and the record takes over. */}
        {horizon != null && (
          <>
            <line x1={x(horizon)} x2={x(horizon)} y1={T - 6} y2={B + 6}
              stroke="var(--color-ink-soft)" strokeWidth={1} strokeDasharray="3 3" />
            <text x={x(horizon)} y={B + 18} textAnchor="middle" fontSize={10}
              fill="var(--color-ink-soft)" fontFamily="var(--font-data)">
              {label(horizon) ? d(label(horizon)!) : ""}
            </text>
          </>
        )}

        {typical && (
          <>
            <text x={x(typical.earliest.day)} y={B + 18} textAnchor="middle" fontSize={10}
              fill="var(--color-ink-soft)" fontFamily="var(--font-data)">
              {d(typical.earliest.date)}
            </text>
            <text x={x(typical.latest.day)} y={B + 18} textAnchor="end" fontSize={10}
              fill="var(--color-ink-soft)" fontFamily="var(--font-data)">
              {d(typical.latest.date)}
            </text>
          </>
        )}
      </svg>

      <p className="data mt-0.5 flex flex-wrap items-center gap-x-3 text-[10.5px] text-ink-soft">
        <span>
          <i className="mr-1.5 inline-block w-4 border-t-[3px] border-growth align-middle" />
          forecast{crossing ? "" : " — no crossing in it"}
        </span>
        {typical && (
          <span>
            <i className="mr-1.5 inline-block h-2.5 w-4 bg-band align-middle" />
            {d(typical.earliest.date)}–{d(typical.latest.date)} across the record
          </span>
        )}
      </p>
    </>
  );
}
