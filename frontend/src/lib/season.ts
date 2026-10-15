// Which season it is on the plot being worked, for the theme that follows it.
//
// Meteorological rather than astronomical: seasons here start on the first of
// the month, because a page that changed its colours at 21:03 on an equinox
// would be a party trick.
//
// The plot decides, not the device. A grower with a plot in Maine and one in
// Hawaii sees autumn on one and the tropics' one long summer on the other;
// south of the equator the months turn round, and October is spring.

export type Season = "spring" | "summer" | "autumn" | "winter";

export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];

/// Inside the tropics the year has no winter to paint; it keeps summer.
export const TROPIC_DEG = 23.44;

/// The season a date falls in on ground at `lat`. North of the equator
/// March–May is spring, June–August summer, September–November autumn and
/// winter the rest; south of it the same months six apart.
export function seasonOf(d: Date = new Date(), lat = 45): Season {
  if (Math.abs(lat) < TROPIC_DEG) return "summer";
  const m = (d.getMonth() + (lat < 0 ? 6 : 0)) % 12;   // 0 = a northern January
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "autumn";
  return "winter";
}
