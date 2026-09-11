// My Plots — the ground you work, and the map you draw more on.
//
// Favorites and Map used to be two rail entries answering one question. A
// grower who wanted a new block drew it on one page and then went looking for
// it on the other; a grower who wanted to switch ground read a list on a page
// that could not show them where any of it was.
//
// One page, and everything that ACTS sits above the map it acts on: find the
// farm, pick from the ground you have, name the new block, and only then the
// map. The map is the tall thing, and a control below a tall thing is a
// control a phone never shows you.

import { useUnits } from "../components/Units";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FieldMap, { type MapValue } from "../components/FieldMap";
import { ICON, IconButton } from "../components/ui";
import {
  areaM2, formatArea, geoJSONToRing, isDrawable, ringToGeoJSON, searchPlace,
  type LatLng, type Place,
} from "../lib/geo";
import { blockSave } from "../lib/mcp";
import { deleteRegion, EXAMPLE_ID, listRegions, type SavedRegion } from "../lib/regions";
import { saveBlock } from "../lib/saveBlock";
import PlotEditor from "../components/PlotEditor";

const EMPTY: MapValue = { mode: "polygon", ring: [], centre: null, radiusM: 400 };

const RADII = [200, 400, 800, 1600, 3200];

export default function Plots({
  active, onPick, onSaved, synced = true,
}: {
  active: SavedRegion;
  onPick: (r: SavedRegion) => void;
  onSaved: (r: SavedRegion) => void;
  /// False until the server's blocks have arrived. The list shown before then
  /// is this device's cache, which is right often enough to show immediately
  /// and honest enough to caption.
  synced?: boolean;
}) {
  const u = useUnits();
  const [regions, setRegions] = useState<SavedRegion[]>(() => listRegions());

  /// Re-read the saved ground whenever something could have written it.
  ///
  /// Two moments catch every writer: the server's blocks landing (`synced`),
  /// and the active block changing — which is what picking one here, saving
  /// one below, and saving one from the top bar's picker all do. Holding the
  /// snapshot taken at mount is what let this list go on showing ground the
  /// grower had just replaced.
  useEffect(() => { setRegions(listRegions()); }, [synced, active.id]);

  /// The block a confirm is open for. Retiring ground is the one act on this
  /// site whose blast radius is bigger than the thing tapped — it takes every
  /// crop, pest, watch and report recorded on it out of every view at once —
  /// so it asks first where a row does not.
  const [confirming, setConfirming] = useState<SavedRegion | null>(null);
  /// The plot whose name and aliases are open for editing.
  const [editing, setEditing] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState(false);
  const [err, setErr] = useState("");

  const [value, setValue] = useState<MapValue>(EMPTY);
  const [name, setName] = useState("");
  const [baseTemp, setBaseTemp] = useState(50);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState("");
  const [centreOn, setCentreOn] = useState<LatLng | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Saved polygons drawn faintly, so a new one can be placed beside them.
  // Derived from the same list the cards read, rather than a second snapshot
  // that could disagree with them.
  //
  // MEMOISED because `FieldMap` has `others` in a dependency array and its
  // redraw effect clears and rebuilds every layer. A fresh array on each
  // render would tear the draggable corner markers down and put them back on
  // every keystroke in the name or search box — including mid-drag.
  const others = useMemo(
    () => regions
      .filter((r) => !("lat" in r.region))
      .map((r) => ({ name: r.name, ring: geoJSONToRing(r.region as { coordinates: number[][][] }) })),
    [regions],
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

  /// Retire the block on the RECORD, not just in this browser.
  ///
  /// "Forget" used to call `deleteRegion` alone, which drops the block from
  /// localStorage — and the next sign-in calls `hydrate()` with whatever the
  /// server still holds, which put it straight back. The button did nothing
  /// that survived a reload. Retiring it server-side is what `block_list`
  /// then filters out, and it is soft: `retired_at` is stamped, nothing is
  /// deleted, and the ground can be restored by saving it again.
  async function forget(r: SavedRegion) {
    setForgetting(true); setErr("");
    try {
      const res = await blockSave({
        block: r.id, name: r.name, geometry: r.region,
        base_temp: r.baseTempF, retired: true,
      });
      if (!res.success) { setErr(res.error || "The block could not be retired."); return; }
      setRegions(deleteRegion(r.id));
      setConfirming(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setForgetting(false);
    }
  }

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
    } catch (err2) {
      if ((err2 as Error).name !== "AbortError") setMsg((err2 as Error).message);
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
      if (!isDrawable(value.ring)) { setMsg("Trace at least three corners on the map below."); return; }
      region = ringToGeoJSON(value.ring);
    } else {
      if (!value.centre) { setMsg("Click the middle of the block on the map below."); return; }
      region = { lat: value.centre.lat, lon: value.centre.lng, radius_m: value.radiusM };
    }

    const saved: SavedRegion = {
      id: `map-${Date.now().toString(36)}`,
      name: trimmed,
      region,
      baseTempF: baseTemp,
    };
    // To the RECORD, then the cache. Saving only here is what lost a block:
    // the server reported the patron had none, and the cache was cleared to
    // match. See `saveBlock`.
    setMsg("Saving…");
    void saveBlock(saved)
      .then((measured) => {
        onSaved(measured);   // switching to it re-scopes the whole app
        setValue(EMPTY); setName("");
        setMsg(`Saved ${trimmed}. Every view is now scoped to it.`);
      })
      .catch((e: Error) => setMsg(e.message));
  }

  const ready =
    value.mode === "polygon" ? isDrawable(value.ring) : !!value.centre;
  const m2 = value.mode === "polygon"
    ? (isDrawable(value.ring) ? areaM2(value.ring) : 0)
    : value.centre ? Math.PI * value.radiusM ** 2 : 0;

  return (
    <>
      <h1 className="figure mb-3.5 text-[26px] font-bold">My Plots</h1>

      {/* ── Find the farm ──────────────────────────────────────────────── */}
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

      {/* ── The ground already saved ───────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {regions.map((r) => {
          const isActive = r.id === active.id;
          return (
            <div
              key={r.id}
              className={`rounded-md border bg-panel p-3.5 ${
                isActive ? "border-ink border-l-4 border-l-growth" : "border-rule"
              }`}
            >
              {editing === r.id ? (
                <PlotEditor plot={r} onDone={(saved) => {
                  setEditing(null);
                  if (!saved) return;
                  setRegions(listRegions());
                  // The top bar and every view carry the active plot's name.
                  if (isActive) onSaved(saved);
                }} />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="figure text-[15.5px] font-semibold">{r.name}</h2>
                    {isActive && <span className="eyebrow text-growth">active</span>}
                  </div>
                  {!!r.aliases?.length && (
                    <p className="mt-0.5 text-[12px] text-ink-soft">
                      also {r.aliases.map((a) => `“${a}”`).join(", ")}
                    </p>
                  )}
                </>
              )}

              <p className="data mt-1 text-[11px] text-ink-soft">
                {"lat" in r.region
                  ? `pin ${r.region.lat.toFixed(4)}, ${r.region.lon.toFixed(4)} · ${r.region.radius_m} m`
                  : `polygon · ${r.region.coordinates[0].length - 1} corners`}
              </p>
              <p className="data mt-0.5 text-[11px] text-ink-soft">
                {r.areaHa != null
                  ? `${r.areaHa.toFixed(1)} ha · ${r.sampleCount} samples`
                  : "not measured yet"}
                {" · base "}{u.showTemp(r.baseTempF)}
              </p>

              <div className="mt-3 flex gap-2">
                {!isActive && (
                  <button
                    onClick={() => onPick(r)}
                    className="min-h-11 rounded border-[1.5px] border-ink px-4 text-[13px] font-semibold active:bg-ink active:text-paper"
                  >
                    Work this plot
                  </button>
                )}
                {/* Not before the record has answered: the cache may not know
                    the plot's aliases, and saving what it does not know would
                    clear them. */}
                {r.id !== EXAMPLE_ID && synced && editing !== r.id && (
                  <IconButton path={ICON.edit} label={`Rename ${r.name}`} tone="quiet" hideLabel
                    onClick={() => setEditing(r.id)} />
                )}
                {r.id !== EXAMPLE_ID && (
                  <IconButton path={ICON.delete} label={`Forget ${r.name}`} tone="quiet" hideLabel
                    onClick={() => { setConfirming(r); setErr(""); }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Name the new block, and save it ────────────────────────────── */}
      <div className="mt-4 rounded-md border border-rule bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <label className="block text-[11px] text-ink-soft">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="East Bench"
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" />
          </label>
          <label className="block text-[11px] text-ink-soft">
            Base{u.tempUnit}
            {/* Shown in the reader's scale, stored in the Fahrenheit the
                service validates against. */}
            <input defaultValue={Math.round(u.temp(baseTemp))} inputMode="numeric"
              onChange={(e) => setBaseTemp(u.toF(Number(e.target.value)) || 50)}
              className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none" />
          </label>
          <IconButton path={ICON.save} label="Save" onClick={save} disabled={!ready}
            title="Save this ground and work it" />
        </div>

        {ready && (
          <p className="mt-2 text-[12.5px] text-ink-soft">
            {formatArea(m2)} — saving switches every view to it.
          </p>
        )}
        {msg && <p className="mt-2 text-[12.5px] text-ink">{msg}</p>}
      </div>

      {/* ── Draw it ────────────────────────────────────────────────────── */}
      <div className="mt-4">
        <FieldMap value={value} onChange={setValue} others={others} centreOn={centreOn} />
      </div>

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

      {confirming && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-5">
          <div className="w-full max-w-sm rounded-xl border border-rule bg-paper p-5 shadow-xl">
            <h2 className="figure text-[17px] font-semibold">
              Forget {confirming.name}?
            </h2>
            {/* What actually happens, in the order it matters. A row can be
                undone from the bar on its page; a block cannot, which is the
                whole reason this asks first. */}
            <p className="mt-2 text-[13px] leading-relaxed">
              The plot and everything recorded on it — crops, pests, watches,
              reports — stop appearing anywhere. Nothing is deleted: the record
              keeps it, and saving the plot again brings it back.
            </p>
            {err && <p className="mt-2 text-[12.5px] text-clay">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirming(null)}
                disabled={forgetting}
                className="min-h-11 rounded-full border border-rule px-4 text-[13px] font-medium text-ink-soft disabled:opacity-40 active:bg-band"
              >
                Keep it
              </button>
              <button
                onClick={() => void forget(confirming)}
                disabled={forgetting}
                className="min-h-11 rounded-full border-[1.5px] border-clay bg-clay px-4 text-[13px] font-semibold text-paper disabled:opacity-40"
              >
                {forgetting ? "Forgetting…" : "Forget it"}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
