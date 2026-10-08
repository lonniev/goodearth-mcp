// The Sun layer's state and its answer, for whichever page shows the map.
//
// One call per block — `sunlight(block, {detail: "grid"})` — held in the
// page cache like the ledger's, and every slider move, view flip, leaf toggle
// and tap after that is arithmetic over the decoded grid. The first call on a
// block casts its horizon on the server and takes some seconds; the panel
// says so while it waits.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sunlight, type SunlightResult } from "./mcp";
import { cached } from "./pageCache";
import type { SavedRegion } from "./regions";
import { decodeGrid, summary, type SunGrid, type SunSummary, type SunView } from "./sunGrid";
import type { SunState } from "./sunOverlay";

export const JUNE = 5;

export function sunKey(id: string): string {
  return `sunlight|${id}`;
}

export function loadSunlight(id: string): Promise<SunlightResult> {
  return cached(sunKey(id), () => sunlight(id, { detail: "grid" }));
}

export interface SunLayerHandle {
  on: boolean;
  toggle: () => void;
  result: SunlightResult | null;
  grid: SunGrid | null;
  loading: boolean;
  error: string;
  state: SunState;
  summary: SunSummary | null;
  setView: (v: SunView) => void;
  setMonth: (m: number) => void;
  setLeaf: (full: boolean) => void;
  select: (cell: number) => void;
  /// Select the best place for panels and show the solar view.
  showBest: () => void;
}

export function useSunLayer(active: SavedRegion): SunLayerHandle {
  const [on, setOn] = useState(false);
  const [view, setView] = useState<SunView>("garden");
  const [month, setMonth] = useState(JUNE);
  const [fullLeaf, setLeaf] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [result, setResult] = useState<SunlightResult | null>(null);
  const [grid, setGrid] = useState<SunGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // New ground, new answer: nothing from the last block may show on this one.
  useEffect(() => {
    setResult(null); setGrid(null); setSelected(-1); setError("");
  }, [active.id]);

  // One read per (block, Sun on). The effect depends on nothing it sets:
  // with `loading` in its deps, its own setLoading(true) re-ran it, the
  // cleanup marked the read dead, and the answer — once it came — was
  // thrown away with the spinner still up. The read that counts is the
  // latest one started; an older one that lands later is ignored.
  const read = useRef(0);
  useEffect(() => {
    if (!on) return;
    const mine = ++read.current;
    setLoading(true); setError("");
    loadSunlight(active.id)
      .then(async (r) => {
        if (read.current !== mine) return;
        if (!r.success || !r.grid) { setError(r.error || "Sunlight could not be read for this plot."); return; }
        const g = await decodeGrid(r.grid);
        if (read.current !== mine) return;
        setResult(r); setGrid(g);
      })
      .catch((e: unknown) => { if (read.current === mine) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (read.current === mine) setLoading(false); });
    return () => { read.current++; };
  }, [on, active.id]);

  const sum = useMemo(() => (grid ? summary(grid, month, fullLeaf) : null), [grid, month, fullLeaf]);
  const state = useMemo<SunState>(
    () => ({ view, month, fullLeaf, selected, best: sum?.best ?? -1 }),
    [view, month, fullLeaf, selected, sum],
  );

  const toggle = useCallback(() => setOn((v) => !v), []);
  const showBest = useCallback(() => {
    if (sum && sum.best >= 0) { setSelected(sum.best); setView("solar"); }
  }, [sum]);

  return {
    on, toggle, result, grid, loading, error, state, summary: sum,
    setView, setMonth, setLeaf, select: setSelected, showBest,
  };
}
