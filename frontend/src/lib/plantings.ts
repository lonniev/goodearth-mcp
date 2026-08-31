// The block's plantings.
//
// A planting is a crop, a target, and the day it went out. Like regions, these
// belong on Nostr as NIP-78 `goodearth/crops` events; localStorage is the
// offline cache in that design and is what ships first. Keeping the store
// behind this module means the write-through is one file later, not a sweep.

export interface Planting {
  id: string;
  crop: string;
  /// Growing degree days from set-out to the stage the grower cares about.
  gddTarget: number;
  setOut: string; // YYYY-MM-DD
  /// Per-crop override; blank means the block's default.
  baseTempF?: number;
  /// Which saved region this planting is on.
  regionId: string;
}

const KEY = "goodearth:plantings:v1";

/// Starting points from extension data, so a grower is not staring at an empty
/// table. These are typical targets, not promises — the whole point of the
/// calibration loop is that a farm learns its own.
export interface CropPreset {
  crop: string;
  gddTarget: number;
  baseTempF: number;
  note: string;
  emoji: string;
  category: "field" | "flower" | "vegetable" | "cover";
  /// Survives a light frost, so it can use the shoulders of the season.
  frostHardy?: boolean;
  /// Sown where it grows rather than transplanted — so it waits on the soil.
  directSow?: boolean;
  /// Soil temperature it will germinate at, °F. Soil lags air by weeks, so
  /// for a direct sowing this is usually the binding constraint, not frost.
  minSoilF?: number;
  /// Weeks under lights before it goes out. This is the seed-packet date.
  startIndoorsWeeks?: number;
}

