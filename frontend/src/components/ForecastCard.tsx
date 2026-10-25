// One fortnight day, opened: its forecast in the Weather Service's own shape,
// ready to paste into a text or a farm log.
//
// The text is the copy, character for character, so what the grower reads is
// what lands on the clipboard. The arrows step through the fortnight without
// closing, because the next question after "what about Tuesday" is usually
// "and Wednesday".

import { useEffect, useRef, useState } from "react";
import type { AlmanacResult, StormSignal } from "../lib/mcp";
import { zoneForecast } from "../lib/zoneForecast";
import { toClipboard } from "./Share";
import { useUnits } from "./Units";
import { Glyph, ICON } from "./ui";

export default function ForecastCard({ days, index, onIndex, place, issued, storm, onClose }: {
  days: AlmanacResult["upcoming"];
  index: number;
  onIndex: (i: number) => void;
  place: string;
  issued: Date;
  storm: StormSignal | null;
  onClose: () => void;
}) {
  const { unit } = useUnits();
  const box = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const day = days[index];
  const today = new Date().toLocaleDateString("en-CA");
  const text = zoneForecast({ days, index, unit, place, issued, today, storm });

  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < days.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose, onIndex, index, days.length]);

  async function copy() {
    if (!(await toClipboard(text, "the forecast"))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const step = (to: number, label: string, glyph: string) => (
    <button onClick={() => onIndex(to)} disabled={to < 0 || to >= days.length}
      aria-label={label} title={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-rule text-[18px] text-ink-soft active:bg-band disabled:opacity-30">
      {glyph}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[900] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Forecast for ${day.date}`}
    >
      <div
        ref={box}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-xl overflow-auto rounded-t-xl border border-rule bg-panel p-5 shadow-xl outline-none sm:rounded-xl"
      >
        <div className="flex items-center gap-2">
          <span className="text-[30px] leading-none" aria-hidden="true">{day.sky.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Forecast</div>
            <h2 className="figure text-[20px] font-semibold leading-tight">
              {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </h2>
          </div>
          {step(index - 1, "The day before", "‹")}
          {step(index + 1, "The day after", "›")}
          <button onClick={() => void copy()} title="Copy the forecast" aria-label="Copy the forecast"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-rule text-ink-soft active:bg-band">
            {copied
              ? <span className="text-[16px] text-growth" aria-hidden="true">✓</span>
              : <Glyph path={ICON.copy} size={20} />}
          </button>
          <button onClick={onClose} aria-label="Close"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[18px] text-ink-soft active:text-ink">×</button>
        </div>
        <pre className="data mt-4 whitespace-pre-wrap break-words rounded border border-rule bg-paper p-3.5 text-[12.5px] leading-relaxed">
          {text}
        </pre>
      </div>
    </div>
  );
}
