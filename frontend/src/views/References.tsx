// References — the feeds and the models, as a list you can scan.
//
// Good Earth sells answers about ground a grower will plant. That obliges it
// to be checkable: not "trust us", but here is the feed, here is what it
// resolves, here is the model applied on top and the assumption inside it.
//
// This page exists because the alternative is a confident interface whose
// workings are private, and a farmer who cannot audit an answer has to either
// believe it or ignore it. Neither is what they are paying for.

import { useMemo } from "react";
import { useShare } from "../components/Share";
import { referencesSheet, type Model, type Reading, type Source } from "../lib/exports";
import { Tx } from "@tollbooth-dpyc/web/react";
import { useT, WORDS, type Translate } from "../i18n";

const sources = (t: Translate): Source[] => [
  {
    name: t("views.references.fieldData.name"),
    url: "https://fielddata.tollbooth-dpyc.com",
    role: t("views.references.fieldData.role"),
    resolution: t("views.references.fieldData.resolution"),
    note: t("views.references.fieldData.note"),
  },
  {
    name: t("views.references.daymet.name"),
    url: "https://daymet.ornl.gov/",
    role: t("views.references.daymet.role"),
    resolution: "1 km",
    note: t("views.references.daymet.note"),
  },
  {
    name: t("views.references.archivedRuns.name"),
    url: "https://open-meteo.com/en/docs/historical-forecast-api",
    role: t("views.references.archivedRuns.role"),
    resolution: "≈ 2 km",
    note: t("views.references.archivedRuns.note"),
  },
  {
    name: t("views.references.reanalysis.name"),
    url: "https://open-meteo.com/en/docs/historical-weather-api",
    role: t("views.references.reanalysis.role"),
    resolution: "≈ 9 km",
    note: t("views.references.reanalysis.note"),
  },
  {
    name: t("views.references.forecast.name"),
    url: "https://open-meteo.com/en/docs",
    role: t("views.references.forecast.role"),
    resolution: t("views.references.forecast.resolution"),
    note: t("views.references.forecast.note"),
  },
  {
    name: t("views.references.previousRuns.name"),
    url: "https://open-meteo.com/en/docs/previous-runs-api",
    role: t("views.references.previousRuns.role"),
    resolution: t("views.references.previousRuns.resolution"),
    note: t("views.references.previousRuns.note"),
  },
  {
    name: t("views.references.terrain.name"),
    url: "https://registry.opendata.aws/copernicus-dem/",
    role: t("views.references.terrain.role"),
    resolution: "30 m",
    note: t("views.references.terrain.note"),
  },
  {
    name: "USA National Phenology Network",
    url: "https://www.usanpn.org/data/api",
    role: t("views.references.npn.role"),
    resolution: t("views.references.npn.resolution"),
    note: t("views.references.npn.note"),
  },
  {
    name: "NEWA — Network for Environment and Weather Applications (Cornell)",
    url: "https://newa.cornell.edu/",
    role: t("views.references.newa.role"),
    resolution: t("views.references.newa.resolution"),
    note: t("views.references.newa.note"),
  },
  {
    name: "Esri World Imagery",
    url: "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9",
    role: t("views.references.esri.role"),
    resolution: t("views.references.esri.resolution"),
    note: t("views.references.esri.note"),
  },
  {
    name: "OpenStreetMap + Nominatim",
    url: "https://www.openstreetmap.org/copyright",
    role: t("views.references.osm.role"),
    resolution: "—",
    note: t("views.references.osm.note"),
  },
  {
    name: "RainViewer",
    url: "https://www.rainviewer.com/api.html",
    role: t("views.references.rainViewer.role"),
    resolution: t("views.references.rainViewer.resolution"),
    note: t("views.references.rainViewer.note"),
  },
  {
    name: "Growstuff",
    url: "https://www.growstuff.org/",
    role: t("views.references.growstuff.role"),
    resolution: t("views.references.growstuff.resolution"),
    note: t("views.references.growstuff.note"),
  },
  {
    name: "Game Icons",
    url: "https://game-icons.net/",
    role: t("views.references.gameIcons.role"),
    resolution: t("views.references.gameIcons.resolution"),
    note: t("views.references.gameIcons.note"),
  },
  {
    name: "iNaturalist",
    url: "https://api.inaturalist.org/v1/docs/",
    role: t("views.references.inaturalist.role"),
    resolution: t("views.references.inaturalist.resolution"),
    note: t("views.references.inaturalist.note"),
  },
  {
    name: "Meta/WRI canopy height map",
    url: "https://sustainability.atmeta.com/?p=5573",
    role: t("views.references.canopy.role"),
    resolution: "1 m",
    note: t("views.references.canopy.note"),
  },
  {
    name: t("views.references.horizonTerrain.name"),
    url: "https://registry.opendata.aws/copernicus-dem/",
    role: t("views.references.horizonTerrain.role"),
    resolution: "30 m",
    note: t("views.references.horizonTerrain.note"),
  },
  {
    name: "Copernicus Global Land Cover",
    url: "https://land.copernicus.eu/en/products/global-dynamic-land-cover",
    role: t("views.references.landCover.role"),
    resolution: "100 m",
    note: t("views.references.landCover.note"),
  },
  {
    name: "DOE/NLR PV system cost benchmark",
    url: "https://www.energy.gov/cmei/systems/solar-photovoltaic-system-cost-benchmarks",
    role: t("views.references.doe.role"),
    resolution: t("views.references.doe.resolution"),
    note: t("views.references.doe.note"),
  },
  {
    name: "EIA Electric Power Monthly, Table 5.6.A",
    url: "https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a",
    role: t("views.references.eia.role"),
    resolution: t("views.references.eia.resolution"),
    note: t("views.references.eia.note"),
  },
];

