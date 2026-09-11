// Does this grower's crop meet this model's name for it?
//
// A port of `roster.norm` / `roster._matches` from the service, where it has
// matched a grower's "Japanese beetle" to a catalogue's "japanese beetle adult"
// for months. Same rules, same shape, so a name that joins on one side of the
// wire joins on the other.
//
// Kept as its own module rather than folded into the disease code because it
// is about NAMES, not about disease: "Calendula officinalis" and "calendula"
// are the same plant whoever is asking.

/// A name reduced to something two spellings can meet on.
export function norm(name: string): string {
  return (name || "")
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")     // drop parentheticals
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/// Whether either name contains the other, once both are normalised.
///
/// Containment BOTH WAYS on purpose: a grower's "calendula" must find a
/// model's "calendula", and their "Calendula officinalis" must find it too.
/// Requiring an exact match would leave every binomial unjoined, which is
/// most of what the species picker writes onto a record.
export function matches(name: string, known: readonly string[]): boolean {
  const n = norm(name);
  if (!n) return false;
  return known.some((k) => {
    const m = norm(k);
    return !!m && (n === m || n.includes(m) || m.includes(n));
  });
}

/// Which of these models claim any of the ground's plantings.
///
/// "Claim" is the model's own word for itself — the crops it was DEVELOPED
/// for, which travels in its metadata. Good Earth is citing the model's scope
/// against the record, not asserting that a crop gets a disease. The second
/// would be plant pathology and is not ours to publish.
export function claimedBy<T extends { about: { crops: string[] } }>(
  models: readonly T[], plantings: readonly string[],
): { claimed: T[]; unclaimed: T[] } {
  const claimed: T[] = [];
  const unclaimed: T[] = [];
  for (const m of models) {
    (plantings.some((p) => matches(p, m.about.crops)) ? claimed : unclaimed).push(m);
  }
  return { claimed, unclaimed };
}

/// Which of a model's crops this ground actually grows, for naming them back.
export function growing(crops: readonly string[], plantings: readonly string[]): string[] {
  return plantings.filter((p) => matches(p, crops));
}
