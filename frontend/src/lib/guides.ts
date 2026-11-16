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

import { tr } from "../i18n/index.ts";
import type { MessageKey } from "../i18n/en.ts";

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
const EMOJI: Record<GuidedView, string> = {
  plots: "🗺️",
  ledger: "🌡️",
  almanac: "🌤️",
  crops: "🌱",
  pests: "🐛",
  wildlife: "🦌",
  todo: "✅",
  reports: "📓",
};

interface GuideMeta { title: string; emoji: string; eyebrow: string; said: string }

/// The words are read from `lib.guides.<page>.*` whenever they are shown.
export const GUIDE_META = Object.fromEntries(Object.entries(EMOJI).map(([page, emoji]) => [page, {
  emoji,
  get title() { return tr(`lib.guides.${page}.title` as MessageKey); },
  get eyebrow() { return tr(`lib.guides.${page}.eyebrow` as MessageKey); },
  get said() { return tr(`lib.guides.${page}.said` as MessageKey); },
}])) as Record<GuidedView, GuideMeta>;
