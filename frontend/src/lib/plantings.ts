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
export const CROP_PRESETS: { crop: string; gddTarget: number; baseTempF: number; note: string }[] = [
  { crop: "Dahlia", gddTarget: 1200, baseTempF: 50, note: "to first bloom" },
  { crop: "Lisianthus", gddTarget: 1050, baseTempF: 50, note: "to cut stage from pinch" },
  { crop: "Celosia", gddTarget: 900, baseTempF: 50, note: "to cut stage" },
  { crop: "Zinnia", gddTarget: 780, baseTempF: 50, note: "to cut stage from sow" },
  { crop: "Sunflower", gddTarget: 1000, baseTempF: 44, note: "to cut stage" },
  { crop: "Tomato", gddTarget: 1300, baseTempF: 50, note: "to first ripe fruit" },
  { crop: "Hot pepper", gddTarget: 1650, baseTempF: 50, note: "to ripe fruit" },
  { crop: "Sweet corn", gddTarget: 1400, baseTempF: 50, note: "to harvest" },
  { crop: "Winter squash", gddTarget: 1600, baseTempF: 50, note: "to maturity" },
  { crop: "Basil", gddTarget: 600, baseTempF: 50, note: "to first cut" },
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
