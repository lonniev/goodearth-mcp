// What a page hands to the share button in the top bar.
//
// Every working page controls one table — the plots, the plantings, the
// tasks, the readings on the Dashboard — and the share sheet takes that table
// out of the app in two forms: as text a grower pastes into a note, an email
// or a chat with their agent, and as JSON an agent or a spreadsheet reads
// without guessing. One shape, one dialog, one pair of buttons, whatever the
// page. The Almanac used to export on its own terms, through a paper-plane
// button of its own that nobody read as "copy".
//
// Pure. A builder takes what the view already holds and returns a sheet; it
// reads nothing and bills nothing. The record stays in the grower's units
// (°F, GDD base °F); the reader's scale is applied here on the way out, the
// same as on the page.

import type {
  AlmanacResult, CropLedgerResult, DiseaseRiskResult, DryingWindowResult,
  FrostWindowResult, PestWindowResult, SeasonCurveResult, SoilWindowResult,
  TaskRow, WildlifeResult,
} from "./mcp.ts";
import type { Planting } from "./plantings.ts";
import type { SavedPest } from "./pestModels.ts";
import type { SavedWildlife } from "./wildlifeModels.ts";
import { TAGS, type FieldReport } from "./reports.ts";
import type { SavedRegion } from "./regions.ts";
import type { Entry } from "./glossary.ts";
import { areaM2, formatArea, geoJSONToRing } from "./geo.ts";
import { showDD, showTemp, type Unit } from "./units.ts";
import { compareOutlook, departure } from "./outlookSummary.ts";

export type Cell = string | number | null | undefined;

export interface Sheet {
  /// The page, as its own heading: "Flora", "Tasks".
  title: string;
  emoji: string;
  /// Whose ground and how much of it: the line under the heading.
  eyebrow: string;
  head: string[];
  rows: Cell[][];
  /// One line under the table, when the numbers carry a caveat.
  foot?: string;
  /// What the braces copy: the page's records as the service holds them.
  json: unknown;
}

const blank = (c: Cell) => c == null || c === "";

/// A cell as text. A pipe inside a cell would split the row.
const text = (c: Cell) => (blank(c) ? "" : String(c).replace(/\|/g, "∣").replace(/\s*\n\s*/g, " "));

/// The sheet as a Markdown table under its heading — what the copy button
/// puts on the clipboard. Markdown because every place it lands reads it:
/// a note, a mail, a chat with an agent, a wiki.
export function sheetText(s: Sheet): string {
  const line = (cells: Cell[]) => `| ${cells.map(text).join(" | ")} |`;
  const out = [
    `${s.emoji} ${s.title} — ${s.eyebrow}`,
    "",
    line(s.head),
    `|${s.head.map(() => "---").join("|")}|`,
    ...s.rows.map(line),
  ];
  if (s.foot) out.push("", s.foot);
  return out.join("\n");
}

/// The sheet's records as JSON, indented for a reader.
export function sheetJSON(s: Sheet): string {
  return JSON.stringify(s.json, null, 2);
}

const n = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/// A paged list says how much of the record it holds: "20 of 57 tasks" is
/// a page, "12 tasks" is the lot. The sheet carries what the page has in
/// hand, never more — a second read would cost sats the grower did not ask
/// to spend.
const held = (count: number, total: number | undefined, one: string, many = `${one}s`) =>
  total != null && total > count ? `${count} of ${n(total, one, many)}` : n(count, one, many);

const words = (s: string | null | undefined) => (s ?? "").replace(/_/g, " ");

// ─── My Plots ────────────────────────────────────────────────────────────

/// Where a block sits, for a row: a pin's own point, or the middle of a ring.
function centre(r: SavedRegion): { lat: number; lon: number } {
  if ("lat" in r.region) return { lat: r.region.lat, lon: r.region.lon };
  const ring = geoJSONToRing(r.region);
  const k = ring.length || 1;
  return {
    lat: ring.reduce((a, p) => a + p.lat, 0) / k,
    lon: ring.reduce((a, p) => a + p.lng, 0) / k,
  };
}

function area(r: SavedRegion): string {
  if (r.areaHa != null) return formatArea(r.areaHa * 10_000);
  if ("lat" in r.region) return formatArea(Math.PI * r.region.radius_m ** 2);
  return formatArea(areaM2(geoJSONToRing(r.region)));
}

