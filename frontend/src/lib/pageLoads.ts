// What "loading a page" means, said once.
//
// Both the view that shows a page and the code that warms it ahead of time
// have to agree on two things exactly: which call fetches it, and what its
// cache key is. If they disagree by so much as a base temperature the warm is
// wasted — it fills a slot nobody reads, the view asks again, and the only
// symptom is that the page is exactly as slow as before while the grower pays
// twice. So neither of them knows: they both ask here.

import { almanacFor, gddSeasonCurve, type AlmanacResult, type SeasonCurveResult } from "./mcp";
import { cached, warm } from "./pageCache";
import { pageKey, type Ground, type Warmable } from "./peerPage";

export function loadLedger(ground: Ground): Promise<SeasonCurveResult> {
  return cached(pageKey("ledger", ground), () => gddSeasonCurve(ground.id, ground.baseTempF));
}

export function loadAlmanac(ground: Ground): Promise<AlmanacResult> {
  return cached(pageKey("almanac", ground), () => almanacFor(ground.id));
}

/// Start a page's headline call without waiting for it or caring if it fails.
export function warmPage(page: Warmable, ground: Ground): void {
  if (!ground?.id) return;
  if (page === "ledger") warm(pageKey(page, ground), () => gddSeasonCurve(ground.id, ground.baseTempF));
  else warm(pageKey(page, ground), () => almanacFor(ground.id));
}
