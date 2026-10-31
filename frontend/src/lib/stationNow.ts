// A plot's station report, for the screen: FieldData speaks SI and UTC, and these
// are its readings in the units the reader chose. Kept pure so they can be tested.

import { showPressure, showRain, showTemp, type Unit } from "./units.ts";

export interface StationReading {
  sensor_kind: string;
  channel: number | null;
  channel_name: string | null;
  quantity: number;
  unit: string;
  observed_at: string;
}

/// The marks the forecast cards use, kind by kind. Pressure's is a drawn barometer.
const LOOKS: Record<string, { name: string; emoji: string }> = {
  air_temperature: { name: "air", emoji: "🌡️" },
  relative_humidity: { name: "humidity", emoji: "💦" },
  pressure: { name: "pressure", emoji: "barometer" },
  rain_rate: { name: "rain rate", emoji: "🌧️" },
  rain_total: { name: "rain today", emoji: "🌧️" },
  solar_radiation: { name: "sun strength", emoji: "☀️" },
  uv_index: { name: "UV", emoji: "☀️" },
  soil_moisture: { name: "soil moisture", emoji: "💧" },
  soil_temperature: { name: "soil", emoji: "🌡️" },
  leaf_wetness: { name: "leaf wetness", emoji: "💧" },
};

/// Wind has its own tile, as on the cards, so these two never show alone.
const WIND_KINDS = ["wind_speed", "wind_direction"];

function figure(r: StationReading, unit: Unit): string {
  const us = unit === "F";
  switch (r.unit) {
    case "°C": return showTemp((r.quantity * 9) / 5 + 32, unit, 1);
    case "hPa": return showPressure(r.quantity, unit);
    case "m/s": return us ? `${(r.quantity * 2.23694).toFixed(1)} mph` : `${r.quantity.toFixed(1)} m/s`;
    case "mm": return showRain(r.quantity / 25.4, unit);
    case "mm/h": return `${showRain(r.quantity / 25.4, unit)}/h`;
    case "index": return r.quantity.toFixed(0);
    case "%": return `${r.quantity.toFixed(0)}%`;
    default: return `${r.quantity.toFixed(0)} ${r.unit}`;
  }
}

/// What one reading says on the card. A kind this page does not know still shows.
export function readingLine(r: StationReading, unit: Unit): { label: string; value: string; emoji: string } {
  const look = LOOKS[r.sensor_kind];
  const name = look?.name ?? r.sensor_kind.replace(/_/g, " ");
  const where = r.channel_name ?? (r.channel != null ? `${r.channel}` : "");
  return { label: where ? `${name} ${where}` : name, value: figure(r, unit), emoji: look?.emoji ?? "📟" };
}

/// The tiles in the order today's forecast reads. A kind it has no place for follows.
const TILE_ORDER = [
  "air_temperature", "dew_point", "relative_humidity", "wind",
  "pressure", "rain_rate", "rain_total", "solar_radiation", "uv_index",
];

const rank = (kind: string) => {
  const at = TILE_ORDER.indexOf(kind);
  return at < 0 ? TILE_ORDER.length : at;
};

/// The card's tiles in order, the wind's two readings being its one "wind" tile.
export function tileReadings(readings: readonly StationReading[]): (StationReading | "wind")[] {
  const tiles: (StationReading | "wind")[] = readings.filter((r) => !WIND_KINDS.includes(r.sensor_kind));
  if (readings.some((r) => WIND_KINDS.includes(r.sensor_kind))) tiles.push("wind");
  const kind = (t: StationReading | "wind") => (t === "wind" ? t : t.sensor_kind);
  return tiles.sort((a, b) => rank(kind(a)) - rank(kind(b)));
}

/// The wind's speed on its tile, in the reader's units.
export function windSpeed(readings: readonly StationReading[], unit: Unit): string {
  const speed = readings.find((r) => r.sensor_kind === "wind_speed");
  return speed ? figure(speed, unit) : "—";
}

/// How old a report is, in the fewest words.
export function reportAge(observedAt: string, now: number): string {
  const then = Date.parse(observedAt);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
