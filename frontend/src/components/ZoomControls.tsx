// Zoom controls for a chart, X and Y independently.
//
// Two axes, one row, and a reset that only appears when there is something to
// reset — a permanently-lit "reset" is noise on a chart nobody has touched.
// Keyboard reachable, because a grower on a laptop in a packing shed is not
// always holding a mouse.

interface Props {
  onZoomX: (factor: number) => void;
  onZoomY: (factor: number) => void;
  onReset: () => void;
  isZoomed: boolean;
  /// Rendered under the buttons — the visible range, so the reader always
  /// knows what window they are looking at.
  range?: string;
}

// 44 px minimum: this is used with a finger on a tablet, where a 24 px button
// is a coin toss.
const btn =
  "flex h-11 w-11 items-center justify-center rounded border border-rule bg-panel text-[17px] leading-none text-ink active:bg-band focus-visible:outline-2 focus-visible:outline-honey";

export default function ZoomControls({ onZoomX, onZoomY, onReset, isZoomed, range }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-2 pt-2 text-[11px] text-ink-soft">
      <span className="inline-flex items-center gap-1">
        <span className="eyebrow">Dates</span>
        <button className={btn} onClick={() => onZoomX(1 / 1.4)} aria-label="Zoom in on dates" title="Narrow the date range">+</button>
        <button className={btn} onClick={() => onZoomX(1.4)} aria-label="Zoom out on dates" title="Widen the date range">−</button>
      </span>

      <span className="inline-flex items-center gap-1">
        <span className="eyebrow">GDD</span>
        <button className={btn} onClick={() => onZoomY(1 / 1.4)} aria-label="Zoom in on degree days" title="Expand the vertical scale">+</button>
        <button className={btn} onClick={() => onZoomY(1.4)} aria-label="Zoom out on degree days" title="Compress the vertical scale">−</button>
      </span>

      {isZoomed && (
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