/// Starting points, not published agronomy.
///
/// Degree-day requirements vary by cultivar and maturity group — a corn hybrid
/// is SOLD by its relative maturity precisely because "corn" has no single
/// number. These are mid-range figures to edit against your own seed packet and
/// your own extension bulletin, and the UI says so wherever they appear.
export const CROP_PRESETS: CropPreset[] = [
  // ── Field and commodity ────────────────────────────────────────────────
  { crop: "Field corn · short season", gddTarget: 2200, baseTempF: 50, emoji: "🌽",
    category: "field", note: "grain, ~85-day hybrid",
    directSow: true, minSoilF: 55 },
  { crop: "Field corn · long season", gddTarget: 2800, baseTempF: 50, emoji: "🌽",
    category: "field", note: "grain, ~110-day hybrid",
    directSow: true, minSoilF: 55 },
  { crop: "Silage corn", gddTarget: 2400, baseTempF: 50, emoji: "🌽",
    category: "field", note: "to dent stage",
    directSow: true, minSoilF: 55 },
  { crop: "Soybean", gddTarget: 2500, baseTempF: 50, emoji: "🫘",
    category: "field", note: "to maturity, mid group",
    directSow: true, minSoilF: 55 },
  { crop: "Sunflower", gddTarget: 2200, baseTempF: 44, emoji: "🌻",
    category: "field", note: "oilseed, to physiological maturity",
    directSow: true, minSoilF: 50 },
  { crop: "Hemp · grain", gddTarget: 2000, baseTempF: 50, emoji: "🌿",
    category: "field", note: "to seed maturity",
    directSow: true, minSoilF: 50 },
  { crop: "Hemp · fibre", gddTarget: 1700, baseTempF: 50, emoji: "🌿",
    category: "field", note: "to technical maturity",
    directSow: true, minSoilF: 50 },
  { crop: "Alfalfa", gddTarget: 750, baseTempF: 41, emoji: "🍀",
    category: "field", note: "per cutting, frost hardy", frostHardy: true,
    directSow: true, minSoilF: 42 },
  { crop: "Winter wheat", gddTarget: 2100, baseTempF: 32, emoji: "🌾",
    category: "field", note: "after vernalisation", frostHardy: true,
    directSow: true, minSoilF: 40 },
  { crop: "Oats", gddTarget: 1700, baseTempF: 40, emoji: "🌾",
    category: "field", note: "to grain", frostHardy: true,
    directSow: true, minSoilF: 40 },
  { crop: "Barley", gddTarget: 1600, baseTempF: 40, emoji: "🌾",
    category: "field", note: "to grain", frostHardy: true,
    directSow: true, minSoilF: 40 },
  { crop: "Canola", gddTarget: 1900, baseTempF: 41, emoji: "🌼",
    category: "field", note: "spring type", frostHardy: true,
    directSow: true, minSoilF: 41 },
  { crop: "Sorghum", gddTarget: 2400, baseTempF: 50, emoji: "🌾",
    category: "field", note: "to grain",
    directSow: true, minSoilF: 60 },
  { crop: "Buckwheat", gddTarget: 1000, baseTempF: 50, emoji: "🥞",
    category: "cover", note: "to seed, fast smother crop",
    directSow: true, minSoilF: 50 },
  { crop: "Field peas", gddTarget: 1400, baseTempF: 40, emoji: "🫛",
    category: "field", note: "to dry seed", frostHardy: true,
    directSow: true, minSoilF: 45 },
  { crop: "Dry bean", gddTarget: 1700, baseTempF: 50, emoji: "🫘",
    category: "field", note: "to dry seed",
    directSow: true, minSoilF: 55 },

  // ── Vegetable ──────────────────────────────────────────────────────────
  { crop: "Pumpkin", gddTarget: 1800, baseTempF: 50, emoji: "🎃",
    category: "vegetable", note: "to orange fruit",
    directSow: true, minSoilF: 60, startIndoorsWeeks: 3 },
  { crop: "Winter squash", gddTarget: 1600, baseTempF: 50, emoji: "🎃",
    category: "vegetable", note: "to maturity",
    directSow: true, minSoilF: 60, startIndoorsWeeks: 3 },
  { crop: "Sweet corn", gddTarget: 1500, baseTempF: 50, emoji: "🌽",
    category: "vegetable", note: "to first pick",
    directSow: true, minSoilF: 55 },
  { crop: "Tomato", gddTarget: 1300, baseTempF: 50, emoji: "🍅",
    category: "vegetable", note: "to first ripe fruit",
    startIndoorsWeeks: 6, minSoilF: 60 },
  { crop: "Hot pepper", gddTarget: 1650, baseTempF: 50, emoji: "🌶️",
    category: "vegetable", note: "to ripe fruit",
    startIndoorsWeeks: 8, minSoilF: 65 },
  { crop: "Potato", gddTarget: 1800, baseTempF: 45, emoji: "🥔",
    category: "vegetable", note: "to bulking",
    directSow: true, minSoilF: 45 },
  { crop: "Garlic", gddTarget: 1900, baseTempF: 40, emoji: "🧄",
    category: "vegetable", note: "autumn planted, to scape", frostHardy: true,
    directSow: true },
  { crop: "Onion", gddTarget: 1900, baseTempF: 45, emoji: "🧅",
    category: "vegetable", note: "to bulbing", frostHardy: true,
    startIndoorsWeeks: 10, minSoilF: 45 },
  { crop: "Carrot", gddTarget: 1300, baseTempF: 40, emoji: "🥕",
    category: "vegetable", note: "to size", frostHardy: true,
    directSow: true, minSoilF: 45 },
  { crop: "Brassicas", gddTarget: 1200, baseTempF: 40, emoji: "🥬",
    category: "vegetable", note: "cabbage, broccoli, to head", frostHardy: true,
    startIndoorsWeeks: 5, minSoilF: 45 },
  { crop: "Watermelon", gddTarget: 3200, baseTempF: 55, emoji: "🍉",
    category: "vegetable", note: "to ripe fruit",
    startIndoorsWeeks: 4, minSoilF: 65 },
  { crop: "Basil", gddTarget: 600, baseTempF: 50, emoji: "🌿",
    category: "vegetable", note: "to first cut",
    startIndoorsWeeks: 6, minSoilF: 60 },

  // ── Cut flower ─────────────────────────────────────────────────────────
  { crop: "Dahlia", gddTarget: 1200, baseTempF: 50, emoji: "🌸",
    category: "flower", note: "to first bloom",
    startIndoorsWeeks: 4, minSoilF: 60 },
  { crop: "Lisianthus", gddTarget: 1050, baseTempF: 50, emoji: "💐",
    category: "flower", note: "to cut stage from pinch",
    startIndoorsWeeks: 10, minSoilF: 55 },
  { crop: "Celosia", gddTarget: 900, baseTempF: 50, emoji: "🌺",
    category: "flower", note: "to cut stage",
    startIndoorsWeeks: 5, minSoilF: 60 },
  { crop: "Zinnia", gddTarget: 780, baseTempF: 50, emoji: "🌼",
    category: "flower", note: "to cut stage from sow",
    startIndoorsWeeks: 4, minSoilF: 60 },
  { crop: "Ranunculus", gddTarget: 900, baseTempF: 40, emoji: "🌷",
    category: "flower", note: "cool season, to cut", frostHardy: true,
    startIndoorsWeeks: 8, minSoilF: 45 },
  { crop: "Snapdragon", gddTarget: 850, baseTempF: 40, emoji: "🌷",
    category: "flower", note: "to cut stage", frostHardy: true,
    startIndoorsWeeks: 8, minSoilF: 45 },

  // ── Cover ──────────────────────────────────────────────────────────────
  { crop: "Winter rye", gddTarget: 900, baseTempF: 38, emoji: "🌾",
    category: "cover", note: "autumn sown, to overwinter", frostHardy: true,
    directSow: true, minSoilF: 38 },
  { crop: "Crimson clover", gddTarget: 1100, baseTempF: 41, emoji: "🍀",
    category: "cover", note: "to bloom", frostHardy: true,
    directSow: true, minSoilF: 42 },
  { crop: "Daikon radish", gddTarget: 900, baseTempF: 45, emoji: "🌱",
    category: "cover", note: "tillage radish, to size", frostHardy: true,
    directSow: true, minSoilF: 45 },
];

