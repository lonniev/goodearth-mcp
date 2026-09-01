// The set of views the app can show.
//
// Kept in lib rather than in the shell component because both the router and
// the shell need it, and a router that imports from a component inverts the
// layering — it also cannot be tested, since the node test runner will not
// load a .tsx file.
//
// One list. A hand-copied second one would let the type accept a view the
// router rejects, and the symptom would be a link that silently lands
// somewhere else.

export const VIEW_KEYS = [
  "map", "ledger", "almanac", "crops", "pests", "wildlife", "todo",
  "reports", "favorites", "references", "about", "account",
] as const;

export type ViewKey = (typeof VIEW_KEYS)[number];
