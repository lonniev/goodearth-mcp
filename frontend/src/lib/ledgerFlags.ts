// Model events placed on the season curve.
//
// The curve is already paid for. Every threshold a grower has entered — a crop
// target, a pest stage, a heat-driven wildlife event — is a GDD number, and
// where that number meets the curve is a date. So the whole calendar can be
// derived here, client-side, from data already on the page: no extra call, no
// extra sats.
//
// Date-driven events (a photoperiod crossing, a date from the grower's own
// record) are placed by date instead, since they do not read the heat axis at
// all.
//
// The base temperature matters: a threshold counted from 43 °F cannot be read
// off a curve accumulated from 50 °F. Events whose base differs from the
// block's are marked rather than silently misplaced.

import type { SeasonCurveResult } from "./mcp";
import type { Planting } from "./plantings";
import type { SavedPest } from "./pestModels";
import type { SavedWildlife } from "./wildlifeModels";

export type FlagKind = "crop" | "pest" | "wildlife";

export interface LedgerFlag {
  kind: FlagKind;
  label: string;
  emoji?: string;
  /// Index along the curve's combined day axis.
  index: number;
  /// GDD at the flag, when it sits on the heat axis.
  gdd?: number;
  date: string | null;
  /// True once the curve has passed it.
  reached: boolean;
  /// Set when the threshold's base temperature differs from the curve's.
  baseMismatch?: number;
}

/// The full day axis: recorded season, then forecast, then projection.
function combinedSeries(curve: SeasonCurveResult): { values: number[]; dates: (string | null)[] } {
  const mean = curve.curve?.cumulative_mean ?? [];
  const fc = curve.forecast?.cumulative ?? [];
  const proj = curve.projection?.cumulative ?? [];
  const dates: (string | null)[] = [...(curve.curve?.dates ?? [])];
  const fcDates = curve.forecast?.dates ?? [];
  fc.forEach((_, i) => dates.push(fcDates[i] ?? null));
  proj.forEach(() => dates.push(null));
  return { values: [...mean, ...fc, ...proj], dates };
}

/// Where a cumulative total first reaches `gdd`, interpolated between days.
function indexAt(values: number[], gdd: number): number | null {
  if (!values.length || gdd <= values[0]) return values.length ? 0 : null;
  for (let i = 1; i < values.length; i++) {
    if (values[i] >= gdd) {
      const span = values[i] - values[i - 1];
      return span > 0 ? i - 1 + (gdd - values[i - 1]) / span : i;
    }
  }
  return null; // beyond even the projection
}

function indexOfDate(dates: (string | null)[], iso: string): number | null {
  const i = dates.indexOf(iso);
  if (i >= 0) return i;
  // Between two recorded days, or past the end: place by offset from day one.
  const first = dates.find((d): d is string => !!d);
  if (!first) return null;
  const off = Math.round(
    (new Date(iso + "T12:00:00").getTime() - new Date(first + "T12:00:00").getTime()) / 86_400_000,
  );
  return off >= 0 && off < dates.length ? off : null;
}

export function buildFlags(
  curve: SeasonCurveResult,
  plantings: Planting[],
  pests: SavedPest[],
  wildlife: SavedWildlife[],
): LedgerFlag[] {
  // Guard on the RECORDED season, not the combined series. A curve with no
  // recorded days still carries a forecast and a projection, which passed a
  // naive length check and put every flag at index 0 — pinned to the y-axis,
  // looking authoritative, and meaning nothing.
  if ((curve.curve?.cumulative_mean?.length ?? 0) < 2) return [];

  const { values, dates } = combinedSeries(curve);
  if (values.length < 2) return [];
  const today = (curve.curve?.dates?.length ?? 1) - 1;
  const base = curve.base_temp_f;
  const out: LedgerFlag[] = [];

  const push = (
    kind: FlagKind, label: string, gdd: number, emoji: string | undefined, evBase: number,
  ) => {
    const idx = indexAt(values, gdd);
    if (idx == null) return;
    out.push({
      kind, label, emoji, gdd, index: idx,
      date: dates[Math.round(idx)] ?? null,
      reached: idx <= today,
      ...(Math.abs(evBase - base) > 0.5 ? { baseMismatch: evBase } : {}),
    });
  };

  // A planting's target is counted from its set-out, not from Jan 1, so the
  // flag sits at the season total AT set-out plus the target.
  for (const p of plantings) {
    const startIdx = indexOfDate(dates, p.setOut);
    const offset = startIdx != null && startIdx < values.length ? values[Math.round(startIdx)] : 0;
    push("crop", p.crop, offset + p.gddTarget, "🌱", p.baseTempF ?? base);
  }

  for (const m of pests) {
    for (const st of m.stages) {
      push("pest", `${m.pest} · ${st.stage}`, st.gdd, "🐛", m.base_temp ?? 50);
    }
  }

  for (const w of wildlife) {
    if (w.driver === "heat" && w.gdd) {
      push("wildlife", `${w.species} · ${w.event}`, w.gdd, w.emoji || "🦋", w.base_temp ?? 50);
    } else if (w.driver === "calendar" && w.typical_on) {
      const [m, d] = w.typical_on.split("-");
      const iso = `${(curve.season_start ?? "2026-01-01").slice(0, 4)}-${m}-${d}`;
      const idx = indexOfDate(dates, iso);
      if (idx != null) {
        out.push({
          kind: "wildlife", label: `${w.species} · ${w.event}`, emoji: w.emoji || "🐿️",
          index: idx, date: iso, reached: idx <= today,
        });
      }
    }
    // Daylight events are deliberately not placed here: they do not read the
    // heat axis, and their date comes from the wildlife tool rather than from
    // this curve. They live on the Wildlife view where that is legible.
  }

  return out.sort((a, b) => a.index - b.index);
}
