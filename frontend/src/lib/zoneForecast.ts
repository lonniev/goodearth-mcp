// One day of the fortnight, written the way the Weather Service writes it.
//
// A grower who pastes a forecast into a text or a farm log expects the shape
// they already read: a dotted ".TUESDAY..." heading, the chance of rain first,
// then the sky and the high, then the wind, then how much rain. The words
// follow the Weather Service's own scale, so "Chance" and "Likely" mean here
// what they mean there.
//
// After those sentences come the rest of the card's figures, in the same
// plain sentences: dew point, humidity, the barometer and the sun.
//
// Only what the almanac read goes in. A day carries one wind figure, the
// day's strongest, so the line says "up to" rather than inventing a range,
// and the night's low is the next morning's low, which is the one the
// Weather Service means by "tonight".

import type { AlmanacResult, StormSignal } from "./mcp.ts";
import { dayTrend, stormLevel } from "./storm.ts";
import { pressure, pressureUnit, showRain, temp, tempUnit, type Unit } from "./units.ts";

type Day = AlmanacResult["upcoming"][number];

const POINTS: Record<string, string> = {
  N: "North", NNE: "North northeast", NE: "Northeast", ENE: "East northeast",
  E: "East", ESE: "East southeast", SE: "Southeast", SSE: "South southeast",
  S: "South", SSW: "South southwest", SW: "Southwest", WSW: "West southwest",
  W: "West", WNW: "West northwest", NW: "Northwest", NNW: "North northwest",
};

/// The almanac's sky words, turned into the daytime words the Weather
/// Service uses. A sky that is raining reads "Mostly cloudy", because the
/// rain itself has its own sentence.
const DAY_SKY: Record<string, string> = {
  "Clear": "Sunny", "Mainly clear": "Mostly sunny", "Partly cloudy": "Partly sunny",
  "Overcast": "Cloudy", "Fog": "Patchy fog", "Rime fog": "Patchy freezing fog",
};

