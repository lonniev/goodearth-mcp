// How Tasks works.

import type { Guide } from "./types";

export const todo: Guide = {
  claim: "A farm list is a list of days. A task is one date, and it sits on the season's timeline whatever the heat did that day.",
  phenomenon: (
    <>
      <p>
        Everything else on this site is computed from the weather; a task is
        the one thing here that is simply decided. It is single-day by design
        — one date, with clock times on it if the job takes a slot — and there
        is no recurrence, because a recurring task is a rule and a farm list is
        a list of what is actually happening this week.
      </p>
      <p>
        A grower does not live in this app. They live in whatever calendar
        tells them about the school run and the market stall, so a plot's
        season — its tasks beside its crop targets, pest stages, fauna dates
        and frost — can be published once as a calendar feed and subscribed to
        from there. That is a setup step done once, on the Account page; this
        page is for the two things done daily: writing a task down and seeing
        what is due.
      </p>
      <p>
        The list is kept by the service, not the browser. It is sorted,
        filtered, searched and paged there, so a season's tasks are never
        downloaded in full for a phone to slice; and a task written in the far
        field without signal waits in the outbox — the mark in the top bar —
        and goes when the signal is back.
      </p>
    </>
  ),
  facts: [
    ["On the Dashboard too",
      <>Every task with a due date is a mark on the season curve, placed by
        its date rather than by heat.</>],
    ["Reminder or slot",
      <>A reminder has a day. A task that takes a slot has a from and a to,
        and only that kind is asked for times.</>],
    ["The feed follows",
      <>If this plot's calendar is published, the feed is refreshed as the
        list changes; nobody is told to go and press a button.</>],
  ],
  using: [
    { emoji: "➕", heading: "Write one down", steps: [
      ["What needs doing · Due",
        <>The title and the day. A task needs a title; the day may be left
          open.</>],
      ["Reminder only?",
        <>Ticked by default. Untick it and the form asks <b>From</b> and{" "}
          <b>To</b>, for a job that takes a slot in the day.</>],
      ["Note",
        <>Where the row cover is. Optional.</>],
      ["+ Task",
        <>Writes it. The form clears and the list reads again once the write
          has landed; a second press before then is dropped.</>],
      ["The gear",
        <>Opens the calendar feed settings on the Account page, where this
          plot's season is published once and subscribed to from any calendar.</>],
    ]},
    { emoji: "👀", heading: "See what is due", steps: [
      ["Day · Week · Month · Season · All",
        <>The timeframe. The list is read for that span alone.</>],
      ["Search",
        <>A regular expression — <i>mulch|cover</i> — run when you submit it,
          not per keystroke.</>],
      ["The columns",
        <>Done, Task, Due, Time. Tap a header to sort; the service sorts the
          whole list. Twenty to a page.</>],
      ["⇡ waiting for signal",
        <>A task written without signal, laid over the list until it is sent.
          It trades the mark for the service's own row when it goes.</>],
    ]},
    { emoji: "✏️", heading: "Change", steps: [
      ["The checkbox",
        <>Marks it done, or not done. A done task stays on the list, struck
          through.</>],
      ["Tap a cell",
        <>Opens the row for editing where it sits: title, note, due, reminder
          or times. Enter saves, Escape abandons.</>],
    ]},
    { emoji: "🗑️", heading: "Remove", steps: [
      ["The bin",
        <>Removes the task. It is the one row the record really deletes, so the
          undo mark in the top bar keeps everything needed to put it back under
          the id it had.</>],
    ]},
  ],
  agent: {
    lead: (
      <>
        Tasks are the simplest record here and the one an agent is most often
        asked to keep: add, list, tick, edit, remove. The list tools filter by
        timeframe and search, so "what's due this week" is one read.
      </>
    ),
    say: "Add “cover the east beds” for Friday as a reminder with the note that the row cover is in the east barn, then list everything due this week.",
    does: (
      <>
        Saves the task on the block with its title, due date and note, then
        reads the week's list and reports it in due order. Ticking one done,
        moving its day or removing it are the same tools with the task's id.
        Asked to put the season on a calendar, it computes the block's dataset
        and returns the feed address to subscribe to.
      </>
    ),
    tools: [
      "goodearth_task_save", "goodearth_task_list", "goodearth_task_set_done",
      "goodearth_task_delete", "goodearth_calendar_dataset",
    ],
  },
};
