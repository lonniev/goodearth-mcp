/**
 * Good Earth's own tools, called through @tollbooth-dpyc/web.
 *
 * The client core is the package's: the one MCP connection, the npub/proof
 * envelope (a fresh kind-27235 inline proof when this tab holds a session key,
 * else the cached DM proof), the proof-bounce signal, the identity storage and
 * the standard tools (balance, top-up, statement, price, profile). What stays
 * here is Good Earth's alone:
 *
 *   - the field outbox: a grower's write made without signal waits in
 *     `outbox.ts` and is sent when the signal returns;
 *   - `TOOL_ID`, the frozen UUIDs this operator prices its tools under;
 *   - the domain tools and their result types.
 */

import { nearbyArgs } from "./wire";
import {
  callTool as callOperator,
  checkPrice,
  debugPush,
  getStoredNpub,
  toolName,
} from "@tollbooth-dpyc/web";
import {
  QUEUEABLE, enqueue, flush, isTransportFailure, waiting, type FlushResult,
} from "./outbox";

// ─── callTool, with the field outbox in front of it ──────────────────────

/// `replay` is the outbox sending what waited. It must fail rather than queue
/// itself a second time.
async function callTool<T = unknown>(
  tool: string,
  args: Record<string, unknown> = {},
  opts: { replay?: boolean } = {},
): Promise<T> {
  // A field write with no signal waits in the outbox instead of failing.
  // It also waits behind anything already waiting: sent straight away, it
  // would land first and then be overwritten by an older edit of the same
  // row when that one is replayed.
  const queueable = QUEUEABLE.has(tool) && !opts.replay;
  const npub = getStoredNpub();
  if (queueable && npub && (browserOnline() === false || waiting(npub).length > 0)) {
    const q = queue(tool, args, npub);
    if (browserOnline() !== false) void flushOutbox();
    return q as T;
  }

  try {
    return await callOperator<T>(tool, args);
  } catch (e) {
    if (queueable && npub && isTransportFailure(toolName(tool), e, browserOnline())) return queue(tool, args, npub) as T;
    throw e;
  }
}

/// What the browser believes. `undefined` where there is no browser.
function browserOnline(): boolean | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.onLine;
}

/// Put a field write in the outbox and answer as the server would have, marked
/// `queued` so a view can draw the row as waiting rather than reload a list it
/// cannot reach.
function queue(tool: string, args: Record<string, unknown>, npub: string) {
  enqueue(npub, tool, args);
  debugPush("call", `${toolName(tool)} waits for signal`);
  const items = (args.items as Record<string, unknown>[] | undefined) ?? [];
  return {
    success: true, queued: true,
    ...(typeof args.task_id === "string" ? { id: args.task_id } : {}),
    ...(items.length ? { saved: items.map((i) => String(i.item_id)) } : {}),
  };
}

/// Send what waited for signal, as whoever is signed in now. Safe to call as
/// often as anything likes: one drain runs at a time.
export function flushOutbox(): Promise<FlushResult> {
  return flush(getStoredNpub(), (tool, args) => callTool(tool, args, { replay: true }));
}

/// A row's id, made here rather than by the server, so that a write replayed
/// after a dropped reply updates the row it made instead of making another.
function mintId(prefix: string): string {
  const r = globalThis.crypto?.getRandomValues?.(new Uint32Array(2)) ?? [Math.random() * 2 ** 32, 0];
  return `${prefix}-${Date.now().toString(36)}-${[...r].map((n) => Math.floor(n).toString(36)).join("")}`;
}

// ─── Pricing ─────────────────────────────────────────────────────────────

/// Frozen tool UUIDs, mirroring src/goodearth_mcp/server.py. check_price is
/// keyed by tool_id, not by name — a capability can be renamed without
/// orphaning its pricing row, which is the whole point of freezing the UUID.
export const TOOL_ID: Record<string, string> = {
  goodearth_gdd_season_curve: "886ebfd6-dde4-5297-9145-2154caefb943",
  goodearth_disease_risk: "b12c4ed8-c3cd-5a14-8e4b-a9fa344b7096",
  goodearth_region_climate_bundle: "2a6cda20-40e0-5aea-8b3a-3f8310937f05",
  goodearth_frost_window: "2b611018-f61d-5d72-bc8e-27abb605b669",
  goodearth_dli_curve: "b111cfd0-1bef-5cf4-907c-37bbf8d2d96a",
  goodearth_water_balance: "c4ec3643-1e8b-59bc-a239-82353c4a0f52",
  goodearth_soil_temp_projection: "03764cdc-c9d9-5396-9eb1-9b7f56da08f6",
  goodearth_crop_gdd_status: "a8f72831-77df-57d4-9e6a-dcf81b06832e",
  goodearth_finish_before_frost: "b5f11328-8d8f-58db-ba89-11f8cbcc3314",
  goodearth_pest_threshold: "79463a63-2076-5376-a357-673c4adb33f0",
  goodearth_calibration: "2e7c72db-e886-53be-b948-bcc97a57986d",
};

/// The fare for one of this operator's tools, by its runtime name. Null when
/// unreadable; the caller shows the answer without a price rather than
/// inventing one.
export function priceOf(runtimeName: string): Promise<number | null> {
  return checkPrice(TOOL_ID[runtimeName] ?? runtimeName);
}

// ─── Good Earth domain tools (paid) ──────────────────────────────────────

/** Either shape a region may take. The SPA's drawing layer emits the first;
 *  a saved Favourite pin emits the second. */
