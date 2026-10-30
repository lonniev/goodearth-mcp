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

/// What each scored measure's forecast is held to, in a sentence.
const SCORED: Partial<Record<MeasureKey, string>> = {
  temp_max: "the day's high",
  temp_min: "the day's low",
  dew_point: "the day's average dew point",
  wind_max: "the day's strongest wind",
  humidity: "the day's average humidity",
  pressure: "the day's average pressure",
};

/// The chip for one card, or null when that measure was not scored.
export function skillChip(
  skill: ForecastSkill | undefined, key: MeasureKey, s: Scale,
): { pct: number; title: string; says: string[] } | null {
  const m = skill?.measures[key];
  const next = m?.leads["1"];
  if (!m || !next) return null;
  const far = m.leads["3"];
  const right = m.within == null ? "right about rain" : `within ${tolerance(key, m.within, s)}`;
  const title = [
    `Next-day forecast ${right} on ${next.hits} of ${next.days} days`,
    far && `3 days out: ${far.pct}%`,
  ].filter(Boolean).join(" · ");
  const held = m.within == null
    ? `the forecast made the day before called rain or no rain correctly on ${next.hits} of ${next.days} days`
    : `the forecast made the day before got ${SCORED[key] ?? "this measure"} ${right} on ${next.hits} of ${next.days} days`;
  const says = [
    `Over the last month here, ${held}.`,
    far && `Three days ahead, it was right ${far.pct}% of the time.`,
    m.within == null && "A trace too small to wet anything counts as dry.",
    "Each day is checked against the weather model's later reading, not a station on your ground.",
  ].filter((line): line is string => Boolean(line));
  return { pct: next.pct, title, says };
}
