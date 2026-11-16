/** Good Earth's English words from `src/components`. Keys are "<area>.<file>.<name>"; see ../index.ts. */

const words = {
  // AppShell: the rail of views (left on a wide screen, bottom bar on a phone)
  "ui.appShell.rail.myPlots": "My Plots",
  "ui.appShell.rail.dashboard": "Dashboard",
  // The weather and season page.
  "ui.appShell.rail.almanac": "Almanac",
  // Plants grown (crops, flowers, trees).
  "ui.appShell.rail.flora": "Flora",
  "ui.appShell.rail.pests": "Pests",
  // Animals seen on the ground.
  "ui.appShell.rail.fauna": "Fauna",
  "ui.appShell.rail.tasks": "Tasks",
  "ui.appShell.rail.fieldReports": "Field Reports",
  "ui.appShell.rail.guides": "Guides",
  // The glossary.
  "ui.appShell.rail.words": "Words",
  "ui.appShell.rail.references": "References",
  "ui.appShell.rail.prices": "Prices",
  "ui.appShell.rail.about": "About",
  "ui.appShell.views": "Views",
  "ui.appShell.expandRail": "Expand the rail",
  "ui.appShell.collapseRail": "Collapse the rail",
  "ui.appShell.expand": "Expand",
  "ui.appShell.collapse": "Collapse",
  // {{label}} is a rail view's name, e.g. "Tasks".
  "ui.appShell.moveUp": "Move {{label}} up",
  "ui.appShell.moveDown": "Move {{label}} down",
  "ui.appShell.done": "Done",
  "ui.appShell.reorder": "Reorder",
  "ui.appShell.yourAccount": "Your account",
  "ui.appShell.account": "Account",
  // Subject of "… could not be drawn." when a page breaks.
  "ui.appShell.thisPage": "This page",
  // PlotStation: choosing the FieldData weather station a plot reads from
  "ui.plotStation.sending": "Sending your Nostr message…",
  "ui.plotStation.asking": "Asking FieldData for your stations…",
  "ui.plotStation.looking": "Looking for your reply…",
  "ui.plotStation.connected": "Connected",
  "ui.plotStation.saving": "Saving…",
  "ui.plotStation.saved": "Saved",
  "ui.plotStation.station": "Station",
  "ui.plotStation.none": "None",
  "ui.plotStation.change": "Change",
  "ui.plotStation.choose": "Choose from FieldData",
  "ui.plotStation.findOnMap": "Find on map",
  "ui.plotStation.keep": "Keep this",
  // <phrase/> is a short code word the message is marked with.
  "ui.plotStation.sent": "FieldData sent you a Nostr message marked <phrase/>.",
  "ui.plotStation.replyThenTap": "Reply to it, then tap below.",
  // {{relay}} is a relay address, wss://…
  "ui.plotStation.replyOn": "Reply on {{relay}}",
  "ui.plotStation.replied": "I replied",
  "ui.plotStation.sendNew": "Send a new message",
  "ui.plotStation.cancel": "Cancel",
  "ui.plotStation.connect": "Connect FieldData",
  // App: the site's own words above the sign-in card
  "ui.app.welcome": "Natural phenomena for your acreage. Frost, heat, rain and daylight, read for the ground you actually farm, season by season.",
  // Top bar conditions line. <temp/> is tonight's low, e.g. "31°F"; <soft>…</soft> is drawn quieter.
  "ui.app.tonight": "Tonight <temp/><soft> on low ground</soft>",
  // {{n}} is a percentage of sky covered.
  "ui.app.cloud": "{{n}}% cloud",
  // {{temp}} is the dew point, e.g. "48°F".
  "ui.app.dew": "{{temp}} dew",
  "ui.app.forgotten": "Your ground is forgotten. You are still a patron here.",
  // ui: shared page furniture
  // Shown above a chart enlarged to full screen.
  "ui.ui.escToClose": "Esc to close",
  // {{label}} is what is enlarged, e.g. "the map", "the season's heat".
  "ui.ui.shrink": "Shrink {{label}}",
  "ui.ui.enlarge": "Enlarge {{label}}",
  // {{what}} names the row being edited, e.g. "the planting".
  "ui.ui.save": "Save {{what}}",
  "ui.ui.cancelEdit": "Cancel edit",
  // {{label}} is a number field's caption; the buttons step it down or up.
  "ui.ui.stepDown": "{{label}} down",
  "ui.ui.stepUp": "{{label}} up",
  // {{label}} is a date field's caption.
  "ui.ui.monthOf": "{{label}} — month",
  "ui.ui.dayOf": "{{label}} — day",
  // Empty choice in the month / day dropdowns.
  "ui.ui.monthPick": "month…",
  "ui.ui.dayPick": "day…",

  // CropLedger: the plantings table
  "ui.cropLedger.status.pastTarget": "Past target",
  "ui.cropLedger.status.onPace": "On pace",
  "ui.cropLedger.status.stalled": "Stalled",
  "ui.cropLedger.status.notYetOut": "Not yet out",
  "ui.cropLedger.status.perennial": "Perennial",
  "ui.cropLedger.status.notTracked": "Not tracked",
  "ui.cropLedger.verdict.wontFinish": "Won't finish",
  "ui.cropLedger.verdict.finishes": "Finishes",
  "ui.cropLedger.verdict.done": "Done",
  "ui.cropLedger.verdict.unknown": "Unknown",
  "ui.cropLedger.col.plant": "Plant",
  "ui.cropLedger.col.setOut": "Set out",
  "ui.cropLedger.col.heat": "Heat to target",
  "ui.cropLedger.col.heatInfo": "Growing degree days this planting has banked since it was set out, against the target you gave it. The bar fills as the heat arrives; the target is when it reaches the stage you care about, usually harvest.",
  "ui.cropLedger.col.projected": "Projected",
  "ui.cropLedger.col.projectedInfo": "The date this planting reaches its heat target if the last fortnight’s heat keeps arriving at the same daily pace. It reads no weather forecast, so a cooling autumn reaches it later than shown.",
  "ui.cropLedger.col.frost": "Frost",
  "ui.cropLedger.col.frostInfo": "Whether that date comes before the median first frost on this ground — and by how many days it clears it, or misses.",
  "ui.cropLedger.col.status": "Status",
  // <b> marks each status name, as shown on its badge.
  "ui.cropLedger.col.statusInfo": "<b>On pace</b>: heat is arriving and a date can be projected. <b>Past target</b>: it has banked its heat. <b>Stalled</b>: too little heat lately to project a date. <b>Not yet out</b>: its set-out date is still ahead. <b>Not tracked</b>: it has no set-out date or no heat target to count from. <b>Perennial</b>: judged on winter chill and hardiness instead.",
  // Short facts under a plant's name, joined by " · ". "h" is hours.
  "ui.cropLedger.fact.chill": "{{n}} h chill",
  "ui.cropLedger.fact.hardy": "hardy to {{temp}}",
  "ui.cropLedger.fact.target": "target {{dd}}",
  "ui.cropLedger.fact.base": "base {{temp}}",
  "ui.cropLedger.nothingToCount": "nothing to count from",
  "ui.cropLedger.seedFor": "Seed for {{crop}}",
  "ui.cropLedger.seedForHeld": "Seed for {{crop}} — on hand",
  "ui.cropLedger.seedOnHand": "Seed on hand",
  "ui.cropLedger.seed": "Seed",
  "ui.cropLedger.recordCutOf": "Record a cut of {{crop}}",
  "ui.cropLedger.recordHarvest": "Record a harvest",
  "ui.cropLedger.companionsFor": "Companions for {{crop}}",
  "ui.cropLedger.companions": "Companions",
  "ui.cropLedger.removeCrop": "Remove {{crop}}",
  "ui.cropLedger.remove": "Remove",
  "ui.cropLedger.refreshMissing": "The reference has nothing to set beside this planting.",
  // After the heat bar's figures, e.g. " · 120 to go" (degree days still needed).
  "ui.cropLedger.toGo": " · {{n}} to go",
  "ui.cropLedger.marginDays_one": "{{count}} days of margin",
  "ui.cropLedger.marginDays_other": "{{count}} days of margin",
  "ui.cropLedger.daysLate_one": "{{count}} days late",
  "ui.cropLedger.daysLate_other": "{{count}} days late",
  "ui.cropLedger.pastEarliestFrost": "past the earliest frost on record",
  "ui.cropLedger.gddShort": "~{{n}} GDD short",
  // Companions: two kinds of pairing
  "ui.cropLedger.synergy": "Synergy",
  "ui.cropLedger.synergyTitle": "Biological companions, by cited family rules",
  "ui.cropLedger.design": "Design",
  "ui.cropLedger.designTitle": "Visual companions, from the colour, height and bloom you recorded",
  "ui.cropLedger.closeCompanions": "Close companions",
  "ui.cropLedger.reading": "Reading…",
  "ui.cropLedger.noCompanions": "Nothing on the record pairs with this yet.",
  // {{names}}: plant names that could not be placed; {{reason}}: why, from the server.
  "ui.cropLedger.notPlaced": "Not placed: {{names}} — {{reason}}.",
  // Seed row: the day it was sown and the packet
  "ui.cropLedger.sown": "Sown",
  "ui.cropLedger.addSeedLotOf": "Add a seed lot of {{crop}}",
  "ui.cropLedger.addSeedLot": "Add a seed lot",
  "ui.cropLedger.removeSeed": "Remove {{crop}} seed",
  "ui.cropLedger.removeLot": "Remove this lot",
  "ui.cropLedger.cancel": "Cancel",
  "ui.cropLedger.addSeedLotAria": "Add seed lot",
  "ui.cropLedger.saveSeed": "Save seed",
  "ui.cropLedger.add": "Add",
  "ui.cropLedger.save": "Save",
  // Harvest row
  "ui.cropLedger.aCutOf": "A cut of {{crop}}",
  "ui.cropLedger.cutOn": "Cut on",
  "ui.cropLedger.howMuch": "How much",
  // Example unit in an empty unit box.
  "ui.cropLedger.stemsPlaceholder": "stems",
  "ui.cropLedger.note": "Note",
  "ui.cropLedger.optional": "optional",
  // Fills "Save {{what}}" on the row's save button.
  "ui.cropLedger.whatHarvest": "harvest",
  "ui.cropLedger.whatPlanting": "planting",
  // Editing a planting: example entries in empty boxes. {{unit}}: a unit symbol.
  "ui.cropLedger.cropPlaceholder": "Zinnia · succession 4",
  "ui.cropLedger.targetPlaceholder": "{{unit}} target — leave blank for a perennial",
  "ui.cropLedger.basePlaceholder": "base{{unit}}",
  // EventComposer: tracking an animal's year
  // The clocks an event can run on, shown as short pills.
  "ui.eventComposer.clock.interval": "days from",
  "ui.eventComposer.clock.calendar": "your record",
  "ui.eventComposer.clock.daylight": "daylight",
  "ui.eventComposer.clock.heat": "heat",
  "ui.eventComposer.clock.condition": "conditions",
  "ui.eventComposer.clock.moon": "moon",
  "ui.eventComposer.phase.new": "new",
  "ui.eventComposer.phase.firstQuarter": "first quarter",
  "ui.eventComposer.phase.full": "full",
  "ui.eventComposer.phase.lastQuarter": "last quarter",
  // {{phase}}: one of the phase words above.
  "ui.eventComposer.phaseMoon": "{{phase}} moon",
  // Which moon of that phase: the first, second or third after a date.
  "ui.eventComposer.nth.first": "first",
  "ui.eventComposer.nth.second": "second",
  "ui.eventComposer.nth.third": "third",
  "ui.eventComposer.help.interval": "A count of days from a day you saw — a cycle. Gestation, incubation, days to point of lay.",
  "ui.eventComposer.help.condition": "What the weather has to do. Re-dates itself every season from this ground's own record.",
  // The grower's view of an animal.
  "ui.eventComposer.role.friend": "friend",
  "ui.eventComposer.role.foe": "foe",
  "ui.eventComposer.role.watch": "watch",
  "ui.eventComposer.catalogFailed": "What is recorded here could not be read.",
  "ui.eventComposer.datesFailed": "The dates could not be worked out.",
  "ui.eventComposer.species": "Species",
  "ui.eventComposer.speciesPlaceholder": "hen, ewe, robin…",
  "ui.eventComposer.readingCatalog": "Reading what is recorded here…",
  // {{name}}: the other name of the animal that matched the words typed.
  "ui.eventComposer.matched": "matched “{{name}}”",
  "ui.eventComposer.onYourRecord": "on your record",
  "ui.eventComposer.looking": "Looking…",
  "ui.eventComposer.searchFailed": "iNaturalist could not be searched just now ({{error}}) — these are only the animals recorded near here.",
  // Followed directly by ui.eventComposer.addOwn, hence the trailing space.
  "ui.eventComposer.nothingListed": "Nothing listed. ",
  // {{name}}: what the grower typed.
  "ui.eventComposer.addOwn": "Add <b>{{name}}</b> as your own.",
  "ui.eventComposer.typeToSearch": "Type a name to search for an animal.",
  "ui.eventComposer.whatYouSaw": "What you saw",
  "ui.eventComposer.whatItDoes": "What it does",
  "ui.eventComposer.sawPlaceholder": "laying on eggs",
  "ui.eventComposer.doesPlaceholder": "first arrival",
  "ui.eventComposer.track": "Track",
  "ui.eventComposer.trackTitle": "Track it: the clock and its figures",
  "ui.eventComposer.trackIt": "Track it",
  "ui.eventComposer.whichAnimal": "Which animal?",
  "ui.eventComposer.close": "Close",
  "ui.eventComposer.startOver": "start over",
  "ui.eventComposer.dayItHappened": "The day it happened",
  "ui.eventComposer.andThen": "And then, counting from that day",
  "ui.eventComposer.whatFollows": "What follows",
  "ui.eventComposer.followsPlaceholder": "eggs hatch",
  "ui.eventComposer.days": "Days",
  // {{what}}: the milestone's own label, or the word "milestone".
  "ui.eventComposer.remove": "Remove {{what}}",
  "ui.eventComposer.milestone": "milestone",
  "ui.eventComposer.addMilestone": "+ a milestone",
  // After "+ a milestone": the count of days the grower used last time.
  "ui.eventComposer.asYouHadIt": " ({{n}} days, as you had it)",
  "ui.eventComposer.typicallyOn": "Typically on",
  // {{h}}: hours of daylight.
  "ui.eventComposer.dayLength": "Day length — {{h}} h",
  // {{name}}: the block's name; {{low}}–{{high}}: hours of daylight.
  "ui.eventComposer.daylightRange": "{{name}} runs {{low}}–{{high}} h this season",
  "ui.eventComposer.readingDaylight": "reading this block's day length…",
  "ui.eventComposer.lengthening": "days lengthening",
  "ui.eventComposer.shortening": "days shortening",
  // {{unit}}: a temperature unit such as " °F".
  "ui.eventComposer.base": "Base{{unit}}",
  // {{name}}: the block's name; {{n}} {{unit}}: degree days banked.
  "ui.eventComposer.seasonSoFar": "{{name}} has {{n}} {{unit}} on the season so far.",
  "ui.eventComposer.readingSeason": "reading this block's season so far…",
  "ui.eventComposer.notBefore": "Not before",
  "ui.eventComposer.nightAtOrAbove": "Night at or above{{unit}}",
  "ui.eventComposer.dayAtOrAbove": "Day at or above{{unit}}",
  "ui.eventComposer.rained": "and it rained",
  "ui.eventComposer.onOrAfter": "On or after",
  "ui.eventComposer.workingOut": "Working out the dates…",
  "ui.eventComposer.notThisSeason": "not this season",
  "ui.eventComposer.inDays": " · in {{n}} days",
  "ui.eventComposer.nothingToDate": "Nothing to date from this yet — it is recorded all the same.",
  "ui.eventComposer.workedOut": "Good Earth worked these out on your ground, not this browser.",
  "ui.eventComposer.record": "Record",
  "ui.eventComposer.previousCycle": "The previous {{n}}-row cycle is kept as history and comes off the calendar.",
  "ui.eventComposer.rowsOneWrite_one": "{{count}} row, one write",
  "ui.eventComposer.rowsOneWrite_other": "{{count}} rows, one write",
  "ui.eventComposer.countsAreYours": "The counts are yours. Good Earth adds the days you give it to the day you saw and says when the window opens. How long a thing takes belongs to your animals and your breed, and your own records beat any average this service could ship.",
  // SpeciesFinder: searching what is recorded near a block
  "ui.speciesFinder.nothingRead": "Nothing could be read.",
  // {{name}}: the block's name.
  "ui.speciesFinder.searchNear": "Search what is recorded near {{name}}",
  "ui.speciesFinder.placeholder": "bumble, maple, chanterelle…",
  "ui.speciesFinder.adding": "Adding…",
  "ui.speciesFinder.lifecycleTitle": "Only the ones USA-NPN publishes a life cycle for",
  "ui.speciesFinder.withLifecycle": "With Lifecycle",
  "ui.speciesFinder.looking": "Looking…",
  "ui.speciesFinder.nothingByName": "Nothing recorded by that name near here.",
  // e.g. "20 of 3,542 · page 1 of 178"
  "ui.speciesFinder.shownOf": "{{shown}} of {{total}} · page {{page}} of {{pages}}",
  "ui.speciesFinder.chosen": " · {{n}} chosen",
  "ui.speciesFinder.choose": "Choose {{name}}",
  "ui.speciesFinder.whatIs": "What is {{name}}?",
  "ui.speciesFinder.nothingHere": "Nothing here. Try a shorter word, or clear the search to see what is most recorded.",
  "ui.speciesFinder.back": "‹ Back",
  "ui.speciesFinder.more": "More ›",
  // PlotFolders: groups of plots, shown as folders
  "ui.plotFolders.show": "Show",
  "ui.plotFolders.hide": "Hide",
  // {{name}}: the group's own name.
  "ui.plotFolders.newGroupInside": "New group inside {{name}}",
  "ui.plotFolders.group": "Group",
  "ui.plotFolders.editPlots": "Edit plots",
  "ui.plotFolders.rename": "Rename",
  "ui.plotFolders.close": "Close",
  "ui.plotFolders.newGroup": "New group",
  "ui.plotFolders.groupPlots": "Group plots",
  "ui.plotFolders.groupMenu": "{{name}}: show, hide or edit",
  "ui.plotFolders.needsName": "A group needs a name.",
  "ui.plotFolders.tooDeep": "A group is at most six levels deep.",
  // Example group name in an empty box.
  "ui.plotFolders.namePlaceholder": "Orchard",
  // Fills "Save {{what}}" on the save button when the group has no name yet.
  "ui.plotFolders.whatGroup": "group",
  // The example is a path of group names joined by " / ".
  "ui.plotFolders.slashHelp": "A slash puts a group inside another: North Farm / Orchard.",
  "ui.plotFolders.needsNameDepth": "A group needs a name, at most six levels deep.",
  "ui.plotFolders.moveHelp": "Type another path to move it, with every group and plot inside: South Farm / Orchard.",
  // RegionPicker: choosing the block being worked, in the top bar
  "ui.regionPicker.workedExample": "worked example — not your ground",
  // {{ha}}: hectares; {{n}}: how many points the terrain was sampled at.
  "ui.regionPicker.areaSamples": "{{ha}} ha · {{n}} samples",
  "ui.regionPicker.samples": "{{n}} samples",
  "ui.regionPicker.notMeasured": "not measured yet",
  "ui.regionPicker.example": "example",
  // A block drawn as a pin with a radius in metres.
  "ui.regionPicker.pin": "pin {{m}} m",
  "ui.regionPicker.polygon": "polygon",
  "ui.regionPicker.forget": "Forget {{name}}",
  "ui.regionPicker.yourGround": "Your ground",
  "ui.regionPicker.find": "Find a plot or group",
  "ui.regionPicker.addPin": "Add a pin",
  "ui.regionPicker.pastePolygon": "Paste a polygon",
  "ui.regionPicker.name": "Name",
  // Example block name in an empty box.
  "ui.regionPicker.namePlaceholder": "East Bench",
  "ui.regionPicker.latitude": "Latitude",
  "ui.regionPicker.longitude": "Longitude",
  "ui.regionPicker.radius": "Radius (m)",
  // {{unit}}: a temperature unit such as " °F".
  "ui.regionPicker.base": "Base{{unit}}",
  "ui.regionPicker.saving": "Saving…",
  "ui.regionPicker.saveBlock": "Save block",
  // GeoJSON is a file format's name.
  "ui.regionPicker.geojson": "GeoJSON Polygon",

  // SeasonChart: the season heat curve
  "ui.seasonChart.frostTitle": "Median first frost",
  "ui.seasonChart.notEnough": "Not enough of the season on record yet to draw a curve.",
  "ui.seasonChart.gddAxis": "Grow Degree Days",
  // {{base}} is a temperature number; {{years}} a count of seasons
  "ui.seasonChart.aria": "Cumulative growing degree days, base {{base}} degrees Fahrenheit, against the {{years}}-season range",
  // {{label}} is an event's name on the chart
  "ui.seasonChart.flagDetails": "{{label}} — details",
  "ui.seasonChart.today": "Today",
  // {{label}} is a weather series (e.g. rain); {{min}}–{{max}} its range in {{unit}}; <soft> is greyed
  "ui.seasonChart.overlay": "{{emoji}} {{label}} behind the curve · {{min}}–{{max}} {{unit}}<soft> · own scale, no axis</soft>",
  // Legend entries under the chart
  "ui.seasonChart.legendRange": "{{years}}-season range",
  "ui.seasonChart.legendMean": "this season (mean)",
  "ui.seasonChart.legendSpread": "across your ground",
  "ui.seasonChart.legendForecast": "7-day forecast",
  "ui.seasonChart.legendProjection": "projection at the recent rate",
  "ui.seasonChart.legendTypical": "a typical year after that",
  "ui.seasonChart.legendWet": "wet",
  "ui.seasonChart.legendWetAhead": "wet · ahead",
  "ui.seasonChart.legendCrops": "crops",
  "ui.seasonChart.legendPests": "pests",
  "ui.seasonChart.legendWildlife": "wildlife",
  "ui.seasonChart.annualTitle": "The whole timeline, however far your dated tasks reach",
  // SunSpotCard: one spot's light, under the map
  "ui.sunSpotCard.fullSun": "Full sun",
  "ui.sunSpotCard.partShade": "Part shade",
  "ui.sunSpotCard.fullShade": "Full shade",
  // {{observed}} is when the canopy imagery was taken
  "ui.sunSpotCard.canopyObserved": "canopy imagery {{observed}}",
  "ui.sunSpotCard.canopy": "canopy imagery",
  "ui.sunSpotCard.terrain": "terrain 30 m",
  "ui.sunSpotCard.sunshineYears": "{{years}} years of sunshine",
  "ui.sunSpotCard.thisSpot": "This spot",
  // <n> is the big number of hours; <soft> the small words after it
  "ui.sunSpotCard.hoursIn": "<n>{{hours}}</n><soft>h of direct sun a day in {{month}}</soft>",
  // Sky-dome key: the hill and tree silhouettes
  "ui.sunSpotCard.hills": "Hills",
  "ui.sunSpotCard.trees": "Trees",
  "ui.sunSpotCard.dashedHidden": "dashed = sun hidden",
  "ui.sunSpotCard.monthByMonth": "Direct sun, month by month",
  "ui.sunSpotCard.leastLight": "Least light in {{month}}: {{hours}} h a day.",
  "ui.sunSpotCard.panelsHere": "Panels here",
  "ui.sunSpotCard.kwhPerKw": "kWh per kW a year",
  "ui.sunSpotCard.openSky": "of open-sky yield",
  "ui.sunSpotCard.screening": "A screening estimate, not a site survey.",
  "ui.sunSpotCard.noSolar": "No solar figures for this plot.",
  "ui.sunSpotCard.skyAria": "Sky above this spot: the tree and hill silhouette with the sun's path in June, at the equinoxes and in December",
  // Compass letters around the sky dome
  "ui.sunSpotCard.north": "N",
  "ui.sunSpotCard.east": "E",
  "ui.sunSpotCard.south": "S",
  "ui.sunSpotCard.west": "W",
  "ui.sunSpotCard.barsAria": "Hours of direct sun a day at this spot, month by month",
  // A solar array's footprint
  "ui.sunSpotCard.array": "Array",
  "ui.sunSpotCard.widthLabel": "Width, metres east to west",
  "ui.sunSpotCard.lengthLabel": "Length, metres north to south",
  "ui.sunSpotCard.toInstall": "to install",
  "ui.sunSpotCard.kwhDay": "kWh a day",
  "ui.sunSpotCard.dayNet": "a day, net",
  // {{quarter}} is a period like "2024 Q4"
  "ui.sunSpotCard.benchmark": "DOE benchmark {{quarter}}",
  "ui.sunSpotCard.noBenchmark": "no benchmark read",
  "ui.sunSpotCard.paybackUnder": "· under a year to pay back",
  "ui.sunSpotCard.paybackYears": "· {{n}} yr to pay back",
  "ui.sunSpotCard.noTariff": "no tariff on file",
  "ui.sunSpotCard.setRate": "Set what a kWh sells for",
  "ui.sunSpotCard.setRateTitle": "What your utility pays for a kWh",
  "ui.sunSpotCard.noPrices": "No prices came with this reading.",
  "ui.sunSpotCard.centsAria": "Cents per kWh your utility pays",
  "ui.sunSpotCard.keepRate": "Keep this rate",
  // EventDetail: one event on the season chart, opened
  "ui.eventDetail.cropLabel": "Crop target",
  "ui.eventDetail.cropSource": "The degree-days your planting needs, counted from when it went in.",
  "ui.eventDetail.pestLabel": "Pest threshold",
  "ui.eventDetail.pestSource": "Your degree-day figure for this pest — check it against your extension bulletin.",
  "ui.eventDetail.wildlifeLabel": "Fauna event",
  "ui.eventDetail.wildlifeSource": "Your degree-day figure for this animal.",
  "ui.eventDetail.taskLabel": "Your task",
  "ui.eventDetail.taskSource": "You chose the date and it's not tied to GDDs.",
  "ui.eventDetail.pastDue": "Past due and not marked done.",
  "ui.eventDetail.fixedDate": "You recorded this fixed date.",
  "ui.eventDetail.happened": "It's happened, by this season's record.",
  "ui.eventDetail.fairlySure": "Fairly sure: it's within the 7-day forecast.",
  "ui.eventDetail.roughGuess": "A rough guess, assuming the last two weeks' warmth holds.",
  "ui.eventDetail.close": "Close",
  "ui.eventDetail.furtherOut": "Further out than we can project",
  "ui.eventDetail.dueNotDone": "due · not done yet",
  "ui.eventDetail.due": "due",
  "ui.eventDetail.passed": "already passed",
  "ui.eventDetail.expected": "expected",
  // Follows the status word above, e.g. "expected · at 1,200 GDD accumulated"
  "ui.eventDetail.atGdd": " · at {{gdd}} GDD accumulated",
  "ui.eventDetail.whatItIs": "What it is",
  "ui.eventDetail.lookingUp": "Looking it up…",
  "ui.eventDetail.notListed": "Not in the species lists — likely a local name — but the timing holds.",
  "ui.eventDetail.howConfident": "How confident?",
  "ui.eventDetail.howDetermined": "How determined?",
  "ui.eventDetail.baseMismatch": "⚠ Different base temperature",
  // {{theirs}} and {{yours}} are temperatures with their unit
  "ui.eventDetail.baseMismatchText": "Placed roughly: this has a GDD base of {{theirs}}, but your Plot has a GDD base of {{yours}} — change the {{theirs}} base for better placement.",
  "ui.eventDetail.acrossGround": "Across your ground",
  "ui.eventDetail.spreadDays_one": "Your warm and cool spots run about {{count}} day apart, so expect it on warm ground first.",
  "ui.eventDetail.spreadDays_other": "Your warm and cool spots run about {{count}} days apart, so expect it on warm ground first.",
  "ui.eventDetail.treatment": "Treatment advice",
  "ui.eventDetail.followBulletin": "Follow the bulletin below: treatment rules vary by state, and the label is the law.",
  "ui.eventDetail.moreAccurate": "Make it more accurate",
  "ui.eventDetail.reportIt": "Report when you see it: your dated records improve the predictions.",
  // FieldMap: the drawing map. Layer buttons:
  "ui.fieldMap.satellite": "Satellite",
  "ui.fieldMap.map": "Map",
  "ui.fieldMap.clickCorners": "Click each corner of your field. Three corners and it has an area.",
  "ui.fieldMap.clickMiddle": "Click the middle of your field, then set the radius.",
  // {{corners}} counts the polygon's corners; {{metres}} its perimeter
  "ui.fieldMap.corners": "{{corners}} corners · {{metres}} m around",
  "ui.fieldMap.radius": "{{metres}} m radius",
  // Button: zoom the map to fit the drawn field
  "ui.fieldMap.fit": "fit",
  // PlotsMap: every plot on one map
  // What the enlarge button enlarges, as in "Enlarge the map"
  "ui.plotsMap.theMap": "the map",
  "ui.plotsMap.sunShade": "Sun and shade",
  "ui.plotsMap.plotNames": "Plot names",
  // SpeciesPicker: searching iNaturalist for a name
  // {{name}} is a species' common or scientific name
  "ui.speciesPicker.about": "About {{name}}",
  "ui.speciesPicker.change": "Change",
  "ui.speciesPicker.placeholder": "Start typing a name…",
  "ui.speciesPicker.searchAria": "Search for a species",
  "ui.speciesPicker.looking": "Looking…",
  "ui.speciesPicker.nothing": "Nothing by that name.",
  // {{matched}} is the alternate name the search matched on
  "ui.speciesPicker.matched": "matched “{{matched}}”",
  "ui.speciesPicker.source": "iNaturalist · most-recorded first",

  // SoilCard — {{temp}} is a temperature with its unit
  "ui.soilCard.coolingThrough": "Soil cooling through {{temp}}",
  "ui.soilCard.warmingThrough": "Soil warming through {{temp}}",
  "ui.soilCard.now": "now <b>{{temp}}</b>",
  // Screen-reader description of the chart; the three parts are joined in order, so keep each trailing space.
  "ui.soilCard.ariaAgainst": "Soil at planting depth against {{n}} degrees. ",
  "ui.soilCard.ariaCrosses": "Crosses {{date}}. ",
  "ui.soilCard.ariaNoCross": "Does not cross inside the forecast. ",
  "ui.soilCard.ariaNormally": "Normally {{median}}, between {{earliest}} and {{latest}}.",
  "ui.soilCard.normally": "normally {{date}}",
  "ui.soilCard.today": "today",
  // Legend for the forecast line
  "ui.soilCard.forecast": "forecast",
  "ui.soilCard.forecastNoCrossing": "forecast — no crossing in it",
  "ui.soilCard.acrossRecord": "{{from}}–{{to}} across the record",
  // FrostCard — {{reason}} is the server's own explanation (wind and sky)
  "ui.frostCard.hardFreeze": "Hard freeze",
  "ui.frostCard.frostLikely": "Frost likely",
  "ui.frostCard.frostWatch": "Frost watch",
  "ui.frostCard.nothingNear": "Nothing near freezing",
  "ui.frostCard.outlook": "Frost outlook",
  "ui.frostCard.nightOutlook": "{{n}}-night outlook",
  "ui.frostCard.lowVsGround": "Forecast low <b>{{low}}</b>, but the coldest ground on your land sits near <b>{{ground}}</b> — {{reason}}.",
  // {{n}}{{unit}} is a temperature difference, e.g. "3.2°F"
  "ui.frostCard.lowGroundRuns": "Low ground runs about {{n}}{{unit}} under the forecast on a night like this.",
  "ui.frostCard.nothingInReach": "Nothing within reach of freezing in the next {{n}} nights.",
  "ui.frostCard.coldestIs": "The coldest is {{temp}} on low ground, {{day}}.",
  "ui.frostCard.terrainUnavailable": "Terrain unavailable — this is the forecast low with no drainage applied.",
  // The three first-frost dates
  "ui.frostCard.earliest": "earliest",
  "ui.frostCard.usually": "usually",
  "ui.frostCard.latest": "latest",
  "ui.frostCard.firstFrost": "First frost",
  "ui.frostCard.seasonsOnRecord": "{{n}} seasons on record",
  "ui.frostCard.daysOut": "{{n}} days out",
  "ui.frostCard.nightAria": "{{day}}, coldest ground {{n}} degrees",
  "ui.frostCard.nightDetail": "<b>{{day}}</b> — coldest ground {{ground}}, forecast {{low}}. {{reason}}.",
  // Optional parts appended after nightDetail, joined by ", " and closed by "."
  "ui.frostCard.wind": "Wind {{n}} mph",
  "ui.frostCard.cloud": "{{n}}% cloud",
  "ui.frostCard.dewPoint": "dew point {{temp}}",
  // Share — {{title}} is the page's own sheet title
  "ui.share.share": "Share {{title}}",
  // Shown in a browser prompt when the clipboard refuses; {{what}} is ui.share.whatJson / whatTable or a caller's phrase
  "ui.share.copyPrompt": "Copy {{what}}:",
  "ui.share.whatJson": "{{title}} as JSON",
  "ui.share.whatTable": "the {{title}} table",
  "ui.share.copyJson": "Copy as JSON",
  "ui.share.copyTable": "Copy the table",
  "ui.share.close": "Close",
  "ui.share.nothing": "Nothing on this page yet.",
  // Diagram — screen-reader text; stage names are joined with ui.diagram.then (keep its leading comma and spaces)
  "ui.diagram.then": ", then ",
  "ui.diagram.theYear": "The year: {{stages}}",
  // LifeCycleStory
  "ui.lifeCycleStory.couldNotRead": "Its life cycle could not be read.",
  "ui.lifeCycleStory.alreadyTracked": "Already tracked",
  // Link to where an event's facts came from
  "ui.lifeCycleStory.source": "source",
  "ui.lifeCycleStory.saving": "Saving…",
  "ui.lifeCycleStory.trackThese": "Track these {{n}}",
  // ZoomControls — {{label}} is the chart's own quantity (degree days, °F, inches, hours)
  "ui.zoomControls.zoomInOn": "Zoom in on {{label}}",
  "ui.zoomControls.expandScale": "Expand the {{label}} scale",
  "ui.zoomControls.zoomOutOn": "Zoom out on {{label}}",
  "ui.zoomControls.compressScale": "Compress the {{label}} scale",
  "ui.zoomControls.dates": "Dates",
  "ui.zoomControls.zoomInDates": "Zoom in on dates",
  "ui.zoomControls.narrowDates": "Narrow the date range",
  "ui.zoomControls.zoomOutDates": "Zoom out on dates",
  "ui.zoomControls.widenDates": "Widen the date range",
  "ui.zoomControls.wholeSeason": "Whole season",
  // RadarMap — theRain fills the enlarge button's "Enlarge …" label
  "ui.radarMap.theRain": "the rain",
  "ui.radarMap.loading": "Loading radar…",
  "ui.radarMap.pause": "Pause radar",
  "ui.radarMap.play": "Play radar",
  "ui.radarMap.time": "Radar time",
  // WaterStrip — {{balance}}, {{rain}}, {{et0}} are depths with their unit; ET₀ is reference evapotranspiration
  "ui.waterStrip.aria": "Rain and evapotranspiration per day; balance {{balance}} today",
  "ui.waterStrip.dayTitle": "{{date}}: rain {{rain}}, ET₀ {{et0}}, balance {{balance}}",
  "ui.waterStrip.dayRootZone": ", root zone {{pct}}",
  "ui.waterStrip.today": "today",
  "ui.waterStrip.topsoilModel": "topsoil, model",
  "ui.waterStrip.rootZoneModel": "root zone, model",
  // Change in soil moisture, in percentage points
  "ui.waterStrip.ptsThisWeek": "{{n}} pts this week",
  // A soil-moisture probe; {{name}} is the probe's own channel name
  "ui.waterStrip.probe": "probe",
  "ui.waterStrip.probeNamed": "probe {{name}}",
  "ui.waterStrip.yourStation": "your station",
  "ui.waterStrip.rain": "rain",
  "ui.waterStrip.toTheAir": "to the air (ET₀)",
  "ui.waterStrip.runningBalance": "running balance",
  "ui.waterStrip.forecast": "forecast",
  // SeedForm — a seed packet's fields
  "ui.seedForm.variety": "Variety",
  // Days to maturity
  "ui.seedForm.days": "Days",
  "ui.seedForm.nonePublished": "none published",
  "ui.seedForm.lookItUp": "Look it up",
  "ui.seedForm.germination": "Germination %",
  "ui.seedForm.germinationTested": "Germination tested",
  // The season (year) the seed was packed for
  "ui.seedForm.packedFor": "Packed for",
  "ui.seedForm.inventoryCount": "Inventory count",
  "ui.seedForm.supplier": "Supplier",
  "ui.seedForm.aSeedHouse": "a seed house",
  "ui.seedForm.suppliersLot": "Supplier’s lot",
  // PlotEditor
  "ui.plotEditor.needsName": "A plot needs a name.",
  "ui.plotEditor.name": "Name",
  "ui.plotEditor.plot": "plot",
  "ui.plotEditor.alsoCalled": "Also called",
  "ui.plotEditor.remove": "Remove {{name}}",
  "ui.plotEditor.anotherName": "Another name for it",
  "ui.plotEditor.addName": "Add name",
  "ui.plotEditor.aliasHint": "Any part of the name already works. Add one only for a name that shares no words with it.",
  "ui.plotEditor.groups": "Groups",
  "ui.plotEditor.takeOutOf": "Take it out of {{group}}",
  // An example group path: a group inside another, joined by " / "
  "ui.plotEditor.groupPlaceholder": "North Farm / Orchard",
  "ui.plotEditor.addGroup": "Add group",
  "ui.plotEditor.slashHint": "A slash puts a group inside another.",
  // SpeciesCard — {{n}} is an already formatted count
  "ui.speciesCard.close": "Close",
  "ui.speciesCard.reading": "Reading…",
  "ui.speciesCard.nearHere": "{{n}} near here",
  "ui.speciesCard.observations": "observations",
  "ui.speciesCard.worldwide": "{{n}} worldwide",
  "ui.speciesCard.chosen": "Chosen — tap to drop",
  "ui.speciesCard.choose": "Choose this one",
  // PulseTile — the centre of a gauge that shows a departure from normal
  "ui.pulseTile.normal": "normal",
  // CalendarFeed — {{name}} is the grower's region (plot) name
  "ui.calendarFeed.couldNotPublish": "The calendar could not be published.",
  "ui.calendarFeed.refreshed": "Refreshed — subscribers update in place.",
  "ui.calendarFeed.published": "Published.",
  "ui.calendarFeed.title": "Calendar feed",
  "ui.calendarFeed.isPublished": "<b>{{name}}</b> is published.",
  "ui.calendarFeed.entries": "{{n}} entries.",
  "ui.calendarFeed.subscribe": "Subscribe on this device",
  "ui.calendarFeed.linkCopied": "Link copied.",
  "ui.calendarFeed.copyLink": "Copy link for Google Calendar",
  "ui.calendarFeed.recomputing": "Recomputing…",
  // A button: rebuild the feed against current weather
  "ui.calendarFeed.recompute": "Recompute",
  "ui.calendarFeed.stop": "Stop publishing",
  // <b>Recompute</b> names the button above (ui.calendarFeed.recompute)
  "ui.calendarFeed.howItWorks": "Your client re-reads this on its own schedule. <b>Recompute</b> rebuilds it against current weather and rewrites the same feed in place, so subscribers update rather than ending up with two of everything.",
  "ui.calendarFeed.publishOnce": "Publish <b>{{name}}</b> once and its season events and reminders arrive in whatever calendar you already read.",
  "ui.calendarFeed.publishing": "Publishing…",
  "ui.calendarFeed.publishRegion": "Publish this region",
  "ui.calendarFeed.notOnCalendar": "Not on the calendar",
  "ui.calendarFeed.everythingElse": "Everything else published. A row with nothing to date is still on your record; it just has no day to put on a calendar.",
  // UndoChip — {{label}} names the removed row; {{error}} is the reason given
  "ui.undoChip.couldNotPutBack": "{{label}} could not be put back: {{error}}",
  "ui.undoChip.putBack": "Put back — {{n}} removed",
  // MeasureChart — {{label}} is the measure's name; {{unit}} its unit symbol
  "ui.measureChart.notEnough": "{{label}} — not enough on record yet.",
  "ui.measureChart.soFar": "<b>{{total}} {{unit}}</b> so far",
  "ui.measureChart.normallyByNow": "normally {{n}} by now",
  "ui.measureChart.latest": "<b>{{value}} {{unit}}</b> latest",
  "ui.measureChart.normal": "normal {{n}}",
  "ui.measureChart.aria": "{{label}}, this season against the normal range",
  // DiseaseCard
  "ui.diseaseCard.title": "Disease Estimates",
  // {{info}} is a sentence about which models are listed; {{wetWhen}} is the server's rule for a wet hour (e.g. "relative humidity is 90% or more")
  "ui.diseaseCard.info": "{{info}}. An hour counts as wet when {{wetWhen}} — estimated, never measured. Each strip is the season: grey where a period qualified, clay where the forecast has one coming, and the dark tick is today. Published models run against your ground; Good Earth does not publish plant pathology and never recommends a treatment.",
  "ui.diseaseCard.recordOnly": "record only — the forecast did not answer",
  "ui.diseaseCard.frontDue": "A front is due: the barometer falls fast across this projected period, so its wet hours are the likeliest to come — perhaps sooner or heavier than forecast. The model itself is unchanged.",
  "ui.diseaseCard.noneThisSeason": "none this season",
  // A risk period starting on {{date}}; <soft> is the quieter lead word
  "ui.diseaseCard.from": "<soft>from </soft><b>{{date}}</b>",
  // The last risk period was on {{date}}
  "ui.diseaseCard.last": "<soft>last </soft>{{date}}",
  // {{crops}} is a comma-separated list of crop names
  "ui.diseaseCard.watchedHere": "Watched here for your {{crops}}.",
  "ui.diseaseCard.developedFor": "Developed for {{crops}}.",
  "ui.diseaseCard.decisionPoint": "{{n}} severity values accrued — the literature's decision point. What to decide is your extension service's to say.",
  "ui.diseaseCard.periods_one": "{{count}} qualifying period this season",
  "ui.diseaseCard.periods_other": "{{count}} qualifying periods this season",
  "ui.diseaseCard.severityOf18": "{{n}} severity values of the 18 that mark a decision point",
  "ui.diseaseCard.nothingQualifying": "nothing qualifying this season",

  // Barometer.tsx — the barometer icon's spoken name
  "ui.barometer.pressure": "pressure",
  // Tour.tsx
  "ui.tour.showMe": "Show me on the page",
  "ui.tour.walkMe": "Walk me through the page itself",
  // GuideButton.tsx
  "ui.guideButton.label": "How this page works",
  // CommunityObservations.tsx — {{blockName}} is the grower's name for a plot
  "ui.communityObservations.title": "Community Observations",
  "ui.communityObservations.lede": "What people have recorded near {{blockName}}, ready to add.",
  // usageDress.tsx — {{n}} is the formatted number
  "ui.usageDress.calls_one": "{{n}} call",
  "ui.usageDress.calls_other": "{{n}} calls",
  "ui.usageDress.sats": "{{n}} sats",
  // AddPanel.tsx — {{label}} is the form's name in lower case, e.g. "add a crop"
  "ui.addPanel.fold": "Fold {{label}}",
  "ui.addPanel.open": "Open {{label}}",
  // Boundary.tsx — {{what}} names the part of the page, e.g. "the season chart"
  "ui.boundary.failed": "{{what}} could not be drawn.",
  "ui.boundary.safe": "Your record is safe — this is a fault in the page, not in what you saved. The rest of Good Earth still works; pick another view and come back.",
  // QuantityField.tsx — {{label}} is the field's label, e.g. "On hand"
  "ui.quantityField.unit": "{{label}} unit",
  "ui.quantityField.unitPlaceholder": "seeds",
  // SuccessionRows.tsx — {{crop}} is a crop name, {{date}} a short date
  "ui.successionRows.none": "No sowing of {{crop}} left this season still finishes before the frost.",
  "ui.successionRows.summary_one": "{{crop}} every {{every}} days — {{count}} sowing still finish here.",
  "ui.successionRows.summary_other": "{{crop}} every {{every}} days — {{count}} sowings still finish here.",
  "ui.successionRows.out": "out <b>{{date}}</b>",
  "ui.successionRows.seedIndoors": "seed indoors {{date}}",
  "ui.successionRows.finishes": "finishes <b>{{date}}</b>",
  "ui.successionRows.margin": "{{n}} days before the frost",
  "ui.successionRows.atRisk": "after the earliest frost on record",
  "ui.successionRows.adding": "Adding…",
  "ui.successionRows.add": "＋ Add {{n}} to the ledger",
  // Provenance.tsx — {{time}} a clock time; {{when}} a time, with its day when not today
  "ui.provenance.busy": "The weather service was busy, so this is the last reading taken of this ground",
  "ui.provenance.when": "When this answer was read",
  "ui.provenance.read": "read {{time}}",
  "ui.provenance.weatherFrom": " · weather from {{when}}",
  // Hive.tsx — spoken name of the beehive drawing
  "ui.hive.flying": "Warm enough for the bees to be working.",
  "ui.hive.quiet": "Below flight temperature — the hive is quiet.",
  "ui.hive.closed": "Frost watch — the hive is shut.",
  "ui.hive.beehive": "Beehive",
  // RotationPanel.tsx — {{name}} a crop; {{seasons}} a list of years
  "ui.rotationPanel.empty": "No dated plantings on this plot yet — rotation reads the season each one went in.",
  "ui.rotationPanel.again": "Plant {{name}} again this season",
  "ui.rotationPanel.tap": "Tap a plant to grow it again — the form above fills in, and you choose the day.",
  "ui.rotationPanel.alsoHere": "also here {{seasons}}",
  // Followed by the list of crops whose family is not known
  "ui.rotationPanel.noFamily": "family not known — ",
  // FolderTree.tsx — {{name}} a group's name
  "ui.folderTree.groups": "Groups",
  "ui.folderTree.close": "Close {{name}}",
  "ui.folderTree.open": "Open {{name}}",
  // SearchBox.tsx
  "ui.searchBox.placeholder": "search — regex ok",
  "ui.searchBox.search": "Search",
  "ui.searchBox.clear": "Clear search",
  // SunSummary.tsx — {{name}} a plot; {{month}} a month's full name; {{pc}} etc. whole percentages
  "ui.sunSummary.inMonth": "{{name}} in {{month}}",
  "ui.sunSummary.shares": "{{sun}}% full sun, {{part}}% part shade, {{shade}}% full shade",
  "ui.sunSummary.fullSun": "<b>{{pc}}%</b> full sun",
  "ui.sunSummary.partShade": "<b>{{pc}}%</b> part shade",
  "ui.sunSummary.fullShade": "<b>{{pc}}%</b> full shade",
  "ui.sunSummary.byMonth": "Share in full sun, by month",
  // {{month}} is a short month name
  "ui.sunSummary.monthInSun": "{{month}}, {{pc}}% in full sun",
  "ui.sunSummary.best": "Best place for panels",
  // Follows a large number of kWh
  "ui.sunSummary.kwhPerKw": "kWh per kW a year",
  // Followed directly by the tilt sentence below
  "ui.sunSummary.openSky": "{{pc}}% of open-sky yield · ",
  // {{facing}} is a compass direction such as "south"
  "ui.sunSummary.tilted": "tilted {{tilt}}° facing {{facing}}",
  "ui.sunSummary.showIt": "Show it",
  "ui.sunSummary.noSolar": "No solar figure this time — the radiation archive did not answer.",
  // FullscreenButton.tsx
  "ui.fullscreenButton.how": "iPhone Safari cannot hide its bars for a web page. Tap Share (the square with an arrow), then Add to Home Screen. Open Good Earth from that icon and it uses the whole screen — you sign in once more there.",
  "ui.fullscreenButton.install": "Use the whole screen",
  "ui.fullscreenButton.exit": "Exit full screen",
  "ui.fullscreenButton.enter": "Full screen",
  // GuestShell.tsx — the public pages' names in a visitor's top bar
  "ui.guestShell.welcome": "Welcome",
  "ui.guestShell.plants": "Plants",
  "ui.guestShell.insects": "Insects",
  "ui.guestShell.trees": "Trees",
  "ui.guestShell.animals": "Animals",
  "ui.guestShell.words": "Words",
  "ui.guestShell.about": "About",
  "ui.guestShell.sources": "Sources",
  "ui.guestShell.prices": "Prices",
  "ui.guestShell.signIn": "Sign in",
  "ui.guestShell.footer": "Good Earth is an operator on the DPYC network. Identity is a Nostr keypair; answers are paid for in Bitcoin Lightning, per call.",
  // ForgetMe.tsx
  "ui.forgetMe.unreachable": "The record could not be reached.",
  "ui.forgetMe.title": "Forget me",
  "ui.forgetMe.what": "Deletes every block and everything recorded on it — crops, pests, watches, reports, tasks — and stops any calendar feed you published. It cannot be undone. <b>Your balance and purchase history are not touched, and you stay a patron here.</b>",
  "ui.forgetMe.open": "Forget my ground",
  // <phrase/> draws the exact phrase to type, which stays in English
  "ui.forgetMe.type": "Type <phrase/> to confirm",
  "ui.forgetMe.keep": "Keep it",
  "ui.forgetMe.forgetting": "Forgetting…",
  "ui.forgetMe.forget": "Forget it all",
  // ForecastCard.tsx — {{date}} is an ISO date, 2026-05-14
  "ui.forecastCard.what": "the forecast",
  "ui.forecastCard.forDay": "Forecast for {{date}}",
  "ui.forecastCard.forecast": "Forecast",
  "ui.forecastCard.before": "The day before",
  "ui.forecastCard.after": "The day after",
  "ui.forecastCard.copy": "Copy the forecast",
  "ui.forecastCard.close": "Close",
  // StationMap.tsx — "the map" is what the enlarge button enlarges
  "ui.stationMap.theMap": "the map",
  "ui.stationMap.current": "This plot's station",
  "ui.stationMap.use": "Use this station",
  "ui.stationMap.finding": "Finding stations…",
  // {{place}} is the plot's name
  "ui.stationMap.none": "No published station stands within {{km}} km of {{place}}.",
  // StationNow.tsx — {{name}} a weather station's name
  "ui.stationNow.nowAt": "Now at {{name}}",
  "ui.stationNow.change": "Change station",
  // When the station was read, and when it last observed
  "ui.stationNow.read": "Read",
  "ui.stationNow.observed": "Observed",
  "ui.stationNow.connect": "Connect FieldData",
  "ui.stationNow.reading": "Reading the station…",
  "ui.stationNow.wind": "wind",
  // {{arrow}} an arrow glyph; {{from}} a compass point such as "NW"
  "ui.stationNow.windFrom": "{{arrow}} from {{from}}",
  // GestureHint.tsx
  "ui.gestureHint.dismiss": "tap to dismiss",
  // FirstRun.tsx
  "ui.firstRun.noGeo": "This device will not share a location — draw it on the map instead.",
  "ui.firstRun.finding": "Finding you…",
  "ui.firstRun.noLocation": "Could not get a location — draw it on the map instead.",
  "ui.firstRun.title": "Where do you farm?",
  "ui.firstRun.claim": "Every answer here is about a piece of ground, so it needs one.",
  "ui.firstRun.lede": "Heat, frost, soil and daylight are all answered for the block you name, with the spread across it. Nothing is computed until there is ground to compute it for.",
  "ui.firstRun.here": "Start where I am",
  "ui.firstRun.hereNote": "About {{acres}} acres around this device, to move and reshape. Your location is used here and not stored.",
  "ui.firstRun.draw": "Draw it on the map",
  "ui.firstRun.drawNote": "Trace the field, or drop a pin with a radius. A polygon is worth the minute — the spread is measured across whatever you draw.",
  // <example> is a button that opens the worked example
  "ui.firstRun.example": "Not ready to say where you are? <example>Look at a worked example</example> — the Champlain Valley in Vermont, which is the ground this was built against. It is not your farm, and nothing you record on it is kept.",
  // Preferences.tsx
  "ui.preferences.viewing": "Viewing",
  "ui.preferences.season": "🍂 Season",
  // {{season}} is this season's name, from the four below
  "ui.preferences.follow": "Follow · {{season}}",
  "ui.preferences.spring": "spring",
  "ui.preferences.summer": "summer",
  "ui.preferences.autumn": "autumn",
  "ui.preferences.winter": "winter",
  "ui.preferences.degrees": "🌡️ Degrees",
  "ui.preferences.timeZone": "🕐 Time zone",
  "ui.preferences.tutorial": "🧭 Live tutorial",
  "ui.preferences.tutorialNote": "A short walk around each page, offered the first time it sits quiet a moment, pointing at what to do. Any popover can stop it; this switch starts it again.",
  "ui.preferences.bees": "🐝 Foraging bees",
  // {{temp}} is a temperature with its unit, e.g. "55 °F"
  "ui.preferences.beesNote": "They read the day’s high against the {{temp}} flight threshold — more of them the warmer it is, none during a frost watch. Turn them off if you would rather nothing moved.",
  // SunPanel.tsx
  "ui.sunPanel.casting": "Casting the sky over this plot",
  "ui.sunPanel.whatToShow": "What to show",
  "ui.sunPanel.garden": "Garden light",
  "ui.sunPanel.solar": "Solar panels",
  "ui.sunPanel.month": "Month",
  // These four run together: "Fixed panels, tilted 35°, facing south · whole year"
  "ui.sunPanel.fixed": "Fixed panels",
  "ui.sunPanel.tilted": ", tilted <b>{{tilt}}°</b>",
  // {{facing}} is a compass word from the eight below
  "ui.sunPanel.facing": ", facing <b>{{facing}}</b>",
  "ui.sunPanel.wholeYear": " · whole year",
  "ui.sunPanel.fullLeaf": "🌳 Full leaf all year",
  // {{month}} is a short month name
  "ui.sunPanel.hours": "Hours of direct sun a day in {{month}}",
  "ui.sunPanel.fullShade": "Full shade · under 3 h",
  "ui.sunPanel.partShade": "Part shade · 3–6 h",
  "ui.sunPanel.fullSun": "Full sun · 6 h+",
  "ui.sunPanel.kwhKey": "kWh a year for each kW of panels installed here · ◆ marks the best spot",
  // Which way a solar panel faces
  "ui.sunPanel.north": "north",
  "ui.sunPanel.northEast": "north-east",
  "ui.sunPanel.east": "east",
  "ui.sunPanel.southEast": "south-east",
  "ui.sunPanel.south": "south",
  "ui.sunPanel.southWest": "south-west",
  "ui.sunPanel.west": "west",
  "ui.sunPanel.northWest": "north-west",
  // DueSoon.tsx — when a wildlife event is due, relative to today
  "ui.dueSoon.today": "today",
  "ui.dueSoon.tomorrow": "tomorrow",
  "ui.dueSoon.yesterday": "yesterday",
  "ui.dueSoon.inDays": "in {{n}} days",
  "ui.dueSoon.daysAgo": "{{n}} days ago",
  "ui.dueSoon.title": "Due soon",
  // An expected event that has been observed
  "ui.dueSoon.seen": "seen",
  // {{from}} and {{to}} are short dates; follows the due date
  "ui.dueSoon.window": " · between {{from}} and {{to}}",
  "ui.dueSoon.whatDay": "What day did you see it?",
  "ui.dueSoon.record": "Record it",
  "ui.dueSoon.notYet": "not yet",
  "ui.dueSoon.sawIt": "I saw it",
  "ui.dueSoon.another": "Start another",
  // RefreshFromAI.tsx — {{name}} a plant, pest or animal
  "ui.refreshFromAI.refreshName": "Refresh {{name}} from AI",
  "ui.refreshFromAI.refresh": "Refresh from AI",
  "ui.refreshFromAI.matches": "✓ Matches the reference.",
  "ui.refreshFromAI.yours": "✍️ Yours",
  "ui.refreshFromAI.ai": "🧠 AI",
  // What the save button saves
  "ui.refreshFromAI.picked": "the picked figures",
  "ui.refreshFromAI.close": "Close",
  // RecordTable.tsx — the pager under a record table
  "ui.recordTable.back": "← Back",
  "ui.recordTable.next": "Next →",
  "ui.recordTable.page": "page {{page}} of {{pages}}",
  // {{noun}} is the record's singular noun as the page passes it ("planting"); the plural adds "s"
  // Follows "page 2 of 5"; {{counted}} is one of the counts below, such as "12 plantings".
  "ui.recordTable.total": " · {{counted}}",
  "ui.recordTable.count.planting_one": "{{count}} planting",
  "ui.recordTable.count.planting_other": "{{count}} plantings",
  "ui.recordTable.count.task_one": "{{count}} task",
  "ui.recordTable.count.task_other": "{{count}} tasks",
  "ui.recordTable.count.pest_one": "{{count}} pest",
  "ui.recordTable.count.pest_other": "{{count}} pests",
  "ui.recordTable.count.watch_one": "{{count}} watch",
  "ui.recordTable.count.watch_other": "{{count}} watches",
  // OutboxChip.tsx — changes recorded offline, waiting to be sent
  "ui.outboxChip.task": "Task: {{title}}",
  "ui.outboxChip.ticked": "A task ticked done",
  "ui.outboxChip.unticked": "A task unticked",
  "ui.outboxChip.taskRemoved": "A task removed",
  "ui.outboxChip.planting_one": "{{count}} planting",
  "ui.outboxChip.planting_other": "{{count}} plantings",
  "ui.outboxChip.pest_one": "{{count}} pest",
  "ui.outboxChip.pest_other": "{{count}} pests",
  "ui.outboxChip.fauna_one": "{{count}} fauna entry",
  "ui.outboxChip.fauna_other": "{{count}} fauna entries",
  "ui.outboxChip.note_one": "{{count}} field note",
  "ui.outboxChip.note_other": "{{count}} field notes",
  "ui.outboxChip.entry_one": "{{count}} entry",
  "ui.outboxChip.entry_other": "{{count}} entries",
  // {{what}} is one of the counts above, e.g. "2 plantings"
  "ui.outboxChip.removed": "{{what}} removed",
  "ui.outboxChip.title": "Recorded without signal. It is sent when the signal is back.",
  // Follows "⇡ 3"
  "ui.outboxChip.waiting": " waiting for signal",
  "ui.outboxChip.notSavedN": "{{n}} not saved",
  "ui.outboxChip.lede": "Recorded here without signal. Each one is sent, in order, when the signal is back.",
  // {{why}} is the server's reason
  "ui.outboxChip.notSaved": "Not saved: {{why}}",
  "ui.outboxChip.discard": "Discard",
  "ui.outboxChip.send": "Send now",
  // DryingStrip.tsx — a day's sky in words; {{h}} is a number of hours
  "ui.dryingStrip.noForecast": "no forecast",
  "ui.dryingStrip.rainFor": "rain for {{h}} h",
  "ui.dryingStrip.showers": "showers, {{h}} h",
  "ui.dryingStrip.dryLeavesWet": "dry, leaves wet {{h}} h",
  "ui.dryingStrip.dry": "dry",
  // When the dew is off in the morning; {{time}} a clock time
  "ui.dryingStrip.dryAt": "dry {{time}}",
  "ui.dryingStrip.dryDawn": "dry dawn",
  "ui.dryingStrip.wetAm": "wet a.m.",
  // A day card's hover text, built from these parts; {{day}} short weekday, {{date}} ISO date
  "ui.dryingStrip.dayTitle": "{{day}} {{date}}: {{words}}",
  "ui.dryingStrip.power": " · drying power {{mm}} mm ET₀",
  "ui.dryingStrip.air": " · air up to {{kpa}} kPa dry",
  "ui.dryingStrip.frontDue": " · a front is due",
  "ui.dryingStrip.frontDueLabel": "front due",
  "ui.dryingStrip.today": "today",
  "ui.dryingStrip.strongestDay": "strongest drying day",
  // The key under the strip
  "ui.dryingStrip.keyPower": "drying power (ET₀)",
  "ui.dryingStrip.keyRun": "dry run",
  "ui.dryingStrip.keyStrongest": " strongest drying",
  "ui.dryingStrip.keyFront": "🌀 front due",

};

export default words;
