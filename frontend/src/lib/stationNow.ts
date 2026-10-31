// A plot's station report, for the screen: FieldData speaks SI and UTC, and these
// are its readings in the units the reader chose. Kept pure so they can be tested.

import { showPressure, showTemp, type Unit } from "./units.ts";

export interface StationReading {
  sensor_kind: string;
  channel: number | null;
  channel_name: string | null;
  quantity: number;
  unit: string;
  observed_at: string;
}

const NAMES: Record<string, string> = {
  air_temperature: "Air", relative_humidity: "Humidity", pressure: "Pressure",
  wind_speed: "Wind", wind_direction: "From", rain_rate: "Rain rate", rain_total: "Rain today",
  solar_radiation: "Sun", uv_index: "UV", soil_moisture: "Soil moisture",
  soil_temperature: "Soil", leaf_wetness: "Leaf wetness",
};

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function figure(r: StationReading, unit: Unit): string {
  const us = unit === "F";
  switch (r.unit) {
    case "°C": return showTemp((r.quantity * 9) / 5 + 32, unit, 1);
    case "hPa": return showPressure(r.quantity, unit);
    case "m/s": return us ? `${(r.quantity * 2.23694).toFixed(1)} mph` : `${r.quantity.toFixed(1)} m/s`;
    case "mm": return us ? `${(r.quantity / 25.4).toFixed(2)} in` : `${r.quantity.toFixed(1)} mm`;
    case "mm/h": return us ? `${(r.quantity / 25.4).toFixed(2)} in/h` : `${r.quantity.toFixed(1)} mm/h`;
    case "deg": return POINTS[Math.round(r.quantity / 45) % 8];
    case "index": return r.quantity.toFixed(0);
    case "%": return `${r.quantity.toFixed(0)}%`;
    default: return `${r.quantity.toFixed(0)} ${r.unit}`;
  }
}

/// What one reading says on the card. A kind this page does not know still shows.
export function readingLine(r: StationReading, unit: Unit): { label: string; value: string } {
  const name = NAMES[r.sensor_kind] ?? r.sensor_kind.replace(/_/g, " ");
  const where = r.channel_name ?? (r.channel != null ? `${r.channel}` : "");
  return { label: where ? `${name} ${where}` : name, value: figure(r, unit) };
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