export type Region =
  | { type: "Polygon"; coordinates: number[][][] }
  | { lat: number; lon: number; radius_m: number };

export interface Spread {
  min: number;
  mean: number;
  max: number;
  spread: number;
  n: number;
}

export interface RegionDescription {
  kind: "polygon" | "circle";
  sample_count: number;
  grid_spacing_m: number;
  area_km2: number;
  centroid: { lat: number; lon: number };
  bbox: { min_lat: number; min_lon: number; max_lat: number; max_lon: number };
}

export interface SeasonCurveResult {
  success: boolean;
  error?: string;
  error_code?: string;
  base_temp_f: number;
  season_start: string;
  as_of: string;
  region: RegionDescription;
  accumulated_gdd: Spread | null;
  across_region: {
    note: string;
    terrain_correction: "applied" | "unavailable";
    terrain_note?: string;
    archive_cells_fetched: number;
  };
  curve: { dates: string[]; cumulative_mean: number[] };
  normals: {
    span_years: number;
    band: { min: number; mean: number; max: number }[];
    today: { min: number; mean: number; max: number } | null;
    ahead_of_normal_gdd: number | null;
    note: string;
  } | null;
  forecast: { dates: string[]; cumulative: number[]; resolution_m: number; note: string } | null;
  projection: { days: number; cumulative: number[]; note: string } | null;
  /// This ground's typical heat for each day from tomorrow to Dec 31 — where
  /// a planting set out past the projection finds its heat. Absent from a
  /// server older than the web app, which deploys first.
  typical?: { dates: string[]; daily: number[]; span_years: number; note: string } | null;
  sources: { name: string; role: string; resolution_m: number; as_of?: string }[];
}

/// Season-to-date growing degree days across a region, with the spread that
/// distinguishes a bench from a hollow on the same block.
export async function gddSeasonCurve(
  block: string,
  baseTemp = 50,
): Promise<SeasonCurveResult> {
  return callTool<SeasonCurveResult>("gdd_season_curve", { block, base_temp: baseTemp,
  });
}

export type FrostLevel = "clear" | "frost_watch" | "frost_likely" | "hard_freeze";

export interface FrostNight {
  date: string;
  level: FrostLevel;
  forecast_low_f: number;
  low_ground_f: number;
  drainage_applied_f: number;
  wind_mph: number | null;
  cloud_pct: number | null;
  dew_point_f: number | null;
  /// The day's high — the temperature that decides whether anything flies.
  high_f: number | null;
  reason: string;
}

export interface FrostWindowResult {
  success: boolean;
  error?: string;
  error_code?: string;
  as_of: string;
  region: RegionDescription;
  first_frost: {
    median: string;
    earliest: string;
    latest: string;
    years_on_record: number;
    note: string;
  } | null;
  days_to_median_first_frost: number | null;
  across_region: {
    coldest_ground_offset_f: number;
    elevation_range_m: number | null;
    terrain_correction: "applied" | "unavailable";
    terrain_note?: string;
    note: string;
  };
  nights: FrostNight[];
  worst_night: FrostNight | null;
  thresholds_f: { frost: number; watch: number; hard_freeze: number };
  sources: { name: string; role: string; resolution_m: number; as_of?: string }[];
}

/// When frost normally arrives on this ground, and whether it is coming this
/// week — assessed for the region's COLDEST ground, not its average.
export async function frostWindow(block: string): Promise<FrostWindowResult> {
  return callTool<FrostWindowResult>("frost_window", { block });
}


export interface PlantingStatus {
  /// The saved planting this row is about. Carried through the arithmetic
  /// untouched, so two successions of one crop are never confused.
  ref?: string;
  crop: string;
  set_out: string;
  days_since_set_out?: number;
  gdd_target: number;
  gdd_accumulated?: number;
  gdd_remaining?: number;
  progress?: number;
  recent_rate_gdd_per_day?: number;
  projected_date: string | null;
  state: "past_target" | "on_pace" | "stalled" | "not_yet_planted";
  base_temp_f?: number;
  note: string;
  finish: {
    verdict: "finished" | "finishes" | "wont_finish" | "unknown";
    projected_date?: string;
    median_frost?: string;
    margin_days?: number;
    at_risk_of_early_frost?: boolean;
    gdd_shortfall?: number | null;
    note: string;
  };
}

export interface CropLedgerResult {
  success: boolean;
  error?: string;
  error_code?: string;
  as_of: string;
  region: RegionDescription;
  first_frost: { median: string; earliest: string; latest: string; years_on_record: number } | null;
  plantings: PlantingStatus[];
  /// On the record but with nothing to count from — no set-out, no heat
  /// target, or neither. A perennial is the ordinary case: an apple tree has
  /// no heat target anyone counts. These must still be SHOWN, or the grower's
  /// own choices are invisible on the page that is supposed to list them.
  untracked?: {
    crop: string; reason: string; missing?: string[]; ref?: string;
    /// A tree, not an annual with fields missing — so the row can be marked
    /// as a different kind of thing rather than as an incomplete one.
    perennial?: boolean;
  }[];
  wont_finish: string[];
  summary: string;
  note: string;
}

/// Where every planting on a block stands. One call answers the whole ledger —
/// the season curve and frost record are shared across plantings server-side.
export async function cropGddStatus(
  block: string,
  plantings: {
    crop: string; gdd_target?: number; set_out?: string; base_temp?: number;
    perennial?: boolean; chill_hours?: number; hardy_to_f?: number; ref?: string;
  }[],
  baseTemp = 50,
): Promise<CropLedgerResult> {
  return callTool<CropLedgerResult>("crop_gdd_status", { block, plantings, base_temp: baseTemp,
  });
}


