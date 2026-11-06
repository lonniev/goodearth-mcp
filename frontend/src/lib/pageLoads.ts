// What "loading a page" means, said once.
//
// Both the view that shows a page and the code that warms it ahead of time
// have to agree on two things exactly: which call fetches it, and what its
// cache key is. If they disagree by so much as a base temperature the warm is
// wasted — it fills a slot nobody reads, the view asks again, and the only
// symptom is that the page is exactly as slow as before while the grower pays
// twice. So neither of them knows: they both ask here.

import {
  almanacFor, gddSeasonCurve, plotConditions, plotStation,
  type AlmanacResult, type PlotConditions, type PlotStationRow, type SeasonCurveResult,
} from "./mcp";
import { cached, forget, warm } from "./pageCache";
import { conditionsKey, pageKey, stationKey, type Ground, type Warmable } from "./peerPage";

export function loadLedger(ground: Ground): Promise<SeasonCurveResult> {
  return cached(pageKey("ledger", ground), () => gddSeasonCurve(ground.id, ground.baseTempF));
}

export function loadAlmanac(ground: Ground): Promise<AlmanacResult> {
  return cached(pageKey("almanac", ground), () => almanacFor(ground.id));
}

/// The station a plot reads its conditions from, or null when it has none.
export function loadStation(blockId: string): Promise<PlotStationRow | null> {
  return cached(stationKey(blockId), async () => (await plotStation(blockId)).station);
}

/// What that station reports now. Ask only once `loadStation` has named one.
export function loadConditions(blockId: string): Promise<PlotConditions> {
  return cached(conditionsKey(blockId), () => plotConditions(blockId));
}

/// A plot's station changed: the next read asks again.
export function forgetStation(blockId: string): void {
  forget(stationKey(blockId));
  forget(conditionsKey(blockId));
}

/// Start a page's headline call without waiting for it or caring if it fails.
///
/// The Almanac opens on "Now at <station>", so its station's report is warmed
/// with it. A plot with no station stops after the first, cheap question.
export function warmPage(page: Warmable, ground: Ground): void {
  if (!ground?.id) return;
  if (page === "ledger") {
    warm(pageKey(page, ground), () => gddSeasonCurve(ground.id, ground.baseTempF));
    return;
  }
  warm(pageKey(page, ground), () => almanacFor(ground.id));
  void loadStation(ground.id)
    .then((station) => { if (station) warm(conditionsKey(ground.id), () => plotConditions(ground.id)); })
    .catch(() => {});
}
