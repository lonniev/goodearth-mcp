// Dollars, as a card prints them.
//
// The only money this app showed was sats, and sats are a count. The array's
// cost and income are in the currency the sources publish in — DOE's
// benchmark and EIA's tariff are both US dollars — so the formatting is
// en-US whatever the reader's locale, the way the figure would read on the
// source's own page.

const WHOLE = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/// `usd(74976)` → "$74,976"; `usd(18.9, 2)` → "$18.90".
export function usd(n: number, digits: 0 | 2 = 0): string {
  return (digits === 2 ? CENTS : WHOLE).format(n);
}

/// A screening estimate carries no more than its sources do: three
/// significant figures, so $74,976 reads as $75,000.
export function roughly(n: number, figures = 3): number {
  if (n === 0 || !Number.isFinite(n)) return n;
  const scale = 10 ** (Math.floor(Math.log10(Math.abs(n))) - figures + 1);
  return Math.round(n / scale) * scale;
}
