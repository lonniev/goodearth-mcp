// Which disease rows say what, and in which order.
//
// Out of the component because these are decisions, not drawing: "this model
// is clear", "this period is the one to show", "the row belongs above the
// fold". Inside a .tsx they could only be checked by looking at a picture, and
// the distinction they turn on — risk NOW against risk at some point since
// January — is exactly the one this feature already got wrong once.

import { claimedBy, matches } from "./cropMatch.ts";
import type { DiseaseRiskResult, DiseaseVerdict } from "./mcp.ts";

/// "clear" was "quiet", which a grower read as "you have not entered anything
/// yet". It means the weather has not been right for the disease.
export type Tone = "ahead" | "recent" | "clear";

/// When a period began, whichever key its model used.
///
/// Hutton's periods start on a DATE and botrytis's on an HOUR. Reading only
/// `from` left half the models with no date on the row at all.
export function began(p: DiseaseVerdict["last_period"]): string {
  return String(p?.from ?? p?.start ?? "").slice(0, 10);
}

export function toneOf(v: DiseaseVerdict): Tone {
  if (v.next_period) return "ahead";
  if (v.recent) return "recent";
  return "clear";
}

export const TONE_WORD: Record<Tone, string> = {
  ahead: "forecast",
  recent: "recent",
  clear: "clear",
};

/// The date on the right of a row: what is coming, else what last happened,
/// else that nothing has.
export function rowDate(v: DiseaseVerdict): { lead: string; date: string } | null {
  if (v.next_period) return { lead: "from", date: began(v.next_period) };
  if (v.last_period) return { lead: "last", date: began(v.last_period) };
  return null;
}

/// The models that belong to this ground: those whose own "developed for"
/// list names something it grows.
///
/// The rest are not mentioned anywhere — not listed, not banded on the chart,
/// not accounted for in a caption. Apple scab on a flower farm was first shown,
/// then set aside with a line saying so; both told a grower about something
/// that is none of their business.
///
/// A block with nothing saved claims nothing, so every model stays in view.
/// An empty record is not a statement that the ground grows everything, and
/// it is not one that it grows nothing either.
export function relevant<T extends DiseaseVerdict>(
  diseases: readonly T[], plantings: readonly string[] = [],
): T[] {
  return plantings.length ? claimedBy(diseases, plantings).claimed : [...diseases];
}

/// What is happening first, what is clear second.
///
/// Both are SHOWN. Risk that is absent is as useful to a grower as risk that
/// is present — a dry Vermont year is the ordinary answer, and a card that
/// hid its clear models would leave the reader unable to tell "nothing found"
/// from "not looked at".
export function order(
  data: DiseaseRiskResult, plantings: readonly string[] = [],
): { live: DiseaseVerdict[]; clear: DiseaseVerdict[] } {
  const mine = relevant(data.diseases, plantings);
  return {
    live: mine.filter((v) => v.at_risk),
    clear: mine.filter((v) => !v.at_risk),
  };
}

export function heading(data: DiseaseRiskResult, plantings: readonly string[] = []): string {
  const { live, clear } = order(data, plantings);
  const shown = live.length + clear.length;
  return live.length
    ? `${live.length} of ${shown} models reporting risk`
    : "All clear";
}

export interface CropWatch {
  model: string;
  /// The disease, as the model names it.
  label: string;
  /// When the next qualifying period begins, or the last one did.
  date: string;
  lead: "from" | "last";
  forecast: boolean;
}

/// Which models claim THIS crop, and what each has to say about it.
///
/// The answer to "where does a grower see which of their crops might have
/// disease": beside the crop, on the page that lists their crops. A model is
/// here because its own "developed for" list names this plant — Good Earth is
/// citing the model's scope against the record, not asserting that a crop gets
/// a disease. That second thing is plant pathology and is not ours to publish.
///
/// Clear models are left out HERE, unlike on the card. A crop ledger is a
/// working list and a row that says "nothing, all season" beside every
/// planting is a column of noise; the card is where absence is reported.
export function cropWatch(data: DiseaseRiskResult | null, crop: string): CropWatch[] {
  if (!data || !crop) return [];
  return data.diseases
    .filter((v) => v.at_risk && matches(crop, v.about.crops))
    .map((v) => {
      const r = rowDate(v);
      return r && {
        model: v.model,
        label: v.disease,
        date: r.date,
        lead: r.lead as "from" | "last",
        forecast: !!v.next_period,
      };
    })
    .filter((w): w is CropWatch => !!w)
    .sort((a, b) => a.date.localeCompare(b.date));
}
