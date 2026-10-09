- My Plots: a plot's chip stacks its area under its name instead of beside
  it, so the row of chips is as narrow as the names; the chip's height is
  unchanged. The Sun strip's Garden light / Solar panels toggle is two
  glyphs, a sprout and a bolt. The Almanac's rail icon is a cloud raining,
  since a sun now means the Sun layer and the screen's own brightness.

- Maps: enlarging the map left the plots drawn on blank ground. The map's
  size now lives on the frame round it, never on the element Leaflet owns —
  React rewrote that element's classes and wiped `leaflet-container`, under
  which Leaflet's CSS keeps a tile its size; without it every tile shrank
  to nothing.

- Maps: the button under the zoom control enlarges the map to the whole
  screen and shrinks it back (Escape too) — the frame grows, not the zoom.
  On the Almanac the radar's player rides inside the enlarged frame. The
  active plot's chip still frames its plot on the map.

- Maps: the frame button moves to the top-left under the zoom control, on
  the plots map and the radar map alike — one place for a map's controls.
  The Sun layer's switch is a glyph, a sun half in shade, not a word. The
  active plot's chip carries a small eye: a tap on it frames the plot.

- Almanac: the weather radar is here now, under a 🌧️ button in the heading
  — a map of the country round the block with RainViewer's last two hours
  and the minutes ahead, played or scrubbed from a strip under the map.
  It lived on the drawing map, which *Add a plot* folded away; the Almanac
  is where the weather is read. Opened once, it stays open on this device.

- Sun layer: the controls — garden light or solar panels, the month, the
  leaf, the key — are a strip under the map across its width, not a panel
  over it that hid a third of the ground it coloured. The map keeps only the
  Sun switch and the frame button.
- My Plots: the map opens on the whole farm, and a plot inside it needed a
  pinch to be seen. A frame button on the map frames the active plot;
  pressed again it frames the farm; tapping the active plot's chip frames
  the plot too.

- Sun layer: the spot card is a row of three cards under the map — the sky
  from here, direct sun month by month, panels here — in the block summary's
  grid, instead of a side column that made the row as tall as the dome and
  left the map floating over empty paper. The map keeps its whole width, and
  nothing shows for the spot until one is tapped.

- My Plots: *Add a plot* is shown on request. The finder, the name form and
  the drawing map took half the page from the plots already saved; they now
  open from **+ Add a plot** beside Import, fold away on Save (the new plot
  is the active chip) or on the close button, and open at once for a grower
  who has no ground of their own yet.

