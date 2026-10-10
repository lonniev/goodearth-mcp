// Every control a tour can point at, by name.
//
// A tour finds its element by `data-tour="<name>"` and nothing else — never
// by its words, which change, nor by an aria label, which is for a reader
// and may change with it. The names are declared once here so a step and
// the element it points at share one spelling, and a test reads the source
// to prove every name below is drawn somewhere.

export const TARGETS = [
  // The chrome, on every signed-in page.
  "shell.guide", "shell.share", "shell.account",
  "rail.plots",
  // A stranger's first pages.
  "welcome.signin", "welcome.explainers", "welcome.guides",
  // Where do you farm?
  "firstrun.here", "firstrun.draw",
  // The Dashboard.
  "ledger.chips", "ledger.pulse", "ledger.ground", "ledger.events", "ledger.weather",
  "ledger.chart", "ledger.trends", "ledger.doors",
  // My Plots.
  "plots.add", "plots.import", "plots.chips", "plots.rename", "plots.share", "plots.forget",
  "plots.search", "plots.locate", "plots.shape", "plots.map", "plots.name", "plots.base", "plots.save",
  "plots.sun", "plots.sunview",
  // Flora.
  "crops.species", "crops.label", "crops.target", "crops.setout", "crops.base",
  "crops.flower", "crops.height", "crops.blooms", "crops.hardy", "crops.taps", "crops.add",
  "crops.filter", "crops.search", "crops.ledger", "crops.rotation", "crops.fit", "crops.sow", "crops.community",
  // Pests.
  "pests.species", "pests.base", "pests.biofix", "pests.stages", "pests.add",
  "pests.active", "pests.filter", "pests.list", "pests.catalog", "pests.community",
  // Fauna.
  "wildlife.species", "wildlife.role", "wildlife.clock", "wildlife.label", "wildlife.figures",
  "wildlife.record", "wildlife.due", "wildlife.list", "wildlife.community",
  // Field Reports.
  "reports.tags", "reports.custom", "reports.on", "reports.crop", "reports.setout", "reports.target",
  "reports.here", "reports.add", "reports.inat", "reports.log",
  // Tasks.
  "todo.title", "todo.due", "todo.reminder", "todo.times", "todo.note", "todo.add", "todo.gear",
  "todo.frames", "todo.search", "todo.list",
  // Almanac.
  "almanac.today", "almanac.radar", "almanac.fortnight", "almanac.chiclets",
  // Account.
  "account.summary", "account.tutorial", "account.season", "account.degrees", "account.bees", "account.forget",
] as const;

export type Target = (typeof TARGETS)[number];

/// The attribute to spread on the element a step points at.
export function tour(id: Target): { "data-tour": Target } {
  return { "data-tour": id };
}

/// The selector for a target.
export function selector(id: Target): string {
  return `[data-tour="${id}"]`;
}
