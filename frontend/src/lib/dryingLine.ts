// The Dashboard's one line about drying.
//
// "Dry by 9 am · 3 dry days today–Thu · rain Fri". A line, not chart bands:
// wet and dry bands on one chart would be two stories at once, and the owner
// chose the line.
//
// Read against the BLOCK's clock (`r.now`), never the device's — a grower
// checking a farm two time zones away should hear about that farm's morning.

import type { DryingWindowResult } from "./mcp.ts";
import { languageLocale } from "@tollbooth-dpyc/web";
import { tr } from "../i18n/index.ts";

/// Mornings only, matching the server: a leaf wet at 2 pm is weather, not dew.
const MORNING_LAST_HOUR = 14;

/// "9 am", "12 pm", "1 pm", "12 am" from a feed timestamp or an "HH" string.
export function clock(stamp: string): string {
  const h = Number(stamp.length > 2 ? stamp.slice(11, 13) : stamp);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return tr(h < 12 ? "lib.dryingLine.am" : "lib.dryingLine.pm", { h: h12 });
}

function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(languageLocale(), { weekday: "short", timeZone: "UTC" });
}

/// "today", "tomorrow", or the weekday.
function whenDay(date: string, r: DryingWindowResult): string {
  if (date === r.today.date) return tr("lib.dryingLine.today");
  if (date === r.tomorrow.date) return tr("lib.dryingLine.tomorrow");
  return weekday(date);
}

function dewPart(r: DryingWindowResult): string | null {
  const nowHour = Number(r.now.slice(11, 13));
  const t = r.today.dew_off;
  if (nowHour < MORNING_LAST_HOUR) {
    if (t.state === "clears" && t.at && t.at > r.now) return tr("lib.dryingLine.dryBy", { at: clock(t.at) });
    if (t.state === "clears" || t.state === "dry") return tr("lib.dryingLine.dryNow");
    if (t.state === "wet") return tr("lib.dryingLine.wetMorning");
  }
  const m = r.tomorrow.dew_off;
  if (m.state === "clears" && m.at) return tr("lib.dryingLine.dryByTomorrow", { at: clock(m.at) });
  if (m.state === "dry") return tr("lib.dryingLine.dryTomorrow");
  if (m.state === "wet") return tr("lib.dryingLine.wetTomorrow");
  return null;
}

function runPart(r: DryingWindowResult): string {
  const run = r.dry_run;
  if (!run) return tr("lib.dryingLine.noDryDay");
  if (run.days === 1) return tr("lib.dryingLine.dryOn", { day: whenDay(run.start, r) });
  const end = run.end === r.tomorrow.date ? tr("lib.dryingLine.tomorrow") : weekday(run.end);
  return tr("lib.dryingLine.dryDays", { count: run.days, from: whenDay(run.start, r), to: end });
}

function rainPart(r: DryingWindowResult): string {
  return r.next_rain
    ? tr("lib.dryingLine.rainOn", { day: whenDay(r.next_rain.at.slice(0, 10), r) })
    : tr("lib.dryingLine.noRain");
}

/// The first day ahead a falling barometer crosses — the dry day likeliest to
/// be cut short. Nothing when the barometer did not answer or sees no fall.
function frontPart(r: DryingWindowResult): string | null {
  const day = r.days.find((d) => d.front_due && d.date >= r.today.date);
  return day ? `🌀 ${tr("lib.dryingLine.front", { day: whenDay(day.date, r) })}` : null;
}

export function dryingLine(r: DryingWindowResult): string {
  const line = [dewPart(r), runPart(r), rainPart(r), frontPart(r)].filter(Boolean).join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}