// ─── Soil window ─────────────────────────────────────────────────────────

export interface SoilWindowResult {
  success: boolean;
  error?: string;
  as_of: string;
  band: { key: string; label: string };
  threshold_f: number;
  direction: "cooling" | "warming";
  current_soil_f: number | null;
  near_term: {
    days: { date: string; soil_f: number | null }[];
    crossing_date: string | null;
    note: string;
  } | null;
  typical: { median: string; earliest: string; latest: string; years_on_record: number } | null;
  days_to_typical_crossing: number | null;
  note: string;
  sources?: { name: string; role: string; resolution_m?: number; as_of?: string }[];
}

/// One published disease model's verdict on this ground.
///
/// `at_risk` is about NOW — a qualifying period inside the recent window, or
/// one the forecast implies. `season_count` is the whole season and is a
/// different question: twenty periods since January says nothing about
/// whether to cut flowers this afternoon.
export interface DiseaseVerdict {
  model: string;
  disease: string;
  about: { name: string; disease: string; crops: string[]; citation: string; asks: string };
  risk: string;
  at_risk: boolean;
  recent: boolean;
  recent_window_days: number;
  season_count: number;
  last_period: { from?: string; to?: string; start?: string; end?: string; days?: number } | null;
  next_period: { from?: string; to?: string; start?: string; end?: string; days?: number } | null;
  /// One sentence about today, computed server-side so every caller says the
  /// same thing about the same weather.
  now: string;
  explain: string;
  /// Wallin only: the season's accrual is its own fact, separate from `at_risk`.
  at_decision_point?: boolean;
  severity_total?: number;
  ref?: string;
}

export interface DiseaseRiskResult {
  success: boolean;
  error?: string;
  as_of: string;
  season_from: string;
  region: RegionDescription;
  wetness: {
    hours: number;
    hours_read: number;
    hours_missing: number;
    first: string | null;
    last: string | null;
    wet_hours: number;
    humid_hours: number;
    forecast_from: string | null;
    forecast_note?: string;
    /// Never measured. The estimator names itself so the page can say so.
    estimator: { name: string; measured: boolean; wet_when: string; why_estimated: string };
  };
  diseases: DiseaseVerdict[];
  skipped: { name: string; reason: string }[];
  summary: string;
  note: string;
  sources: { name: string; role: string; resolution_m: number; as_of?: string }[];
}

export interface DewOff {
  state: "dry" | "clears" | "wet" | "unknown";
  /// The feed's local hour, "YYYY-MM-DDTHH:00", when state is "clears".
  at: string | null;
}

export interface DryDay {
  date: string;
  /// Null when the feed did not fill the day — never read as dry.
  dry: boolean | null;
  rain_mm: number;
  rain_hours: number;
  wet_hours: number;
  et0_mm: number | null;
  vpd_max_kpa: number | null;
}

export interface DryingWindowResult {
  success: boolean;
  error?: string;
  error_code?: string;
  as_of: string;
  /// This hour on the block's own clock — the line reads against it, not the device's.
  now: string;
  today: { date: string; dew_off: DewOff };
  tomorrow: { date: string; dew_off: DewOff };
  dry_run: { start: string; end: string; days: number; strongest: string | null } | null;
  next_rain: { at: string; mm: number } | null;
  days: DryDay[];
  note: string;
  sources: { name: string; role: string; resolution_m: number; as_of?: string }[];
}

/// When the dew burns off this ground, the dry days ahead, and the next rain.
export async function dryingWindow(block: string): Promise<DryingWindowResult> {
  return callTool<DryingWindowResult>("drying_window", { block });
}

/// Hours of leaf wetness on this ground, and what the models make of them.
///
/// Stateless: the models travel as an argument and nothing is read from or
/// written to the record, so a page can show risk for a row nobody has saved.
export async function diseaseRisk(
  block: string, models?: { model: string; ref?: string }[],
): Promise<DiseaseRiskResult> {
  return callTool<DiseaseRiskResult>("disease_risk", {
    block,
    // Omitted at its default, never sent as an explicit one: the page and the
    // service deploy on separate clocks, and an argument the deployed service
    // has not heard of fails the WHOLE call rather than just the new feature.
    ...(models?.length ? { models } : {}),
  });
}

/// When soil at planting depth crosses a threshold on this ground.
export async function soilTempProjection(
  block: string, threshold = 60, direction: "cooling" | "warming" = "cooling",
  band: "planting" | "shallow" = "planting",
): Promise<SoilWindowResult> {
  return callTool<SoilWindowResult>("soil_temp_projection", { block, threshold, direction, band });
}

// ─── Pest thresholds ─────────────────────────────────────────────────────

export interface PestStage {
  stage: string;
  gdd: number;
  reached: boolean;
  gdd_remaining: number;
  projected_date: string | null;
  /// The day the season's count first cleared this stage. A `reached` flag
  /// says nothing about when, so a stage crossed in June and one crossed
  /// yesterday read identically without it.
  crossed_on?: string | null;
}

export interface PestAssessment {
  /// The saved pest model this row is about, echoed back untouched.
  ref?: string;
  pest: string;
  base_temp_f?: number;
  biofix?: string | null;
  counted_from?: string;
  gdd_accumulated?: number;
  current_stage?: string | null;
  next_stage?: PestStage | null;
  stages?: PestStage[];
  state: "active" | "before_first_stage" | "not_started";
  note: string;
}