const models = (t: Translate): Model[] => [
  { title: t("views.references.model.gdd.title"), body: t("views.references.model.gdd.body"), assumption: t("views.references.model.gdd.assumption") },
  { title: t("views.references.model.lapseRate.title"), body: t("views.references.model.lapseRate.body"), assumption: t("views.references.model.lapseRate.assumption") },
  { title: t("views.references.model.drainage.title"), body: t("views.references.model.drainage.body"), assumption: t("views.references.model.drainage.assumption") },
  { title: t("views.references.model.frostRisk.title"), body: t("views.references.model.frostRisk.body"), assumption: t("views.references.model.frostRisk.assumption") },
  { title: t("views.references.model.firstFrost.title"), body: t("views.references.model.firstFrost.body"), assumption: t("views.references.model.firstFrost.assumption") },
  { title: t("views.references.model.soilCrossings.title"), body: t("views.references.model.soilCrossings.body"), assumption: t("views.references.model.soilCrossings.assumption") },
  { title: t("views.references.model.normalBand.title"), body: t("views.references.model.normalBand.body"), assumption: t("views.references.model.normalBand.assumption") },
  { title: t("views.references.model.leafWetness.title"), body: t("views.references.model.leafWetness.body"), assumption: t("views.references.model.leafWetness.assumption") },
  { title: t("views.references.model.hutton.title"), body: t("views.references.model.hutton.body"), assumption: t("views.references.model.hutton.assumption") },
  { title: t("views.references.model.mills.title"), body: t("views.references.model.mills.body"), assumption: t("views.references.model.mills.assumption") },
  { title: t("views.references.model.wallin.title"), body: t("views.references.model.wallin.body"), assumption: t("views.references.model.wallin.assumption") },
  { title: t("views.references.model.botrytis.title"), body: t("views.references.model.botrytis.body"), assumption: t("views.references.model.botrytis.assumption") },
  { title: t("views.references.model.powderyMildew.title"), body: t("views.references.model.powderyMildew.body"), assumption: t("views.references.model.powderyMildew.assumption") },
  { title: t("views.references.model.drying.title"), body: t("views.references.model.drying.body"), assumption: t("views.references.model.drying.assumption") },
  { title: t("views.references.model.projections.title"), body: t("views.references.model.projections.body"), assumption: t("views.references.model.projections.assumption") },
  { title: t("views.references.model.heatBudget.title"), body: t("views.references.model.heatBudget.body"), assumption: t("views.references.model.heatBudget.assumption") },
  { title: t("views.references.model.calibration.title"), body: t("views.references.model.calibration.body"), assumption: t("views.references.model.calibration.assumption") },
  { title: t("views.references.model.sunMoon.title"), body: t("views.references.model.sunMoon.body"), assumption: t("views.references.model.sunMoon.assumption") },
  { title: t("views.references.model.sunlight.title"), body: t("views.references.model.sunlight.body"), assumption: t("views.references.model.sunlight.assumption") },
  { title: t("views.references.model.array.title"), body: t("views.references.model.array.body"), assumption: t("views.references.model.array.assumption") },
];