export function plotsSheet(regions: SavedRegion[], unit: Unit): Sheet {
  return {
    title: "My Plots", emoji: "🗺️",
    eyebrow: n(regions.length, "plot"),
    head: ["Plot", "Also called", "Shape", "Area", "Base", "Latitude", "Longitude"],
    rows: regions.map((r) => {
      const c = centre(r);
      return [
        r.name, (r.aliases ?? []).join(", "),
        "lat" in r.region ? `pin · ${Math.round(r.region.radius_m)} m` : "drawn",
        area(r), showTemp(r.baseTempF, unit), c.lat.toFixed(5), c.lon.toFixed(5),
      ];
    }),
    json: regions.map((r) => ({
      id: r.id, name: r.name, aliases: r.aliases ?? [], base_temp_f: r.baseTempF,
      area_ha: r.areaHa ?? null, region: r.region,
    })),
  };
}

// ─── Dashboard ───────────────────────────────────────────────────────────

export interface LedgerReadings {
  region: SavedRegion;
  heat: SeasonCurveResult | null;
  frost: FrostWindowResult | null;
  soil: SoilWindowResult | null;
  drying: DryingWindowResult | null;
  disease: DiseaseRiskResult | null;
}

/// The Dashboard controls no record of its own; it reads five. Its table is
/// one row per reading, which is what a grower reads off it anyway.
export function ledgerSheet(r: LedgerReadings, unit: Unit): Sheet {
  const rows: Cell[][] = [];
  const h = r.heat;
  const g = h?.accumulated_gdd;
  if (h && g) {
    rows.push([`Heat since ${h.season_start}`, showDD(g.mean, unit),
      `${showDD(g.min, unit)} to ${showDD(g.max, unit)} across the ground · base ${showTemp(h.base_temp_f, unit)}`]);
    const ahead = h.normals?.ahead_of_normal_gdd;
    if (ahead != null) {
      rows.push(["Against normal", `${ahead > 0 ? "+" : ""}${showDD(ahead, unit)}`,
        `the last ${n(h.normals?.span_years ?? 0, "season")}`]);
    }
  }
  const f = r.frost;
  if (f?.first_frost) {
    rows.push(["First frost, typically", f.first_frost.median,
      `${f.first_frost.earliest} to ${f.first_frost.latest} over ${n(f.first_frost.years_on_record, "year")}`]);
    if (f.days_to_median_first_frost != null) {
      rows.push(["Days to typical first frost", f.days_to_median_first_frost, ""]);
    }
  }
  if (f?.worst_night) {
    const w = f.worst_night;
    rows.push(["Coldest night ahead", `${showTemp(w.low_ground_f, unit)} on ${w.date}`,
      `${words(w.level)} · ${w.reason}`]);
  }
  const s = r.soil;
  if (s) {
    rows.push(["Soil at planting depth",
      s.current_soil_f != null ? showTemp(s.current_soil_f, unit) : "",
      `${s.direction} past ${showTemp(s.threshold_f, unit)}${
        s.near_term?.crossing_date ? ` on ${s.near_term.crossing_date}` : ""}${
        s.typical ? ` · typically ${s.typical.median}` : ""}`]);
  }
  const d = r.drying;
  if (d) {
    rows.push(["Dry run",
      d.dry_run ? `${n(d.dry_run.days, "day")} from ${d.dry_run.start}` : "none ahead",
      d.next_rain ? `next rain ${d.next_rain.at} · ${d.next_rain.mm} mm` : ""]);
  }
  const k = r.disease;
  if (k) {
    const risky = k.diseases.filter((x) => x.at_risk).map((x) => x.disease);
    rows.push(["Disease at risk now", risky.length ? risky.join(", ") : "none",
      `${k.wetness.wet_hours} wet hours of ${k.wetness.hours_read} read`]);
  }
  return {
    title: "Dashboard", emoji: "🌡️",
    eyebrow: `${r.region.name} · ${n(rows.length, "reading")}`,
    head: ["Reading", "Value", "Note"],
    rows,
    json: {
      block: r.region.name, as_of: h?.as_of ?? f?.as_of ?? null,
      heat: h ? { base_temp_f: h.base_temp_f, season_start: h.season_start,
        accumulated_gdd: h.accumulated_gdd, normals: h.normals && {
          span_years: h.normals.span_years, today: h.normals.today,
          ahead_of_normal_gdd: h.normals.ahead_of_normal_gdd } } : null,
      frost: f ? { first_frost: f.first_frost, days_to_median_first_frost: f.days_to_median_first_frost,
        nights: f.nights, worst_night: f.worst_night } : null,
      soil: s ? { threshold_f: s.threshold_f, direction: s.direction, current_soil_f: s.current_soil_f,
        crossing_date: s.near_term?.crossing_date ?? null, typical: s.typical } : null,
      drying: d ? { today: d.today, tomorrow: d.tomorrow, dry_run: d.dry_run, next_rain: d.next_rain } : null,
      disease: k ? { wetness: k.wetness, diseases: k.diseases.map((x) => ({
        model: x.model, disease: x.disease, risk: x.risk, at_risk: x.at_risk,
        season_count: x.season_count, now: x.now })) } : null,
    },
  };
}

