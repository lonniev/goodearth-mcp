// The Dashboard's one line about drying.
//
// "Dry by 9 am · 3 dry days today–Thu · rain Fri". A line, not chart bands:
// wet and dry bands on one chart would be two stories at once, and the owner
// chose the line.
//
// Read against the BLOCK's clock (`r.now`), never the device's — a grower
// checking a farm two time zones away should hear about that farm's morning.

import type { DryingWindowResult } from "./mcp.ts";

/// Mornings only, matching the server: a leaf wet at 2 pm is weather, not dew.
const MORNING_LAST_HOUR = 14;

/// "9 am", "12 pm", "1 pm", "12 am" from a feed timestamp or an "HH" string.
export function clock(stamp: string): string {
  const h = Number(stamp.length > 2 ? stamp.slice(11, 13) : stamp);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? "am" : "pm"}`;
}

function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

/// "today", "tomorrow", or the weekday.
function whenDay(date: string, r: DryingWindowResult): string {
  if (date === r.today.date) return "today";
  if (date === r.tomorrow.date) return "tomorrow";
  return weekday(date);
}

function dewPart(r: DryingWindowResult): string | null {
  const nowHour = Number(r.now.slice(11, 13));
  const t = r.today.dew_off;
  if (nowHour < MORNING_LAST_HOUR) {
    if (t.state === "clears" && t.at && t.at > r.now) return `dry by ${clock(t.at)}`;
    if (t.state === "clears" || t.state === "dry") return "dry now";
    if (t.state === "wet") return "wet all morning";
  }
  const m = r.tomorrow.dew_off;
  if (m.state === "clears" && m.at) return `dry by ${clock(m.at)} tomorrow`;
  if (m.state === "dry") return "dry morning tomorrow";
  if (m.state === "wet") return "wet morning tomorrow";
  return null;
}

function runPart(r: DryingWindowResult): string {
  const run = r.dry_run;
  if (!run) return "no dry day in the forecast";
  if (run.days === 1) return `dry ${whenDay(run.start, r)}`;
  const end = run.end === r.tomorrow.date ? "tomorrow" : weekday(run.end);
  return `${run.days} dry days ${whenDay(run.start, r)}–${end}`;
}

function rainPart(r: DryingWindowResult): string {
  return r.next_rain ? `rain ${whenDay(r.next_rain.at.slice(0, 10), r)}` : "no rain in the forecast";
}

export function dryingLine(r: DryingWindowResult): string {
  const line = [dewPart(r), runPart(r), rainPart(r)].filter(Boolean).join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}
