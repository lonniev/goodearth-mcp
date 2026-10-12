// Groups of plots, and groups of groups.
//
// A plot names the groups it is in. A group inside a group is a path,
// `North Farm / Orchard / Apples`, and a plot in that group is in the Orchard
// and the North Farm too. A group is every plot below it, so there is no group
// record: renaming one is a save of its plots. The server cleans paths the
// same way (`block_store.clean_group_path`).

import type { SavedRegion } from "./regions";

export const SEP = " / ";
export const MAX_DEPTH = 6;

/// A path's steps, trimmed. Empty steps are dropped here; the server refuses them.
export function parsePath(path: string): string[] {
  return path.split("/").map((s) => s.trim()).filter(Boolean);
}

export function joinPath(steps: readonly string[]): string {
  return steps.join(SEP);
}

/// A typed path, cleaned; "" when nothing usable was typed or it is too deep.
export function cleanPath(path: string): string {
  const steps = parsePath(path);
  return steps.length && steps.length <= MAX_DEPTH ? joinPath(steps) : "";
}

const fold = (s: string) => s.toLocaleLowerCase();

/// Whether `path` is `group` or lies inside it.
export function isWithin(path: string, group: string): boolean {
  const p = fold(cleanPath(path));
  const g = fold(cleanPath(group));
  return !!g && (p === g || p.startsWith(g + SEP.toLocaleLowerCase()));
}

/// Every group a plot is in, its own and each one around them.
export function ancestors(path: string): string[] {
  const steps = parsePath(path);
  return steps.map((_, i) => joinPath(steps.slice(0, i + 1)));
}

/// Every group any plot names, with the groups around them, sorted.
export function allGroups(plots: readonly SavedRegion[]): string[] {
  const seen = new Map<string, string>();
  for (const p of plots) {
    for (const g of p.groups ?? []) {
      for (const a of ancestors(g)) if (!seen.has(fold(a))) seen.set(fold(a), a);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/// The groups one step inside `group`; the top level when `group` is "".
export function childrenOf(plots: readonly SavedRegion[], group: string): string[] {
  const depth = group ? parsePath(group).length + 1 : 1;
  return allGroups(plots).filter((g) =>
    parsePath(g).length === depth && (!group || isWithin(g, group)));
}

/// The plots in `group` or in any group inside it.
export function membersOf(plots: readonly SavedRegion[], group: string): SavedRegion[] {
  return plots.filter((p) => (p.groups ?? []).some((g) => isWithin(g, group)));
}

export function memberIds(plots: readonly SavedRegion[], group: string): string[] {
  return membersOf(plots, group).map((p) => p.id);
}

/// The hidden set with every plot of the group shown.
export function showGroup(hidden: readonly string[], plots: readonly SavedRegion[], group: string): string[] {
  const ids = new Set(memberIds(plots, group));
  return hidden.filter((id) => !ids.has(id));
}

/// The hidden set with every plot of the group hidden.
export function hideGroup(hidden: readonly string[], plots: readonly SavedRegion[], group: string): string[] {
  const out = [...hidden];
  for (const id of memberIds(plots, group)) if (!out.includes(id)) out.push(id);
  return out;
}

/// The plots a page narrowed to `group` shows; every plot when it is "".
export function narrowTo(plots: readonly SavedRegion[], group: string): SavedRegion[] {
  return group ? membersOf(plots, group) : [...plots];
}

/// A plot's groups with `group` set on or off. Off removes the group and every
/// path inside it, since the plot is then no longer in it.
export function withGroup(groups: readonly string[], group: string, on: boolean): string[] {
  const g = cleanPath(group);
  if (!g) return [...groups];
  const rest = groups.filter((x) => !isWithin(x, g));
  if (!on) return rest;
  // Already inside it through a deeper group: nothing to add.
  if (groups.some((x) => isWithin(x, g))) return [...groups];
  return [...rest, g];
}

/// The plots whose groups change when `from` is renamed or moved to `to`,
/// with their new groups; throws when a moved path would be too deep. `to` may sit anywhere, `Orchard` → `South Farm / Orchard`.
export function renameGroup(plots: readonly SavedRegion[], from: string, to: string): SavedRegion[] {
  const f = cleanPath(from);
  const t = cleanPath(to);
  if (!f || !t || fold(f) === fold(t)) return [];
  const fDepth = parsePath(f).length;
  const out: SavedRegion[] = [];
  for (const p of plots) {
    const gs = p.groups ?? [];
    if (!gs.some((g) => isWithin(g, f))) continue;
    const moved = gs.map((g) => isWithin(g, f) ? joinPath([...parsePath(t), ...parsePath(g).slice(fDepth)]) : g);
    if (moved.some((g) => parsePath(g).length > MAX_DEPTH)) {
      throw new Error(`A group is at most ${MAX_DEPTH} levels deep.`);
    }
    const seen = new Set<string>();
    out.push({ ...p, groups: moved.filter((g) => !seen.has(fold(g)) && !!seen.add(fold(g))) });
  }
  return out;
}

/// The last step of a path, for a chip's label.
export function leaf(path: string): string {
  const steps = parsePath(path);
  return steps[steps.length - 1] ?? "";
}
