// Forget me.
//
// The one control here that cannot be taken back, so it is the one that asks
// twice — a typed phrase, not a checkbox, because a checkbox is ticked by the
// same reflex that tapped the button.
//
// It also says what does NOT go. Somebody deleting their farm should not be
// left wondering whether they have also destroyed their balance: they have
// not, they remain a patron, and saying so is the difference between a control
// people can use and one they avoid.

import { useState } from "react";
import {
  FORGET_PHRASE, forgetMyGround, getStoredNpub, logOut,
} from "../lib/mcp";
import { clear as clearUndo } from "../lib/undo";

export default function ForgetMe({ onForgotten }: { onForgotten: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const ready = typed.trim().toUpperCase() === FORGET_PHRASE;

  async function forget() {
    setBusy(true); setErr("");
    try {
      const r = await forgetMyGround(FORGET_PHRASE);
      if (!r.success) { setErr(r.error || "The record could not be reached."); return; }
      // The server has forgotten. This browser must too, or the next render
      // reads a cache describing ground that no longer exists.
      try {
        clearUndo();
        window.localStorage.removeItem(`goodearth:regions:v1:${getStoredNpub()}`);
        window.localStorage.removeItem(`goodearth:active-region:v1:${getStoredNpub()}`);
      } catch { /* a browser that refuses storage has nothing cached anyway */ }
      logOut();
      onForgotten();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-clay/40 bg-panel px-4 py-3">
      <div className="eyebrow mb-1 text-clay">Forget me</div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="min-w-[14rem] flex-1 text-[12.5px] leading-snug text-ink-soft">
        Deletes every block and everything recorded on it — crops, pests,
        watches, reports, tasks — and stops any calendar feed you published.
        It cannot be undone.{" "}
        <b className="text-ink">
          Your balance and purchase history are not touched, and you stay a
          patron here.
        </b>
      </p>

      {!open && (
        <button onClick={() => { setOpen(true); setErr(""); }}
          className="min-h-11 shrink-0 rounded-full border border-clay px-4 text-[13px] font-semibold text-clay">
          Forget my ground
        </button>
      )}
      </div>
      {open && (
        <>
          <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="block min-w-[12rem] flex-1 text-[12px] text-ink-soft">
            Type <b className="data text-ink">{FORGET_PHRASE}</b> to confirm
            <input
              autoFocus value={typed} onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setTyped(""); } }}
              className="data mt-1 h-11 w-full rounded border border-rule bg-white px-2.5 text-[15px] focus:border-clay focus:outline-none"
            />
          </label>
            <button onClick={() => { setOpen(false); setTyped(""); setErr(""); }}
              disabled={busy}
              className="min-h-11 rounded-full border border-rule px-4 text-[13px] font-medium text-ink-soft disabled:opacity-40">
              Keep it
            </button>
            <button onClick={() => void forget()} disabled={!ready || busy}
              className="min-h-11 rounded-full border-[1.5px] border-clay bg-clay px-4 text-[13px] font-semibold text-paper disabled:opacity-40">
              {busy ? "Forgetting…" : "Forget it all"}
            </button>
          </div>
          {err && <p className="mt-2 text-[12.5px] text-clay">{err}</p>}
        </>
      )}
    </div>
  );
}
