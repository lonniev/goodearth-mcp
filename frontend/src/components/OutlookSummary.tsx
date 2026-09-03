// The ten-day outlook against the decade, as text a grower can take away.
//
// A chart answers "how is it trending"; a sentence answers "what do I tell the
// crew". Both come from the same numbers, and those numbers are already on the
// page — so this costs nothing and asks the service for nothing.
//
// It reports measurements and their departure from normal, and stops. Good
// Earth computes against your ground and does not publish agronomy: "4 °F
// above normal" is the sentence, "so sow early" is not.

import { useEffect, useRef, useState } from "react";
import type { AlmanacResult } from "../lib/mcp";
import { compareOutlook, outlookText } from "../lib/outlookSummary";

export default function OutlookSummary({ data, place, onClose }: {
  data: AlmanacResult;
  place: string;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const lines = compareOutlook(data);
  const text = outlookText(data, place);

  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // A clipboard write can be refused — an insecure context, a browser that
      // wants a fresher gesture. Say so rather than showing a tick that lies;
      // the text is on screen and can be selected by hand.
      setCopied(false);
      window.prompt("Copy the outlook:", text);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[900] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Ten-day outlook against the record"
    >
      <div
        ref={box}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-lg overflow-auto rounded-t-xl border border-rule bg-panel p-5 shadow-xl outline-none sm:rounded-xl"
      >
        <div className="flex items-start gap-3">
          <span className="text-[30px] leading-none">🔭</span>
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Next {data.forecast_dates?.length ?? 0} days</div>
            <h2 className="figure text-[20px] font-semibold leading-tight">
              Against the last {data.normals_span_years ?? 0} seasons
            </h2>
          </div>
          <button onClick={copy} title="Copy this summary" aria-label="Copy this summary"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-rule text-ink-soft active:bg-band">
            {copied ? (
              <span className="text-[16px] text-growth" aria-hidden="true">✓</span>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m0 16H8V7h11z" />
              </svg>
            )}
          </button>
          <button onClick={onClose} aria-label="Close"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[18px] text-ink-soft active:text-ink">×</button>
        </div>

        {lines.length ? (
          <table className="mt-4 w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["", "Ahead", "Normal", ""].map((h, i) => (
                  <th key={i} className="data border-b-[1.5px] border-ink px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-[.1em] text-ink-soft">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                // The threshold is per-unit: 1 °F is nothing, an inch of rain
                // over ten days is a great deal.
                const scale = Math.max(Math.abs(l.normal) * 0.08, l.decimals === 2 ? 0.15 : 1);
                const flat = Math.abs(l.delta) < scale;
                return (
                  <tr key={l.label} className="border-b border-rule last:border-b-0">
                    <td className="px-2 py-2 font-medium">{l.label}</td>
                    <td className="data px-2 py-2 whitespace-nowrap">
                      {l.forecast.toFixed(l.decimals)} {l.unit}
                    </td>
                    <td className="data px-2 py-2 whitespace-nowrap text-ink-soft">
                      {l.normal.toFixed(l.decimals)} {l.unit}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        flat ? "bg-band text-ink-soft"
                          : l.delta > 0 ? "bg-honey/20 text-honey" : "bg-frost/15 text-frost"
                      }`}>
                        {flat ? "about normal"
                          : `${l.delta > 0 ? "+" : "−"}${Math.abs(l.delta).toFixed(l.decimals)}`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-[13px] text-ink-soft">
            There is no forecast to compare yet.
          </p>
        )}

        <p className="mt-3 text-[11.5px] text-ink-soft">
          Measurements only. What they mean for your ground is yours to judge.
        </p>
      </div>
    </div>
  );
}
