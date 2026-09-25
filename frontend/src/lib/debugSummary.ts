// What the debug log may say about Good Earth's own tools.
//
// The package logs every call's arguments and the first 220 characters of its
// answer, scrubbed of secrets. Secrets are not this site's problem; location
// is. Nearly every Good Earth answer opens with `region` — the farm's centroid
// and bounding box to five decimals, about a metre — and `block_save` sends
// the whole polygon. A log pasted into a bug report would carry the farm's
// address in all but name. `calendar_dataset` answers with the feed URL, and
// the feed token is in the URL's path, where a field-name scrubber cannot see
// it.
//
// So the package stays quiet for every tool here, and `mcp.ts` writes these
// lines instead: the call with any geometry reduced to its shape, and the
// outcome — success, the error and its code, a count — never the answer.

/// Every Good Earth tool the front end calls. `debugSummary.test.ts` reads
/// `mcp.ts` and fails if a call there is missing from this list.
export const GOOD_EARTH_TOOLS: readonly string[] = [
  "almanac", "calibration", "crop_gdd_status", "crop_suitability",
  "disease_risk", "drying_window", "frost_window", "gdd_season_curve",
  "nearby_species", "pest_catalog", "pest_threshold", "planting_window",
  "soil_temp_projection", "tree_suitability", "tree_year",
  "wildlife_calendar", "wildlife_catalog",
  "block_list", "block_save", "block_item_list", "block_item_save",
  "task_list", "task_save", "task_delete", "task_set_done",
  "calendar_dataset", "calendar_list", "calendar_revoke",
  "forget_my_ground",
];

/// A geometry as its shape: a polygon's vertex count, or that it is a pin.
function shapeOf(g: unknown): string {
  if (!g || typeof g !== "object") return "geometry";
  const o = g as Record<string, unknown>;
  if (Array.isArray(o.coordinates)) {
    const ring = (o.coordinates as unknown[])[0];
    return `polygon of ${Array.isArray(ring) ? ring.length : "?"} points`;
  }
  if ("lat" in o || "lon" in o) return "pin";
  return "geometry";
}

const LOCATION_KEYS = new Set(["geometry", "lat", "lon", "latitude", "longitude", "centroid", "bbox", "coordinates"]);

/// The arguments with every location reduced to its shape, at any depth.
function withoutLocation(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(withoutLocation);
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    out[k] = k === "geometry" ? shapeOf(x) : LOCATION_KEYS.has(k) ? "…" : withoutLocation(x);
  }
  return out;
}

/// The call line: `goodearth_block_save({"name":"Home","geometry":"polygon of 9 points"})`.
export function callLine(name: string, args: Record<string, unknown>): string {
  return `${name}(${JSON.stringify(withoutLocation(args)).slice(0, 140)})`;
}

/// Fields of an answer that say how it went without saying what it found.
const OUTCOME_KEYS = [
  "success", "queued", "error_code", "error",
  "count", "total", "saved_count", "retired_count", "revoked", "seeded",
] as const;

/// The result line, and whether it is a failure. The JSON form keeps the
/// package's severity test working: `"success":false` and `error_code` are
/// what it reads to paint a row red or as a patron's next step.
export function resultLine(name: string, answer: unknown): { failed: boolean; message: string } {
  if (!answer || typeof answer !== "object") {
    return { failed: false, message: `${name} → ${typeof answer}` };
  }
  const a = answer as Record<string, unknown>;
  const outcome: Record<string, unknown> = {};
  for (const k of OUTCOME_KEYS) {
    const v = a[k];
    if (v === undefined || v === null) continue;
    outcome[k] = k === "error" ? String(v).slice(0, 160) : typeof v === "object" ? "…" : v;
  }
  const failed = a.success === false || a.error !== undefined || a.error_code !== undefined;
  return { failed, message: `${name} → ${JSON.stringify(outcome)}` };
}
