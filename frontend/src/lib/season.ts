// Which season it is, for the theme that follows the calendar.
//
// Meteorological rather than astronomical: seasons here start on the first of
// the month, because a page that changed its colours at 21:03 on an equinox
// would be a party trick. Northern hemisphere — this service reads USA-NPN
// and Daymet, both of which stop at North America, so pretending otherwise
// would be a courtesy to nobody who can use it.

export type Season = "spring" | "summer" | "autumn" | "winter";

export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];

/// The season a date falls in. March–May, June–August, September–November,
/// then winter takes the rest.
export function seasonOf(d: Date = new Date()): Season {
  const m = d.getMonth();           // 0 = January
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "autumn";
  return "winter";
}
