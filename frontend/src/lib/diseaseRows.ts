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

/// What the card's (i) says about the counts behind it.
///
/// The card used to lead with "4 of 4 models reporting risk" and a wet-hour
/// total. The owner's rule: the card lists the estimates, and the arithmetic
/// behind them goes in the (i).
export function estimatesInfo(data: DiseaseRiskResult, plantings: readonly string[] = []): string {
  const { live, clear } = order(data, plantings);
  const n = live.length + clear.length;
  const since = new Date(`${data.season_from.slice(0, 10)}T12:00:00Z`)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${n} disease model${n === 1 ? "" : "s"} · `
    + `${data.wetness.wet_hours.toLocaleString("en-US")} estimated wet hours since ${since}`;
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

/// The span every row's season strip shares, as ISO dates: the season's first
/// day, today, and the last day anything is known about — the forecast's end,
/// or a projected period reaching past it.
export interface StripAxis { from: string; today: string; to: string }

const dayOf = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

export function stripAxis(data: DiseaseRiskResult): StripAxis | null {
  const from = data.season_from?.slice(0, 10);
  const today = data.as_of?.slice(0, 10);
  if (!from || !today) return null;
  const ends = [today, (data.wetness.last ?? "").slice(0, 10),
    ...data.diseases.flatMap((v) => (v.season_periods ?? []).map((p) => p.to))].filter(Boolean);
  const to = ends.reduce((a, b) => (b > a ? b : a));
  return dayOf(to) > dayOf(from) ? { from, today, to } : null;
}

/// Where a date sits along the strip, 0 at the season's first day and 1 at the
/// axis's last. A date outside is held to the ends rather than dropped.
export function along(axis: StripAxis, iso: string): number {
  const span = dayOf(axis.to) - dayOf(axis.from) + 1;
  return Math.min(1, Math.max(0, (dayOf(iso) - dayOf(axis.from)) / span));
}

export interface StripMark { left: number; width: number; forecast: boolean; from: string; to: string }

/// One model's season as marks on the strip. Each covers its days inclusive,
/// so a one-day period still has a width. Null when the answer predates the
/// field — an empty strip would claim a season with nothing in it.
export function stripMarks(v: DiseaseVerdict, axis: StripAxis): StripMark[] | null {
  if (!v.season_periods) return null;
  const span = dayOf(axis.to) - dayOf(axis.from) + 1;
  return v.season_periods.map((p) => {
    const left = along(axis, p.from);
    const right = Math.min(1, (dayOf(p.to) - dayOf(axis.from) + 1) / span);
    return { left, width: Math.max(0, right - left), forecast: p.forecast, from: p.from, to: p.to };
  });
}

/// The first of each month inside the axis, for faint gridlines and the
/// month initials over the strips.
export function stripMonths(axis: StripAxis): { at: number; label: string }[] {
  const out: { at: number; label: string }[] = [];
  let y = +axis.from.slice(0, 4), m = +axis.from.slice(5, 7);
  for (;;) {
    m += 1; if (m > 12) { m = 1; y += 1; }
    const iso = `${y}-${String(m).padStart(2, "0")}-01`;
    if (iso > axis.to) break;
    out.push({ at: along(axis, iso),
      label: new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) });
  }
  return out;
}
