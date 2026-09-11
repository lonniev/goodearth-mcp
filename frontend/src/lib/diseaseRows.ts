// Which disease rows say what, and in which order.
//
// Out of the component because these are decisions, not drawing: "this model
// is quiet", "this period is the one to show", "the row belongs above the
// fold". Inside a .tsx they could only be checked by looking at a picture, and
// the distinction they turn on — risk NOW against risk at some point since
// January — is exactly the one this feature already got wrong once.

import { claimedBy, matches } from "./cropMatch.ts";
import type { DiseaseRiskResult, DiseaseVerdict } from "./mcp.ts";

export type Tone = "ahead" | "recent" | "quiet";

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
export function order(
  data: DiseaseRiskResult, plantings: readonly string[] = [],
): { live: DiseaseVerdict[]; quiet: DiseaseVerdict[]; unclaimed: DiseaseVerdict[] } {
  // A model no planting claims is set aside, not hidden. Apple scab on a
  // flower farm was being SHOWN with a caption apologising for it — a line
  // explaining why a row the reader did not need was there. Matching the
  // model's own "developed for" list against the record is the fix; the
  // caption was the patch.
  //
  // A block with nothing saved claims nothing, so every model stays in view.
  // An empty record is not a statement that the ground grows everything, and
  // it is not one that it grows nothing either.
  const { claimed, unclaimed } = plantings.length
    ? claimedBy(data.diseases, plantings)
    : { claimed: data.diseases, unclaimed: [] as DiseaseVerdict[] };
  return {
    live: claimed.filter((v) => v.at_risk),
    quiet: claimed.filter((v) => !v.at_risk),
    unclaimed,
  };
}

export function heading(data: DiseaseRiskResult, plantings: readonly string[] = []): string {
  const { live, quiet } = order(data, plantings);
  const shown = live.length + quiet.length;
  return live.length
    ? `${live.length} of ${shown} models reporting risk`
    : "Nothing reporting risk";
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
/// Quiet models are left out HERE, unlike on the card. A crop ledger is a
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

/// The line that accounts for what is NOT on the card.
///
/// Said out loud, because a reader who knows five models exist and counts four
/// is owed the fifth. Silence would read as a bug.
export function asideLine(unclaimed: readonly DiseaseVerdict[]): string {
  if (!unclaimed.length) return "";
  const names = unclaimed.map((v) => v.disease).join(", ");
  return `${unclaimed.length} model${unclaimed.length === 1 ? "" : "s"} set aside — `
    + `${names} ${unclaimed.length === 1 ? "was" : "were"} developed for crops this block does not grow.`;
}
