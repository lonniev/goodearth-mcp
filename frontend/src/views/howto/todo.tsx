// How Tasks works.

import { Tx } from "@tollbooth-dpyc/web/react";
import { WORDS, type Translate } from "../../i18n";
import type { Guide } from "./types";

export const todo = (t: Translate): Guide => ({
  claim: t("howto.todo.claim"),
  phenomenon: (
    <>
      <p>{t("howto.todo.p1")}</p>
      <p>{t("howto.todo.p2")}</p>
      <p>{t("howto.todo.p3")}</p>
    </>
  ),
  facts: [
    [t("howto.todo.fact1"), t("howto.todo.fact1Body")],
    [t("howto.todo.fact2"), t("howto.todo.fact2Body")],
    [t("howto.todo.fact3"), t("howto.todo.fact3Body")],
  ],
  using: [
    { emoji: "➕", heading: t("howto.todo.add"), steps: [
      [t("howto.todo.add1"), t("howto.todo.add1Does")],
      [t("howto.todo.add2"),
        <Tx ns={WORDS} k="howto.todo.add2Does" components={{ b: <b /> }} />],
      [t("howto.todo.add3"), t("howto.todo.add3Does")],
      [t("howto.todo.add4"), t("howto.todo.add4Does")],
      [t("howto.todo.add5"), t("howto.todo.add5Does")],
    ]},
    { emoji: "👀", heading: t("howto.todo.read"), steps: [
      [t("howto.todo.read1"), t("howto.todo.read1Does")],
      [t("howto.todo.read2"),
        <Tx ns={WORDS} k="howto.todo.read2Does" components={{ i: <i /> }} />],
      [t("howto.todo.read3"), t("howto.todo.read3Does")],
      [t("howto.todo.read4"), t("howto.todo.read4Does")],
    ]},
    { emoji: "✏️", heading: t("howto.todo.change"), steps: [
      [t("howto.todo.change1"), t("howto.todo.change1Does")],
      [t("howto.todo.change2"), t("howto.todo.change2Does")],
    ]},
    { emoji: "🗑️", heading: t("howto.todo.remove"), steps: [
      [t("howto.todo.remove1"), t("howto.todo.remove1Does")],
    ]},
  ],
  agent: {
    lead: t("howto.todo.agentLead"),
    say: t("howto.todo.agentSay"),
    does: t("howto.todo.agentDoes"),
    tools: [
      "goodearth_task_save", "goodearth_task_list", "goodearth_task_set_done",
      "goodearth_task_delete", "goodearth_calendar_dataset",
    ],
  },
});
