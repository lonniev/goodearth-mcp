// The group the Plots page is narrowed to, per device: a viewing choice, like
// hiding a plot, so it changes nothing in the record.

const KEY = "goodearth:plot-group:v1";

export function readFocusGroup(): string {
  try { return window.localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}

export function writeFocusGroup(group: string): string {
  try { window.localStorage.setItem(KEY, group); } catch { /* a viewing choice; nothing lost */ }
  return group;
}
