// Plots hidden from the plots map, per device.
//
// A grower with a dozen plots wants to look at three; hiding is a viewing
// choice, so it stays on this device and changes nothing in the record. A
// hidden plot keeps its chip, dimmed, and a tap on the chip brings it back.

const KEY = "goodearth:hidden-plots:v1";

export function readHidden(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeHidden(ids: string[]): string[] {
  try { window.localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* a viewing choice; nothing lost */ }
  return ids;
}

export function hide(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? [...ids] : [...ids, id];
}

export function show(ids: readonly string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

/// The hidden ids that still name a plot — a forgotten plot's id is dropped.
export function stillHidden(ids: readonly string[], plotIds: readonly string[]): string[] {
  return ids.filter((x) => plotIds.includes(x));
}

/// What a tap on a plot chip does, by where that plot stands.
export type ChipTap = "show" | "work" | "frame" | "ask";

export function chipTap(isHidden: boolean, isActive: boolean, isFramed: boolean): ChipTap {
  if (isHidden) return "show";
  if (!isActive) return "work";
  return isFramed ? "ask" : "frame";
}
