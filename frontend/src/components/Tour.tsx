// The one tour control that is this site's to draw: the compass on a guide
// page, "Show me on the page". Its mechanics — the preference, the offer,
// the popovers — are the package's (`@tollbooth-dpyc/web`); see
// lib/tour/copy.ts for the words and lib/tour/targets.ts for the names.

import { useTourReplay } from "@tollbooth-dpyc/web/react";
import type { TourPage } from "../lib/tour/types";
import type { ViewKey } from "../lib/views";
import { ICON, IconButton } from "./ui";
import { useT } from "../i18n";

export function TourButton({ page, onView }: {
  page: Extract<TourPage, ViewKey>;
  onView: (v: ViewKey) => void;
}) {
  const replay = useTourReplay();
  const t = useT();
  return (
    <IconButton path={ICON.explore} label={t("ui.tour.showMe")} tone="quiet"
      title={t("ui.tour.walkMe")}
      onClick={() => { replay(page); onView(page); }} />
  );
}
