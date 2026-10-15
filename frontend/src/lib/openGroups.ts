// The groups open on the Plots page, per device: a viewing choice, like
// hiding a plot, so it changes nothing in the record.

const KEY = "goodearth:plot-folders:v1";

export function readOpenGroups(): string[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}

export function writeOpenGroups(open: string[]): string[] {
  try { window.localStorage.setItem(KEY, JSON.stringify(open)); } catch { /* a viewing choice; nothing lost */ }
  return open;
}
