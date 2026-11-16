// The life of a plant, and why heat rather than dates.
//
// The one idea worth a page: a crop does not count days, it counts warmth.
// Everything else this service does to a crop follows from that, and it is a
// claim best made in a picture — the stages sit at fixed HEAT and therefore at
// moving DATES, which no sentence shows as quickly as two rulers do.

import { Tx } from "@tollbooth-dpyc/web/react";
import { Claim, Facts, StageRun } from "../components/Diagram";
import { useT, WORDS, type Translate } from "../i18n";

/// Positions are the shape of a season, not a scale to read values off.
/// A crop's early stages come fast and its ripening is the long half.
const stages = (t: Translate) => [
  { emoji: "🌱", label: t("views.lifeOfAPlant.stage.sown"), at: 0.0 },
  { emoji: "🌿", label: t("views.lifeOfAPlant.stage.emerges"), at: 0.12, figure: "~120" },
  { emoji: "🍃", label: t("views.lifeOfAPlant.stage.leafsOut"), at: 0.3, figure: "~400" },
  { emoji: "🌸", label: t("views.lifeOfAPlant.stage.flowers"), at: 0.58, figure: "~900" },
  { emoji: "🍅", label: t("views.lifeOfAPlant.stage.setsFruit"), at: 0.76, figure: "~1,200" },
  { emoji: "🧺", label: t("views.lifeOfAPlant.stage.harvest"), at: 1.0, figure: "~1,600" },
];

export default function LifeOfAPlant() {
  const t = useT();
  return (
    <article>
      <h1 className="figure mb-1 text-[1.5rem] font-bold">{t("views.lifeOfAPlant.title")}</h1>
      <p className="eyebrow mb-4">{t("views.lifeOfAPlant.eyebrow")}</p>

      <Claim>{t("views.lifeOfAPlant.claim")}</Claim>

      <p className="text-[0.84375rem] leading-relaxed">
        <Tx ns={WORDS} k="views.lifeOfAPlant.intro" components={{ b: <b /> }} />
      </p>

      <StageRun stages={stages(t)} axis={t("views.lifeOfAPlant.axis")}
        foot={t("views.lifeOfAPlant.foot")} />

      <div className="rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3">
        <p className="text-[0.84375rem] leading-relaxed">
          <Tx ns={WORDS} k="views.lifeOfAPlant.datesMove" components={{ b: <b /> }} />
        </p>
      </div>

      <Facts items={[
        [t("views.lifeOfAPlant.fact.oneDay"), <>{t("views.lifeOfAPlant.fact.oneDayBody")}</>],
        [t("views.lifeOfAPlant.fact.base"), <>{t("views.lifeOfAPlant.fact.baseBody")}</>],
        [t("views.lifeOfAPlant.fact.ground"), <>{t("views.lifeOfAPlant.fact.groundBody")}</>],
      ]} />
    </article>
  );
}
