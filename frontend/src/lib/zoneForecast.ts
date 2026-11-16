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
import { languageLocale } from "@tollbooth-dpyc/web";
import { tr } from "../i18n/index.ts";
import type { MessageKey } from "../i18n/en.ts";

type Day = AlmanacResult["upcoming"][number];

/// Compass points, by the abbreviation the almanac sends.
const POINTS = new Set([
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
]);

/// The almanac's sky words, turned into the daytime words the Weather
/// Service uses. A sky that is raining reads "Mostly cloudy", because the
/// rain itself has its own sentence.
const DAY_SKY: Record<string, MessageKey> = {
  "Clear": "lib.zoneForecast.sky.clear", "Mainly clear": "lib.zoneForecast.sky.mainlyClear",
  "Partly cloudy": "lib.zoneForecast.sky.partlyCloudy", "Overcast": "lib.zoneForecast.sky.overcast",
  "Fog": "lib.zoneForecast.sky.fog", "Rime fog": "lib.zoneForecast.sky.rimeFog",
};

type Falls = "storms" | "freezingRain" | "snowShowers" | "snow" | "showers" | "drizzle" | "rain";

/// What falls, from the sky's own word for it.
function falling(sky: string): Falls {
  const s = sky.toLowerCase();
  if (s.includes("thunder")) return "storms";
  if (s.includes("freezing")) return "freezingRain";
  if (s.includes("snow")) return s.includes("shower") ? "snowShowers" : "snow";
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
  if (pct < 25) return [tr("lib.zoneForecast.chance.slight", { what }), null];
  if (pct < 55) return [tr("lib.zoneForecast.chance.percent", { p, what }), null];
  const tail = tr("lib.zoneForecast.chance.tail", { p });
  return [tr(pct < 75 ? "lib.zoneForecast.chance.likely" : "lib.zoneForecast.chance.certain", { what: cap(what) }), tail];
}

/// The day's rain as the Weather Service brackets it; nothing under a tenth.
export function rainfall(inches: number | null | undefined, snow: boolean): string | null {
  if (inches == null || inches < 0.1) return null;
  const band =
    inches < 0.25 ? "tenthToQuarter" :
    inches < 0.5 ? "quarterToHalf" :
    inches < 0.75 ? "halfToThreeQuarters" :
    inches < 1 ? "threeQuartersToOne" :
    inches < 2 ? "oneToTwo" : "twoOrMore";
  return tr(snow ? "lib.zoneForecast.amount.snow" : "lib.zoneForecast.amount.rain",
    { band: tr(`lib.zoneForecast.band.${band}`) });
}

export function windLine(w: Day["wind"]): string {
  const mph = w.speed_mph;
  if (mph == null) return "";
  if (mph < 4) return tr("lib.zoneForecast.wind.calm");
  const mphN = Math.round(mph);
  if (!w.from) return tr("lib.zoneForecast.wind.any", { mph: mphN });
  const point = POINTS.has(w.from) ? tr(`lib.zoneForecast.point.${w.from}` as MessageKey) : w.from;
  return tr("lib.zoneForecast.wind.from", { point, mph: mphN });
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
  if (day.dew_point_f != null) out.push(tr("lib.zoneForecast.dew", { t: degrees(day.dew_point_f, unit) }));
  if (day.humidity_pct != null) out.push(tr("lib.zoneForecast.humidity", { n: Math.round(day.humidity_pct) }));
  if (day.pressure_hpa != null) {
    const reading = `${pressure(day.pressure_hpa, unit).toFixed(unit === "C" ? 0 : 2)}${pressureUnit(unit)}`;
    const trend = dayTrend(day.pressure_hpa, before?.pressure_hpa);
    out.push(trend
      ? tr("lib.zoneForecast.barometerTrend", { reading, trend: tr(`lib.zoneForecast.trend.${trend}`) })
      : tr("lib.zoneForecast.barometer", { reading }));
  }
  if (day.precip_in) {
    const amount = showRain(day.precip_in, unit);
    out.push(day.rain_rate_in_h
      ? tr("lib.zoneForecast.rainRate", { amount, rate: showRain(day.rain_rate_in_h, unit) })
      : tr("lib.zoneForecast.rain", { amount }));
  }
  if (day.sun_wm2 != null) out.push(tr("lib.zoneForecast.sun", { n: Math.round(day.sun_wm2) }));
  if (day.uv_index != null) out.push(tr("lib.zoneForecast.uv", { n: day.uv_index.toFixed(0) }));
  if (day.sunshine_hours != null) {
    const h = Math.round(day.sunshine_hours);
    out.push(h === 0 ? tr("lib.zoneForecast.noSunshine") : tr("lib.zoneForecast.sunshine", { count: h }));
  }
  return out;
}

/// The barometer's warning, on the day its worst fall lands.
export function stormLine(storm: StormSignal | null | undefined, date: string): string | null {
  if (!storm || storm.level === "none" || storm.worst?.at.slice(0, 10) !== date) return null;
  return tr("lib.zoneForecast.storm", { level: stormLevel(storm) });
}

/// What the heading calls a day: TODAY and TONIGHT for today, else its name.
function names(date: string, today: string): [string, string] {
  if (date === today) return [tr("lib.zoneForecast.today"), tr("lib.zoneForecast.tonight")];
  const name = new Date(date + "T12:00:00")
    .toLocaleDateString(languageLocale(), { weekday: "long" }).toUpperCase();
  return [name, tr("lib.zoneForecast.night", { name })];
}

/// The day and the night after it, as two dotted paragraphs.
export function dayForecast(
  day: Day, next: Day | undefined, unit: Unit, today: string,
  before?: Day, storm?: StormSignal | null,
): string {
  const [dayName, nightName] = names(day.date, today);
  const falls = falling(day.sky.label);
  const what = tr(`lib.zoneForecast.falls.${falls}`);
  const wet = chanceOf(day.precip_chance_pct, what);
  const named = DAY_SKY[day.sky.label];
  const sky = named ? tr(named) : wet ? tr("lib.zoneForecast.sky.mostlyCloudy") : cap(day.sky.label);
  const parts = [
    wet?.[0],
    day.high_f != null
      ? tr("lib.zoneForecast.skyHigh", { sky, t: degrees(day.high_f, unit) })
      : tr("lib.zoneForecast.skyOnly", { sky }),
    windLine(day.wind),
    wet?.[1],
    rainfall(day.precip_in, falls === "snow" || falls === "snowShowers"),
    stormLine(storm, day.date),
    ...dayDetails(day, before, unit),
  ].filter(Boolean);
  const lines = [`.${dayName}...${parts.join(" ")}`];
  if (next?.low_f != null) {
    lines.push(`.${nightName}...${tr("lib.zoneForecast.low", { t: degrees(next.low_f, unit) })}`);
  }
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
  const at = issued.toLocaleString(languageLocale(), {
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
  return [
    tr("lib.zoneForecast.header", { place }),
    tr("lib.zoneForecast.issued", { at }),
    "",
    dayForecast(days[index], days[index + 1], unit, today, days[index - 1], storm),
  ].join("\n");
}