- My Plots, compact above the map: the saved plots are one row of chips
  (tap one to work it; rename, share and forget act on the plot being
  worked, at the row's end), the map follows at once, and the plot's numbers
  — shape, corners, area, samples, base, other names — are the line under
  it. Search, *Use my location* and the Trace / Pin switch move down to
  *Add a plot*, the drawing map they serve. On an iPad the map began halfway
  down the screen; now it begins under the chips. The Sun panel waits with
  the quotes scroller, like every other call in flight.

- Sun layer: the grid never drew. The panel said *Casting the sky…* for
  minutes after the answer arrived because the hook that reads it depended
  on its own loading flag — setting the flag re-ran the effect, the cleanup
  marked the read dead, and the answer was thrown away when it came. The
  read now depends only on the plot and the Sun switch, and the latest read
  started is the one that counts. The horizons inflate with fflate in plain
  JS rather than the browser's stream API. And the spot card's column
  appears only once there is a grid — tapping Sun no longer shrinks the map
  to make room for nothing.

- Crops is Flora on the rail, on the Dashboard's tile and in the harvest hint.
  The page holds more than commercial crops. Item kinds, tool names and URLs
  keep their identifiers.
- The Account page is the shared `AccountPage` from @tollbooth-dpyc/web 1.5.0.
  The balance card leads, then the Nostr profile, session key and usage on the
  left; Viewing, the calendar feed and Forget me stay on the right, Forget me
  last. Usage now sits below the profile, the package's one order.
- The form for tracking a creature sits above the Wildlife table, where Plants
  and Pests keep theirs, instead of below it — past the table, its pager, and
  the empty state telling a grower to go and find a creature. It has lost its
  "Track something" heading too: on all three pages the bordered card is the
  form, and its first field names itself.
- The Wildlife year reads like the other two tables: one heading carrying its
  own reading time, a filter beside the search — **due within** so many days,
  **already happened**, **on the roster with no date** — and the summary
  sentence gone. All three pages now share one filter control.

- The pests page reads like the Plant ledger: one heading carrying its own
  reading time, a filter beside the search — **due within** so many days,
  **crossed this season**, **watched with no model** — and the "Nothing
  crossed or due…" sentence gone, since it was a fact about a list the list
  already shows. One filter component serves both tables.
- A pest chosen from iNaturalist can be tapped to read its card, the same card
  the nearby list opens.
- "Due on this ground" is **When they appear here** — half of what it lists has
  already happened this season, so nothing about it is upcoming.
- The Plant ledger is filtered rather than described. "Median first frost
  Oct 12. 2 on this page will not make it." is gone — the Dashboard carries
  frost — and in its place a filter beside the search: **ready before frost**,
  **has seed**, **projected within** so many days, **heat left under** so much.
  The heading took the row back and carries its own reading time, as
  "Plant ledger (at 8:28 PM)".
- While a filter is on the ledger reads the whole block rather than a page of
  it, so the count is of your ground and not of the first twenty rows.
- Undo is one mark in the top row rather than a full row under the header on
  four pages. Tap it for what you have removed from this ground, newest first;
  tap one to put it back; tap outside and it is a small mark again. It offers
  every kind, not just the page you happen to be on — so a task deleted before
  you walked to Crops can still come back — and whatever page is open re-reads
  when it does.
- A pest is named from iNaturalist rather than typed and hoped for, so a row
  carries the creature's taxon and every later lookup has something to key on.
  It searches **animals**, not insects — this list already held a chipmunk and
  a slug — and a name the catalogue has not heard of still stands.
- The pest form fits one row less: captions on one line, boxes one height, a
  narrower base field, and the add button at the end of the fields instead of
  on a row of its own. It shows a bug rather than the word "Pest".
- "Modelled stages" is **Due on this ground**.
- Recording a cut is as tidy as recording seed: every caption above its
  control, every box one height, and the two buttons together at the top
  right. The date wore no caption at all while "How much" wore one, which is
  why nothing in that row lined up.
- A plant with seed on the shelf shows a full green seed, and one without shows
  an empty outline, so the ledger says which rows hold a packet without opening
  each one in turn — and says it by shape rather than by two inks that are hard
  to tell apart at the size they are drawn.
- Recording a cut is marked with a pair of secateurs rather than office
  scissors. Plain scissors on a row of actions read as "delete this", and
  taking a cut of a plant is the opposite of removing it. Credited on the
  References page, where the rest of this app's sources are.
- The seed row is one tidy form. Every field goes through one component, so
  the captions sit on one line and the boxes are one height — a date input, a
  select and a text box do not agree on a height by themselves, which is what
  made it look home-made. Its four controls — add a lot, remove one, cancel,
  save — are together at the top right of the form rather than scattered
  through it, and the plant is not named again inside its own row.
- The seed row asks for a packet the way a packet reads. Each field is as wide
  as what goes in it — a three-digit day count and a four-digit year no longer
  take a quarter of the row each; germination is a percent spinner; how much
  you hold is **one** field, "500 seeds", rather than a count and a unit asked
  for separately. "Tested on" is **Germination tested**, which says what was
  tested; "From" is **Supplier** and "Lot" is **Supplier's lot**; "On hand" is
  **Inventory count**. Variety offers back the varieties of that plant you have
  already named.
- The seed and the cut are Material Design glyphs in the page's own ink,
  where they were a chestnut and a pair of scissors in Apple's colours. The
  sowing date and the seed list no longer run into each other.
- A plant's seed is stated on the plant's own row. "Seeds on hand" was a
  section of its own, with a dropdown re-picking a plant the ledger already had
  on screen, and a saved packet whose only gesture was a jump back to the form
  to add a second row for a plant that was already there. Open a plant on the
  **Plant ledger** — the Crop ledger, renamed — and its sowing date and its
  packet are there.
- Every plant on the page is called a plant.
- The Dashboard and the Almanac are read together, so each now starts the
  other's reading in the background while the grower is on the first one. Flip
  across and the page is already there. A page revisited within a few minutes
  is served from what was already asked for rather than asked again — so a
  grower who moves between the two several times pays one fare each instead of
  one per visit. A reader who opens only one of the two pays for a reading of
  the other they never look at.
- The heat chart gives its top corner back to the season. "MEDIAN FIRST FROST"
  ran nearly a fifth of the chart's width in words; it is now one ice-crystal
  mark sitting on the line it names. And today's dot no longer spells out
  "today" — the dot says that, and a tick on the date axis says it again, so
  all that is written is the figure a reader cannot get from the picture.
- The historical range now runs to the right-hand edge of every chart instead
  of stopping at today. A normal range is history, and history has a figure
  for November as readily as for September — so the forecast and the
  projection, the part a grower is actually asking about, finally have
  something behind them to be read against. Nothing else about the band
  changes: same ten seasons, same min/mean/max, same fill.
