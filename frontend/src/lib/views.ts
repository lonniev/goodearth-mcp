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
  // The front door and what it opens onto. Reachable without an npub.
  "welcome", "plant", "pest", "tree", "animal",
] as const;

export type ViewKey = (typeof VIEW_KEYS)[number];

/// What a visitor may see before signing in.
///
/// The distinction did not exist: `App` returned the sign-in gate for
/// everything, so the two pages best suited to a stranger — what this is, and
/// which feeds it reads — were behind it, and the only thing a stranger could
/// actually see was a password box for a farm they do not have.
///
/// Nothing here reads a block, and nothing here is billed. `about` makes one
/// unpaid `service_status` call and `references` makes none at all; the rest
/// are static. That is the test for adding to this list — not "is it
/// harmless" but "does it name a patron or spend their sats".
export const PUBLIC_VIEWS = [
  "welcome", "plant", "pest", "tree", "animal", "about", "references",
] as const;

export type PublicView = (typeof PUBLIC_VIEWS)[number];

export function isPublic(v: ViewKey): v is PublicView {
  return (PUBLIC_VIEWS as readonly string[]).includes(v);
}
