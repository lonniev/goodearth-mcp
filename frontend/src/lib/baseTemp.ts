// A base temperature, as the service will take one.
//
// The bounds are the server's (`season.MIN_BASE_F` / `MAX_BASE_F`, and the same
// 20–80 °F in every model that reads a base). Stated here so the form refuses
// what the record would refuse — in the grower's own scale, before a paid call
// comes back with an error in Fahrenheit.

export const MIN_BASE_F = 20;
export const MAX_BASE_F = 80;

/// What the page needs from the units context.
export interface Scale {
  temp: (f: number) => number;
  toF: (x: number) => number;
  tempUnit: string;
}

/// The bounds in the reader's scale, rounded inward so both ends are legal.
export function baseBounds(u: Scale): { min: number; max: number } {
  return { min: Math.ceil(u.temp(MIN_BASE_F)), max: Math.floor(u.temp(MAX_BASE_F)) };
}

/// Blank is allowed and means "use the plot's base". Anything else must be a
/// number, and a temperature the service accepts.
export function parseBase(raw: string, u: Scale): { f?: number; error?: string } {
  const t = raw.trim();
  if (!t) return {};
  const { min, max } = baseBounds(u);
  const range = `${min}–${max}${u.tempUnit}`;
  const n = Number(t);
  if (!Number.isFinite(n)) return { error: `Base must be a temperature, ${range}.` };
  const f = u.toF(n);
  if (f < MIN_BASE_F - 1e-9 || f > MAX_BASE_F + 1e-9) {
    return { error: `Base must be between ${range}.` };
  }
  return { f };
}
