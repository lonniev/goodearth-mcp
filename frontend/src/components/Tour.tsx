// The one tour control that is this site's to draw: the compass on a guide
// page, "Show me on the page". Its mechanics — the preference, the offer,
// the popovers — are the package's (`@tollbooth-dpyc/web`); see
// lib/tour/copy.ts for the words and lib/tour/targets.ts for the names.

import { useTourReplay } from "@tollbooth-dpyc/web/react";
import type { TourPage } from "../lib/tour/types";
import type { ViewKey } from "../lib/views";
import { ICON, IconButton } from "./ui";

export function TourButton({ page, onView }: {
  page: Extract<TourPage, ViewKey>;
  onView: (v: ViewKey) => void;
}) {
  const replay = useTourReplay();
  return (
    <IconButton path={ICON.explore} label="Show me on the page" tone="quiet"
      title="Walk me through the page itself"
      onClick={() => { replay(page); onView(page); }} />
  );
}
