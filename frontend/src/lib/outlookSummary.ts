// The next ten days against the last ten seasons, in words.
//
// Every number here is already on the page — the almanac fetch carries the
// forecast and the normal band together — so this costs nothing and asks
// nothing. It is arithmetic over what the grower has already paid for.
//
// It states measurements and their departure from normal, and stops there. It
// does not say what to do about them: Good Earth computes against your ground
// and does not publish agronomy, so "4 °F above normal" is the sentence and
// "so sow early" is not.

import type { AlmanacResult, Measure, MeasureKey } from "./mcp.ts";

/// Measures worth a sentence, in the order a grower would read them. Day
/// length is omitted deliberately — it is astronomy, identical every year, and
/// "normal" is not a useful frame for it.
const SPOKEN: { key: MeasureKey; label: string; decimals: number }[] = [
  { key: "temp_max", label: "Daily high", decimals: 0 },
  { key: "temp_min", label: "Daily low", decimals: 0 },
  { key: "dew_point", label: "Dew point", decimals: 0 },
  { key: "precip", label: "Rain", decimals: 2 },
  { key: "sunshine", label: "Sunshine", decimals: 1 },
  { key: "wind_max", label: "Wind", decimals: 0 },
];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/// A number, or null. Guards the `null` holes the series legitimately carries
/// — a day upstream could not report is not a zero.
const nums = (xs: (number | null)[] | undefined) =>
  (xs ?? []).filter((v): v is number => typeof v === "number");

export interface Line {
  label: string;
  forecast: number;
  normal: number;
  delta: number;
  unit: string;
  decimals: number;
}

/// Compare the forecast window against the same window's normal.
///
/// The normal band runs across the whole domain — season so far AND forecast —
/// so the forecast's normal is its TAIL, not the season's average. Comparing
/// ten October days against a March-to-October mean would report a cold snap
/// every autumn.
export function compareOutlook(data: AlmanacResult): Line[] {
  const days = (data.forecast_dates ?? []).length;
  if (!days) return [];

  const out: Line[] = [];
  for (const { key, label, decimals } of SPOKEN) {
    const m: Measure | undefined = data.measures?.[key];
    if (!m) continue;

    const fc = nums(m.forecast);
    if (!fc.length) continue;

    const band = m.normal ?? [];
    const tail = band.slice(-days);
    const normals = tail.map((b) => b?.mean).filter((v): v is number => typeof v === "number");
    if (!normals.length) continue;

    // Rain and sunshine accumulate: what matters over ten days is the TOTAL,
    // not the daily average. Reporting "0.08 in" for a wet fortnight would be
    // true of a day and wrong about the period.
    const f = m.accumulates ? fc.reduce((a, b) => a + b, 0) : mean(fc);
    const n = m.accumulates
      ? normals.reduce((a, b) => a + b, 0) * (fc.length / normals.length)
      : mean(normals);

    out.push({ label, forecast: f, normal: n, delta: f - n, unit: m.unit, decimals });
  }
  return out;
}

/// How a departure reads in words. "About normal" needs a threshold, and the
/// threshold has to be per-unit: 1 °F is nothing, 1 inch of rain in ten days
/// is a great deal.
function departure(l: Line): string {
  const scale = Math.max(Math.abs(l.normal) * 0.08, l.decimals === 2 ? 0.15 : 1);
  const d = l.delta;
  if (Math.abs(d) < scale) return "about normal";
  const size = Math.abs(d) > scale * 3 ? "well " : "";
  return `${size}${d > 0 ? "above" : "below"} normal by ${Math.abs(d).toFixed(l.decimals)} ${l.unit}`;
}

/// The whole thing as plain text, ready to paste into a note or an email.
export function outlookText(data: AlmanacResult, place: string): string {
  const lines = compareOutlook(data);
  const days = (data.forecast_dates ?? []).length;
  const span = data.normals_span_years ?? 0;
  if (!lines.length) return `No outlook available for ${place}.`;

  const head = `${place} — next ${days} days against the last ${span} seasons`;
  const body = lines.map((l) => {
    const what = l.forecast.toFixed(l.decimals);
    const norm = l.normal.toFixed(l.decimals);
    const total = /rain|sunshine/i.test(l.label) ? " total" : " average";
    return `${l.label}: ${what} ${l.unit}${total}, ${departure(l)} (normally ${norm} ${l.unit}).`;
  });

  return [
    head,
    "=".repeat(head.length),
    "",
    ...body,
    "",
    // Say where it came from and what it is not. A number pasted into an email
    // outlives the page that explained it.
    `Computed by Good Earth from the forecast and the ${span}-season record for `
      + `this ground. Measurements only — no recommendation is implied.`,
  ].join("\n");
}
