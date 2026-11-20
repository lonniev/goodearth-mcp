// What each tour says, step by step.
//
// Short, and in the voice of someone showing a friend around: what the
// control is and what to do with it, in a sentence or two. Each step names
// the guide step it abbreviates, so when a guide changes the tour is caught
// by the test that reads both. Every guided page shows the (?), where the
// whole story is: the Dashboard among its top-row peers, every other page last.

import { accountTour, signInTour } from "@tollbooth-dpyc/web";
import { tr } from "../../i18n/index.ts";
import type { MessageKey } from "../../i18n/en.ts";
import type { Tour, TourStep } from "./types.ts";

/** A step as written here: where it points, with its words in the catalog. */
type Placed = Omit<TourStep, "title" | "says">;

/**
 * A page's steps with their words. The title and the sentence are read from
 * `lib.tour.<page>.<target>` each time the tour draws them, so a tour started
 * after a language change speaks the new language. The shared (?) step is
 * `lib.tour.guide`.
 */
function worded(page: string, steps: Placed[]): TourStep[] {
  return steps.map((s) => {
    const name = String(s.target);
    const key = name === "shell.guide" ? "lib.tour.guide"
      : `lib.tour.${page}.${name.startsWith(`${page}.`) ? name.slice(page.length + 1) : name}`;
    return {
      ...s,
      get title() { return tr(`${key}.title` as MessageKey); },
      get says() { return tr(`${key}.says` as MessageKey); },
    };
  });
}

const GUIDE: Placed = {
  target: "shell.guide",
  side: "bottom", align: "end",
};

