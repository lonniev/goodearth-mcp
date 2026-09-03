import { TIMESCALES } from "../lib/useChartZoom";
// Zoom controls for a chart.
//
// Split in two, because the two axes belong in different places. The DATE
// controls sit under the plot, where the dates are. The VALUE control sits
// beside the vertical axis it scales — see `AxisZoom` below — because a
// control for the vertical scale, parked in a row along the bottom, is a
// control the eye has to be told about rather than one it finds.
//
// It also stopped the row lying. The vertical button was labelled "GDD" for
// every chart that used it, and only ONE of them plots degree days: the
// Almanac's measures are degrees, inches and hours, and were all offered a
// "GDD" zoom. A control that names the wrong quantity is worse than an
// unlabelled one, because it is believed.
//
// Icons rather than [+] and [−]: a magnifier says "this changes what you can
// see", where a plus sign says "this adds something", which is what the
// grower's other plus buttons do on every page of this app.

interface Props {
  onZoomX: (factor: number) => void;
  onReset: () => void;
  isZoomed: boolean;
  /// Named spans. Jumping to an altitude beats pinching your way there.
  onSpan?: (days: number | null) => void;
  activeSpan?: string | null;
  /// Rendered under the buttons — the visible range, so the reader always
  /// knows what window they are looking at.
  range?: string;
}

// 44 px minimum: this is used with a finger on a tablet, where a 24 px button
// is a coin toss.
const BTN =
  "flex h-11 w-11 items-center justify-center rounded border border-rule bg-panel text-ink active:bg-band focus-visible:outline-2 focus-visible:outline-honey";

/// A magnifier with a plus, and one with a minus. One concept, one icon.
const GLASS = "M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19z";
const IN = <><path d={GLASS} /><path d="M12 10H10V8H9v2H7v1h2v2h1v-2h2z" /></>;
const OUT = <><path d={GLASS} /><path d="M7 10h5v1H7z" /></>;

function Glass({ kind }: { kind: "in" | "out" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      {kind === "in" ? IN : OUT}
    </svg>
  );
}

/// The vertical control, rendered by a chart beside its own value axis.
///
/// `label` is the chart's OWN quantity — degree days, °F, inches, hours — so
/// the control can never again claim to scale something the chart does not
/// plot.
export function AxisZoom({ onZoom, label }: {
  onZoom: (factor: number) => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1 pl-1">
      <button className={BTN} onClick={() => onZoom(1 / 1.4)}
        aria-label={`Zoom in on ${label}`} title={`Expand the ${label} scale`}>
        <Glass kind="in" />
      </button>
      <span className="eyebrow text-[9px] leading-none [writing-mode:vertical-rl] [text-orientation:mixed]">{label}</span>
      <button className={BTN} onClick={() => onZoom(1.4)}
        aria-label={`Zoom out on ${label}`} title={`Compress the ${label} scale`}>
        <Glass kind="out" />
      </button>
    </div>
  );
}

export default function ZoomControls({
  onZoomX, onReset, isZoomed, range, onSpan, activeSpan,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-2 pt-2 text-[11px] text-ink-soft">
      {onSpan && (
        <span className="flex w-full flex-wrap items-center gap-1.5 pb-1">
          <span className="eyebrow mr-0.5">Span</span>
          {TIMESCALES.map((t) => (
            <button key={t.key} onClick={() => onSpan(t.days)}
              className={`min-h-11 rounded-full border px-3.5 text-[12px] font-medium ${
                activeSpan === t.key
                  ? "border-ink bg-ink text-paper"
                  : "border-rule text-ink active:bg-band"}`}>
              {t.label}
            </button>
          ))}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <span className="eyebrow">Dates</span>
        <button className={BTN} onClick={() => onZoomX(1 / 1.4)}
          aria-label="Zoom in on dates" title="Narrow the date range">
          <Glass kind="in" />
        </button>
        <button className={BTN} onClick={() => onZoomX(1.4)}
          aria-label="Zoom out on dates" title="Widen the date range">
          <Glass kind="out" />
        </button>
      </span>

      {isZoomed && !onSpan && (
        <button
          onClick={onReset}
          className="min-h-11 rounded border border-rule px-3 text-[12px] active:bg-band focus-visible:outline-2 focus-visible:outline-honey"
        >
          Whole season
        </button>
      )}

      {range && <span className="data ml-auto text-[10px]">{range}</span>}

      {/* Say the gesture that always works FIRST. A pinch on iPadOS can escape
          to the browser's own page zoom, so it is offered but never relied on. */}
      <span className="data w-full text-[10px] leading-relaxed opacity-70">
        drag the left edge to stretch the scale · drag along the bottom for dates ·
        double-tap in, two-finger tap out{isZoomed ? " · drag the middle to pan" : ""}
      </span>
    </div>
  );
}
