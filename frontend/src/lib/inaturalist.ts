// iNaturalist import.
//
// Growers who already log what they see should not have to log it twice.
// iNaturalist's v1 API is public and needs no key for reads: observations are
// fetchable by user login, bounded by a box and a date range, which is exactly
// the shape of a field report.
//
// What comes back is a SIGHTING — a species, a date, a place. That maps
// honestly onto a report and, for a plant seen in flower, onto the bloom
// observation the calibration loop can actually use. It does NOT map onto a
// crop stage: iNaturalist does not know what you set out or when, so those
// stay hand-entered rather than being inferred from a photograph.
//
// Writes need OAuth. This is read-only on purpose — importing someone's
// observations is a courtesy; posting on their behalf is not.

const API = "https://api.inaturalist.org/v1/observations";

export interface INatObservation {
  id: number;
  observed_on: string | null;
  species: string;
  scientificName: string | null;
  lat: number | null;
  lng: number | null;
  /// iNaturalist's own annotation that the plant was flowering, when present.
  flowering: boolean;
  qualityGrade: string | null;
  url: string;
}

export interface Bounds { swlat: number; swlng: number; nelat: number; nelng: number }

/// Phenology annotation 12 is "Plant Phenology"; value 13 is "Flowering".
function isFlowering(o: Record<string, unknown>): boolean {
  const anns = (o.annotations ?? []) as { controlled_attribute_id?: number; controlled_value_id?: number }[];
  return anns.some((a) => a.controlled_attribute_id === 12 && a.controlled_value_id === 13);
}

/// What actually went wrong, in the grower's terms.
///
/// This used to report `iNaturalist replied 422.` — a number, and the reader
/// left to guess. The number was always the same thing: an email address typed
/// into a field that wants a handle, because the browser offers to autofill
/// one. iNaturalist says so in the body it returns
/// (`{"error":"Unknown user_id …","status":422}`); nothing was reading it.
async function reasonFor(r: Response, user: string): Promise<string> {
  if (r.status === 404 || r.status === 422) {
    if (user.includes("@")) {
      return `iNaturalist does not know "${user}". That looks like an email `
        + "address, and this field wants your iNaturalist handle — the name in "
        + "your profile URL, which is usually shorter and has no @ in it.";
    }
    return `No iNaturalist user called "${user}".`;
  }
  // Anything else is theirs, not the grower's. Pass on what they said rather
  // than translating a server fault into a user error.
  let said = "";
  try { said = String(((await r.json()) as { error?: unknown }).error ?? ""); }
  catch { /* a status with no body is still a status */ }
  return said
    ? `iNaturalist could not answer: ${said}`
    : `iNaturalist replied ${r.status}. That is on their side — try again shortly.`;
}

/// Handles that look like what has been typed so far, so a grower who does not
/// remember their own login can pick it instead of guessing at it.
export async function searchUsers(
  q: string, signal?: AbortSignal,
): Promise<{ login: string; name: string | null; observations: number }[]> {
  const text = q.trim().replace(/^@/, "");
  if (text.length < 2) return [];
  const r = await fetch(
    `https://api.inaturalist.org/v1/users/autocomplete?q=${encodeURIComponent(text)}&per_page=5`,
    { signal, headers: { Accept: "application/json" } },
  );
  if (!r.ok) return [];
  const d = (await r.json()) as { results?: Record<string, unknown>[] };
  return (d.results ?? [])
    .map((u) => ({
      login: String(u.login ?? ""),
      name: (u.name as string) ?? null,
      observations: Number(u.observations_count ?? 0),
    }))
    .filter((u) => u.login);
}

/// iNaturalist's own ceiling on a page. Asking for more is refused, so this
/// is the size of a REQUEST and never a limit on what comes back.
const PAGE = 200;

export async function fetchObservations(opts: {
  user: string;
  bounds?: Bounds;
  since?: string;
  /// A ceiling on requests, not on observations — a runaway guard for a query
  /// that somehow matches half of iNaturalist, never a cap on a grower's own
  /// record. At 200 an page this is 40,000 observations from one block.
  maxPages?: number;
  signal?: AbortSignal;
}): Promise<INatObservation[]> {
  const user = opts.user.trim().replace(/^@/, "");
  if (!user) throw new Error("Which iNaturalist user?");

  const q = new URLSearchParams({
    user_login: user,
    per_page: String(PAGE),
    order_by: "observed_on",
    order: "desc",
  });
  if (opts.since) q.set("d1", opts.since);
  if (opts.bounds) {
    // Bounding the fetch to the block is the difference between a grower's
    // farm and their holiday in Costa Rica.
    q.set("swlat", String(opts.bounds.swlat));
    q.set("swlng", String(opts.bounds.swlng));
    q.set("nelat", String(opts.bounds.nelat));
    q.set("nelng", String(opts.bounds.nelng));
  }

  // Paged to exhaustion. This used to ask for 60 and return them, so a grower
  // with more than sixty sightings on one block was quietly handed a slice and
  // told nothing — the page size standing in for an answer. The size of a
  // request is ours to choose; how much a grower has recorded is not.
  const raw: Record<string, unknown>[] = [];
  const cap = opts.maxPages ?? 200;
  for (let page = 1; page <= cap; page++) {
    q.set("page", String(page));
    const r = await fetch(`${API}?${q}`, {
      signal: opts.signal, headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new Error(await reasonFor(r, user));
    const d = (await r.json()) as {
      results?: Record<string, unknown>[]; total_results?: number;
    };
    const got = d.results ?? [];
    raw.push(...got);
    // Short page, or everything the service says there is. Both are the end;
    // trusting only one of them loops forever if the other is what arrives.
    if (got.length < PAGE) break;
    if (typeof d.total_results === "number" && raw.length >= d.total_results) break;
  }

  return raw.map((o) => {
    const taxon = (o.taxon ?? {}) as Record<string, unknown>;
    const geo = (o.geojson ?? null) as { coordinates?: [number, number] } | null;
    return {
      id: Number(o.id),
      observed_on: (o.observed_on as string) ?? null,
      species: String(taxon.preferred_common_name || taxon.name || "Unidentified"),
      scientificName: (taxon.name as string) ?? null,
      lat: geo?.coordinates?.[1] ?? null,
      lng: geo?.coordinates?.[0] ?? null,
      flowering: isFlowering(o),
      qualityGrade: (o.quality_grade as string) ?? null,
      url: `https://www.inaturalist.org/observations/${o.id}`,
    };
  }).filter((o) => o.observed_on);
}

/// The region's bounding box, in the order iNaturalist wants it.
export function boundsFrom(bbox: {
  min_lat: number; min_lon: number; max_lat: number; max_lon: number;
}): Bounds {
  return { swlat: bbox.min_lat, swlng: bbox.min_lon, nelat: bbox.max_lat, nelng: bbox.max_lon };
}
