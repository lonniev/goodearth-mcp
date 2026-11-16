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
import { tour } from "../lib/tour/targets";
import { Tx, useTour } from "@tollbooth-dpyc/web/react";
import { useT, WORDS } from "../i18n";

export default function FirstRun({ onSaved, onDraw, onExample }: {
  onSaved: (r: SavedRegion) => void;
  onDraw: () => void;
  onExample: () => void;
}) {
  // The Dashboard's tour begins here for a grower with no ground yet.
  useTour("ledger");
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function here() {
    if (!navigator.geolocation) {
      setMsg(t("ui.firstRun.noGeo"));
      return;
    }
    setBusy(true); setMsg(t("ui.firstRun.finding"));
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
        setMsg(t("ui.firstRun.noLocation"));
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div>
      <h1 className="figure mb-1 text-[1.625rem] font-bold">{t("ui.firstRun.title")}</h1>
      <Claim>{t("ui.firstRun.claim")}</Claim>
      <p className="text-[0.84375rem] leading-relaxed">
        {t("ui.firstRun.lede")}
      </p>

      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
        <button onClick={here} disabled={busy} {...tour("firstrun.here")}
          className="rounded-md border-[1.5px] border-ink bg-ink p-4 text-left text-paper disabled:opacity-50">
          <span className="text-[1.5rem]" aria-hidden="true">📍</span>
          <span className="figure mt-1 block text-[0.9375rem] font-semibold">
            {busy ? t("ui.firstRun.finding") : t("ui.firstRun.here")}
          </span>
          <span className="mt-1 block text-[0.78125rem] leading-relaxed opacity-80">
            {t("ui.firstRun.hereNote", { acres: HOME_ACRES })}
          </span>
        </button>

        <button onClick={onDraw} {...tour("firstrun.draw")}
          className="rounded-md border border-rule bg-panel p-4 text-left active:border-ink">
          <span className="text-[1.5rem]" aria-hidden="true">✏️</span>
          <span className="figure mt-1 block text-[0.9375rem] font-semibold">{t("ui.firstRun.draw")}</span>
          <span className="mt-1 block text-[0.78125rem] leading-relaxed text-ink-soft">
            {t("ui.firstRun.drawNote")}
          </span>
        </button>
      </div>

      {msg && <p className="mt-3 text-[0.78125rem] text-clay">{msg}</p>}

      <p className="mt-6 text-[0.8125rem] leading-relaxed text-ink-soft">
        <Tx ns={WORDS} k="ui.firstRun.example" components={{
          example: <button onClick={onExample} className="underline decoration-dotted underline-offset-2" />,
        }} />
      </p>
    </div>
  );
}
