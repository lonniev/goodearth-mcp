// Field reports — what the grower saw, and where.
//
// These are the most valuable thing a patron produces here: each one measures
// the gap between what the model predicted and what the ground did, and enough
// of them turn a generic grid into this block's own calendar.
//
// They belong on Nostr as NIP-78 `goodearth/reports`, encrypted to the patron.
// localStorage is the offline cache in that design — and offline matters more
// for this collection than any other, because a report is captured standing in
// a field, which is exactly where the signal is worst.

import type { FieldObservation } from "./mcp";

/// What was seen. The five below are quick picks, not the whole vocabulary:
/// a grower may type anything. Only "frost" and the stage kinds reach the
/// calibration model — the server accepts exactly {frost, stage} — and the
/// rest are recorded as observations, which is what "pest" and "note"
/// already were. A closed list here only ever hid that.
export type ReportTag = string;

export interface FieldReport {
  id: string;
  regionId: string;
  tag: ReportTag;
  observedOn: string;
  note: string;
  /// Where the grower was standing, when the device offered it.
  lat?: number;
  lng?: number;
  /// Stage reports carry what they were measured against.
  crop?: string;
  stage?: string;
  gddTarget?: number;
  setOut?: string;
  createdAt: string;
}

export const TAGS: { key: string; label: string; hint: string; calibrates: boolean }[] = [
  { key: "frost", label: "Frost", hint: "Frost seen on the ground", calibrates: true },
  { key: "first_bloom", label: "First bloom", hint: "A planting reached its stage", calibrates: true },
  { key: "emergence", label: "Emergence", hint: "A sowing came up", calibrates: true },
  { key: "pest", label: "Pest seen", hint: "Sighting or trap catch", calibrates: false },
  { key: "note", label: "Note", hint: "Anything worth remembering", calibrates: false },
];

/// Whether a kind carries the extra fields the calibration model needs.
/// Anything the grower types that is not a known stage kind is simply
/// recorded — which is the honest default, since the model can only use a
/// date it can compare against an expectation.
export function calibrates(tag: string): boolean {
  return TAGS.find((t) => t.key === tag)?.calibrates ?? false;
}

const KEY = "goodearth:reports:v1";

function read(): FieldReport[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FieldReport[]) : [];
  } catch { return []; }
}

function write(all: FieldReport[]): FieldReport[] {
  try { window.localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* noop */ }
  return all;
}

export function listReports(regionId?: string): FieldReport[] {
  const all = read().sort((a, b) => b.observedOn.localeCompare(a.observedOn));
  return regionId ? all.filter((r) => r.regionId === regionId) : all;
}

export function saveReport(r: FieldReport): FieldReport[] {
  return write([...read().filter((x) => x.id !== r.id), r]);
}

export function deleteReport(id: string): FieldReport[] {
  return write(read().filter((x) => x.id !== id));
}

export function makeReport(
  input: Omit<FieldReport, "id" | "createdAt">,
): FieldReport | string {
  if (!input.observedOn || Number.isNaN(Date.parse(input.observedOn)))
    return "When did you see it?";
  if (input.tag !== "frost" && input.tag !== "note" && !input.crop?.trim())
    return "Which crop was it?";
  if (input.gddTarget != null && (input.gddTarget < 1 || input.gddTarget > 20_000))
    return "That GDD target is outside any real crop's range.";
  if (input.setOut && Number.isNaN(Date.parse(input.setOut)))
    return "Set-out date must be a real date.";
  if (input.setOut && input.setOut > input.observedOn)
    return "It cannot have been seen before it was set out.";
  return {
    ...input,
    id: `fr-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    createdAt: new Date().toISOString(),
  };
}

/// Only some reports can calibrate: the model has to have predicted the thing
/// for the observation to measure a gap. A pest sighting is worth keeping and
/// cannot correct a degree-day curve.
export function toObservations(reports: FieldReport[]): FieldObservation[] {
  const out: FieldObservation[] = [];
  for (const r of reports) {
    if (r.tag === "frost") {
      out.push({ kind: "frost", observed_on: r.observedOn, note: r.note });
    } else if (
      (r.tag === "first_bloom" || r.tag === "emergence") &&
      r.crop && r.gddTarget && r.setOut
    ) {
      out.push({
        kind: "stage", observed_on: r.observedOn, crop: r.crop,
        stage: r.stage || r.tag, gdd_target: r.gddTarget, set_out: r.setOut,
        note: r.note,
      });
    }
  }
  return out;
}
