// What a thing IS — identity, not advice.
//
// A flag that says "Codling moth · first egg hatch" answers WHEN and leaves
// the grower to know the rest. New to a crop, or to a pest that has just
// arrived in the valley, they may not.
//
// So this fetches identification: scientific name, a cited encyclopaedia
// summary, a photograph, and links to sources that can be checked. iNaturalist
// resolves a common name to a taxon (which Wikipedia alone cannot do reliably
// — "cabbage maggot" has no article, *Delia radicum* does), and carries the
// summary with it. No key, same API the Field Reports import already uses.
//
// ── What this deliberately does NOT do ────────────────────────────────────
//
// It does not tell anyone how to treat a pest.
//
// Pesticide registration is jurisdiction-specific and changes annually: a
// product legal in one state is not in the next, and label rates are law, not
// guidance. A generated recommendation could be out of date, off-label, or
// illegal to follow — and would be the one place in this app where being
// confidently wrong costs a grower their crop or their certification.
//
// What it does instead is ROUTE: name the jurisdiction, and hand over links to
// the extension service whose bulletin is actually authoritative there. That
// is the honest version of "what's the usual treatment".

const TAXA = "https://api.inaturalist.org/v1/taxa";

export interface SpeciesInfo {
  id: number;
  scientificName: string;
  commonName: string | null;
  rank: string | null;
  summary: string | null;
  wikipediaUrl: string | null;
  inatUrl: string;
  photo: { url: string; attribution: string } | null;
}

const cache = new Map<string, SpeciesInfo | null>();

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/// Look a name up. Returns null when nothing matches — a miss is reported as a
/// miss rather than as a guess at a neighbouring species.
export async function lookupSpecies(
  name: string, signal?: AbortSignal,
): Promise<SpeciesInfo | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const q = new URLSearchParams({ q: name.trim(), per_page: "1" });
  const r = await fetch(`${TAXA}?${q}`, { signal, headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Species lookup failed (${r.status}).`);
  const d = (await r.json()) as { results?: Record<string, unknown>[] };
  const hit = d.results?.[0];
  if (!hit) { cache.set(key, null); return null; }

  // The search result carries no summary; the detail record does.
  let summary: string | null = null;
  try {
    const dr = await fetch(`${TAXA}/${hit.id}`, { signal, headers: { Accept: "application/json" } });
    if (dr.ok) {
      const dd = (await dr.json()) as { results?: Record<string, unknown>[] };
      const raw = dd.results?.[0]?.wikipedia_summary as string | undefined;
      if (raw) summary = stripTags(raw);
    }
  } catch { /* identity without a summary is still worth having */ }

  const photo = (hit.default_photo ?? null) as { square_url?: string; medium_url?: string; attribution?: string } | null;
  const info: SpeciesInfo = {
    id: Number(hit.id),
    scientificName: String(hit.name ?? name),
    commonName: (hit.preferred_common_name as string) ?? null,
    rank: (hit.rank as string) ?? null,
    summary,
    wikipediaUrl: (hit.wikipedia_url as string) ?? null,
    inatUrl: `https://www.inaturalist.org/taxa/${hit.id}`,
    photo: photo?.medium_url || photo?.square_url
      ? { url: (photo.medium_url || photo.square_url)!, attribution: photo.attribution ?? "" }
      : null,
  };
  cache.set(key, info);
  return info;
}

// ── Where management guidance actually lives ─────────────────────────────

const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";
let jurisdictionCache: { key: string; value: string | null } | null = null;

/// The state or province the block sits in. Used to name the right extension
/// service, not to make any decision.
export async function jurisdictionFor(
  lat: number, lon: number, signal?: AbortSignal,
): Promise<string | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (jurisdictionCache?.key === key) return jurisdictionCache.value;
  try {
    const q = new URLSearchParams({
      lat: String(lat), lon: String(lon), format: "jsonv2", zoom: "5",
    });
    const r = await fetch(`${NOMINATIM}?${q}`, { signal, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as { address?: { state?: string; province?: string } };
    const v = d.address?.state ?? d.address?.province ?? null;
    jurisdictionCache = { key, value: v };
    return v;
  } catch {
    return null;
  }
}

export interface GuidanceLink { label: string; url: string; note?: string }

/// Links to the sources whose word actually counts. A SEARCH, clearly labelled
/// as one — not a recommendation this app is making.
export function guidanceLinks(
  subject: string, kind: "pest" | "crop" | "wildlife", state: string | null,
): GuidanceLink[] {
  const where = state ? ` ${state}` : "";
  const topic = kind === "pest" ? "management" : kind === "crop" ? "growing guide" : "";
  const query = encodeURIComponent(`${subject}${topic ? " " + topic : ""}${where} extension site:edu`);

  const out: GuidanceLink[] = [
    {
      label: state ? `${state} extension bulletins` : "University extension bulletins",
      url: `https://duckduckgo.com/?q=${query}`,
      note: "A search of land-grant extension sites — their bulletin is the authority, not this app.",
    },
  ];
  if (kind === "pest") {
    out.push({
      label: "Regional IPM centers",
      url: `https://www.ipmcenters.org/`,
      note: "Integrated pest management guidance by region.",
    });
  }
  return out;
}
