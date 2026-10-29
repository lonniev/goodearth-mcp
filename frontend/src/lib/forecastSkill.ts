// The small "83%" on a weather card: how often the next-day forecast for that
// measure landed within a tolerance a grower would act on the same way, over
// the last month here. The server scores it (`forecast_skill.py`); these are
// the words for it, in the reader's own units. Kept pure so they can be tested.

import type { ForecastSkill, MeasureKey } from "./mcp";

/// The reader's scale for a tolerance: a difference, so no offset.
export interface Scale {
  /// A temperature difference in °F, as the reader reads one.
  tempDelta: (f: number) => string;
  /// A pressure difference in hPa, as the reader reads one.
  pressureDelta: (hpa: number) => string;
}

const TEMPS: readonly MeasureKey[] = ["temp_max", "temp_min", "dew_point"];

function tolerance(key: MeasureKey, within: number, s: Scale): string {
  if (TEMPS.includes(key)) return `±${s.tempDelta(within)}`;
  if (key === "pressure") return `±${s.pressureDelta(within)}`;
  if (key === "wind_max") return `±${within} mph`;
  if (key === "humidity") return `±${within}%`;
  return `±${within}`;
}

/// The chip for one card, or null when that measure was not scored.
export function skillChip(
  skill: ForecastSkill | undefined, key: MeasureKey, s: Scale,
): { pct: number; title: string } | null {
  const m = skill?.measures[key];
  const next = m?.leads["1"];
  if (!m || !next) return null;
  const far = m.leads["3"];
  const right = m.within == null ? "right about rain" : `within ${tolerance(key, m.within, s)}`;
  const title = [
    `Next-day forecast ${right} on ${next.hits} of ${next.days} days`,
    far && `3 days out: ${far.pct}%`,
  ].filter(Boolean).join(" · ");
  return { pct: next.pct, title };
}