/// Where the disease models are published and run by others. Good Earth
/// calls none of these; they are where a grower checks it, or goes next.
const diseaseReading = (t: Translate): Reading[] => [
  {
    name: t("views.references.reading.newa.name"),
    url: "https://newa.cornell.edu/",
    said: t("views.references.reading.newa.said"),
  },
  {
    name: t("views.references.reading.blightWatch.name"),
    url: "https://blightwatch.co.uk/",
    said: t("views.references.reading.blightWatch.said"),
  },
  {
    name: "USAblight",
    url: "https://usablight.org/",
    said: t("views.references.reading.usaBlight.said"),
  },
];

export default function References() {
  /// The whole page as one table, for the share button in the top bar.
  const t = useT();
  const SOURCES = useMemo(() => sources(t), [t]);
  const MODELS = useMemo(() => models(t), [t]);
  const DISEASE_READING = useMemo(() => diseaseReading(t), [t]);
  useShare(useMemo(() => referencesSheet(SOURCES, MODELS, DISEASE_READING), [SOURCES, MODELS, DISEASE_READING]));
  return (
    <>
      <h1 className="figure mb-3.5 text-[1.375rem] font-bold">{t("views.references.title")}</h1>

      <h2 className="figure mb-2.5 text-[1.125rem] font-semibold">🛰️ {t("views.references.sources")}</h2>
      <div className="space-y-2.5">
        {SOURCES.map((s) => (
          <div key={s.name} className="rounded-md border border-rule bg-panel px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <a href={s.url} target="_blank" rel="noreferrer"
                className="figure text-[0.9375rem] font-semibold text-ink underline decoration-rule underline-offset-2">
                {s.name}
              </a>
              <span className="data rounded-full bg-band px-2 py-0.5 text-[0.65625rem] text-ink-soft">
                {s.resolution}
              </span>
            </div>
            <p className="mt-1 text-[0.8125rem] leading-relaxed">{s.role}</p>
            <p className="mt-1 text-[0.78125rem] leading-relaxed text-ink-soft">{s.note}</p>
          </div>
        ))}
      </div>

      <h2 className="figure mt-8 mb-2.5 text-[1.125rem] font-semibold">📐 {t("views.references.models")}</h2>
      <div className="space-y-2.5">
        {MODELS.map((m) => (
          <div key={m.title} className="rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3">
            <h3 className="figure text-[0.9375rem] font-semibold">{m.title}</h3>
            <p className="mt-1 text-[0.8125rem] leading-relaxed">{m.body}</p>
            <p className="mt-1.5 text-[0.78125rem] leading-relaxed text-ink-soft">
              <span className="eyebrow mr-1.5">{t("views.references.assumption")}</span>{m.assumption}
            </p>
          </div>
        ))}
      </div>

      <h2 className="figure mt-8 mb-2.5 text-[1.125rem] font-semibold">🍄 {t("views.references.diseaseElsewhere")}</h2>
      <div className="space-y-2.5">
        {DISEASE_READING.map((s) => (
          <div key={s.name} className="rounded-md border border-rule bg-panel px-4 py-3">
            <a href={s.url} target="_blank" rel="noreferrer"
              className="figure text-[0.9375rem] font-semibold text-ink underline decoration-rule underline-offset-2">
              {s.name}
            </a>
            <p className="mt-1 text-[0.8125rem] leading-relaxed">{s.said}</p>
          </div>
        ))}
      </div>

      <h2 className="figure mt-8 mb-2.5 text-[1.125rem] font-semibold">🚫 {t("views.references.limits")}</h2>
      <div className="rounded-md border border-rule border-l-4 border-l-clay bg-panel px-4 py-3.5 text-[0.8125rem] leading-relaxed">
        <p><Tx ns={WORDS} k="views.references.limit1" components={{ b: <b /> }} /></p>
        <p className="mt-1.5"><Tx ns={WORDS} k="views.references.limit2" components={{ b: <b /> }} /></p>
        <p className="mt-1.5"><Tx ns={WORDS} k="views.references.limit3" components={{ b: <b /> }} /></p>
      </div>

      <p className="mt-6 text-[0.75rem] leading-relaxed text-ink-soft">
        {t("views.references.disagrees")}
      </p>
    </>
  );
}