export interface PestWindowResult {
  success: boolean;
  error?: string;
  as_of: string;
  pests: PestAssessment[];
  scout_now: string[];
  summary: string;
  note: string;
  /// Rows the server could not evaluate, with the reason. A pest saved with
  /// no thresholds is one of these — the page must say so rather than leave
  /// the row blank.
  skipped?: { name: string; reason: string }[];
}

// ─── Trees ───────────────────────────────────────────────────────────────

export interface TreeRequirement {
  tree: string;
  /// Chill hours at or below 45 °F the cultivar needs, and the temperature it
  /// is lost at. Both optional: a tree with neither is recorded and comes back
  /// unrated rather than refused.
  chill_hours?: number;
  hardy_to_f?: number;
  category?: string;
  emoji?: string;
  /// The saved item this row is about, echoed back untouched.
  ref?: string;
}

export type HardinessVerdict =
  "hardy" | "marginal" | "risky" | "too_cold" | "unrated" | "unknown";
export type ChillVerdict =
  "reliable" | "usual" | "marginal" | "short" | "unrated" | "unknown";

export interface TreeAssessment {
  ref?: string;
  tree: string;
  emoji?: string | null;
  category?: string | null;
  hardiness: {
    verdict: HardinessVerdict;
    note: string;
    record_low_f?: number;
    record_low_on?: string;
    hardy_to_f?: number;
    winters_below?: number;
    winters_on_record?: number;
    coldest_margin_f?: number;
  };
  chill: {
    verdict: ChillVerdict;
    note: string;
    median_hours?: number;
    lowest_hours?: number;
    highest_hours?: number;
    most_recent_hours?: number;
    most_recent_winter?: number;
    winters_on_record?: number;
    winters_meeting?: number;
    chill_hours_needed?: number;
    window?: string;
    model?: string;
  };
}

export interface TreeSuitabilityResult {
  success: boolean;
  error?: string;
  as_of: string;
  trees: TreeAssessment[];
  skipped?: { name: string; reason: string }[];
  chill?: TreeAssessment["chill"] | null;
  summary: string;
  note: string;
}

/// Whether a tree survives and gets its chill on this ground, across every
/// winter on record. The requirements are the caller's — they are cultivar
/// figures — and Good Earth computes what the ground delivered against them.
export async function treeSuitability(
  block: string, trees: TreeRequirement[],
): Promise<TreeSuitabilityResult> {
  return callTool<TreeSuitabilityResult>("tree_suitability", { block, trees });
}


export interface SpringStage {
  /// The date this stage reached this block, and the date it normally does.
  /// Either may be absent — a coastal pixel, or a season the run has not
  /// reached — and absent is reported rather than filled in.
  on: string | null;
  normally: string | null;
  /// Negative is early. The subtraction is shown rather than taken from
  /// NPN's own anomaly layer, which is computed against a baseline this code
  /// cannot see and disagreed with it.
  days_from_normal?: number;
}

export interface SapRun {
  /// "paused": no cycle for ten days before April — a hard freeze, not the end.
  state: "running" | "paused" | "over" | "not_started" | "none_recorded";
  started_on?: string;
  last_cycle_on?: string;
  cycles: number;
  days_since_last_cycle?: number;
  /// The sap winter, Dec 1 to May 15, named by the years it spans ("2026–27").
  winter?: string;
  window?: string;
  /// Past May 15: the day the next winter's window opens.
  next_window_opens?: string;
  note: string;
}

export interface TreeYearResult {
  success: boolean;
  error?: string;
  as_of: string;
  spring: { first_leaf: SpringStage; first_bloom: SpringStage } | null;
  /// The saved plants a sugarmaker would tap. Empty means no sap section.
  tapped: string[];
  sap: SapRun | null;
  sap_error?: string;
  summary: string;
  note: string;
  sources?: { name: string; role: string }[];
}

/// When spring reached this ground — first leaf and first bloom against their
/// thirty-year normals — and what the sap did. The trees are read from the
/// block's own record, so nothing is passed.
export async function treeYear(block: string): Promise<TreeYearResult> {
  return callTool<TreeYearResult>("tree_year", { block });
}
/// One row of what is recorded near a block.
export interface NearbyItem {
  name: string;
  scientific_name?: string;
  observations?: number;
  taxon_id?: number;
  rank?: string;
  photo?: string | null;
  photo_by?: string;
  photo_licence?: string;
  /// USA-NPN tracks a life cycle for this one, so there is a year to look at.
  has_habits?: boolean;
}

export interface NearbyResult {
  success: boolean;
  error?: string;
  kingdom?: string;
  looking_for?: string;
  search?: string;
  items?: NearbyItem[];
  /// Every page carries it. The catalogue this replaced showed forty of 2,196
  /// and said nothing about the rest.
  total?: number;
  page?: number;
  pages?: number;
  page_size?: number;
  with_habits?: number;
  search_span_km?: number;
  note?: string;
}

