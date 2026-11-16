// How the Dashboard works.

import { Tx } from "@tollbooth-dpyc/web/react";
import { WORDS, type Translate } from "../../i18n";
import type { Guide } from "./types";
import { Word } from "./word";

export const ledger = (t: Translate): Guide => ({
  claim: t("howto.ledger.claim"),
  phenomenon: (
    <>
      <p>
        <Tx ns={WORDS} k="howto.ledger.p1" components={{ base: <Word of="base_temp" />, gdd: <Word of="gdd" /> }} />
      </p>
      <p>
        <Tx ns={WORDS} k="howto.ledger.p2" components={{ spread: <Word of="spread" /> }} />
      </p>
      <p>
        <Tx ns={WORDS} k="howto.ledger.p3" components={{ i: <i /> }} />
      </p>
    </>
  ),
  facts: [
    [t("howto.ledger.fact1"), t("howto.ledger.fact1Body")],
    [t("howto.ledger.fact2"), t("howto.ledger.fact2Body")],
    [t("howto.ledger.fact3"), t("howto.ledger.fact3Body")],
  ],
  using: [
    { emoji: "👀", heading: t("howto.ledger.read"), steps: [
      [t("howto.ledger.read1"),
        <Tx ns={WORDS} k="howto.ledger.read1Does" components={{ b: <b /> }} />],
      [t("howto.ledger.read2"), t("howto.ledger.read2Does")],
      [t("howto.ledger.read3"), t("howto.ledger.read3Does")],
      [t("howto.ledger.read4"), t("howto.ledger.read4Does")],
      [t("howto.ledger.read5"), t("howto.ledger.read5Does")],
      [t("howto.ledger.read6"), t("howto.ledger.read6Does")],
      [t("howto.ledger.read7"), t("howto.ledger.read7Does")],
      [t("howto.ledger.read8"), t("howto.ledger.read8Does")],
    ]},
    { emoji: "🔔", heading: t("howto.ledger.trends"), steps: [
      [t("howto.ledger.trend1"), t("howto.ledger.trend1Does")],
      [t("howto.ledger.trend2"), t("howto.ledger.trend2Does")],
      [t("howto.ledger.trend3"), t("howto.ledger.trend3Does")],
      [t("howto.ledger.trend4"), t("howto.ledger.trend4Does")],
      [t("howto.ledger.trend5"),
        <Tx ns={WORDS} k="howto.ledger.trend5Does" components={{ b: <b /> }} />],
      [t("howto.ledger.trend6"), t("howto.ledger.trend6Does")],
    ]},
    { emoji: "✏️", heading: t("howto.ledger.change"), steps: [
      [t("howto.ledger.change1"), t("howto.ledger.change1Does")],
      [t("howto.ledger.change2"), t("howto.ledger.change2Does")],
    ]},
  ],
  agent: {
    lead: t("howto.ledger.agentLead"),
    say: t("howto.ledger.agentSay"),
    does: t("howto.ledger.agentDoes"),
    tools: [
      "goodearth_gdd_season_curve", "goodearth_frost_window", "goodearth_soil_temp_projection",
      "goodearth_disease_risk", "goodearth_drying_window", "goodearth_water_balance",
      "goodearth_almanac",
    ],
  },
});
