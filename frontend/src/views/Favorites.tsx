// Favorites — the saved ground, and the place to add more.
//
// A region is a first-class thing here rather than a form field: it carries
// the block's name, its measured area and sample count, and the base
// temperature its crops are counted against.

import { useUnits } from "../components/Units";
import { useState } from "react";
import { blockSave } from "../lib/mcp";
import { deleteRegion, listRegions, type SavedRegion } from "../lib/regions";

export default function Favorites({
  active, onPick, synced = true,
}: {
  active: SavedRegion;
  onPick: (r: SavedRegion) => void;
  /// False until the server's blocks have arrived. The list shown before then
  /// is this device's cache, which is right often enough to show immediately
  /// and honest enough to caption.
  synced?: boolean;
}) {
  const u = useUnits();
  const [regions, setRegions] = useState<SavedRegion[]>(() => listRegions());
  /// The block a confirm is open for. Retiring ground is the one act on this
  /// site whose blast radius is bigger than the thing tapped — it takes every
  /// crop, pest, watch and report recorded on it out of every view at once —
  /// so it asks first where a row does not.
  const [confirming, setConfirming] = useState<SavedRegion | null>(null);
  const [forgetting, setForgetting] = useState(false);
  const [err, setErr] = useState("");

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

  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">Favorites</h1>
        <span className="text-[13px] text-ink-soft">
          {synced ? "the ground you work" : "the ground you work — checking for more"}
        </span>
      </div>

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
              <div className="flex items-start justify-between gap-2">
                <h2 className="figure text-[15.5px] font-semibold">{r.name}</h2>
                {isActive && <span className="eyebrow text-growth">active</span>}
              </div>

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
                    Work this ground
                  </button>
                )}
                {r.id !== "example-champlain" && (
                  <button
                    onClick={() => { setConfirming(r); setErr(""); }}
                    className="min-h-11 rounded px-3 text-[13px] text-ink-soft active:text-clay"
                  >
                    Forget
                  </button>
                )}
              </div>
            </div>
          );
        })}
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
              The ground and everything recorded on it — crops, pests, watches,
              reports — stop appearing anywhere. Nothing is deleted: the record
              keeps it, and saving the block again brings it back.
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

      <p className="mt-5 text-[13px] leading-relaxed text-ink-soft">
        Add ground with the region picker in the top bar — a pin with a radius,
        or a pasted GeoJSON polygon from any mapping tool. Drawing on a map
        arrives with the Map view.
      </p>
    </>
  );
}