/// Search what is recorded near this ground — plants, insects, wildlife or
/// fungi — twenty to a page. Replaces the three whole-catalogue reads: there
/// are 3,542 insects and spiders around one Vermont block, and sweeping them
/// cost eleven round trips to build a list nobody read.
export async function nearbySpecies(
  block: string, kingdom: string, q = "", page = 1, withLifecycle = false,
): Promise<NearbyResult> {
  // `with_lifecycle` changes what `total` COUNTS — the ones with a published
  // life cycle rather than everything recorded here. The server says so in the
  // answer, and the finder's count line reads it back without adjustment.
  //
  // Sent ONLY when it is true, and that is not tidiness.
  //
  // The page and the service ship on different clocks: Cloudflare Pages had
  // this build live 43 seconds after the merge, and the MCP takes minutes. For
  // those minutes a new client was talking to a server that had never heard of
  // the argument, and because it was sent on EVERY call the whole finder
  // answered `unexpected_keyword_argument` — not just the new filter. Omitted
  // at its default, the ordinary path is immune to that window and only the
  // feature itself waits for the server to catch up.
  return callTool<NearbyResult>(
    "nearby_species", nearbyArgs(block, kingdom, q, page, withLifecycle));
}

export interface PestModel {
  pest: string;
  /// Cite the published forecast for this ground instead of restating it.
  /// Re-resolves every season, where pasted stages freeze whatever the
  /// forecast said the day they were copied.
  model?: "usa-npn";
  /// Vigilance without arithmetic. A grower watches voles, slugs and wasps —
  /// creatures with no degree-day stages — and demanding thresholds for them
  /// invites invented numbers.
  watch?: boolean;
  base_temp?: number;
  biofix?: string;
  stages: { stage: string; gdd: number }[];
}

/// Where your pest models' degree-day stages stand on this ground. The
/// thresholds are the caller's — Good Earth computes, it does not publish
/// entomology.
export async function pestThreshold(
  block: string, models: PestModel[],
): Promise<PestWindowResult> {
  return callTool<PestWindowResult>("pest_threshold", { block, pests: models });
}


// ─── Calibration ─────────────────────────────────────────────────────────

export interface FieldObservation {
  kind: "frost" | "stage";
  observed_on: string;
  note?: string;
  crop?: string;
  stage?: string;
  gdd_target?: number;
  set_out?: string;
}

export interface BiasSummary {
  median: number;
  min: number;
  max: number;
  spread: number;
  n: number;
  rejected_as_implausible: number;
  applicable: boolean;
  why_not: string | null;
  confidence?: "provisional" | "early" | "firming" | "settled";
  reading?: string;
  predicted_median?: string | null;
  rows?: Record<string, unknown>[];
}

export interface CalibrationResult {
  success: boolean;
  error?: string;
  as_of: string;
  observations_used: number;
  heat: BiasSummary & { rows: Record<string, unknown>[] };
  first_frost: BiasSummary & { rows: Record<string, unknown>[] };
  corrections: { heat_multiplier?: number; first_frost_offset_days?: number };
  note: string;
}

/// Turn a block's own field reports into a correction on the model. This is
/// the loop that makes Good Earth better the longer a farm uses it.
export async function calibration(
  block: string, observations: FieldObservation[], baseTemp = 50,
): Promise<CalibrationResult> {
  return callTool<CalibrationResult>("calibration", { block, observations, base_temp: baseTemp,
  });
}


// ─── Almanac ─────────────────────────────────────────────────────────────

export interface Sky { label: string; emoji: string }
export interface Wind {
  from: string | null; arrow: string | null; emoji: string;
  strength: string | null; speed_mph?: number;
}

export interface Measure {
  unit: string;
  actual: (number | null)[];
  forecast: (number | null)[];
  normal: { min: number; mean: number; max: number }[] | null;
  accumulates: boolean;
  latest?: number | null;
  normal_today?: { min: number; mean: number; max: number } | null;
  actual_total?: number;
  normal_total?: number;
}

export type MeasureKey =
  | "temp_max" | "temp_min" | "dew_point" | "precip" | "sunshine" | "daylight"
  | "wind_max" | "humidity";

export interface AlmanacResult {
  success: boolean;
  error?: string;
  as_of: string;
  sources?: { name: string; role: string; resolution_m?: number; as_of?: string }[];
  season_start: string;
  dates: string[];
  forecast_dates: string[];
  measures: Record<MeasureKey, Measure>;
  conditions: {
    date: string; sky: Sky; wind: Wind;
    high_f: number | null; low_f: number | null; dew_point_f: number | null;
    humidity_pct: number | null;
    precip_chance_pct: number | null;
    sunrise: string | null; sunset: string | null;
    daylight_hours: number | null; sunshine_hours: number | null;
    sunshine_fraction: number | null;
  } | null;
  upcoming: {
    date: string; sky: Sky; wind: Wind;
    high_f: number | null; low_f: number | null; dew_point_f: number | null;
    humidity_pct: number | null;
    precip_in: number | null; precip_chance_pct: number | null;
    sunshine_hours: number | null;
  }[];
  sun: { daylight_change_min_per_day: number | null; note: string };
  moon: {
    phase: number; illumination: number; name: string; emoji: string;
    age_days: number; next_full: string | null; note: string;
  };
  normals_span_years: number;
}

/// Temperature, dew point, rain, wind, sun and moon — normal, actual, forecast.
export async function almanacFor(block: string): Promise<AlmanacResult> {
  return callTool<AlmanacResult>("almanac", { block });
}

// ─── Wildlife calendar ───────────────────────────────────────────────────

