// How Pests works.

import { Tx } from "@tollbooth-dpyc/web/react";
import { WORDS, type Translate } from "../../i18n";
import type { Guide } from "./types";
import { Word } from "./word";

export const pests = (t: Translate): Guide => ({
  claim: t("howto.pests.claim"),
  phenomenon: (
    <>
      <p>
        <Tx ns={WORDS} k="howto.pests.p1" components={{
          biofix: <Word of="biofix" />, threshold: <Word of="threshold" />, base: <Word of="base_temp" />,
        }} />
      </p>
      <p>{t("howto.pests.p2")}</p>
    </>
  ),
  facts: [
    [t("howto.pests.fact1"), t("howto.pests.fact1Body")],
    [t("howto.pests.fact2"), t("howto.pests.fact2Body")],
    [t("howto.pests.fact3"), t("howto.pests.fact3Body")],
  ],
  using: [
    { emoji: "➕", heading: t("howto.pests.add"), steps: [
      [t("howto.pests.add1"), t("howto.pests.add1Does")],
      [t("howto.pests.add2"), t("howto.pests.add2Does")],
      [t("howto.pests.add3"), t("howto.pests.add3Does")],
      [t("howto.pests.add4"),
        <Tx ns={WORDS} k="howto.pests.add4Does" components={{ i: <i /> }} />],
      [t("howto.pests.add5"), t("howto.pests.add5Does")],
      [t("howto.pests.add6"), t("howto.pests.add6Does")],
      [t("howto.pests.add7"), t("howto.pests.add7Does")],
    ]},
    { emoji: "🐛", heading: t("howto.pests.read"), steps: [
      [t("howto.pests.read1"), t("howto.pests.read1Does")],
      [t("howto.pests.read2"), t("howto.pests.read2Does")],
      [t("howto.pests.read3"), t("howto.pests.read3Does")],
      [t("howto.pests.read4"),
        <Tx ns={WORDS} k="howto.pests.read4Does" components={{ i: <i /> }} />],
    ]},
    { emoji: "✏️", heading: t("howto.pests.change"), steps: [
      [t("howto.pests.change1"), t("howto.pests.change1Does")],
    ]},
    { emoji: "🗑️", heading: t("howto.pests.remove"), steps: [
      [t("howto.pests.remove1"), t("howto.pests.remove1Does")],
    ]},
  ],
  agent: {
    lead: t("howto.pests.agentLead"),
    say: t("howto.pests.agentSay"),
    does: t("howto.pests.agentDoes"),
    tools: [
      "goodearth_block_item_save", "goodearth_pest_threshold", "goodearth_pest_catalog",
      "goodearth_review_roster", "goodearth_nearby_species",
    ],
  },
});
