// Degrees, in the unit the reader asked for.
//
// The wire is Fahrenheit end to end: the service validates base temperatures
// as °F, the archives are read as °F, and every stored threshold is a °F
// figure. That does not change. This converts at the last moment, on the way
// to the screen and back from a keyboard, so nothing in the record depends on
// what someone toggled on a tablet.
//
// Two conversions, not one, and confusing them is the whole hazard here:
//
//   a TEMPERATURE is a point on the scale       50 °F → 10 °C    (f - 32) × 5/9
//   a DEGREE-DAY is an INTERVAL on it       1000 GDD°F → 556 GDD°C      f × 5/9
//
// A growing degree day is an accumulated *difference* between the day's mean
// and a base, so it carries no offset. Running it through the temperature
// conversion would report a season 18 degree-days short on every 1000 — which
// is why these are separate functions with separate names.

export type Unit = "F" | "C";

/// A temperature, converted for display. Fahrenheit in, always.
export function temp(f: number, unit: Unit): number {
  return unit === "C" ? (f - 32) * (5 / 9) : f;
}

/// A temperature typed by a person, converted back to the °F the record keeps.
export function toF(value: number, unit: Unit): number {
  return unit === "C" ? value * (9 / 5) + 32 : value;
}

/// A degree-day total or a threshold: an interval, so no offset.
export function degreeDays(gddF: number, unit: Unit): number {
  return unit === "C" ? gddF * (5 / 9) : gddF;
}

/// A degree-day figure typed by a person, back to the °F the record keeps.
/// The interval's inverse — `toF` would add 32 to a threshold.
export function ddToF(value: number, unit: Unit): number {
  return unit === "C" ? value * (9 / 5) : value;
}

/// The suffix for a temperature. Non-breaking space: "50 °F" must not wrap.
export function tempUnit(unit: Unit): string {
  return unit === "C" ? " °C" : " °F";
}

/// The suffix for an accumulation. GDD is unit-bearing and usually written
/// without saying so, which is fine while everyone means Fahrenheit and
/// misleading the moment they do not.
export function ddUnit(unit: Unit): string {
  return unit === "C" ? " GDD°C" : " GDD";
}

/// A rounded temperature with its suffix — the common case, in one call.
export function showTemp(f: number, unit: Unit, digits = 0): string {
  return `${temp(f, unit).toFixed(digits)}${tempUnit(unit)}`;
}

/// A rounded accumulation with its suffix, thousands separated.
export function showDD(gddF: number, unit: Unit, digits = 0): string {
  const v = degreeDays(gddF, unit);
  return `${v.toLocaleString(undefined, {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  })}${ddUnit(unit)}`;
}