export interface WildlifeEventInput {
  species: string;
  event: string;
  driver: "heat" | "daylight" | "interval" | "calendar" | "condition";
  emoji?: string;
  note?: string;
  gdd?: number;
  base_temp?: number;
  daylight_hours?: number;
  rising?: boolean;
  typical_on?: string;
  /// A calendar event that happened ONCE, on this full date — a brood's start.
  /// Never re-dated to the year in hand, as `typical_on` alone is.
  on?: string;
  /// Interval events: a fixed count of days from a date. Every husbandry
  /// event is this — gestation, incubation, days to point of lay.
  days?: number;
  from?: string;
  /// A grower-defined trigger, dated by what this ground's weather did. The
  /// salamanders' "Big Night" is the case: the first mild wet night after the
  /// ground thaws, which no catalogue holds and no heat total finds. Stored in
  /// the record, so it belongs to the grower and re-dates itself each season.
  trigger?: {
    /// MM-DD. The earliest the season will look, so a February thaw is not
    /// mistaken for the thing itself.
    after?: string;
    min_night_f?: number;
    min_day_f?: number;
    wet?: boolean;
  };
}

export interface WildlifeRow {
  /// The saved watch this row is about, echoed back untouched. One creature
  /// can hold several events — an arrival and a departure — and only this
  /// separates them with certainty.
  ref?: string;
  species: string; event: string; emoji: string | null; note: string | null;
  driver: "heat" | "daylight" | "interval" | "calendar" | "condition";
  threshold: string;
  reached_on: string | null;
  projected_date: string | null;
  /// Interval events report a window, not a day — gestation varies.
  window?: { from: string; to: string };
  gdd_accumulated?: number;
  gdd_remaining?: number | null;
  days_away?: number;
}

export interface WildlifeResult {
  success: boolean;
  error?: string;
  as_of: string;
  events: WildlifeRow[];
  due_soon: WildlifeRow[];
  summary: string;
  note: string;
}

/// When the grower's own wildlife events arrive on this ground.
export async function wildlifeCalendar(
  block: string, events: WildlifeEventInput[],
): Promise<WildlifeResult> {
  return callTool<WildlifeResult>("wildlife_calendar", { block, events });
}


// ─── Crop suitability ────────────────────────────────────────────────────

export type Verdict = "comfortable" | "tight" | "marginal" | "too_short" | "unknown";

export interface SuitabilityRow {
  crop: string;
  emoji: string | null;
  category: string | null;
  gdd_target: number;
  base_temp_f: number;
  frost_hardy: boolean;
  season_gdd_available?: number;
  gdd_needed?: number;
  surplus_gdd?: number;
  surplus_days?: number | null;
  frost_free_days?: number | null;
  verdict: Verdict;
  note: string;
}

export interface SuitabilityResult {
  success: boolean;
  error?: string;
  budget: {
    frost_free_days: number | null;
    gdd_by_base: Record<string, number>;
    seasons_on_record: number;
    note: string;
  };
  crops: SuitabilityRow[];
  counts: Partial<Record<Verdict, number>>;
  summary: string;
  note: string;
}

/// Which crops finish on this ground, measured against its own frost-free heat
/// budget rather than looked up from a zone map.
export async function cropSuitability(
  block: string,
  crops: { crop: string; gdd_target: number; base_temp: number;
           frost_hardy?: boolean; category?: string; emoji?: string }[],
): Promise<SuitabilityResult> {
  return callTool<SuitabilityResult>("crop_suitability", { block, crops });
}


// ─── Calendar feeds ──────────────────────────────────────────────────────

export interface CalendarEvent {
  kind: "crop" | "pest" | "wildlife" | "frost" | "todo";
  key: string;
  title: string;
  date: string;
  emoji: string | null;
  detail: string;
  uid: string;
}

export interface CalendarFeedResult {
  success: boolean;
  error?: string;
  token: string;
  events: CalendarEvent[];
  url: string;
  webcal_url: string;
  region_name: string;
  entries: Record<string, number>;
  total: number;
  computed_on: string;
  note: string;
  /// Rows the feed could not date, each with the service's own reason. The
  /// builder has always returned these — nothing on the client had a field to
  /// put them in, so a grower whose heron never appeared on their calendar was
  /// told nothing at all. Partial knowledge is the permanent condition of
  /// farming; one undatable row must not cost the other forty, and it must not
  /// vanish either.
  skipped?: { kind?: string; name: string; item_id?: string | null; reason: string }[];
}

export interface FeedRow {
  token: string;
  url: string;
  region_name: string;
  entry_count: number;
  computed_on: string | null;
  updated_at: string | null;
}

/// Publish a block's season and tasks as a calendar any iCal client can
/// subscribe to. Pass an existing token to refresh in place — subscribers keep
/// their subscription and events update rather than duplicating.
export async function calendarSubscribe(opts: {
  block: string;
  season?: number;
  token?: string;
}): Promise<CalendarFeedResult> {
  // Nothing but the block: the server reads what it grows, watches for and has
  // due from the record. That is what makes a refresh safe — while these
  // travelled as arguments, a caller who did not know what was passed the
  // first time would silently republish a smaller season.
  return callTool<CalendarFeedResult>("calendar_dataset", {
    block: opts.block,
    ...(opts.season ? { season: opts.season } : {}),
    ...(opts.token ? { token: opts.token } : {}),
  });
}

export async function calendarList(): Promise<{ success: boolean; feeds: FeedRow[]; count: number; error?: string }> {
  return callTool("calendar_list", {});
}

export async function calendarRevoke(token: string): Promise<{ success: boolean; revoked: boolean; note: string }> {
  return callTool("calendar_revoke", { token });
}


// ─── Planting windows ────────────────────────────────────────────────────

