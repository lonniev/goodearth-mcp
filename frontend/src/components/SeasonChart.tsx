// The season heat curve — the Heat Ledger's centrepiece.
//
// Geometry follows frontend/design/heat-ledger-mock.html: normals band behind,
// the actual mean in accrual green, a spread ribbon showing the range across
// the region's ground, the forecast dashed, the projection dotted, the frost
// line in frost blue.
//
// Both axes zoom independently (useChartZoom). Y zoom earns its keep here: the
// spread ribbon is often a couple of percent of a 2,400-GDD axis and is nearly
// invisible at full scale, but it is the whole product — so the reader needs to
// be able to open it up.
//
// Every series comes from goodearth_gdd_season_curve. Nothing is synthesised:
// where the server returned no band or forecast, that element is absent rather
// than guessed at.

import { useUnits } from "./Units";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SeasonCurveResult } from "../lib/mcp";
import type { LedgerFlag } from "../lib/ledgerFlags";
import { placeLabels } from "../lib/labelPlacement";
import { dateFor, dayNumber, timelineDomain } from "../lib/seasonDays";
import { seasonBounds } from "../lib/meteoSeason";
import { SEASON_ICON } from "../lib/seasonIcon";
import { useChartFrame } from "./ui";
import { regionImageUrl } from "../lib/basemapImage";
import { DEFAULT_SPAN, useChartZoom, windowToDomain } from "../lib/useChartZoom";
import { spanTarget } from "../lib/chartSpan";
import ZoomControls, { AxisZoom } from "./ZoomControls";
import GestureHint from "./GestureHint";
import { dateTicks, labelFits } from "../lib/dateTicks";

const W = 740, L = 46, R = 716, T = 16;

/// The box's height, and with it the plot's.
///
/// The viewBox aspect is fixed, so `w-full` in a full-screen frame made the
/// chart wider and — proportionally — taller, leaving most of a tall screen
/// as margin. A taller box spends that height on the plot instead. The extra
/// goes to the GDD axis, which is the one the spread ribbon lives on.
// Grew with the space the gesture hint and the flag note gave back. The plot
// is the only thing on this card anybody came to look at, so a row removed
// from around it belongs to it.
const H_INLINE = 300;
/// Bounds on the measured full-screen height. The floor is the inline box —
/// full screen must never make the plot SHORTER — and the ceiling stops a very
/// tall window from stretching the curve into a wall.
const H_FULL_MIN = H_INLINE, H_FULL_MAX = 900;
/// Room under the plot for the date axis, in either box.
const AXIS_H = 36;

// SVG <text> does not wrap — it runs off the plot and over whatever is there.
// So labels are broken into tspans here, on whole words, with a hard split for
// a word longer than the line so nothing can escape.
const FLAG_CHARS = 17;
const FLAG_LINES = 2;

/// The label's rendered width, used to decide which side of the stem it sits
/// on and how big its tap target is. Monospace, so this is exact.
function w0(f: { label: string }): number {
  return wrapLabel(f.label).reduce((m, l) => Math.max(m, l.length), 0) * 5.7 + 10;
}

function wrapLabel(text: string, width = FLAG_CHARS, max = FLAG_LINES): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) {
      cur = w.length > width ? w.slice(0, width - 1) + "-" : w;
      if (w.length > width) { lines.push(cur); cur = w.slice(width - 1); }
      continue;
    }
    if ((cur + " " + w).length <= width) cur += " " + w;
    else { lines.push(cur); cur = w; }
    if (lines.length >= max) break;
  }
  if (cur && lines.length < max) lines.push(cur);
  if (lines.length > max) lines.length = max;
  // Mark truncation on the last line rather than silently dropping words.
  const used = lines.join(" ").replace(/-$/, "").length;
  if (used < text.replace(/\s+/g, " ").length - 1) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] =
      last.length > width - 1 ? last.slice(0, width - 1) + "…" : last + "…";
  }
  return lines;
}

