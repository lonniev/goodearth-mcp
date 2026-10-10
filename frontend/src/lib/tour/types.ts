// The shape of a page's tour: a handful of steps, each pointing at one
// control and saying what it is for.
//
// Data, with no DOM in it, so the copy can be tested — every target must be
// something a page draws, every guide reference must be a step the guide
// still has, and every sentence must say what a thing IS.

import type { Target } from "./targets.ts";

/// The pages with a tour. The eight guided pages, the account page, and
/// the two a stranger meets first: the welcome page and the sign-in gate.
export const TOUR_PAGES = [
  "welcome", "signin", "ledger", "plots", "crops", "pests", "wildlife", "todo", "reports", "almanac", "account",
] as const;
export type TourPage = (typeof TOUR_PAGES)[number];

export interface TourStep {
  /// A `data-tour` name, or — for the one page whose markup is a package's —
  /// a function that finds the element.
  target: Target | (() => Element | null);
  title: string;
  /// One or two short sentences: what the control is, what to do with it.
  says: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /// Something the page must do before this step can be pointed at — open
  /// the add form, pick a tag. The page registers the action by name.
  before?: string;
  /// The guide step this abbreviates: [group heading, control label]. Kept
  /// in step with the guide by a test.
  guide?: [group: string, control: string];
}

export interface Tour {
  page: TourPage;
  steps: TourStep[];
}