export interface PlantingRow {
  crop: string;
  emoji: string | null;
  start_seed_indoors: string | null;
  earliest_out: string | null;
  earliest_reason: string;
  latest_out: string | null;
  days_to_finish: number | null;
  window_days: number | null;
  state: "open" | "narrow" | "will_not_fit" | "unknown";
  sow_now: boolean;
  note: string;
  /// Present only when the crop was sent with `succession_days`.
  successions?: SuccessionRow[];
}

/// One sowing of a succession: when it goes out, and when it typically
/// finishes on this ground — a median year, not a forecast.
export interface SuccessionRow {
  n: number;
  out: string;
  start_seed_indoors: string | null;
  finish: string | null;
  /// Days between the finish and the median first frost.
  margin_days: number | null;
  verdict: "finishes" | "wont_finish" | "unknown";
  /// Finishes after the EARLIEST first frost on record — the late bets.
  at_risk_of_early_frost: boolean;
}

export interface PlantingWindowResult {
  success: boolean;
  error?: string;
  /// The season the dates are for — next year's once this year's first frost
  /// has typically come. Absent from a server older than the web app.
  season?: number;
  frost: {
    last_spring_median: string | null;
    last_spring_latest: string | null;
    first_fall_median: string | null;
    first_fall_earliest: string | null;
    seasons_on_record: number;
  };
  soil_warming: Record<string, string>;
  crops: PlantingRow[];
  sow_now: string[];
  summary: string;
  note: string;
}

/// When to start seed, when to put it out, and the last day a sowing still
/// finishes — from this block's own frost and soil record.
export async function plantingWindow(
  block: string,
  crops: {
    crop: string; gdd_target: number; base_temp: number;
    frost_hardy?: boolean; direct_sow?: boolean;
    min_soil_f?: number; start_indoors_weeks?: number; emoji?: string;
    /// Sow again every this many days (3–60) and get the schedule back.
    succession_days?: number;
  }[],
): Promise<PlantingWindowResult> {
  return callTool<PlantingWindowResult>("planting_window", { block, crops });
}

// ── Regional catalogues ──────────────────────────────────────────────────
//
// What lives on this ground, read from the record of the surrounding country
// rather than from a list in this repo.

export interface PestCatalogEvent {
  model: string;
  name: string;
  /// The two halves of `name`. "Spotted lanternfly egg hatch" is a pest AND a
  /// moment; a form asking for a pest wants only the first, or it puts the
  /// whole phrase on the record as an animal.
  pest?: string;
  stage?: string;
  date: string;
  passed: boolean;
  source: string;
  resolution_m: number;
}

export interface PestCatalogResult {
  success: boolean;
  error?: string;
  events?: PestCatalogEvent[];
  insects_recorded?: { name: string; scientific_name?: string; observations: number }[];
  insects_recorded_total?: number;
  models_published?: number;
  models_unreadable?: number;
  search_span_km?: number;
  note?: string;
}

export async function pestCatalog(block: string): Promise<PestCatalogResult> {
  return callTool<PestCatalogResult>("pest_catalog", { block });
}

export interface WildlifeSpecies {
  name: string;
  scientific_name?: string;
  observations: number;
  emoji: string;
  /// The taxon's own photograph from iNaturalist, Creative Commons.
  photo?: string | null;
  photo_by?: string | null;
  photo_licence?: string | null;
  /// Whether USA-NPN publishes life-cycle phenophases for this animal.
  has_habits?: boolean;
}

export interface WildlifeCatalogResult {
  success: boolean;
  error?: string;
  groups?: {
    group: string; taxon: string; emoji: string;
    /// How many the feed says this group holds. Equal to `species.length` now;
    /// it was 40 against 253 recorded birds before, with nothing on screen to
    /// say the other 213 existed.
    recorded?: number;
    species: WildlifeSpecies[];
  }[];
  species_total?: number;
  with_habits?: number;
  unavailable?: string[];
  search_span_km?: number;
  note?: string;
}

export interface SpeciesHabitsResult {
  success: boolean;
  error?: string;
  scientific_name?: string;
  common_name?: string;
  habits?: string[];
  tracked?: boolean;
  note?: string;
}

export async function wildlifeCatalog(block: string): Promise<WildlifeCatalogResult> {
  return callTool<WildlifeCatalogResult>("wildlife_catalog", { block });
}

/// The same tool, asked about one animal: its life-cycle phenophases.
export async function speciesHabits(block: string, species: string): Promise<SpeciesHabitsResult> {
  return callTool<SpeciesHabitsResult>("wildlife_catalog", { block, species });
}

// ── Tasks ────────────────────────────────────────────────────────────────
//
// Server-held now, so the list can be filtered, sorted and paged in SQL. The
// parameter names follow taxsort's convention — sort_col, sort_dir, page,
// page_size — because three repos in this fleet already speak it.

export type Timeframe = "day" | "week" | "month" | "season" | "all";
export type TaskSort = "due" | "title" | "done" | "starts" | "created" | "updated";

