// Which pages have a guide, and where each one lives.
//
// Every working page on the rail has a (?) in the top bar that opens a page
// about it: what is happening on the ground it describes, how its controls
// add, read, change and remove things, and how the same work is done through
// an agent. The guides are free pages, like the life-cycle explainers — they
// read no block and bill nothing — so a stranger can learn how My Plots is
// used before they have any plots.
//
// Kept in lib, without JSX, so the router and the tests can read it. The
// content itself is in `views/howto/`.

/// The pages that have a guide, in the rail's order.
export const GUIDED = [
  "plots", "ledger", "almanac", "crops", "pests", "wildlife", "todo", "reports",
] as const;

export type GuidedView = (typeof GUIDED)[number];

/// The view key of a page's guide. `#/how-plots` is the guide to My Plots.
export type GuideKey = `how-${GuidedView}`;

export const GUIDE_KEYS: readonly GuideKey[] = GUIDED.map((p) => `how-${p}` as GuideKey);

/// The guide for a view, or null when the view has none — the guides
/// themselves, the account page, the free reading.
export function guideFor(view: string): GuideKey | null {
  return (GUIDED as readonly string[]).includes(view) ? (`how-${view}` as GuideKey) : null;
}

/// The page a guide is about, or null when the key is not a guide.
export function pageOf(key: string): GuidedView | null {
  const m = /^how-([a-z]+)$/.exec(key);
  const page = m?.[1];
  return page && (GUIDED as readonly string[]).includes(page) ? (page as GuidedView) : null;
}

/// What each guide is called, on its own page and on the Guides index.
///
/// `title` is the page's rail label, so the guide is found under the word the
/// reader already knows. `said` is the one line on its card.
export const GUIDE_META: Record<GuidedView, {
  title: string; emoji: string; eyebrow: string; said: string;
}> = {
  plots: {
    title: "My Plots", emoji: "🗺️", eyebrow: "the ground every answer is about",
    said: "Draw or pin your ground, switch between plots, and see the sun on each.",
  },
  ledger: {
    title: "Dashboard", emoji: "🌡️", eyebrow: "where the season stands",
    said: "The season's heat against ten years, with frost, soil, drying and disease under it.",
  },
  almanac: {
    title: "Almanac", emoji: "🌤️", eyebrow: "what the sky is doing",
    said: "Today, the fortnight, and each measure of the season so far, each against its normal.",
  },
  crops: {
    title: "Flora", emoji: "🌱", eyebrow: "what you grow, and where each stands",
    said: "The plant ledger: what finishes before frost, when to sow, what grew here, and what grows beside what.",
  },
  pests: {
    title: "Pests", emoji: "🐛", eyebrow: "what to scout for, and when",
    said: "Your pest models timed on this ground, and the published ones dated for it.",
  },
  wildlife: {
    title: "Fauna", emoji: "🦌", eyebrow: "the other creatures on the same clocks",
    said: "Arrivals, emergences, broods and lambing, each on the clock it actually runs on.",
  },
  todo: {
    title: "Tasks", emoji: "✅", eyebrow: "the work, by the day",
    said: "Write a task down, see what is due, and carry it to the calendar you already read.",
  },
  reports: {
    title: "Field Reports", emoji: "📓", eyebrow: "what you saw, and what it teaches",
    said: "Frost, first bloom and emergence as you saw them, turned into a correction on the model.",
  },
};
