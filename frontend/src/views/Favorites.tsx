// Favorites — the saved ground, and the place to add more.
//
// A region is a first-class thing here rather than a form field: it carries
// the block's name, its measured area and sample count, and the base
// temperature its crops are counted against.

import { useState } from "react";
import { deleteRegion, listRegions, type SavedRegion } from "../lib/regions";

export default function Favorites({
  active, onPick,
}: {
  active: SavedRegion;
  onPick: (r: SavedRegion) => void;
}) {
  const [regions, setRegions] = useState<SavedRegion[]>(() => listRegions());

  return (
    <>
      <div className="mb-3.5 flex items-baseline gap-3">
        <h1 className="figure text-[26px] font-bold">Favorites</h1>
        <span className="text-[13px] text-ink-soft">the ground you work</span>
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
                {" · base "}{r.baseTempF}°F
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
                    onClick={() => setRegions(deleteRegion(r.id))}
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

      <p className="mt-5 text-[13px] leading-relaxed text-ink-soft">
        Add ground with the region picker in the top bar — a pin with a radius,
        or a pasted GeoJSON polygon from any mapping tool. Drawing on a map
        arrives with the Map view.
      </p>
    </>
  );
}