// ─── Almanac ─────────────────────────────────────────────────────────────

export function almanacSheet(data: AlmanacResult, place: string, unit: Unit): Sheet {
  const lines = compareOutlook(data, unit);
  const days = data.forecast_dates?.length ?? 0;
  const span = data.normals_span_years ?? 0;
  return {
    title: "Almanac", emoji: "🌤️",
    eyebrow: `${place} · next ${n(days, "day")} against the last ${n(span, "season")}`,
    head: ["Measure", "Ahead", "Normal", "Departure"],
    rows: lines.map((l) => [
      l.label, `${l.forecast.toFixed(l.decimals)} ${l.unit}`,
      `${l.normal.toFixed(l.decimals)} ${l.unit}`, departure(l),
    ]),
    // Measurements only. What they mean for the ground is the grower's call.
    foot: "Measurements only, computed from the forecast and this ground's record. No recommendation is implied.",
    json: {
      place, as_of: data.as_of, today: data.conditions, ahead: data.upcoming,
      outlook: lines.map((l) => ({ ...l, departure: departure(l) })),
      sun: data.sun, moon: data.moon,
    },
  };
}

// ─── Flora ───────────────────────────────────────────────────────────────

export function cropsSheet(
  region: SavedRegion, plantings: Planting[], ledger: CropLedgerResult | null, unit: Unit,
  total?: number,
): Sheet {
  const status = new Map((ledger?.plantings ?? []).map((s) => [s.ref, s]));
  return {
    title: "Flora", emoji: "🌱",
    eyebrow: `${region.name} · ${held(plantings.length, total, "planting")}`,
    head: ["Crop", "Sown", "Set out", "Base", "Target", "So far", "To go", "Finishes"],
    rows: plantings.map((p) => {
      const s = status.get(p.id);
      const finish = p.perennial && !p.gddTarget ? "perennial"
        : s?.finish ? `${words(s.finish.verdict)}${s.finish.projected_date ? ` · ${s.finish.projected_date}` : ""}`
        : "";
      return [
        p.commonName && p.commonName !== p.crop ? `${p.crop} (${p.commonName})` : p.crop,
        p.sownOn ?? "", p.setOut, showTemp(p.baseTempF ?? region.baseTempF, unit),
        p.gddTarget != null ? showDD(p.gddTarget, unit) : "",
        s?.gdd_accumulated != null ? showDD(s.gdd_accumulated, unit) : "",
        s?.gdd_remaining != null ? showDD(s.gdd_remaining, unit) : "",
        finish,
      ];
    }),
    json: {
      block: region.name, as_of: ledger?.as_of ?? null,
      plantings: plantings.map((p) => ({ ...p, status: status.get(p.id) ?? null })),
    },
  };
}

// ─── Pests ───────────────────────────────────────────────────────────────

export function pestsSheet(
  region: SavedRegion, models: SavedPest[], data: PestWindowResult | null, unit: Unit,
  total?: number,
): Sheet {
  const status = new Map((data?.pests ?? []).map((s) => [s.ref, s]));
  return {
    title: "Pests", emoji: "🐛",
    eyebrow: `${region.name} · ${held(models.length, total, "pest")}`,
    head: ["Pest", "Base", "Biofix", "So far", "Stage now", "Next stage", "Expected"],
    rows: models.map((m) => {
      const s = status.get(m.id);
      return [
        m.pest,
        m.watch ? "watch" : showTemp(m.base_temp ?? region.baseTempF, unit),
        m.biofix ?? "",
        s?.gdd_accumulated != null ? showDD(s.gdd_accumulated, unit) : "",
        s?.current_stage ?? (m.model ? m.model : ""),
        s?.next_stage ? `${s.next_stage.stage} at ${showDD(s.next_stage.gdd, unit)}` : "",
        s?.next_stage?.projected_date ?? "",
      ];
    }),
    json: {
      block: region.name, as_of: data?.as_of ?? null,
      scout_now: data?.scout_now ?? [],
      pests: models.map((m) => ({ ...m, status: status.get(m.id) ?? null })),
    },
  };
}

