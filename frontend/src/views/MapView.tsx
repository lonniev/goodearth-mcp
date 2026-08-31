// Map — draw the ground, name it, work it.
//
// This is the on-ramp: everything else in Good Earth is scoped by a region, so
// how easily a grower can draw one decides whether they ever see the rest.
//
// The flow is deliberately three steps and no dialogs: find the farm, trace
// the block, name it. Acreage is live on the map throughout, because the
// number that tells a grower their polygon is right is the one already in
// their field book.

import { useCallback, useEffect, useRef, useState } from "react";
import FieldMap, { type MapValue } from "../components/FieldMap";
import {
  areaM2, formatArea, geoJSONToRing, isDrawable, ringToGeoJSON, searchPlace,
  type LatLng, type Place,
} from "../lib/geo";
import { listRegions, saveRegion, type SavedRegion } from "../lib/regions";

const EMPTY: MapValue = { mode: "polygon", ring: [], centre: null, radiusM: 400 };

const RADII = [200, 400, 800, 1600, 3200];

export default function MapView({
  active, onSaved,
}: {
  active: SavedRegion;
  onSaved: (r: SavedRegion) => void;
}) {
  const [value, setValue] = useState<MapValue>(EMPTY);
  const [name, setName] = useState("");
  const [baseTemp, setBaseTemp] = useState(50);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState("");
  const [centreOn, setCentreOn] = useState<LatLng | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Saved blocks drawn faintly, so a new one can be placed beside them.
  const [others] = useState(() =>
    listRegions()
      .filter((r) => !("lat" in r.region))
      .map((r) => ({ name: r.name, ring: geoJSONToRing(r.region as { coordinates: number[][][] }) })),
  );

  // Open on the active block rather than a world view — a grower almost always
  // wants to draw next to ground they already have.
  useEffect(() => {
    if ("lat" in active.region) {
      setCentreOn({ lat: active.region.lat, lng: active.region.lon });
    } else {
      const ring = geoJSONToRing(active.region);
      if (ring.length) {
        setCentreOn({
          lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length,
          lng: ring.reduce((s, p) => s + p.lng, 0) / ring.length,
        });
      }
    }
  }, [active]);

  const search = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setSearching(true); setMsg("");
    try {
      const rows = await searchPlace(query, ac.signal);
      setPlaces(rows);
      if (!rows.length) setMsg("Nothing found by that name. Try a nearby town or a road.");
    } catch (err) {
      if ((err as Error).name !== "AbortError") setMsg((err as Error).message);
    } finally { setSearching(false); }
  }, [query]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setMsg("This device will not share a location."); return; }
    setMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCentreOn({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setMsg("");
      },
      () => setMsg("Could not get a location — search for the farm instead."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  function save() {
    const trimmed = name.trim();
    if (!trimmed) { setMsg("Give the block a name you'll recognise."); return; }

    let region: SavedRegion["region"];
    if (value.mode === "polygon") {
      if (!isDrawable(value.ring)) { setMsg("Trace at least three corners."); return; }
      region = ringToGeoJSON(value.ring);
    } else {
      if (!value.centre) { setMsg("Click the middle of the block first."); return; }
      region = { lat: value.centre.lat, lon: value.centre.lng, radius_m: value.radiusM };
    }

    const saved: SavedRegion = {
      id: `map-${Date.now().toString(36)}`,
      name: trimmed,
      region,
      baseTempF: baseTemp,
    };
    saveRegion(saved);
    onSaved(saved);       // switching to it re-scopes the whole app
    setValue(EMPTY); setName(""); setMsg(`Saved ${trimmed}. Every view is now scoped to it.`);
  }

  const ready =
    value.mode === "polygon" ? isDrawable(value.ring) : !!value.centre;
  const m2 = value.mode === "polygon"
    ? (isDrawable(value.ring) ? areaM2(value.ring) : 0)
    : value.centre ? Math.PI * value.radiusM ** 2 : 0;

  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">Map</h1>
        <span className="text-[13px] text-ink-soft">draw the ground you farm</span>
      </div>

      {/* ── 1. Find the farm ───────────────────────────────────────────── */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <form onSubmit={search} className="flex flex-1 min-w-[240px] gap-2">
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a town, road or address"
            className="min-h-11 flex-1 rounded border border-rule bg-white px-3 text-[16px] focus:border-honey focus:outline-none"
          />
          <button className="min-h-11 rounded border-[1.5px] border-ink px-4 text-[13px] font-semibold active:bg-ink active:text-paper">
            {searching ? "…" : "Search"}
          </button>
        </form>
        <button onClick={locate}
          className="min-h-11 rounded border-[1.5px] border-ink px-4 text-[13px] font-semibold active:bg-ink active:text-paper">
          Use my location
        </button>

        <div className="ml-auto flex overflow-hidden rounded-md border-[1.5px] border-ink text-[12.5px] font-semibold">
          {(["polygon", "pin"] as const).map((mo) => (
            <button key={mo}
              onClick={() => setValue({ ...EMPTY, mode: mo, radiusM: value.radiusM })}
              className={`min-h-11 px-4 ${value.mode === mo ? "bg-ink text-paper" : "active:bg-band"}`}>
              {mo === "polygon" ? "Trace a block" : "Pin + radius"}
            </button>
          ))}
        </div>
      </div>

      {places.length > 0 && (
        <ul className="mb-2.5 divide-y divide-rule overflow-hidden rounded-md border border-rule bg-panel text-[12.5px]">
          {places.map((p) => (
            <li key={`${p.lat},${p.lng}`}>
              <button onClick={() => { setCentreOn({ lat: p.lat, lng: p.lng }); setPlaces([]); }}
                className="block min-h-11 w-full truncate px-3 py-2 text-left active:bg-band">
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ── 2. Trace it ────────────────────────────────────────────────── */}
      <FieldMap value={value} onChange={setValue} others={others} centreOn={centreOn} />

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
        {value.mode === "polygon" ? (
          <>
            <button
              onClick={() => setValue({ ...value, ring: value.ring.slice(0, -1) })}
              disabled={!value.ring.length}
              className="min-h-11 rounded border border-rule px-3.5 active:bg-band disabled:opacity-40">
              Undo corner
            </button>
            <button onClick={() => setValue({ ...EMPTY, mode: "polygon" })}
              disabled={!value.ring.length}
              className="min-h-11 rounded border border-rule px-3.5 active:bg-band disabled:opacity-40">
              Start over
            </button>
            <span className="text-ink-soft">
              Click each corner · drag a corner to fix it
            </span>
          </>
        ) : (
          <>
            <span className="text-ink-soft">Radius</span>
            {RADII.map((r) => (
              <button key={r} onClick={() => setValue({ ...value, radiusM: r })}
                className={`min-h-11 rounded border px-3.5 ${
                  value.radiusM === r ? "border-ink bg-ink text-paper" : "border-rule hover:bg-band"}`}>
                {r < 1000 ? `${r} m` : `${r / 1000} km`}
              </button>
            ))}
          </>
        )}
      </div>

      {/* ── 3. Name it ─────────────────────────────────────────────────── */}
      <div className="mt-4 rounded-md border border-rule bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <label className="block text-[11px] text-ink-soft">
            Name this ground
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="East Bench"
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" />
          </label>
          <label className="block text-[11px] text-ink-soft">
            Base °F
            <input value={baseTemp} inputMode="numeric"
              onChange={(e) => setBaseTemp(Number(e.target.value) || 50)}
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" />
          </label>
          <button onClick={save} disabled={!ready}
            className="min-h-11 rounded border-[1.5px] border-ink bg-ink px-5 text-[13px] font-semibold text-paper disabled:opacity-40 disabled:bg-transparent disabled:text-ink">
            Save and work it
          </button>
        </div>

        {ready && (
          <p className="mt-2 text-[12.5px] text-ink-soft">
            {formatArea(m2)} — saving switches every view to it.
          </p>
        )}
        {msg && <p className="mt-2 text-[12.5px] text-ink">{msg}</p>}
      </div>

      <p className="mt-4 max-w-prose text-[12px] leading-relaxed text-ink-soft">
        Imagery is the default layer because a field is easier to recognise from
        the air than from a road map. Nothing you draw leaves your browser until
        you ask a question about it.
      </p>
    </>
  );
}