export const CROP_CATEGORIES: { key: CropPreset["category"]; label: string }[] = [
  { key: "field", label: "Field" },
  { key: "vegetable", label: "Vegetable" },
  { key: "flower", label: "Cut flower" },
  { key: "cover", label: "Cover" },
];

function read(): Planting[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Planting[]) : [];
  } catch {
    return [];
  }
}

function write(all: Planting[]): Planting[] {
  try { window.localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* noop */ }
  return all;
}

export function listPlantings(regionId?: string): Planting[] {
  const all = read();
  return regionId ? all.filter((p) => p.regionId === regionId) : all;
}

export function savePlanting(p: Planting): Planting[] {
  return write([...read().filter((x) => x.id !== p.id), p]);
}

export function deletePlanting(id: string): Planting[] {
  return write(read().filter((x) => x.id !== id));
}

/// Validate the way the server does, so a grower is corrected in the form
/// rather than by a failed paid call.
export function makePlanting(
  crop: string, gddTarget: number, setOut: string, regionId: string, baseTempF?: number,
): Planting | string {
  if (!crop.trim()) return "Give the planting a crop name.";
  if (!Number.isFinite(gddTarget) || gddTarget < 1 || gddTarget > 20_000)
    return "GDD target should be a realistic number of degree days.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(setOut) || Number.isNaN(Date.parse(setOut)))
    return "Set-out date must be YYYY-MM-DD.";
  if (baseTempF != null && (baseTempF < 20 || baseTempF > 80))
    return "Base temperature must be between 20 and 80 °F.";
  return {
    id: `pl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    crop: crop.trim(), gddTarget, setOut, regionId,
    ...(baseTempF != null ? { baseTempF } : {}),
  };
}


/// The icon for a crop name, for the ledger rows.
///
/// A planting's crop is free text — a grower writes "Zinnia · succession 4",
/// not a preset key — so an exact lookup alone would leave most real rows
/// unmarked. Falling back to the longest preset name contained in the string
/// matches the successions and the notes people actually type, and a seedling
/// stands in for anything the catalogue has never heard of. Never guesses by
/// prefix alone: "corn" must not claim "cornflower".
export function emojiFor(crop: string): string {
  const name = crop.trim().toLowerCase();
  if (!name) return SEEDLING;

  for (const p of CROP_PRESETS) {
    if (p.crop.toLowerCase() === name) return p.emoji;
  }

  let best: CropPreset | undefined;
  for (const p of CROP_PRESETS) {
    // Match on the head term, before any " · " qualifier, and only on a whole
    // word — otherwise "Hemp · grain" would match against "hemp" inside an
    // unrelated word and mark the wrong row.
    const head = p.crop.split("·")[0].trim().toLowerCase();
    if (!head) continue;
    if (!new RegExp(`(^|[^a-z])${escapeRe(head)}([^a-z]|$)`).test(name)) continue;
    if (!best || head.length > best.crop.split("·")[0].trim().length) best = p;
  }
  return best?.emoji ?? SEEDLING;
}

const SEEDLING = "\u{1F331}";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


/// The date a planting added from a sowing row should carry.
///
/// The row's whole point is its out date, so that is the date to use — but
/// only while it is still ahead. A window that opened in April cannot be when
/// an August tap put the crop in the ground, and dating it there would
/// backdate the heat the ledger goes on to count against the target. Both
/// arguments are YYYY-MM-DD, which compares correctly as text.
export function plantingDateFor(earliestOut: string | null | undefined, today: string): string {
  return earliestOut && earliestOut > today ? earliestOut : today;
}
