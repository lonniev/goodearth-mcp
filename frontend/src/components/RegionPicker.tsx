// Active-region picker. Switching re-scopes the whole app, so it sits in the
// top bar beside the sat chip rather than inside any one view.

import { saveBlock } from "../lib/saveBlock";
import { useUnits } from "./Units";
import { useEffect, useRef, useState } from "react";
import {
  deleteRegion, listRegions, parsePastedGeoJSON, pinRegion,
  type SavedRegion,
} from "../lib/regions";

export default function RegionPicker({
  active, onPick, onMap,
}: {
  active: SavedRegion;
  onPick: (r: SavedRegion) => void;
  /// Leave for the map editor. The picker can take a pin's numbers or a
  /// pasted polygon, and neither is how anyone actually knows where their
  /// field is — so the third way out is the one with a map under it.
  onMap: () => void;
}) {
  const u = useUnits();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<"pin" | "poly" | null>(null);
  const [regions, setRegions] = useState<SavedRegion[]>(() => listRegions());

  /// Re-read the list, because a block can be saved from OUTSIDE this
  /// component and this held a snapshot taken when it mounted.
  ///
  /// `AppShell` mounts once, so the snapshot was taken at first paint — before
  /// the server's blocks arrive, and before a first-run grower saves the block
  /// proposed around them. Both wrote to the store and neither could tell this
  /// list about it, so the dropdown went on offering the worked example alone
  /// while the bar above it named the ground they had just drawn.
  ///
  /// Two moments are enough to catch every writer: the active block changing
  /// (which is what `pickRegion` and the server sync both do) and the dropdown
  /// being opened (which is the only time the list is read).
  useEffect(() => { setRegions(listRegions()); }, [active.id, open]);
  const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); setAdding(null); setErr(""); }
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const [saving, setSaving] = useState(false);

  /// Ground goes to the RECORD first. Saving only to this browser is the state
  /// that lost a block: the server then reported the patron had none, and the
  /// cache was cleared to match. See `saveBlock`.
  async function commit(result: SavedRegion | string) {
    if (typeof result === "string") { setErr(result); return; }
    setSaving(true); setErr("");
    try {
      const saved = await saveBlock(result);
      setRegions(listRegions());
      onPick(saved);
      setAdding(null); setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /// The worked example, marked as one. It renders exactly like a real block
  /// — name, area, satellite ground — and nothing said otherwise, so a
  /// first-time reader could take it for a guess at where they are.
  const EXAMPLE = "example-champlain";

  const detail = active.id === EXAMPLE
    // Said in the one place a reader always sees, because the example is
    // otherwise indistinguishable from ground they drew.
    ? "worked example — not your ground"
    : active.sampleCount
      ? `${active.areaHa ? active.areaHa.toFixed(1) + " ha · " : ""}${active.sampleCount} samples`
      : "not measured yet";

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 rounded-md border-[1.5px] border-ink bg-panel px-3 text-[13.5px] font-semibold"
      >
        {active.name}
        <small className="data text-[10.5px] font-normal text-ink-soft">{detail}</small>
        <span className="text-[10px] text-ink-soft">▼</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-rule bg-panel p-2 shadow-lg">
          <div className="eyebrow px-2 pb-1">Your ground</div>
          <ul role="listbox" className="max-h-64 overflow-auto overscroll-contain">
            {regions.map((r) => (
              <li key={r.id} className="flex items-center">
                <button
                  role="option"
                  aria-selected={r.id === active.id}
                  onClick={() => { onPick(r); setOpen(false); }}
                  className={`min-h-11 flex-1 truncate rounded px-2 text-left text-[13px] active:bg-band ${
                    r.id === active.id ? "font-semibold" : ""
                  }`}
                >
                  {r.name}
                  {r.id === EXAMPLE && (
                    <span className="ml-2 rounded-full bg-band px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft">
                      example
                    </span>
                  )}
                  <span className="data ml-2 text-[10px] text-ink-soft">
                    {"lat" in r.region ? `pin ${r.region.radius_m} m` : "polygon"}
                  </span>
                </button>
                {r.id !== EXAMPLE && (
                  <button
                    onClick={() => setRegions(deleteRegion(r.id))}
                    aria-label={`Forget ${r.name}`}
                    className="flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft active:text-clay"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-2 flex flex-wrap gap-2 border-t border-rule pt-2">
            {/* First, because it is the one that does not ask a grower to
                already know their coordinates. */}
            <button onClick={() => { setOpen(false); setAdding(null); setErr(""); onMap(); }}
              className="min-h-11 flex-1 rounded border-[1.5px] border-ink bg-ink px-3 text-[12.5px] font-semibold text-paper">
              🗺️ Draw on a map
            </button>
            <button onClick={() => { setAdding("pin"); setErr(""); }}
              className="min-h-11 flex-1 rounded border-[1.5px] border-ink px-3 text-[12.5px] font-semibold active:bg-ink active:text-paper">
              Add a pin
            </button>
            <button onClick={() => { setAdding("poly"); setErr(""); }}
              className="min-h-11 flex-1 rounded border-[1.5px] border-ink px-3 text-[12.5px] font-semibold active:bg-ink active:text-paper">
              Paste a polygon
            </button>
          </div>

          {adding === "pin" && (
            <form
              className="mt-2 space-y-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void commit(pinRegion(
                  String(f.get("name") ?? ""),
                  Number(f.get("lat")), Number(f.get("lon")), Number(f.get("r")),
                  f.get("base") ? u.toF(Number(f.get("base"))) : 50,
                ));
              }}
            >
              <Field name="name" label="Name" placeholder="East Bench" />
              <div className="flex gap-1.5">
                <Field name="lat" label="Latitude" placeholder="44.48" />
                <Field name="lon" label="Longitude" placeholder="-73.21" />
              </div>
              <div className="flex gap-1.5">
                <Field name="r" label="Radius (m)" placeholder="800" />
                <Field name="base" label={`Base${u.tempUnit}`}
                  placeholder={String(Math.round(u.temp(50)))} />
              </div>
              <button disabled={saving}
                className="min-h-11 w-full rounded bg-ink text-[13px] font-semibold text-paper disabled:opacity-40">
                {saving ? "Saving…" : "Save block"}</button>
            </form>
          )}

          {adding === "poly" && (
            <form
              className="mt-2 space-y-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void commit(parsePastedGeoJSON(
                  String(f.get("json") ?? ""), String(f.get("name") ?? ""),
                  f.get("base") ? u.toF(Number(f.get("base"))) : 50,
                ));
              }}
            >
              <Field name="name" label="Name" placeholder="East Bench" />
              <label className="block text-[11px] text-ink-soft">
                GeoJSON Polygon
                <textarea name="json" rows={4}
                  placeholder='{"type":"Polygon","coordinates":[[[-73.24,44.44], …]]}'
                  className="data mt-0.5 w-full rounded border border-rule bg-white px-2 py-2 text-[16px] focus:border-honey focus:outline-none" />
              </label>
              <Field name="base" label={`Base${u.tempUnit}`}
                  placeholder={String(Math.round(u.temp(50)))} />
              <button disabled={saving}
                className="min-h-11 w-full rounded bg-ink text-[13px] font-semibold text-paper disabled:opacity-40">
                {saving ? "Saving…" : "Save block"}</button>
            </form>
          )}

          {err && <div className="mt-2 rounded border border-clay/30 bg-clay/10 p-2 text-[11.5px] text-clay">{err}</div>}
        </div>
      )}
    </div>
  );
}

function Field({ name, label, placeholder }: { name: string; label: string; placeholder: string }) {
  return (
    <label className="block flex-1 text-[11px] text-ink-soft">
      {label}
      <input name={name} placeholder={placeholder}
        className="mt-0.5 min-h-11 w-full rounded border border-rule bg-white px-2 text-[16px] text-ink focus:border-honey focus:outline-none" />
    </label>
  );
}
