// How Fauna works.

import { Tx } from "@tollbooth-dpyc/web/react";
import { WORDS, type Translate } from "../../i18n";
import type { Guide } from "./types";
import { Word } from "./word";

export const wildlife = (t: Translate): Guide => ({
  claim: t("howto.wildlife.claim"),
  phenomenon: (
    <>
      <p><Tx ns={WORDS} k="howto.wildlife.p1" components={{ daylight: <Word of="daylight" /> }} /></p>
      <p>{t("howto.wildlife.p2")}</p>
    </>
  ),
  facts: [
    [t("howto.wildlife.fact1"), t("howto.wildlife.fact1Body")],
    [t("howto.wildlife.fact2"), t("howto.wildlife.fact2Body")],
    [t("howto.wildlife.fact3"), t("howto.wildlife.fact3Body")],
  ],
  using: [
    { emoji: "➕", heading: t("howto.wildlife.add"), steps: [
      [t("howto.wildlife.add1"), t("howto.wildlife.add1Does")],
      [t("howto.wildlife.add2"), t("howto.wildlife.add2Does")],
      [t("howto.wildlife.add3"),
        <Tx ns={WORDS} k="howto.wildlife.add3Does" components={{ b: <b /> }} />],
      [t("howto.wildlife.add4"), t("howto.wildlife.add4Does")],
      [t("howto.wildlife.add5"), t("howto.wildlife.add5Does")],
      [t("howto.wildlife.add6"), t("howto.wildlife.add6Does")],
    ]},
    { emoji: "🐾", heading: t("howto.wildlife.read"), steps: [
      [t("howto.wildlife.read1"), t("howto.wildlife.read1Does")],
      [t("howto.wildlife.read2"), t("howto.wildlife.read2Does")],
      [t("howto.wildlife.read3"), t("howto.wildlife.read3Does")],
      [t("howto.wildlife.read4"), t("howto.wildlife.read4Does")],
    ]},
    { emoji: "✏️", heading: t("howto.wildlife.change"), steps: [
      [t("howto.wildlife.change1"),
        <Tx ns={WORDS} k="howto.wildlife.change1Does" components={{ b: <b /> }} />],
      [t("howto.wildlife.change2"), t("howto.wildlife.change2Does")],
      [t("howto.wildlife.change3"), t("howto.wildlife.change3Does")],
    ]},
    { emoji: "🗑️", heading: t("howto.wildlife.remove"), steps: [
      [t("howto.wildlife.remove1"), t("howto.wildlife.remove1Does")],
    ]},
  ],
  agent: {
    lead: t("howto.wildlife.agentLead"),
    say: t("howto.wildlife.agentSay"),
    does: t("howto.wildlife.agentDoes"),
    tools: [
      "goodearth_block_item_save", "goodearth_wildlife_calendar", "goodearth_wildlife_catalog",
      "goodearth_nearby_species",
    ],
  },
});
