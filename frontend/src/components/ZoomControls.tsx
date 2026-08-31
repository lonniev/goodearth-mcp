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

const btn =
  "flex h-6 w-6 items-center justify-center rounded border border-rule bg-panel text-[13px] leading-none text-ink hover:bg-band focus-visible:outline-2 focus-visible:outline-honey";

export default function ZoomControls({ onZoomX, onZoomY, onReset, isZoomed, range }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-2 pt-1 text-[11px] text-ink-soft">
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
          className="rounded border border-rule px-2 py-0.5 text-[11px] hover:bg-band focus-visible:outline-2 focus-visible:outline-honey"
        >
          Whole season
        </button>
      )}

      {range && <span className="data ml-auto text-[10px]">{range}</span>}

      <span className="data w-full text-[10px] opacity-70">
        scroll to zoom dates · shift-scroll for GDD{isZoomed ? " · drag to pan" : ""}
      </span>
    </div>
  );
}