interface Props {
  data: SeasonCurveResult;
  /// Median first frost as a day-index into the curve, when known (T2).
  frostDayIndex?: number | null;
  /// The grower's own model events, placed on the curve. Derived client-side
  /// from thresholds already on the page, so they cost nothing to show.
  flags?: LedgerFlag[];
  /// Tapping a flag opens its detail. Without a handler flags stay inert.
  onFlag?: (f: LedgerFlag) => void;
  /// Ghost the block's own satellite still behind the plot.
  showGround?: boolean;
  /// One weather series drawn behind the curve on its own scale.
  overlay?: {
    key: string;
    label: string;
    emoji: string;
    unit: string;
    /// Aligned to the curve's own day axis: recorded days then forecast.
    values: (number | null)[];
    colour: string;
    /// Rain reads as bars; everything else as a line.
    asBars?: boolean;
  } | null;
}

function niceStep(span: number): number {
  const raw = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
}

export default function SeasonChart({
  data, frostDayIndex = null, flags = [], onFlag, showGround = true, overlay = null,
}: Props) {
  const u = useUnits();
  // Full screen gets a taller box, so the height it buys is spent on the plot
  // rather than on margin above and below it.
  //
  // MEASURED, not chosen. A fixed full-screen height was 885 px tall on a
  // 834 px iPad — the plot alone was bigger than the window, so the span
  // buttons under it were pushed off the bottom and the frame had to scroll.
  // A number that fits one screen is wrong on every other one.
  const { full, slotH } = useChartFrame();
  const shell = useRef<HTMLDivElement | null>(null);
  const [fullH, setFullH] = useState(H_INLINE);
  const H = full ? fullH : H_INLINE;
  const B = H - AXIS_H;
  // The drag gutter has to follow the plot. Left at its 268-box default it
  // would sit inside a full-screen plot, and a drag beginning on the curve
  // would scale the date axis instead of panning.
  const { zoom, zoomX, zoomY, reset, showSpan, isZoomed, svgRef } =
    useChartZoom({ plotBottom: B / H });
  const [span, setSpan] = useState<string | null>(DEFAULT_SPAN);
  const clipId = "ge-plot-clip";
  const ground = showGround && data.region?.bbox ? regionImageUrl(data.region.bbox) : null;

  const view = useMemo(() => {
    const mean = data.curve?.cumulative_mean ?? [];
    const dates = data.curve?.dates ?? [];
    if (mean.length < 2) return null;

    const fc = data.forecast?.cumulative ?? [];
    const proj = data.projection?.cumulative ?? [];
    const band = data.normals?.band ?? [];
    const spread = data.accumulated_gdd;

    const totalDays = mean.length + fc.length + proj.length;
    // Day zero of the timeline. Every date on this chart is measured from here.
    const origin = dates[0] ?? data.season_start ?? "";
    const gFull = Math.max(...mean, ...fc, ...proj, ...band.map((b) => b.max), 1);

    // Where a mark sits on the timeline.
    //
    // A stated date resolves through dayNumber, which works for ANY date —
    // including one outside the plotted series, which is the whole point of a
    // timeline. A computed crossing keeps its fractional index instead: for a
    // contiguous daily series that IS the day number, only carrying the
    // sub-day precision that `indexAt` interpolated and a rounded date throws
    // away. Same quantity, better resolution.
    const dayOf = (f: LedgerFlag): number => {
      if (f.anchor === "heat") return f.index;
      const d = f.begin ? dayNumber(f.begin, origin) : null;
      return d ?? f.index;
    };
    const endDayOf = (f: LedgerFlag): number | null => {
      if (f.endIndex != null) return f.endIndex;
      return f.end ? dayNumber(f.end, origin) : null;
    };

    // The timeline is as long as it needs to be to hold everything on it.
    //
    // The curve occupies days 0..totalDays-1, but a task dated next January is
    // still a real day and belongs somewhere. So the domain is the union of
    // the series and every mark, padded a little so an edge mark is not
    // clipped in half. When nothing falls outside the curve — the ordinary
    // case — this is exactly the old domain and nothing moves.
    const seriesHi = Math.max(totalDays - 1, 1);
    const { lo: domLo, hi: domHi, extended } = timelineDomain(
      seriesHi,
      flags.flatMap((f) => [dayOf(f), endDayOf(f)]),
    );

    // Domain windows after zoom. The zoom window is a FRACTION of whatever
    // bounds it is given, so lengthening the domain rescales every fraction —
    // which is why the span buttons and the reset below are expressed in days
    // against this same span rather than against the array length.
    const [dLo, dHi] = windowToDomain(zoom.x, domLo, domHi);
    const [gLo, gHi] = windowToDomain(zoom.y, 0, gFull * 1.04);

    const x = (d: number) => L + ((d - dLo) * (R - L)) / Math.max(dHi - dLo, 1e-6);
    const y = (g: number) => B - ((g - gLo) * (B - T)) / Math.max(gHi - gLo, 1e-6);
    const line = (pts: [number, number][]) =>
      pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");

    // Label placement is geometry, so it is resolved here with the scales
    // rather than inside the render loop, where each flag could only see
    // itself. Flags outside the zoom window are excluded so an off-screen
    // label cannot push a visible one around.
    const flagItems = flags.map((f) => ({
      cx: x(dayOf(f)),
      cy: f.gdd != null ? y(f.gdd) : B - 8,
      lines: wrapLabel(f.label),
    }));
    // IBM Plex Mono at 9.5px, so a character really is 0.6em wide and the
    // width estimate is exact rather than a guess.
    const placement = placeLabels(flagItems, {
      left: L, right: R, top: T, charW: 9.5 * 0.6, lineH: 10,
    });

    let bandPath = "";
    if (band.length > 1) {
      const n = Math.min(band.length, mean.length);
      const up = band.slice(0, n).map((b, i) => `${x(i).toFixed(1)} ${y(b.max).toFixed(1)}`);
      const dn = band.slice(0, n).reverse().map((b, i) =>
        `${x(n - 1 - i).toFixed(1)} ${y(b.min).toFixed(1)}`);
      bandPath = `M${up.join(" L")} L${dn.join(" L")} Z`;
    }

    // The spread ribbon: min/max ground scaled along the curve's own shape.
    let ribbon = "";
    if (spread && spread.spread > 0 && spread.mean > 0) {
      const lo = spread.min / spread.mean, hi = spread.max / spread.mean;
      const up = mean.map((g, i) => `${x(i).toFixed(1)} ${y(g * hi).toFixed(1)}`);
      const dn = [...mean].reverse().map((g, i) =>
        `${x(mean.length - 1 - i).toFixed(1)} ${y(g * lo).toFixed(1)}`);
      ribbon = `M${up.join(" L")} L${dn.join(" L")} Z`;
    }

    const actual: [number, number][] = mean.map((g, i) => [i, g]);
    const last = mean.length - 1;
    const fcPts: [number, number][] = fc.length
      ? [[last, mean[last]], ...fc.map((g, i) => [last + 1 + i, g] as [number, number])] : [];
    const projStart = fcPts.length ? fcPts[fcPts.length - 1] : ([last, mean[last]] as [number, number]);
    const projPts: [number, number][] = proj.length
      ? [projStart, ...proj.map((g, i) => [projStart[0] + 1 + i, g] as [number, number])] : [];

    // Months, then weeks, then days, chosen by how much is on screen — the
    // same scale the Almanac's charts use, so one axis is learned once.
    //
    // Walked in DAYS across the visible window rather than over the recorded
    // dates: the forecast and projection thirds carried no labels when it
    // iterated `curve.dates`, and a timeline reaching past the curve would be
    // an unlabelled void out there, which is no use to scroll into.
    const ticks = dateTicks(dLo, dHi, (d) => dateFor(d, origin) || null);

    const step = niceStep(gHi - gLo);
    const gridLines: number[] = [];
    for (let g = Math.ceil(gLo / step) * step; g <= gHi; g += step) gridLines.push(Math.round(g));

    return { x, y, line, bandPath, ribbon, actual, fcPts, projPts, ticks, gridLines, last, mean, totalDays, placement, dayOf, endDayOf, domLo, domHi, seriesHi, extended, origin };
  }, [data, zoom, flags, B]);

  if (!view) {
    return (
      <div className="rounded-md border border-rule bg-panel p-6 text-sm text-ink-soft">
        Not enough of the season on record yet to draw a curve.
      </div>
    );
  }

  /// Move the window to a named span.
  ///
  /// Three kinds, and only one of them is a plain day count:
  ///
  ///   * **annual** — the whole timeline, however far a dated task stretches
  ///     it. This is what the button labelled "Season" used to do.
  ///   * **season** — the METEOROLOGICAL quarter today falls in, centred on
  ///     the quarter rather than on today, because a season has its own middle
  ///     and sliding it to sit under the reader would show half of it.
  ///   * anything else — that many days, centred on today, which is where the
  ///     reader is standing.
  ///
  /// Every day count is measured against the DOMAIN's length, never the
  /// array's. `showSpan` turns days into a fraction of the total it is handed,
  /// so handing it the series length while the domain reaches into next
  /// January would make each button lie by the ratio between them — "Week"
  /// quietly showing a fortnight is a wrong reading that looks right.
  const goToSpan = useCallback((key: string) => {
    if (!view) return;
    setSpan(key);
    const t = spanTarget(key, {
      today: view.last, origin: view.origin, domLo: view.domLo, domHi: view.domHi,
    });
    if (t === "full") { reset(); return; }
    showSpan(t.days, view.domHi - view.domLo + 1, t.anchor);
  }, [view, showSpan, reset]);

  /// The opening view: a fortnight with today in the middle of it.
  ///
  /// It used to open on the recorded season, and only when a dated task had
  /// stretched the timeline past it. A grower opening the page is asking what
  /// to do this week; the year is one tap away on Annual.
  ///
  /// Runs once per domain change and only while the reader has not zoomed —
  /// panning somewhere and being yanked back would be worse than opening in
  /// the wrong place.
  const domainKey = view ? `${view.domLo}:${view.domHi}` : "";
  useEffect(() => {
    if (!view || isZoomed) return;
    goToSpan(DEFAULT_SPAN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainKey]);

  /// How tall the plot can be and still leave its own controls on screen.
  ///
  /// Everything in this card that is NOT the plot — the span buttons, the
  /// hint line, the legend — plus whatever the frame put above it, is already
  /// laid out and none of it depends on the plot's height. So the space left
  /// over is a straight subtraction, and it converges in one pass rather than
  /// chasing itself.
  useLayoutEffect(() => {
    if (!full || slotH <= 0) { setFullH(H_INLINE); return; }
    const card = shell.current, svg = svgRef.current;
    if (!card || !svg) return;
    const plot = svg.getBoundingClientRect();
    // Everything in this card that is NOT the plot — the span buttons, the
    // legend, the card's own padding. None of it depends on the plot's
    // height, so this is a straight subtraction from the height the FRAME
    // measured, and it settles in one pass. Deriving the space from the
    // card's own position instead is what left 80 px of slack: the card is
    // centred, so its top moved with its height, which moved with the plot.
    const avail = slotH - (card.scrollHeight - plot.height) - 6;
    if (plot.width > 0 && avail > 140) {
      setFullH(Math.max(H_FULL_MIN,
        Math.min(H_FULL_MAX, Math.round((W * avail) / plot.width))));
    }
  }, [full, slotH, svgRef]);

  const { x, y, line, bandPath, ribbon, actual, fcPts, projPts, ticks, gridLines, last, mean, placement, dayOf, endDayOf, origin } = view;
  const todayGdd = mean[last];
  /// The meteorological quarter the curve's last recorded day falls in — the
  /// name on the Season button, and the window it opens.
  const thisSeason = seasonBounds(dateFor(last, origin) ?? "");

  return (
    <div ref={shell} className={`overflow-x-auto rounded-md border border-rule bg-panel ${
      full ? "px-1 pt-1 pb-0" : "px-2.5 pt-3.5 pb-2"}`}>
      {/* The degree-day control sits beside the degree-day axis. This is the
          one chart in the app that actually plots GDD, which is why the shared
          row could not go on calling its vertical button "GDD".
          Spelled out, because the column has the height for it and "GDD" is
          an abbreviation a first-time grower has to look up. */}
      <div className="flex items-stretch">
      <AxisZoom onZoom={zoomY} label="Grow Degree Days" short={u.ddUnit.trim()} />
      {/* One column, so the key lands under the PLOT rather than under the
          card. The gutters match the svg's own L and R as percentages of its
          box, which is what makes "10-season range" sit above "Sun 6" instead
          of above the degree-day axis. */}
      <div className="min-w-[560px] flex-1">
      <GestureHint isZoomed={isZoomed}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`ge-chart block h-auto w-full min-w-[560px] touch-none select-none ${isZoomed ? "cursor-grab" : ""}`}
        role="img"
        aria-label={`Cumulative growing degree days, base ${data.base_temp_f} degrees Fahrenheit, against the ${data.normals?.span_years ?? 0}-season range`}
      >
        {/* Everything data-bearing is clipped to the plot, so a zoomed line
            cannot run out over the axis labels. */}
        <defs>
          <clipPath id={clipId}>
            <rect x={L} y={T} width={R - L} height={B - T} />
          </clipPath>
          {/* Fade the still toward the axis so it never fights the numbers —
              but not so far that it reads as a smudge. The curve is drawn on
              top at full strength, so the image can afford to be seen. */}
          <linearGradient id="ge-ground-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="1" />
            <stop offset="70%" stopColor="#fff" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.35" />
          </linearGradient>
          <mask id="ge-ground-mask">
            <rect x={L} y={T} width={R - L} height={B - T} fill="url(#ge-ground-fade)" />
          </mask>
        </defs>

        {/* The ground this season belongs to, ghosted. On a farm with six
            saved blocks this is orientation, not decoration.
            A paper scrim sits over it so legibility does not depend on how
            bright the satellite happened to find the field that day — a dark
            wood and a bare ploughed field are very different backgrounds. */}
        {ground && (
          <>
            <image href={ground} x={L} y={T} width={R - L} height={B - T}
              preserveAspectRatio="xMidYMid slice" opacity={0.38}
              mask="url(#ge-ground-mask)" aria-hidden="true" />
            <rect x={L} y={T} width={R - L} height={B - T}
              fill="var(--color-paper)" opacity={0.42} aria-hidden="true" />
          </>
        )}

        {gridLines.map((g) => (
          <g key={g}>
            <line x1={L} x2={R} y1={y(g)} y2={y(g)} stroke="var(--color-rule)" strokeWidth={1} strokeDasharray="1 4" />
            <text x={L - 6} y={y(g) + 3} textAnchor="end" fontSize={9.5} fill="var(--color-ink-soft)" fontFamily="var(--font-data)"
              paintOrder="stroke" stroke="var(--color-paper)" strokeWidth={3} strokeLinejoin="round">
              {Math.round(u.degreeDays(g)).toLocaleString()}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {/* Weather sits BEHIND the heat, on its own scale, faint. It is
              context for the curve, not a second subject competing with it —
              which is why it carries no axis of its own beyond a min/max note. */}
          {overlay && (() => {
            const vals = overlay.values.filter((v): v is number => typeof v === "number");
            if (vals.length < 2) return null;
            const lo = Math.min(...vals), hi = Math.max(...vals);
            const span = hi - lo || 1;
            const oy = (v: number) => B - ((v - lo) / span) * (B - T) * 0.55;
            if (overlay.asBars) {
              const w = Math.max(1, (R - L) / Math.max(overlay.values.length, 1) - 0.5);
              return (
                <g opacity={0.5}>
                  {overlay.values.map((v, i) =>
                    typeof v === "number" && v > 0 ? (
                      <rect key={i} x={x(i) - w / 2} y={oy(v)} width={w} height={B - oy(v)}
                        fill={overlay.colour} />
                    ) : null,
                  )}
                </g>
              );
            }
            let d = "", pen = false;
            overlay.values.forEach((v, i) => {
              if (v == null) { pen = false; return; }
              d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${oy(v).toFixed(1)}`;
              pen = true;
            });
            return <path d={d} fill="none" stroke={overlay.colour} strokeWidth={1.8} opacity={0.55} />;
          })()}

          {bandPath && <path d={bandPath} fill="var(--color-band)" />}
          {ribbon && <path d={ribbon} fill="var(--color-growth)" opacity={0.18} />}
          <path d={line(actual)} fill="none" stroke="var(--color-growth)" strokeWidth={3.2} />
          {fcPts.length > 1 && (
            <path d={line(fcPts)} fill="none" stroke="var(--color-growth)" strokeWidth={2.5} strokeDasharray="6 4" />
          )}
          {projPts.length > 1 && (
            <path d={line(projPts)} fill="none" stroke="var(--color-ink-soft)" strokeWidth={1.6} strokeDasharray="2 5" />
          )}
          {frostDayIndex != null && (
            <line x1={x(frostDayIndex)} x2={x(frostDayIndex)} y1={T} y2={B} stroke="var(--color-frost)" strokeWidth={2.2} strokeDasharray="7 4" />
          )}
            {/* The grower's own calendar, on the curve that produces it. The
              dot and stem sit on the day being marked; the label is placed by
              resolving actual collisions, so a crowded stretch spreads upward
              into empty plot rather than stacking on the curve. A flag whose
              threshold is counted from a different base temperature is dimmed
              rather than quietly misplaced. */}
          {flags.map((f, i) => {
            const cx = x(dayOf(f));
            // A bar is only off-screen when BOTH ends are, or a planting that
            // began before the window would vanish while it is still running.
            const endDay = endDayOf(f);
            const ex = endDay != null ? x(endDay) : cx;
            if (Math.max(cx, ex) < L - 4 || Math.min(cx, ex) > R + 4) return null;
            const cy = f.gdd != null ? y(f.gdd) : B - 8;
            const { stem, flip } = placement[i] ?? { stem: 14, flip: false };
            const tone =
              f.kind === "crop" ? "var(--color-growth)"
              : f.kind === "pest" ? "var(--color-honey)"
              // A task is the grower's own hand on the timeline, not a reading
              // off the ground, so it is drawn in the ink colour rather than
              // one of the three that mean "measured".
              : f.kind === "task" ? "var(--color-ink-soft)"
              : "var(--color-frost)";
            return (
              <g key={`${f.label}-${f.index}`}
                opacity={f.baseMismatch ? 0.45 : f.reached ? 1 : 0.75}
                onPointerUp={onFlag ? (e) => { e.stopPropagation(); onFlag(f); } : undefined}
                style={onFlag ? { cursor: "pointer" } : undefined}
                role={onFlag ? "button" : undefined}
                aria-label={onFlag ? `${f.label} — details` : undefined}>
                {/* Two finger targets, not one tall one. The dot is 7px so it
                    cannot hide the curve, and the tap area is 44 — but a single
                    rect spanning the whole stem would now be up to 190px tall
                    and would swallow taps meant for the flags it passes. */}
                {onFlag && (() => {
                  const lw = wrapLabel(f.label).reduce((m, l) => Math.max(m, l.length), 0) * 5.7 + 10;
                  const lh = wrapLabel(f.label).length * 10;
                  const lx = cx + w0(f) > R ? cx - lw : cx;
                  return (
                    <>
                      <rect x={cx - 22} y={cy - 22} width={44} height={44} fill="transparent" />
                      <rect x={lx} y={cy - stem - lh - 4} width={lw} height={lh + 8} fill="transparent" />
                    </>
                  );
                })()}
                {/* A mark that runs from one day to another is drawn as a
                    bar. A planting is the clearest case: it begins on the day
                    it went in the ground — a date the grower stated — and ends
                    on the day the curve says its heat target arrives. Left end
                    stated, right end computed, one bar.

                    An instant draws no bar at all. Most of what a season marks
                    really is a moment: an egg hatch happens on a day, and
                    giving it a width would be inventing a duration. */}
                {endDay != null && Math.abs(ex - cx) > 1.5 && (
                  <rect
                    x={Math.min(cx, ex)} y={cy - 3}
                    width={Math.abs(ex - cx)} height={6} rx={3}
                    fill={tone} opacity={f.reached ? 0.34 : 0.2}
                  />
                )}
                {/* The stem can be long now, so it is drawn lighter than the
                    dot it belongs to — a leader should point, not compete. */}
                <line x1={cx} y1={cy} x2={cx} y2={cy - stem} stroke={tone} strokeWidth={1} opacity={0.55} />
                <circle cx={cx} cy={cy} r={3.5} fill={tone} stroke="var(--color-panel)" strokeWidth={1.2} />
                {(() => {
                  const lines = wrapLabel(f.label);
                  return (
                    <text
                      x={flip ? cx - 4 : cx + 4}
                      y={cy - stem - 2 - (lines.length - 1) * 10}
                      textAnchor={flip ? "end" : "start"}
                      fontSize={9.5} fontWeight={600}
                      fill={tone} fontFamily="var(--font-data)"
                      paintOrder="stroke" stroke="var(--color-panel)"
                      strokeWidth={3.5} strokeLinejoin="round">
                      {lines.map((ln, li) => (
                        <tspan key={li} x={flip ? cx - 4 : cx + 4} dy={li === 0 ? 0 : 10}>
                          {li === 0 ? `${f.emoji ?? ""} ${ln}`.trim() : ln}
                        </tspan>
                      ))}
                    </text>
                  );
                })()}
              </g>
            );
          })}

        <circle cx={x(last)} cy={y(todayGdd)} r={4.5} fill="var(--color-ink)" />
          <text x={x(last) + 7} y={y(todayGdd) - 1} fontSize={10.5} fontWeight={700} fill="var(--color-ink)"
            paintOrder="stroke" stroke="var(--color-panel)" strokeWidth={3.5} strokeLinejoin="round">
            <tspan x={x(last) + 7}>today</tspan>
            <tspan x={x(last) + 7} dy={11}>
              {Math.round(u.degreeDays(todayGdd)).toLocaleString()}
            </tspan>
          </text>
        </g>

        {frostDayIndex != null && (
          <text x={x(frostDayIndex) - 5} y={T + 10} textAnchor="end" fontSize={9.5} fontWeight={600}
            fill="var(--color-frost)" fontFamily="var(--font-data)"
            paintOrder="stroke" stroke="var(--color-panel)" strokeWidth={3.5} strokeLinejoin="round">
            MEDIAN FIRST FROST
          </text>
        )}

        {/* Axis handles. Faint, but present — an invisible affordance is one
            nobody finds, and these are the gestures that cannot escape to the
            browser. */}
        <rect x={0} y={T} width={L - 8} height={B - T} fill="var(--color-band)" opacity={0.35} rx={2} />
        <rect x={L} y={B + 6} width={R - L} height={H - B - 8} fill="var(--color-band)" opacity={0.35} rx={2} />

        {/* A month boundary is taller and darker than the days inside it, so
            the coarse structure survives the detail. */}
        {ticks.map((t) => (
          <g key={t.d}>
            <line x1={x(t.d)} x2={x(t.d)} y1={B} y2={B + (t.major ? 7 : 4)}
              stroke={t.major ? "var(--color-ink)" : "var(--color-ink-soft)"} />
            {labelFits(x(t.d) + 2, t.label, W - 2) && (
              <text x={x(t.d) + 2} y={B + 16} fontSize={9}
                fill={t.major ? "var(--color-ink)" : "var(--color-ink-soft)"}
                fontFamily="var(--font-data)" letterSpacing="1">
                {t.label}
              </text>
            )}
          </g>
        ))}
        <line x1={L} x2={R} y1={B} y2={B} stroke="var(--color-ink)" strokeWidth={1.5} />
      </svg>
      </GestureHint>

      {overlay && (() => {
        const vals = overlay.values.filter((v): v is number => typeof v === "number");
        if (!vals.length) return null;
        return (
          <p className="data px-2 pt-1 text-[10.5px]" style={{ color: overlay.colour }}>
            {overlay.emoji} {overlay.label} behind the curve ·{" "}
            {Math.min(...vals).toFixed(overlay.unit === "in" ? 2 : 0)}–
            {Math.max(...vals).toFixed(overlay.unit === "in" ? 2 : 0)} {overlay.unit}
            <span className="text-ink-soft"> · own scale, no axis</span>
          </p>
        );
      })()}

      <div
        style={{ paddingLeft: `${(L / W) * 100}%`, paddingRight: `${((W - R) / W) * 100}%` }}
        className={`flex flex-wrap justify-center gap-x-3.5 gap-y-0.5 text-[11.5px] text-ink-soft ${
          full ? "pt-0.5 pb-0" : "pt-1 pb-0"}`}>
        {data.normals && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-4.5 bg-band" />{data.normals.span_years}-season range
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block w-4.5 border-t-[3px] border-growth" />this season (mean)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-4.5 bg-growth opacity-25" />across your ground
        </span>
        {data.forecast && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-4.5 border-t-[3px] border-dashed border-growth" />7-day forecast
          </span>
        )}
        {data.projection && (
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-4.5 border-t-[3px] border-dotted border-ink-soft" />projection at the recent rate
          </span>
        )}
        {flags.length > 0 && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-full bg-growth" />crops
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-full bg-honey" />pests
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-full bg-frost" />wildlife
            </span>
          </>
        )}
      </div>
      </div>
      </div>

      <ZoomControls
        onZoomX={(f) => { setSpan(null); zoomX(f); }}
        // Reset returns to the view the page opened on, not to the whole
        // domain. Once the timeline reaches past the curve to hold a task next
        // January, the whole domain is mostly empty — and landing there is
        // what the Annual button is for.
        onReset={() => goToSpan(DEFAULT_SPAN)}
        isZoomed={isZoomed}
        activeSpan={span}
        onSpan={goToSpan}
        // Full screen puts the rows side by side and drops the gesture hint —
        // 140 px of controls under a plot that is competing for the same
        // height is the framing the reader asked to get back.
        compact={full}
        // The button says which season it will show. "Season" beside
        // "3 months" tells a reader nothing; "Fall" tells them everything.
        spanLabels={thisSeason ? { season: thisSeason.name } : undefined}
        spanIcons={thisSeason ? { season: SEASON_ICON[thisSeason.name] } : undefined}
        spanTitles={thisSeason
          ? { season: `${thisSeason.start} → ${thisSeason.end}`,
              annual: "The whole timeline, however far your dated tasks reach" }
          : undefined}
      />

    </div>
  );
}
