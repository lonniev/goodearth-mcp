// The whole screen, as much as this device allows. See `lib/fullscreen`.
//
// Acts when the finger LIFTS as well as on a click — the iPad drops clicks
// (the plant picker, the chart hint) and pointer-up is itself a user gesture,
// which a full-screen request must be made inside. The iPhone's explanation
// is a panel that leaves on its own like every other (i).

import { useEffect, useRef, useState } from "react";
import { dwellMs } from "@tollbooth-dpyc/web";
import { fullscreenMode, isFullscreen, readEnv, toggleFullscreen } from "../lib/fullscreen";
import { ICON } from "./ui";
import { tour } from "../lib/tour/targets";
import { useT } from "../i18n";

export default function FullscreenButton() {
  const t = useT();
  const HOW = t("ui.fullscreenButton.how");
  const [mode] = useState(() => (typeof document === "undefined" ? "none" : fullscreenMode(readEnv())));
  const [full, setFull] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const lifted = useRef(false);

  useEffect(() => {
    if (mode !== "toggle") return;
    const sync = () => setFull(isFullscreen());
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, [mode]);

  // The iPhone panel: gone on an outside press, on Escape, or once read.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const timer = window.setTimeout(() => setOpen(false), dwellMs(HOW));
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open, HOW]);

  if (mode === "none") return null;

  const act = () => {
    if (mode === "toggle") void toggleFullscreen().catch(() => { /* the browser said no; nothing to undo */ });
    else setOpen((v) => !v);
  };
  const label = mode === "install" ? t("ui.fullscreenButton.install")
    : full ? t("ui.fullscreenButton.exit") : t("ui.fullscreenButton.enter");

  return (
    <span ref={box} className="relative">
      <button type="button" aria-label={label} title={label} aria-expanded={mode === "install" ? open : undefined}
        {...tour("shell.fullscreen")}
        onPointerUp={() => { lifted.current = true; act(); }}
        onClick={() => { if (lifted.current) { lifted.current = false; return; } act(); }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-rule text-ink-soft active:bg-band">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
          <path d={full ? ICON.collapse : ICON.expand} />
        </svg>
      </button>
      {open && (
        <span role="tooltip"
          className="absolute top-full right-0 z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] whitespace-normal rounded-md border border-rule bg-paper p-2.5 text-left text-[0.75rem] leading-snug text-ink shadow-lg">
          {HOW}
        </span>
      )}
    </span>
  );
}
