// How My Plots works.

import { Tx } from "@tollbooth-dpyc/web/react";
import { WORDS, type Translate } from "../../i18n";
import type { Guide } from "./types";
import { Word } from "./word";

export const plots = (t: Translate): Guide => ({
  claim: t("howto.plots.claim"),
  phenomenon: (
    <>
      <p>{t("howto.plots.p1")}</p>
      <p>
        <Tx ns={WORDS} k="howto.plots.p2" components={{
          block: <Word of="block" />, i: <i />, spread: <Word of="spread" />,
        }} />
      </p>
      <p>{t("howto.plots.p3")}</p>
    </>
  ),
  facts: [
    [t("howto.plots.fact1"), t("howto.plots.fact1Body")],
    [t("howto.plots.fact2"), t("howto.plots.fact2Body")],
    [t("howto.plots.fact3"), t("howto.plots.fact3Body")],
  ],
  using: [
    { emoji: "➕", heading: t("howto.plots.add"), steps: [
      [t("howto.plots.add1"), t("howto.plots.add1Does")],
      [t("howto.plots.add2"), t("howto.plots.add2Does")],
      [t("howto.plots.add3"),
        <Tx ns={WORDS} k="howto.plots.add3Does" components={{ b: <b /> }} />],
      [t("howto.plots.add4"), t("howto.plots.add4Does")],
      [t("howto.plots.add5"),
        <Tx ns={WORDS} k="howto.plots.add5Does" components={{ base: <Word of="base_temp" /> }} />],
      [t("howto.plots.add6"), t("howto.plots.add6Does")],
      [t("howto.plots.add7"), t("howto.plots.add7Does")],
      [t("howto.plots.add8"), t("howto.plots.add8Does")],
    ]},
    { emoji: "👀", heading: t("howto.plots.read"), steps: [
      [t("howto.plots.read1"), t("howto.plots.read1Does")],
      [t("howto.plots.read2"), t("howto.plots.read2Does")],
      [t("howto.plots.read3"), t("howto.plots.read3Does")],
      [t("howto.plots.read4"), t("howto.plots.read4Does")],
      [t("howto.plots.read5"),
        <Tx ns={WORDS} k="howto.plots.read5Does" components={{ b: <b /> }} />],
    ]},
    { emoji: "✏️", heading: t("howto.plots.change"), steps: [
      [t("howto.plots.change1"), t("howto.plots.change1Does")],
      [t("howto.plots.change2"), t("howto.plots.change2Does")],
    ]},
    { emoji: "🗑️", heading: t("howto.plots.remove"), steps: [
      [t("howto.plots.remove1"), t("howto.plots.remove1Does")],
    ]},
  ],
  agent: {
    lead: t("howto.plots.agentLead"),
    say: t("howto.plots.agentSay"),
    does: <Tx ns={WORDS} k="howto.plots.agentDoes" components={{ code: <code /> }} />,
    tools: ["goodearth_block_save", "goodearth_block_list", "goodearth_sunlight"],
  },
});
