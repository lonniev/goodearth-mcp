// The first thing a grower with no ground sees.
//
// It used to be the Champlain Valley — a 13,344-acre box over a lake in
// Vermont, presented exactly like a real block, with a name, a satellite image
// and 2,438 growing degree days. Nothing on screen said it was an example. A
// first-time patron could reasonably read it as a guess at where they are, or
// start recording crops against ground five hundred miles away.
//
// So the ask leads instead. Draw your ground, or let the browser propose one
// around you; the example is still here, one tap away and labelled as what it
// is.

import { useState } from "react";
import { Claim } from "./Diagram";
import {
  HOME_ACRES, proposeHomeBlock, type SavedRegion,
} from "../lib/regions";
import { saveBlock } from "../lib/saveBlock";

export default function FirstRun({ onSaved, onDraw, onExample }: {
  onSaved: (r: SavedRegion) => void;
  onDraw: () => void;
  onExample: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function here() {
    if (!navigator.geolocation) {
      setMsg("This device will not share a location — draw it on the map instead.");
      return;
    }
    setBusy(true); setMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const made = proposeHomeBlock(pos.coords.latitude, pos.coords.longitude);
        if (typeof made === "string") { setMsg(made); setBusy(false); return; }
        void saveBlock(made)
          .then((saved) => { setMsg(""); onSaved(saved); })
          .catch((e: Error) => setMsg(e.message))
          .finally(() => setBusy(false));
      },
      () => {
        setBusy(false);
        setMsg("Could not get a location — draw it on the map instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="figure mb-1 text-[26px] font-bold">Where do you farm?</h1>
      <Claim>Every answer here is about a piece of ground, so it needs one.</Claim>
      <p className="text-[13.5px] leading-relaxed">
        Heat, frost, soil and daylight are all answered for the block you name,
        with the spread across it. Nothing is computed until there is ground to
        compute it for.
      </p>

      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
        <button onClick={here} disabled={busy}
          className="rounded-md border-[1.5px] border-ink bg-ink p-4 text-left text-paper disabled:opacity-50">
          <span className="text-[24px]" aria-hidden="true">📍</span>
          <span className="figure mt-1 block text-[15px] font-semibold">
            {busy ? "Finding you…" : "Start where I am"}
          </span>
          <span className="mt-1 block text-[12.5px] leading-relaxed opacity-80">
            About {HOME_ACRES} acres around this device, to move and reshape.
            Your location is used here and not stored.
          </span>
        </button>

        <button onClick={onDraw}
          className="rounded-md border border-rule bg-panel p-4 text-left active:border-ink">
          <span className="text-[24px]" aria-hidden="true">✏️</span>
          <span className="figure mt-1 block text-[15px] font-semibold">Draw it on the map</span>
          <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-soft">
            Trace the field, or drop a pin with a radius. A polygon is worth the
            minute — the spread is measured across whatever you draw.
          </span>
        </button>
      </div>

      {msg && <p className="mt-3 text-[12.5px] text-clay">{msg}</p>}

      <p className="mt-6 text-[13px] leading-relaxed text-ink-soft">
        Not ready to say where you are?{" "}
        <button onClick={onExample}
          className="underline decoration-dotted underline-offset-2">
          Look at a worked example
        </button>{" "}
        — the Champlain Valley in Vermont, which is the ground this was built
        against. It is not your farm, and nothing you record on it is kept.
      </p>
    </div>
  );
}
