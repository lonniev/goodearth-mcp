// Which disease rows say what, and in which order.
//
// Out of the component because these are decisions, not drawing: "this model
// is quiet", "this period is the one to show", "the row belongs above the
// fold". Inside a .tsx they could only be checked by looking at a picture, and
// the distinction they turn on — risk NOW against risk at some point since
// January — is exactly the one this feature already got wrong once.

import type { DiseaseRiskResult, DiseaseVerdict } from "./mcp.ts";

export type Tone = "ahead" | "recent" | "quiet";

/// When a period began, whichever key its model used.
///
/// Hutton's periods start on a DATE and botrytis's on an HOUR. Reading only
/// `from` left half the models with no date on the row at all.
export function began(p: DiseaseVerdict["last_period"]): string {
  return String(p?.from ?? p?.start ?? "");
}

export function toneOf(v: DiseaseVerdict): Tone {
  if (v.next_period) return "ahead";
  if (v.recent) return "recent";
  return "quiet";
}

export const TONE_WORD: Record<Tone, string> = {
  ahead: "forecast",
  recent: "recent",
  quiet: "quiet",
};

/// The date on the right of a row: what is coming, else what last happened,
/// else that nothing has.
export function rowDate(v: DiseaseVerdict): { lead: string; date: string } | null {
  if (v.next_period) return { lead: "from", date: began(v.next_period) };
  if (v.last_period) return { lead: "last", date: began(v.last_period) };
  return null;
}

/// What is happening first, what is quiet second.
///
/// Both are SHOWN. Risk that is absent is as useful to a grower as risk that
/// is present — a dry Vermont year is the ordinary answer, and a card that
/// hid its quiet models would leave the reader unable to tell "nothing found"
/// from "not looked at".
export function order(data: DiseaseRiskResult): { live: DiseaseVerdict[]; quiet: DiseaseVerdict[] } {
  return {
    live: data.diseases.filter((v) => v.at_risk),
    quiet: data.diseases.filter((v) => !v.at_risk),
  };
}

export function heading(data: DiseaseRiskResult): string {
  const live = data.diseases.filter((v) => v.at_risk).length;
  return live
    ? `${live} of ${data.diseases.length} models reporting risk`
    : "Nothing reporting risk";
}
