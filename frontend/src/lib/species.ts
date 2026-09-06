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

/// Kingdom ids, used to constrain a search to the thing being named.
///
/// **`iconic_taxa=Plantae` does not filter this endpoint.** Asking it for
/// "Sweet William" returns *Mustelus antarcticus* — a shark — ranked above the
/// pink, because the parameter is accepted and ignored. The ancestor id does
/// filter, so it is what every call here passes.
export const KINGDOM = { plants: 47126, animals: 1, fungi: 47170 } as const;
export type Kingdom = keyof typeof KINGDOM;

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
  name: string, signal?: AbortSignal, kingdom?: Kingdom,
): Promise<SpeciesInfo | null> {
  const q0 = name.trim().toLowerCase();
  if (!q0) return null;
  // Scoped by kingdom: the same word means a plant in one call and an insect
  // in another, and one cache holding both would answer the wrong page.
  const key = `${kingdom ?? "any"}:${q0}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const q = new URLSearchParams({ q: name.trim(), per_page: "1" });
  if (kingdom) q.set("taxon_id", String(KINGDOM[kingdom]));
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


// ── The picker ───────────────────────────────────────────────────────────
//
// Good Earth holds no list of plants. A grower names what they grow by
// searching the same catalogue an ecologist uses, and what gets saved is the
// taxon id — a pointer to a record somebody else maintains — rather than a row
// copied out of it.
//
// This is a SEARCH the grower reads, and that matters for correctness rather
// than only for taste. iNaturalist ranks by how often a thing is observed, so
// a bare shelf word lands on the wild cousin: "apple" leads with Solanum
// (bitter-apples) and "fig" with a prickly pear. Ranked answers are safe when
// a person picks from them and dangerous when code takes the first one.

/// One candidate, as the picker draws it.
export interface SpeciesHit {
  id: number;
  scientificName: string;
  commonName: string | null;
  rank: string | null;
  /// What matched the query — often a name other than the one displayed, which
  /// is why it is shown when it differs.
  matched: string | null;
  thumb: string | null;
  observations: number;
}

function toHit(t: Record<string, unknown>): SpeciesHit {
  const photo = (t.default_photo ?? null) as { square_url?: string } | null;
  return {
    id: Number(t.id),
    scientificName: String(t.name ?? ""),
    commonName: (t.preferred_common_name as string) ?? null,
    rank: (t.rank as string) ?? null,
    matched: (t.matched_term as string) ?? null,
    thumb: photo?.square_url ?? null,
    observations: Number(t.observations_count ?? 0),
  };
}

/// Candidates for what the grower has typed so far, most-recorded first.
///
/// A genus is a real answer and is offered as one: somebody planting an
/// Asiatic lily has planted a Lilium and nothing narrower, and forcing a
/// species on them would be inventing precision.
export async function searchSpecies(
  q: string, kingdom: Kingdom, signal?: AbortSignal,
): Promise<SpeciesHit[]> {
  const text = q.trim();
  if (text.length < 2) return [];
  const p = new URLSearchParams({
    q: text,
    taxon_id: String(KINGDOM[kingdom]),
    rank: "species,subspecies,variety,genus",
    per_page: "8",
  });
  const r = await fetch(`${TAXA}/autocomplete?${p}`, {
    signal, headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`Species search failed (${r.status}).`);
  const d = (await r.json()) as { results?: Record<string, unknown>[] };
  return (d.results ?? []).map(toHit).filter((h) => h.id && h.scientificName);
}

const byId = new Map<number, SpeciesHit | null>();

/// Look several taxa up at once, for a page that has a list of saved ids and
/// wants a picture beside each. One request for the whole ledger rather than
/// one per row.
export async function speciesByIds(
  ids: number[], signal?: AbortSignal,
): Promise<Map<number, SpeciesHit>> {
  const out = new Map<number, SpeciesHit>();
  const missing: number[] = [];
  for (const id of new Set(ids.filter((n) => Number.isFinite(n) && n > 0))) {
    const hit = byId.get(id);
    if (hit) out.set(id, hit);
    else if (!byId.has(id)) missing.push(id);
  }
  if (!missing.length) return out;

  // The endpoint takes a comma-joined path segment. Chunked so a grower with a
  // large orchard does not build a URL nobody will accept.
  for (let i = 0; i < missing.length; i += 30) {
    const chunk = missing.slice(i, i + 30);
    try {
      const r = await fetch(`${TAXA}/${chunk.join(",")}`, {
        signal, headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { results?: Record<string, unknown>[] };
      const seen = new Set<number>();
      for (const t of d.results ?? []) {
        const hit = toHit(t);
        byId.set(hit.id, hit);
        out.set(hit.id, hit);
        seen.add(hit.id);
      }
      // An id the catalogue no longer knows is remembered as a miss, so the
      // page does not ask again on every render.
      for (const id of chunk) if (!seen.has(id)) byId.set(id, null);
    } catch {
      // A picture is decoration. Failing to fetch one must not empty a ledger.
    }
  }
  return out;
}


/// Does this taxon admit to the name that was asked for?
///
/// Whole word, and tolerant of a plural. A plain substring test is what made
/// "Bat" come back as *Battus* — a swallowtail butterfly whose genus contains
/// the letters — and "Butterfly" come back as a butterflyFISH. The word has to
/// stand on its own, and "Bat" is then allowed to meet "Bats".
function admits(name: string, t: SpeciesHit): boolean {
  const q = name.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!q) return false;
  const word = new RegExp(`(?<![a-z])${q}e?s?(?![a-z])`);
  return word.test(
    `${t.commonName ?? ""} ${t.scientificName} ${t.matched ?? ""}`.toLowerCase());
}

/// A photograph for each of these creatures, by the names the grower saved.
///
/// Rows added from the roster carry no emoji, so the table drew a bullet
/// beside them while the catalogue below showed real photographs of the same
/// animals. The picture was available; nothing was fetching it.
///
/// **Unrestricted by rank, unlike the picker.** A grower planting something
/// needs a species or a genus. A row that says "Bat" or "Butterfly" is naming
/// a group, and the honest picture for it is the group's — Chiroptera, or
/// Papilionoidea. Twenty candidates, because those sit well below the species
/// that outrank them on observation count.
///
/// **A name is resolved only if the answer admits to it.** Nothing matching
/// means no picture, and a row with no picture is not a wrong one.
export async function photosByName(
  names: string[], kingdom: Kingdom, signal?: AbortSignal,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const queue = [...new Set(names.map((n) => n.trim()).filter(Boolean))];

  async function worker() {
    for (let n = queue.shift(); n; n = queue.shift()) {
      if (signal?.aborted) return;
      // Keyed by kingdom as well as name: the same word names a plant in one
      // call and an animal in another, and one cache holding both would hand
      // a page the picture from the other.
      const key = `${kingdom}:${n.toLowerCase()}`;
      const cached = photoCache.get(key);
      if (cached !== undefined) {
        if (cached) out.set(n, cached);
        continue;
      }
      try {
        const p = new URLSearchParams({
          q: n, taxon_id: String(KINGDOM[kingdom]), per_page: "20",
        });
        const r = await fetch(`${TAXA}/autocomplete?${p}`, {
          signal, headers: { Accept: "application/json" },
        });
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { results?: Record<string, unknown>[] };
        const hit = (d.results ?? []).map(toHit).find((t) => admits(n, t));
        photoCache.set(key, hit?.thumb ?? null);
        if (hit?.thumb) out.set(n, hit.thumb);
      } catch {
        // A missing picture is a missing picture. It is never a reason to
        // fail the table it decorates.
      }
    }
  }
  // Four at a time. Thirty rows is thirty requests on a cold page, and
  // iNaturalist asks callers not to sprint.
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  return out;
}

const photoCache = new Map<string, string | null>();