/// What falls, from the sky's own word for it.
function falling(sky: string): string {
  const s = sky.toLowerCase();
  if (s.includes("thunder")) return "showers and thunderstorms";
  if (s.includes("freezing")) return "freezing rain";
  if (s.includes("snow")) return s.includes("shower") ? "snow showers" : "snow";
  if (s.includes("shower")) return "showers";
  if (s.includes("drizzle")) return "drizzle";
  return "rain";
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/// The chance of rain in the Weather Service's own words, as the sentence that
/// opens the day and, from "likely" up, the percentage that closes it.
/// Nothing under 15%.
export function chanceOf(pct: number | null | undefined, what: string): [string, string | null] | null {
  if (pct == null || pct < 15) return null;
  const p = Math.round(pct / 10) * 10;
  if (pct < 25) return [`A slight chance of ${what}.`, null];
  if (pct < 55) return [`A ${p} percent chance of ${what}.`, null];
  const tail = `Chance of precipitation is ${p}%.`;
  return [pct < 75 ? `${cap(what)} likely.` : `${cap(what)}.`, tail];
}

/// The day's rain as the Weather Service brackets it; nothing under a tenth.
export function rainfall(inches: number | null | undefined, snow: boolean): string | null {
  if (inches == null || inches < 0.1) return null;
  const what = snow ? "New precipitation amounts" : "New rainfall amounts";
  const band =
    inches < 0.25 ? "between a tenth and quarter of an inch" :
    inches < 0.5 ? "between a quarter and half of an inch" :
    inches < 0.75 ? "between a half and three quarters of an inch" :
    inches < 1 ? "between three quarters and one inch" :
    inches < 2 ? "between 1 and 2 inches" : "of 2 inches or more";
  return `${what} ${band} possible.`;
}

export function windLine(w: Day["wind"]): string {
  const mph = w.speed_mph;
  if (mph == null) return "";
  if (mph < 4) return "Calm wind.";
  const from = w.from ? `${POINTS[w.from] ?? w.from} wind` : "Wind";
  return `${from} up to ${Math.round(mph)} mph.`;
}

function degrees(f: number, unit: Unit): string {
  // The Weather Service writes a bare number in °F; a °C reader gets the unit.
  const n = Math.round(temp(f, unit));
  return unit === "F" ? `${n}` : `${n}${tempUnit(unit).trim()}`;
}

/// The rest of what the day's card shows, after the Weather Service's own
/// sentences: the dew point, the humidity, the barometer, the rain and the sun.
export function dayDetails(day: Day, before: Day | undefined, unit: Unit): string[] {
  const out: string[] = [];
  if (day.dew_point_f != null) out.push(`Dew point near ${degrees(day.dew_point_f, unit)}.`);
  if (day.humidity_pct != null) out.push(`Humidity around ${Math.round(day.humidity_pct)} percent.`);
  if (day.pressure_hpa != null) {
    const reading = `${pressure(day.pressure_hpa, unit).toFixed(unit === "C" ? 0 : 2)}${pressureUnit(unit)}`;
    const trend = dayTrend(day.pressure_hpa, before?.pressure_hpa);
    out.push(`Barometer ${reading}${trend ? ` and ${trend}` : ""}.`);
  }
  if (day.precip_in) {
    const rate = day.rain_rate_in_h ? `, at ${showRain(day.rain_rate_in_h, unit)} an hour` : "";
    out.push(`Rain about ${showRain(day.precip_in, unit)}${rate}.`);
  }
  if (day.sun_wm2 != null) out.push(`Sun strength averaging ${Math.round(day.sun_wm2)} W/m² in daylight.`);
  if (day.uv_index != null) out.push(`UV peaking at ${day.uv_index.toFixed(0)}.`);
  if (day.sunshine_hours != null) {
    const h = Math.round(day.sunshine_hours);
    out.push(h === 0 ? "No sunshine." : `About ${h} hour${h === 1 ? "" : "s"} of sunshine.`);
  }
  return out;
}

/// The barometer's warning, on the day its worst fall lands.
export function stormLine(storm: StormSignal | null | undefined, date: string): string | null {
  if (!storm || storm.level === "none" || storm.worst?.at.slice(0, 10) !== date) return null;
  return `${stormLevel(storm)}: the barometer is forecast to fall fast.`;
}

/// What the heading calls a day: TODAY and TONIGHT for today, else its name.
function names(date: string, today: string): [string, string] {
  if (date === today) return ["TODAY", "TONIGHT"];
  const name = new Date(date + "T12:00:00")
    .toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  return [name, `${name} NIGHT`];
}

/// The day and the night after it, as two dotted paragraphs.
export function dayForecast(
  day: Day, next: Day | undefined, unit: Unit, today: string,
  before?: Day, storm?: StormSignal | null,
): string {
  const [dayName, nightName] = names(day.date, today);
  const what = falling(day.sky.label);
  const wet = chanceOf(day.precip_chance_pct, what);
  const sky = wet ? (DAY_SKY[day.sky.label] ?? "Mostly cloudy") : (DAY_SKY[day.sky.label] ?? cap(day.sky.label));
  const high = day.high_f != null ? `, with a high near ${degrees(day.high_f, unit)}` : "";
  const parts = [
    wet?.[0],
    `${sky}${high}.`,
    windLine(day.wind),
    wet?.[1],
    rainfall(day.precip_in, what.includes("snow")),
    stormLine(storm, day.date),
    ...dayDetails(day, before, unit),
  ].filter(Boolean);
  const lines = [`.${dayName}...${parts.join(" ")}`];
  if (next?.low_f != null) lines.push(`.${nightName}...Low around ${degrees(next.low_f, unit)}.`);
  return lines.join("\n");
}

/// The whole pasteable product: a header naming the plot and when the
/// figures were read, then the day.
export function zoneForecast(
  { days, index, unit, place, issued, today, storm }: {
    days: Day[]; index: number; unit: Unit; place: string; issued: Date; today: string;
    storm?: StormSignal | null;
  },
): string {
  const at = issued.toLocaleString("en-US", {
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
  return [
    `Point forecast for ${place}`,
    `Good Earth · issued ${at}`,
    "",
    dayForecast(days[index], days[index + 1], unit, today, days[index - 1], storm),
  ].join("\n");
}