export const TOURS: Record<Tour["page"], Tour> = {
  welcome: { page: "welcome", steps: worded("welcome", [
    { target: "welcome.signin" },
    { target: "welcome.explainers", side: "top" },
    { target: "welcome.guides", side: "top" },
  ])},

  signin: signInTour("signin"),

  ledger: { page: "ledger", steps: worded("ledger", [
    { target: "shell.plot" },
    { target: "shell.conditions" },
    { target: "shell.undo", side: "bottom", align: "end" },
    GUIDE,
    { target: "shell.share", side: "bottom", align: "end" },
    { target: "shell.fullscreen", side: "bottom", align: "end" },
    { target: "shell.account", side: "bottom", align: "end" },
    { target: "firstrun.here" },
    { target: "firstrun.draw" },
    { target: "ledger.chips", guide: ["Read the season", "The chips by the title"] },
    { target: "ledger.heat", guide: ["Read the season", "The pulse strip"] },
    { target: "ledger.spread", guide: ["Read the season", "The pulse strip"] },
    { target: "ledger.ahead", guide: ["Read the season", "The pulse strip"] },
    { target: "ledger.frost", guide: ["Read the season", "The pulse strip"] },
    { target: "ledger.cold", guide: ["Read the season", "The pulse strip"] },
    { target: "ledger.storm", guide: ["Read the season", "The pulse strip"] },
    { target: "ledger.chart", guide: ["Read the season", "The chart"], side: "top" },
    { target: "ledger.marker", guide: ["Read the season", "🔔 Events"], before: "show-events", side: "top" },
    { target: "ledger.ground", guide: ["Read the season", "🛰️ Ground"] },
    { target: "ledger.events", guide: ["Read the season", "🔔 Events"] },
    { target: "ledger.weather", guide: ["Read the season", "🌦️ Weather"] },
    { target: "ledger.trends", guide: ["The trends", "❄️ Freezing"], side: "top" },
    { target: "ledger.doors", guide: ["The trends", "More Views"], side: "top" },
  ])},

  plots: { page: "plots", steps: worded("plots", [
    { target: "plots.add", guide: ["Add ground", "+ Add a plot"] },
    { target: "plots.search", before: "open-add-form",
      guide: ["Add ground", "Find a town, road or address · Use my location"] },
    { target: "plots.locate", guide: ["Add ground", "Find a town, road or address · Use my location"] },
    { target: "plots.shape", guide: ["Add ground", "Trace a block"] },
    { target: "plots.map", guide: ["Add ground", "Pin + radius"], side: "top" },
    { target: "plots.name", guide: ["Add ground", "Name · Base"] },
    { target: "plots.base", guide: ["Add ground", "Name · Base"] },
    { target: "plots.save", guide: ["Add ground", "Save"] },
    { target: "plots.station", guide: ["Add ground", "Station"], side: "top" },
    { target: "plots.import", guide: ["Add ground", "Import"] },
    { target: "plots.groups", guide: ["Read and switch", "Groups"] },
    { target: "plots.chips", guide: ["Read and switch", "The chips"] },
    { target: "plots.rename", guide: ["Change", "The pencil"] },
    { target: "plots.share", guide: ["Change", "Share"] },
    { target: "plots.forget", guide: ["Remove", "The bin"] },
    { target: "plots.sun", guide: ["Read and switch", "The Sun button"], side: "left" },
    { target: "plots.labels", guide: ["Read and switch", "The map"], side: "left" },
    { target: "plots.sunview", guide: ["Read and switch", "The Sun button"] },
    GUIDE,
  ])},

  crops: { page: "crops", steps: worded("crops", [
    { target: "crops.species", before: "open-add", guide: ["Add a planting", "Species"] },
    { target: "crops.label", guide: ["Add a planting", "Your name for it"] },
    { target: "crops.target", guide: ["Add a planting", "GDD target · Planted · Base"] },
    { target: "crops.setout", guide: ["Add a planting", "GDD target · Planted · Base"] },
    { target: "crops.base", guide: ["Add a planting", "GDD target · Planted · Base"] },
    { target: "crops.flower", guide: ["Add a planting", "Flower · Height · Blooms"] },
    { target: "crops.height", guide: ["Add a planting", "Flower · Height · Blooms"] },
    { target: "crops.blooms", guide: ["Add a planting", "Flower · Height · Blooms"] },
    { target: "crops.hardy", guide: ["Add a planting", "Handles Light Frost · Sap Producer"] },
    { target: "crops.taps", guide: ["Add a planting", "Handles Light Frost · Sap Producer"] },
    { target: "crops.add", guide: ["Add a planting", "+ Planting"] },
    { target: "crops.ledgerhead", guide: ["Read the ledger", "The heading"] },
    { target: "crops.filter", guide: ["Read the ledger", "The heading"] },
    { target: "crops.search", guide: ["Read the ledger", "The heading"] },
    { target: "crops.ledger", guide: ["Read the ledger", "A row"], side: "top" },
    { target: "crops.seed", guide: ["Change", "Seed"], side: "left" },
    { target: "crops.cut", guide: ["Change", "Record a harvest"], side: "left" },
    { target: "crops.companions", guide: ["Companions", "🤝 Synergy"], side: "left" },
    { target: "crops.rotation", guide: ["Read the ledger", "🔄 Rotation — What grew here?"] },
    { target: "crops.fit", guide: ["Read the ledger", "🌾 Grows here"] },
    { target: "crops.sow", guide: ["Read the ledger", "🌱 When to sow — 🧠 When?"] },
    { target: "crops.community", guide: ["Add a planting", "Community Observations"] },
    GUIDE,
  ])},

  pests: { page: "pests", steps: worded("pests", [
    { target: "pests.species", before: "open-add", guide: ["Watch a pest", "Pest"] },
    { target: "pests.base", guide: ["Watch a pest", "Base"] },
    { target: "pests.biofix", guide: ["Watch a pest", "Biofix"] },
    { target: "pests.stages", guide: ["Watch a pest", "Stages"] },
    { target: "pests.add", guide: ["Watch a pest", "The bug button"] },
    { target: "pests.active", guide: ["Read the Pests ledger", "Active now"] },
    { target: "pests.filter", guide: ["Read the Pests ledger", "The heading"] },
    { target: "pests.list", guide: ["Read the Pests ledger", "A row"], side: "top" },
    { target: "pests.catalog", guide: ["Watch a pest", "🐛 When they appear here — What's here?"] },
    { target: "pests.community", guide: ["Watch a pest", "Community Observations"] },
    GUIDE,
  ])},

  wildlife: { page: "wildlife", steps: worded("wildlife", [
    { target: "wildlife.species", before: "open-add", guide: ["Track something", "The creature"] },
    { target: "wildlife.open", guide: ["Track something", "Track it"] },
    { target: "wildlife.role", before: "open-track", guide: ["Track something", "The creature"] },
    { target: "wildlife.clock", guide: ["Track something", "The clock"] },
    { target: "wildlife.label", guide: ["Track something", "The figures"] },
    { target: "wildlife.figures", guide: ["Track something", "The figures"] },
    { target: "wildlife.record", guide: ["Track something", "Save"] },
    { target: "wildlife.due", guide: ["Read the Fauna ledger", "Watch for these"] },
    { target: "wildlife.list", guide: ["Read the Fauna ledger", "The columns"], side: "top" },
    { target: "wildlife.community", guide: ["Track something", "Community Observations"] },
    GUIDE,
  ])},

  reports: { page: "reports", steps: worded("reports", [
    { target: "reports.tags", before: "open-add", guide: ["File one", "The tags"] },
    { target: "reports.custom", guide: ["File one", "The tags"] },
    { target: "reports.on", guide: ["File one", "Seen on"] },
    { target: "reports.crop", before: "pick-tag:first_bloom", guide: ["File one", "Crop"] },
    { target: "reports.setout", guide: ["File one", "Set out · Expected at (GDD)"] },
    { target: "reports.target", guide: ["File one", "Set out · Expected at (GDD)"] },
    { target: "reports.here", guide: ["File one", "Here"] },
    { target: "reports.add", guide: ["File one", "Observation"] },
    { target: "reports.inat", guide: ["Import from iNaturalist", "Your handle"], side: "top" },
    { target: "reports.log", guide: ["Read what it learned", "Log"], side: "top" },
    GUIDE,
  ])},

  todo: { page: "todo", steps: worded("todo", [
    { target: "todo.title", before: "open-add", guide: ["Write one down", "What needs doing · Due"] },
    { target: "todo.due", guide: ["Write one down", "What needs doing · Due"] },
    { target: "todo.reminder", guide: ["Write one down", "Reminder only?"] },
    { target: "todo.times", before: "show-times", guide: ["Write one down", "Reminder only?"] },
    { target: "todo.note", guide: ["Write one down", "Note"] },
    { target: "todo.add", guide: ["Write one down", "+ Task"] },
    { target: "todo.gear", guide: ["Write one down", "The gear"] },
    { target: "todo.frames", guide: ["See what is due", "Day · Week · Month · Season · All"] },
    { target: "todo.search", guide: ["See what is due", "Search"] },
    { target: "todo.list", guide: ["Change", "The checkbox"], side: "top" },
    GUIDE,
  ])},

  almanac: { page: "almanac", steps: worded("almanac", [
    { target: "almanac.station", guide: ["Read", "Now at your station"] },
    { target: "almanac.today", guide: ["Read", "Today"] },
    { target: "almanac.storm", guide: ["Read", "🌀 Storm signal"] },
    { target: "almanac.radar", guide: ["Read", "🌧️ in the title row"] },
    { target: "almanac.fortnight", guide: ["Read", "The fortnight"], side: "top" },
    { target: "almanac.chiclets", guide: ["Arrange", "The chiclets"] },
    { target: "shell.share", guide: ["Read", "Share, in the top bar"], side: "bottom", align: "end" },
    GUIDE,
  ])},

  account: accountTour("account", worded("account", [
    { target: "account.tutorial" },
    { target: "account.season" },
    { target: "account.degrees" },
    { target: "account.bees" },
    { target: "account.forget", side: "top" },
    { target: "account.summary" },
  ])),
};
