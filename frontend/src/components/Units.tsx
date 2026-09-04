// Which scale this browser reads degrees in.
//
// Context rather than a prop, because the answer is needed at the leaves —
// a stage chip, a base temperature under a pest's name, an axis label — and
// threading it through Pests → table → row → chip would put a `unit` in the
// signature of every component between here and there, none of which cares.
//
// The conversions themselves live in lib/units.ts and are pure, so they stay
// testable under the node runner; this only carries the choice.

import { createContext, useContext } from "react";
import type { Unit } from "../lib/units";
import {
  ddToF, ddUnit, degreeDays, showDD, showTemp, temp, tempUnit, toF,
} from "../lib/units";

const UnitCtx = createContext<Unit>("F");

export const UnitProvider = UnitCtx.Provider;

/// The unit, and the conversions already bound to it.
///
/// Bound rather than raw so a call site cannot pass the wrong unit — the one
/// failure this whole module exists to prevent is a degree-day run through
/// the temperature conversion, and a bound helper has no argument to get
/// wrong.
export function useUnits() {
  const unit = useContext(UnitCtx);
  return {
    unit,
    /// A temperature for the screen, with its suffix. "50 °F" / "10 °C".
    showTemp: (f: number, digits?: number) => showTemp(f, unit, digits),
    /// An accumulation for the screen, with its suffix.
    showDD: (gddF: number, digits?: number) => showDD(gddF, unit, digits),
    /// A bare converted temperature, for a chart axis that labels itself.
    temp: (f: number) => temp(f, unit),
    /// A bare converted accumulation.
    degreeDays: (gddF: number) => degreeDays(gddF, unit),
    /// What a person typed, back in the °F the record keeps.
    toF: (value: number) => toF(value, unit),
    /// The same, for a degree-day figure — no offset. Separate from `toF`
    /// because adding 32 to a threshold is the exact mistake to prevent.
    ddToF: (value: number) => ddToF(value, unit),
    tempUnit: tempUnit(unit),
    ddUnit: ddUnit(unit),
  };
}
