// How the Almanac works.

import { Tx } from "@tollbooth-dpyc/web/react";
import { WORDS, type Translate } from "../../i18n";
import type { Guide } from "./types";
import { Word } from "./word";

export const almanac = (t: Translate): Guide => ({
  claim: t("howto.almanac.claim"),
  phenomenon: (
    <>
      <p>{t("howto.almanac.p1")}</p>
      <p>
        <Tx ns={WORDS} k="howto.almanac.p2" components={{
          dew: <Word of="dew_point" />, humidity: <Word of="humidity" />,
        }} />
      </p>
      <p>
        <Tx ns={WORDS} k="howto.almanac.p3" components={{ daylight: <Word of="daylight" /> }} />
      </p>
    </>
  ),
  facts: [
    [t("howto.almanac.fact1"), t("howto.almanac.fact1Body")],
    [t("howto.almanac.fact2"), t("howto.almanac.fact2Body")],
    [t("howto.almanac.fact3"), t("howto.almanac.fact3Body")],
  ],
  using: [
    { emoji: "👀", heading: t("howto.almanac.read"), steps: [
      [t("howto.almanac.read1"), t("howto.almanac.read1Does")],
      [t("howto.almanac.read2"), t("howto.almanac.read2Does")],
      [t("howto.almanac.read3"), t("howto.almanac.read3Does")],
      [t("howto.almanac.read4"), t("howto.almanac.read4Does")],
      [t("howto.almanac.read5"), t("howto.almanac.read5Does")],
      [t("howto.almanac.read6"), t("howto.almanac.read6Does")],
      [t("howto.almanac.read7"), t("howto.almanac.read7Does")],
    ]},
    { emoji: "✏️", heading: t("howto.almanac.arrange"), steps: [
      [t("howto.almanac.arrange1"), t("howto.almanac.arrange1Does")],
      [t("howto.almanac.arrange2"), t("howto.almanac.arrange2Does")],
    ]},
  ],
  agent: {
    lead: t("howto.almanac.agentLead"),
    say: t("howto.almanac.agentSay"),
    does: t("howto.almanac.agentDoes"),
    tools: ["goodearth_almanac", "goodearth_disease_risk", "goodearth_drying_window"],
  },
});
