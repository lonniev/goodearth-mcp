// How Fauna works.

import Term from "../../components/Term";
import type { Guide } from "./types";

export const wildlife: Guide = {
  claim: "Animals do not all run on one clock. Which clock an event runs on decides how far to trust its date.",
  phenomenon: (
    <>
      <p>
        A woodchuck wakes on heat, like a crop: a degree-day threshold above
        its own base, so the date moves with the season. A robin arrives on{" "}
        <Term label="day length" of="daylight" />: migration runs on
        photoperiod, which is astronomy, so the date barely moves between a
        warm year and a cold one. A broody hen hatches her clutch on a count of
        days from the day she went down — and lambing, kidding, farrowing and
        queen-rearing are all that shape. Some events are a date from your own
        record, with no clean driver at all; some wait on conditions, and
        re-date themselves each season from this ground's weather.
      </p>
      <p>
        So a watch is entered on the clock it runs on, and the page shows the
        clock beside the date. The counts are yours. There is no table pairing
        a hen with twenty-one days, because twenty-one is right for a chicken
        and wrong for a muscovy and moves with the breed — the page does the
        arithmetic and remembers what you chose last time. A cycle saves as
        one thing: the start you saw, and the milestones counted from it.
      </p>
    </>
  ),
  facts: [
    ["Five clocks",
      <>Heat, daylight, days from a date, your record, and conditions. The
        chip on each row names which.</>],
    ["Wild and kept alike",
      <>Robins and the laying flock live on one page: the same drivers time
        both, and a brood is a cycle like a migration is a threshold.</>],
    ["Seen settles it",
      <>A watch whose day has come is answered by recording what you saw. That
        observation is what makes next year's count yours rather than a guess.</>],
  ],
  using: [
    { emoji: "➕", heading: "Track something", steps: [
      ["The creature",
        <>Picked, not typed: your own record first, then what iNaturalist has
          recorded near here, then a search for anything else. The ⟳ mark means
          USA-NPN publishes a life cycle for it, and its habits are offered as
          labels once it is chosen.</>],
      ["The clock",
        <>Chips for the five: <b>days from</b>, <b>your record</b>,
          <b> daylight</b>, <b>heat</b>, <b>conditions</b>. Each says in a line
          what it asks for.</>],
      ["The figures",
        <>A degree-day total and base for heat; hours and rising or falling for
          daylight; a month and a day for your record; a start day and
          milestones — each a count of days — for a cycle. The month and the day
          are two short lists rather than a typed date.</>],
      ["Save",
        <>One write for the whole cycle: half a brood was never a thing anyone
          wanted to record.</>],
      ["Community Observations",
        <>Creatures people have actually seen near here. Search, tick, add
          them all — they go on the roster named and undated; the clock and its
          figure are yours to set.</>],
    ]},
    { emoji: "👀", heading: "Read the year", steps: [
      ["Watch for these",
        <>What is due with its window — "in 6 days", give or take — and what
          has just been and gone with nothing recorded against it. The window
          matters: a hatch presented to the day gets somebody to the coop at
          dawn for nothing.</>],
      ["The heading",
        <>The time the calendar was read. The filter asks: due within so many
          days, already happened, on the roster with no date. Search takes a
          regular expression, run on submit.</>],
      ["The columns",
        <>Creature, Event, Clock, When, and seen or ahead. Two rows can be one
          species — an arrival and a departure are two things you chose to
          track. Tap the creature's name for what USA-NPN tracks it doing in a
          year.</>],
      ["When",
        <>The threshold, then the date: reached on, or expected with its
          window, or not this season.</>],
    ]},
    { emoji: "✏️", heading: "Change", steps: [
      ["Seen it",
        <>On a due row, records the observation on the day you give. The watch
          reads <b>seen</b> from then on, and the date is on your record.</>],
      ["Start another",
        <>On a cycle, repeats it from a new day — the labels and counts come
          off the rows you already saved, and the old brood is retired once the
          new one lands.</>],
      ["Tap a row",
        <>Edits the creature, the event, its emoji and the note where it sits.
          The threshold is not edited in the row: the four clocks have four
          shapes, so change one by removing the watch and adding it again from
          the form.</>],
    ]},
    { emoji: "🗑️", heading: "Remove", steps: [
      ["The bin",
        <>Retires the watch. The undo mark in the top bar puts it back.</>],
    ]},
  ],
  agent: {
    lead: (
      <>
        A watch is an event with a driver and a figure, and an agent can save
        one in any of the five shapes and then ask when it lands on this
        ground. A brood or a lambing is a start date and a list of milestones,
        saved together.
      </>
    ),
    say: "The Buff Orpington went broody on the 3rd. Hatch is 21 days; remind me to candle at day 7. And when do the robins usually arrive here?",
    does: (
      <>
        Saves two interval rows for the hen — candle at 7 days, hatch at 21,
        both counted from the 3rd — reads the calendar for the block and
        reports the two dates with their windows. For the robins it saves a
        daylight watch at the hours you give it, or asks the catalogue what
        USA-NPN tracks them doing here, and reports the date day length
        crosses it on this ground.
      </>
    ),
    tools: [
      "goodearth_block_item_save", "goodearth_wildlife_calendar", "goodearth_wildlife_catalog",
      "goodearth_nearby_species",
    ],
  },
};
