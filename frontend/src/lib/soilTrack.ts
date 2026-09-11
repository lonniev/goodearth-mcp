// The soil question, laid out on a line.
//
// Two paragraphs used to answer it: what the soil reads now and whether it
// crosses inside the forecast, then when it normally crosses and how many days
// that is. Both are the same shape of fact — a date somewhere ahead of today —
// and a reader comparing two dates in prose is doing by counting what a line
// does by looking.
//
// The arithmetic is here rather than in the component because "the normal
// window sits past the end of the forecast" is a claim about numbers, and in
// an SVG it could only be checked by eye.

import { dayNumber, isDate } from "./seasonDays.ts";

export interface SoilMark {
  /// Day number from `origin`.
  day: number;
  date: string;
}

export interface SoilTrack {
  origin: string;
  /// Domain in days from the origin, inclusive.
  lo: number;
  hi: number;
  /// The forecast series, as day/temperature pairs.
  forecast: { day: number; f: number }[];
  /// Where the forecast stops — everything right of this is history, not a
  /// reading, and the drawing says so.
  horizon: number | null;
  /// Where the soil crosses inside the forecast, when it does at all.
  crossing: SoilMark | null;
  /// The normal window: earliest, median, latest.
  typical: { earliest: SoilMark; median: SoilMark; latest: SoilMark } | null;
  /// Temperature bounds for the forecast line, padded.
  loF: number;
  hiF: number;
}

interface Input {
  as_of: string;
  threshold_f: number;
  current_soil_f: number | null;
  near_term: {
    days: { date: string; soil_f: number | null }[];
    crossing_date: string | null;
  } | null;
  typical: { median: string; earliest: string; latest: string } | null;
}

const PAD_DAYS = 2;

export function soilTrack(data: Input): SoilTrack | null {
  const days = data.near_term?.days ?? [];
  const origin = days.find((d) => isDate(d.date))?.date ?? data.as_of;
  if (!isDate(origin)) return null;

  const at = (iso: string): SoilMark | null => {
    const day = dayNumber(iso, origin);
    return day == null ? null : { day, date: iso };
  };

  const forecast = days
    .filter((d) => isDate(d.date) && typeof d.soil_f === "number")
    .map((d) => ({ day: dayNumber(d.date, origin)!, f: d.soil_f as number }));

  const t = data.typical;
  const typical = t
    ? (() => {
        const earliest = at(t.earliest), median = at(t.median), latest = at(t.latest);
        return earliest && median && latest ? { earliest, median, latest } : null;
      })()
    : null;

  // The domain has to hold BOTH, and the whole point of the picture is that
  // the normal window usually sits past the end of the forecast. Fitting it to
  // the forecast alone would crop off the answer.
  const marks = [
    ...forecast.map((f) => f.day),
    ...(typical ? [typical.earliest.day, typical.median.day, typical.latest.day] : []),
  ];
  if (!marks.length) return null;

  const temps = forecast.map((f) => f.f);
  if (data.current_soil_f != null) temps.push(data.current_soil_f);
  temps.push(data.threshold_f);
  const spanF = Math.max(...temps) - Math.min(...temps);
  // A flat fortnight is a real answer, not a missing one — pad it so the line
  // sits mid-box rather than pinned to an edge.
  const padF = Math.max(spanF * 0.15, 2);

  return {
    origin,
    lo: Math.min(0, ...marks) - PAD_DAYS,
    hi: Math.max(...marks) + PAD_DAYS,
    forecast,
    horizon: forecast.length ? forecast[forecast.length - 1].day : null,
    crossing: data.near_term?.crossing_date ? at(data.near_term.crossing_date) : null,
    typical,
    loF: Math.min(...temps) - padF,
    hiF: Math.max(...temps) + padF,
  };
}