export interface TaskRow {
  id: string;
  title: string;
  note?: string | null;
  due?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  reminder_only: boolean;
  done: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TaskPage {
  success: boolean;
  error?: string;
  rows?: TaskRow[];
  total?: number;
  page?: number;
  pages?: number;
  page_size?: number;
  sort_col?: string;
  sort_dir?: string;
  timeframe?: string;
}

export interface TaskInput {
  task_id?: string;
  title: string;
  note?: string;
  due?: string;
  starts_at?: string;
  ends_at?: string;
  reminder_only?: boolean;
  done?: boolean;
}

export async function taskList(regionId: string, q: {
  timeframe?: Timeframe; search?: string; sort_col?: TaskSort;
  sort_dir?: "asc" | "desc"; page?: number; page_size?: number; season_start?: string;
} = {}): Promise<TaskPage> {
  return callTool<TaskPage>("task_list", { region_id: regionId, ...q });
}

export async function taskSave(regionId: string, t: TaskInput): Promise<{ success: boolean; id?: string; error?: string; queued?: boolean }> {
  return callTool("task_save", { region_id: regionId, ...t, task_id: t.task_id || mintId("tk") });
}

export async function taskDelete(taskId: string): Promise<{ success: boolean; error?: string }> {
  return callTool("task_delete", { task_id: taskId });
}

export async function taskSetDone(taskId: string, done: boolean): Promise<{ success: boolean; error?: string }> {
  return callTool("task_set_done", { task_id: taskId, done });
}


// ── Blocks ───────────────────────────────────────────────────────────────
//
// A block is a plot of land, saved on the server. The geometry travels once,
// when the block is saved; after that every tool refers to the block and the
// server resolves the ground. Everything the grower curates on it — plantings,
// pests, wildlife, observations — is an item of one `kind`, written a row at a
// time rather than as a document, so two tabs cannot overwrite each other.

// ─── Forget me ───────────────────────────────────────────────────────────

export interface ForgetResult {
  success: boolean;
  error?: string;
  error_code?: string;
  /// Rows removed per table, so "gone" is checkable rather than asserted.
  forgotten?: Record<string, number>;
  rows?: number;
  note?: string;
}

/// The exact phrase the server requires. A sentence rather than a boolean,
/// because this cannot be undone.
export const FORGET_PHRASE = "FORGET MY GROUND";

/// Delete every block and everything recorded on it. The npub stays a patron:
/// balance and purchase history are the network's ledger, not this operator's
/// record of a farm, and they are untouched.
export async function forgetMyGround(confirm: string): Promise<ForgetResult> {
  return callTool<ForgetResult>("forget_my_ground", { confirm });
}


export interface BlockRow {
  block_id: string;
  name: string;
  aliases: string[];
  geometry: Region;
  base_temp_f: number;
  area_ha?: number | null;
  sample_count?: number | null;
  retired?: boolean;
  /// True on the worked example, which has no row and is never persisted.
  seeded?: boolean;
}

export interface BlockListResult {
  success: boolean;
  blocks: BlockRow[];
  count: number;
  /// The grower has saved nothing, so `blocks` is the worked example.
  seeded: boolean;
  note?: string;
  error?: string;
  error_code?: string;
}

export type ItemKind = "planting" | "pest" | "wildlife" | "observation" | "seed";

export interface ItemRow {
  item_id: string;
  kind: ItemKind;
  season_year?: number | null;
  observed_on?: string | null;
  source?: string | null;
  retired?: boolean;
  [field: string]: unknown;
}

/// The columns the server will order by. Mirrors `block_store.SORTABLE`
/// rather than hoping the two agree — a key absent there cannot be sorted by.
export type ItemSort =
  | "name" | "event" | "driver" | "starts_on" | "target_gdd"
  | "observed_on" | "season" | "created" | "updated";

export interface ItemPage {
  success: boolean;
  block_id: string;
  block_name: string;
  items: ItemRow[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  kind: ItemKind;
  error?: string;
  error_code?: string;
}

export async function blockList(includeRetired = false): Promise<BlockListResult> {
  return callTool<BlockListResult>("block_list", { include_retired: includeRetired });
}

export async function blockSave(b: {
  name: string; geometry: Region; block?: string; aliases?: string[];
  base_temp?: number; retired?: boolean;
}): Promise<{ success: boolean; block?: BlockRow; error?: string; error_code?: string }> {
  return callTool("block_save", b);
}

export async function blockItemSave(
  block: string, kind: ItemKind,
  q: { items?: Record<string, unknown>[]; retire_ids?: string[]; season?: number } = {},
): Promise<{ success: boolean; saved?: string[]; saved_count?: number; retired_count?: number; error?: string; error_code?: string; queued?: boolean }> {
  const items = q.items?.map((i) => (i.item_id ? i : { ...i, item_id: mintId(kind.slice(0, 2)) }));
  return callTool("block_item_save", { block, kind, ...q, ...(items ? { items } : {}) });
}

export async function blockItemList(
  block: string, kind: ItemKind,
  q: {
    season?: number; since?: string; until?: string; as_of?: string;
    include_retired?: boolean; page?: number; page_size?: number;
    /// Case-insensitive regex over name and event, applied by the database.
    search?: string;
    /// name | event | driver | starts_on | target_gdd | observed_on | season |
    /// created | updated. Omit for the record's default order.
    sort_col?: ItemSort; sort_dir?: "asc" | "desc";
  } = {},
): Promise<ItemPage> {
  return callTool<ItemPage>("block_item_list", { block, kind, ...q });
}

/// Is the server's block record available to this patron?
///
/// `check_price` is free and answers the same gate the paid tools do, so this
/// asks whether blocks are live without spending anything and without a write.
/// Until the operator has priced them the app stays wholly on device storage,
/// which is why this returns a plain boolean rather than throwing.
export async function blocksAvailable(): Promise<boolean> {
  try {
    const r = await blockList();
    return r?.success === true;
  } catch {
    return false;
  }
}
