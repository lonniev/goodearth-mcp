// Days to maturity, looked up rather than typed.
//
// Growstuff is a growers' commons: its figures are medians of what members
// actually recorded, so "Lacinato kale, 58 days" is fifteen people's harvests
// rather than a catalogue's claim. That is also its limit — a variety nobody
// has logged has no figure, and this says so instead of guessing one.
//
// Two calls: a search that resolves the grower's words to a crop, then that
// crop's page, which is where the median lives. Remembered per lookup, because
// the service is often briefly unavailable and a second tap should not pay for
// the first one's outage.
//
// What is NOT looked up: germination %, its test date, the packed-for year,
// quantity, supplier and lot. Those are properties of the packet in the
// grower's hand — the seller's own test of that lot — and no catalogue holds
// them. See the References page.

const HOST = "https://www.growstuff.org";

export interface GrowstuffHit {
  slug: string;
  name: string;
  alternate_names?: string[];
  scientific_names?: string[];
  scientific_name?: string;
  plantings_count?: number;
}

export interface Want {
  crop: string;
  variety?: string;
  /// The binomial the plant picker resolved, when the grower picked a species.
  scientificName?: string;
}

export interface Looked {
  daysToMaturity: number | null;
  /// Which crop answered, so the figure is attributable.
  name: string;
  slug: string;
}

export const searchUrl = (term: string) =>
  `${HOST}/crops/search.json?term=${encodeURIComponent(term)}`;

export const cropUrl = (slug: string) => `${HOST}/crops/${encodeURIComponent(slug)}.json`;

const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const genus = (s: string) => fold(s).split(" ").slice(0, 2).join(" ");

/// The words to search for: the variety names the crop, so "Lacinato" and
/// "Kale" together find the variety rather than the species.
export function termFor(w: Want): string {
  return [w.variety, w.crop].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
}

/// Which result is the crop the grower means — or none.
///
/// A wrong variety is worse than no answer: kale is 34 days and Lacinato kale
/// is 58, so a near-miss would put a figure the grower never chose on their
/// shelf. Only an exact name, an exact alternate name, or (failing that) the
/// crop name alone is accepted.
export function pickCrop(hits: readonly GrowstuffHit[], w: Want): GrowstuffHit | null {
  if (!hits.length) return null;
  const names = (h: GrowstuffHit) => [h.name, ...(h.alternate_names ?? [])].map(fold);
  const binomial = w.scientificName ? genus(w.scientificName) : "";
  const sameSpecies = (h: GrowstuffHit) => {
    if (!binomial) return true;
    const sci = [h.scientific_name, ...(h.scientific_names ?? [])].filter(Boolean) as string[];
    return sci.length === 0 || sci.some((s) => genus(s) === binomial);
  };
  const firmest = (a: GrowstuffHit, b: GrowstuffHit) =>
    (b.plantings_count ?? 0) - (a.plantings_count ?? 0);

  // Variety-and-crop first, then the variety alone — a variety often carries a
  // name of its own ("cavolo nero" IS lacinato kale, and the commons files it
  // under that), and settling for the species would put the species' figure on
  // a variety that does not share it. The crop alone is the last resort.
  for (const wanted of [termFor(w), fold(w.variety ?? ""), fold(w.crop)]) {
    const want = fold(wanted);
    if (!want) continue;
    const exact = hits.filter((h) => names(h).includes(want) && sameSpecies(h));
    if (exact.length) return [...exact].sort(firmest)[0];
  }
  return null;
}

/// The median days to first harvest on a crop's page, when it has one.
export function daysFrom(crop: Record<string, unknown>): number | null {
  const n = Number(crop.median_days_to_first_harvest);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const known = new Map<string, Promise<Looked | null>>();

/// What the commons publishes for this crop, or null — no figure, no match, or
/// the service is having one of its outages. A lookup never blocks a save and
/// never fills a field it had to guess at.
export function lookUp(w: Want, signal?: AbortSignal): Promise<Looked | null> {
  const key = `${fold(w.crop)}|${fold(w.variety ?? "")}|${genus(w.scientificName ?? "")}`;
  let p = known.get(key);
  if (!p) {
    p = fetchIt(w, signal).catch(() => null);
    known.set(key, p);
  }
  return p;
}

async function fetchIt(w: Want, signal?: AbortSignal): Promise<Looked | null> {
  const term = termFor(w);
  if (!term) return null;
  const found = await fetch(searchUrl(term), { signal, headers: { Accept: "application/json" } });
  if (!found.ok) return null;
  const hits = (await found.json()) as GrowstuffHit[];
  const hit = pickCrop(Array.isArray(hits) ? hits : [], w);
  if (!hit) return null;

  const page = await fetch(cropUrl(hit.slug), { signal, headers: { Accept: "application/json" } });
  if (!page.ok) return null;
  const crop = (await page.json()) as Record<string, unknown>;
  return { daysToMaturity: daysFrom(crop), name: hit.name, slug: hit.slug };
}
