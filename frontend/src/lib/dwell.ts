// How long a popup stays up before it leaves by itself.
//
// Every transient thing on the page must go away on its own — the chart's
// gesture hint stuck on an iPad because the only way out was a tap the iPad
// dropped. But an (i) that vanishes mid-sentence is its own failure, so the
// time follows the text: a few seconds to find it, and a steady reading pace
// after that, between a floor and a ceiling.

export const DWELL_MIN_MS = 8000;
export const DWELL_MAX_MS = 20000;

/// About 240 words a minute, plus three seconds to look.
export function dwellMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(DWELL_MAX_MS, Math.max(DWELL_MIN_MS, 3000 + words * 250));
}