// ─── Fauna ───────────────────────────────────────────────────────────────

export function wildlifeSheet(
  region: SavedRegion, models: SavedWildlife[], data: WildlifeResult | null, total?: number,
): Sheet {
  const status = new Map((data?.events ?? []).map((s) => [s.ref, s]));
  return {
    title: "Fauna", emoji: "🦌",
    eyebrow: `${region.name} · ${held(models.length, total, "watch", "watches")}`,
    head: ["Creature", "Event", "Clock", "Threshold", "Reached", "Expected"],
    rows: models.map((m) => {
      const s = status.get(m.id);
      return [
        `${m.emoji ? `${m.emoji} ` : ""}${m.species}`, m.event, m.driver,
        s?.threshold ?? "", s?.reached_on ?? "",
        s?.window ? `${s.window.from} to ${s.window.to}` : s?.projected_date ?? "",
      ];
    }),
    json: {
      block: region.name, as_of: data?.as_of ?? null,
      watches: models.map((m) => ({ ...m, status: status.get(m.id) ?? null })),
    },
  };
}

// ─── Tasks ───────────────────────────────────────────────────────────────

export function todoSheet(region: SavedRegion, rows: TaskRow[], total?: number): Sheet {
  return {
    title: "Tasks", emoji: "✅",
    eyebrow: `${region.name} · ${held(rows.length, total, "task")}`,
    head: ["Done", "Due", "Starts", "Task", "Note"],
    rows: rows.map((t) => [
      t.done ? "✓" : "", t.due ?? "", t.starts_at ?? "", t.title, t.note ?? "",
    ]),
    json: { block: region.name, tasks: rows },
  };
}

// ─── References ──────────────────────────────────────────────────────────

/// The three kinds of thing the References page lists. Typed here, where the
/// sheet reads them, so the page's constants and the export agree by
/// construction.
export interface Source { name: string; url: string; role: string; resolution: string; note: string }
export interface Model { title: string; body: string; assumption: string }
export interface Reading { name: string; url: string; said: string }

/// Three lists with three shapes, as one table: what kind of thing each row
/// is, its name, what it says, the caveat, and the link where there is one.
export function referencesSheet(sources: Source[], models: Model[], reading: Reading[]): Sheet {
  return {
    title: "References", emoji: "📚",
    eyebrow: `${n(sources.length, "source")} · ${n(models.length, "model")} · ${n(reading.length, "place")} to read on`,
    head: ["Kind", "Name", "Says", "Caveat", "Resolution", "Link"],
    rows: [
      ...sources.map((s) => ["Source", s.name, s.role, s.note, s.resolution, s.url]),
      ...models.map((m) => ["Model", m.title, m.body, m.assumption, "", ""]),
      ...reading.map((r) => ["Reading", r.name, r.said, "", "", r.url]),
    ],
    json: { sources, models, disease_reading: reading },
  };
}

// ─── Glossary ────────────────────────────────────────────────────────────

export function termsSheet(entries: Entry[], groups: { key: Entry["group"]; label: string }[], of: number): Sheet {
  const where = new Map(groups.map((g) => [g.key, g.label]));
  return {
    title: "What the words mean", emoji: "📖",
    eyebrow: held(entries.length, of, "word"),
    head: ["Term", "Also called", "Where", "Meaning"],
    rows: entries.map((e) => [e.term, (e.aka ?? []).join(", "), where.get(e.group) ?? e.group, e.said]),
    json: entries,
  };
}

// ─── Field Reports ───────────────────────────────────────────────────────

export function reportsSheet(region: SavedRegion, reports: FieldReport[]): Sheet {
  const label = new Map(TAGS.map((t) => [t.key, t.label]));
  return {
    title: "Field Reports", emoji: "📓",
    eyebrow: `${region.name} · ${n(reports.length, "report")}`,
    head: ["Seen", "What", "About", "Amount", "Note", "Where"],
    rows: reports.map((o) => [
      o.observedOn, label.get(o.tag) ?? o.tag,
      [o.crop, o.stage].filter(Boolean).join(" · "),
      o.amount != null ? `${o.amount}${o.unit ? ` ${o.unit}` : ""}` : "",
      o.note,
      o.lat != null && o.lng != null ? `${o.lat.toFixed(5)}, ${o.lng.toFixed(5)}` : "",
    ]),
    json: { block: region.name, reports },
  };
}
