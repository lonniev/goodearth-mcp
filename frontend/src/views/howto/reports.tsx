// How Field Reports works.

import { Tx } from "@tollbooth-dpyc/web/react";
import { WORDS, type Translate } from "../../i18n";
import type { Guide } from "./types";
import { Word } from "./word";

export const reports = (t: Translate): Guide => ({
  claim: t("howto.reports.claim"),
  phenomenon: (
    <>
      <p>{t("howto.reports.p1")}</p>
      <p><Tx ns={WORDS} k="howto.reports.p2" components={{ i: <i /> }} /></p>
      <p>{t("howto.reports.p3")}</p>
    </>
  ),
  facts: [
    [t("howto.reports.fact1"), t("howto.reports.fact1Body")],
    [t("howto.reports.fact2"), t("howto.reports.fact2Body")],
    [t("howto.reports.fact3"), t("howto.reports.fact3Body")],
  ],
  using: [
    { emoji: "➕", heading: t("howto.reports.add"), steps: [
      [t("howto.reports.add1"),
        <Tx ns={WORDS} k="howto.reports.add1Does" components={{ b: <b /> }} />],
      [t("howto.reports.add2"), t("howto.reports.add2Does")],
      [t("howto.reports.add3"), t("howto.reports.add3Does")],
      [t("howto.reports.add4"),
        <Tx ns={WORDS} k="howto.reports.add4Does" components={{ target: <Word of="gdd_target" /> }} />],
      [t("howto.reports.add5"), t("howto.reports.add5Does")],
      [t("howto.reports.add6"), t("howto.reports.add6Does")],
    ]},
    { emoji: "🔭", heading: t("howto.reports.import"), steps: [
      [t("howto.reports.import1"), t("howto.reports.import1Does")],
      [t("howto.reports.import2"), t("howto.reports.import2Does")],
      [t("howto.reports.import3"), t("howto.reports.import3Does")],
    ]},
    { emoji: "👀", heading: t("howto.reports.read"), steps: [
      [t("howto.reports.read1"), t("howto.reports.read1Does")],
      [t("howto.reports.read2"), t("howto.reports.read2Does")],
    ]},
    { emoji: "🗑️", heading: t("howto.reports.remove"), steps: [
      [t("howto.reports.remove1"), t("howto.reports.remove1Does")],
    ]},
  ],
  agent: {
    lead: t("howto.reports.agentLead"),
    say: t("howto.reports.agentSay"),
    does: t("howto.reports.agentDoes"),
    tools: [
      "goodearth_block_item_save", "goodearth_calibration", "goodearth_review_roster",
      "goodearth_block_item_list",
    ],
  },
});
