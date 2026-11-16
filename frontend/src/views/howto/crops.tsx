// How Flora works.

import { Tx } from "@tollbooth-dpyc/web/react";
import { Glyph, ICON } from "../../components/ui";
import { WORDS, type Translate } from "../../i18n";
import type { Guide } from "./types";
import { Word } from "./word";

export const crops = (t: Translate): Guide => ({
  claim: t("howto.crops.claim"),
  phenomenon: (
    <>
      <p>
        <Tx ns={WORDS} k="howto.crops.p1" components={{ target: <Word of="gdd_target" />, setOut: <Word of="set_out" /> }} />
      </p>
      <p>
        <Tx ns={WORDS} k="howto.crops.p2" components={{ hardiness: <Word of="hardiness" />, chill: <Word of="chill_hours" /> }} />
      </p>
      <p>
        <Tx ns={WORDS} k="howto.crops.p3" components={{ i: <i />, succession: <Word of="succession" /> }} />
      </p>
      <p>{t("howto.crops.p4")}</p>
    </>
  ),
  facts: [
    [t("howto.crops.fact1"), t("howto.crops.fact1Body")],
    [t("howto.crops.fact2"), t("howto.crops.fact2Body")],
    [t("howto.crops.fact3"), t("howto.crops.fact3Body")],
  ],
  using: [
    { emoji: "➕", heading: t("howto.crops.add"), steps: [
      [t("howto.crops.add1"), t("howto.crops.add1Does")],
      [t("howto.crops.add2"), t("howto.crops.add2Does")],
      [t("howto.crops.add3"), t("howto.crops.add3Does")],
      [t("howto.crops.add4"), t("howto.crops.add4Does")],
      [t("howto.crops.add5"), t("howto.crops.add5Does")],
      [t("howto.crops.add6"), t("howto.crops.add6Does")],
      [t("howto.crops.add7"), t("howto.crops.add7Does")],
    ]},
    { emoji: "📒", heading: t("howto.crops.read"), steps: [
      [t("howto.crops.read1"), t("howto.crops.read1Does")],
      [t("howto.crops.read2"), t("howto.crops.read2Does")],
      [t("howto.crops.read3"), t("howto.crops.read3Does")],
      [t("howto.crops.read4"), t("howto.crops.read4Does")],
      [t("howto.crops.read5"),
        <Tx ns={WORDS} k="howto.crops.read5Does" components={{ b: <b /> }} />],
      [t("howto.crops.read6"),
        <Tx ns={WORDS} k="howto.crops.read6Does" components={{ b: <b /> }} />],
    ]},
    { emoji: "🤝", heading: t("howto.crops.companions"), steps: [
      [<span className="inline-flex items-center gap-1.5">
        <Tx ns={WORDS} k="howto.crops.companions1" components={{ glyph: <Glyph path={ICON.companions} /> }} />
      </span>, t("howto.crops.companions1Does")],
      [t("howto.crops.companions2"), t("howto.crops.companions2Does")],
      [t("howto.crops.companions3"), t("howto.crops.companions3Does")],
      [t("howto.crops.companions4"), t("howto.crops.companions4Does")],
    ]},
    { emoji: "✏️", heading: t("howto.crops.change"), steps: [
      [t("howto.crops.change1"), t("howto.crops.change1Does")],
      [t("howto.crops.change2"), t("howto.crops.change2Does")],
      [t("howto.crops.change3"), t("howto.crops.change3Does")],
    ]},
    { emoji: "🗑️", heading: t("howto.crops.remove"), steps: [
      [t("howto.crops.remove1"), t("howto.crops.remove1Does")],
    ]},
  ],
  agent: {
    lead: t("howto.crops.agentLead"),
    say: t("howto.crops.agentSay"),
    does: t("howto.crops.agentDoes"),
    tools: [
      "goodearth_block_item_save", "goodearth_crop_gdd_status", "goodearth_planting_window",
      "goodearth_crop_suitability", "goodearth_tree_suitability", "goodearth_companions",
      "goodearth_block_item_list",
    ],
  },
});
