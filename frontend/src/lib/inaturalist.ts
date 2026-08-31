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

export async function fetchObservations(opts: {
  user: string;
  bounds?: Bounds;
  since?: string;
  perPage?: number;
  signal?: AbortSignal;
}): Promise<INatObservation[]> {
  const user = opts.user.trim().replace(/^@/, "");
  if (!user) throw new Error("Which iNaturalist user?");

  const q = new URLSearchParams({
    user_login: user,
    per_page: String(Math.min(opts.perPage ?? 50, 200)),
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

  const r = await fetch(`${API}?${q}`, { signal: opts.signal, headers: { Accept: "application/json" } });
  if (r.status === 404) throw new Error(`No iNaturalist user called "${user}".`);
  if (!r.ok) throw new Error(`iNaturalist replied ${r.status}.`);

  const d = (await r.json()) as { results?: Record<string, unknown>[] };
  return (d.results ?? []).map((o) => {
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
