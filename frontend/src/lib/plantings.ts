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
    category: "field", note: "grain, ~85-day hybrid" },
  { crop: "Field corn · long season", gddTarget: 2800, baseTempF: 50, emoji: "🌽",
    category: "field", note: "grain, ~110-day hybrid" },
  { crop: "Silage corn", gddTarget: 2400, baseTempF: 50, emoji: "🌽",
    category: "field", note: "to dent stage" },
  { crop: "Soybean", gddTarget: 2500, baseTempF: 50, emoji: "🫘",
    category: "field", note: "to maturity, mid group" },
  { crop: "Sunflower", gddTarget: 2200, baseTempF: 44, emoji: "🌻",
    category: "field", note: "oilseed, to physiological maturity" },
  { crop: "Hemp · grain", gddTarget: 2000, baseTempF: 50, emoji: "🌿",
    category: "field", note: "to seed maturity" },
  { crop: "Hemp · fibre", gddTarget: 1700, baseTempF: 50, emoji: "🌿",
    category: "field", note: "to technical maturity" },
  { crop: "Alfalfa", gddTarget: 750, baseTempF: 41, emoji: "🍀",
    category: "field", note: "per cutting, frost hardy", frostHardy: true },
  { crop: "Winter wheat", gddTarget: 2100, baseTempF: 32, emoji: "🌾",
    category: "field", note: "after vernalisation", frostHardy: true },
  { crop: "Oats", gddTarget: 1700, baseTempF: 40, emoji: "🌾",
    category: "field", note: "to grain", frostHardy: true },
  { crop: "Barley", gddTarget: 1600, baseTempF: 40, emoji: "🌾",
    category: "field", note: "to grain", frostHardy: true },
  { crop: "Canola", gddTarget: 1900, baseTempF: 41, emoji: "🌼",
    category: "field", note: "spring type", frostHardy: true },
  { crop: "Sorghum", gddTarget: 2400, baseTempF: 50, emoji: "🌾",
    category: "field", note: "to grain" },
  { crop: "Buckwheat", gddTarget: 1000, baseTempF: 50, emoji: "🥞",
    category: "cover", note: "to seed, fast smother crop" },
  { crop: "Field peas", gddTarget: 1400, baseTempF: 40, emoji: "🫛",
    category: "field", note: "to dry seed", frostHardy: true },
  { crop: "Dry bean", gddTarget: 1700, baseTempF: 50, emoji: "🫘",
    category: "field", note: "to dry seed" },

  // ── Vegetable ──────────────────────────────────────────────────────────
  { crop: "Pumpkin", gddTarget: 1800, baseTempF: 50, emoji: "🎃",
    category: "vegetable", note: "to orange fruit" },
  { crop: "Winter squash", gddTarget: 1600, baseTempF: 50, emoji: "🎃",
    category: "vegetable", note: "to maturity" },
  { crop: "Sweet corn", gddTarget: 1500, baseTempF: 50, emoji: "🌽",
    category: "vegetable", note: "to first pick" },
  { crop: "Tomato", gddTarget: 1300, baseTempF: 50, emoji: "🍅",
    category: "vegetable", note: "to first ripe fruit" },
  { crop: "Hot pepper", gddTarget: 1650, baseTempF: 50, emoji: "🌶️",
    category: "vegetable", note: "to ripe fruit" },
  { crop: "Potato", gddTarget: 1800, baseTempF: 45, emoji: "🥔",
    category: "vegetable", note: "to bulking" },
  { crop: "Garlic", gddTarget: 1900, baseTempF: 40, emoji: "🧄",
    category: "vegetable", note: "autumn planted, to scape", frostHardy: true },
  { crop: "Onion", gddTarget: 1900, baseTempF: 45, emoji: "🧅",
    category: "vegetable", note: "to bulbing", frostHardy: true },
  { crop: "Carrot", gddTarget: 1300, baseTempF: 40, emoji: "🥕",
    category: "vegetable", note: "to size", frostHardy: true },
  { crop: "Brassicas", gddTarget: 1200, baseTempF: 40, emoji: "🥬",
    category: "vegetable", note: "cabbage, broccoli, to head", frostHardy: true },
  { crop: "Watermelon", gddTarget: 3200, baseTempF: 55, emoji: "🍉",
    category: "vegetable", note: "to ripe fruit" },
  { crop: "Basil", gddTarget: 600, baseTempF: 50, emoji: "🌿",
    category: "vegetable", note: "to first cut" },

  // ── Cut flower ─────────────────────────────────────────────────────────
  { crop: "Dahlia", gddTarget: 1200, baseTempF: 50, emoji: "🌸",
    category: "flower", note: "to first bloom" },
  { crop: "Lisianthus", gddTarget: 1050, baseTempF: 50, emoji: "💐",
    category: "flower", note: "to cut stage from pinch" },
  { crop: "Celosia", gddTarget: 900, baseTempF: 50, emoji: "🌺",
    category: "flower", note: "to cut stage" },
  { crop: "Zinnia", gddTarget: 780, baseTempF: 50, emoji: "🌼",
    category: "flower", note: "to cut stage from sow" },
  { crop: "Ranunculus", gddTarget: 900, baseTempF: 40, emoji: "🌷",
    category: "flower", note: "cool season, to cut", frostHardy: true },
  { crop: "Snapdragon", gddTarget: 850, baseTempF: 40, emoji: "🌷",
    category: "flower", note: "to cut stage", frostHardy: true },

  // ── Cover ──────────────────────────────────────────────────────────────
  { crop: "Winter rye", gddTarget: 900, baseTempF: 38, emoji: "🌾",
    category: "cover", note: "autumn sown, to overwinter", frostHardy: true },
  { crop: "Crimson clover", gddTarget: 1100, baseTempF: 41, emoji: "🍀",
    category: "cover", note: "to bloom", frostHardy: true },
  { crop: "Daikon radish", gddTarget: 900, baseTempF: 45, emoji: "🌱",
    category: "cover", note: "tillage radish, to size", frostHardy: true },
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
