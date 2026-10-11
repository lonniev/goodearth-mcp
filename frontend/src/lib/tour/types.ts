// The pages with a tour. The eight guided pages, the account page, and the
// two a stranger meets first: the welcome page and the sign-in gate. The
// step and tour shapes are the package's.

export type { Tour, TourStep } from "@tollbooth-dpyc/web";

export const TOUR_PAGES = [
  "welcome", "signin", "ledger", "plots", "crops", "pests", "wildlife", "todo", "reports", "almanac", "account",
] as const;
export type TourPage = (typeof TOUR_PAGES)[number];
