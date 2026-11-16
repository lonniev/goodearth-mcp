// The life of a tree, and why the other two pages do not fit it.
//
// This one exists to say a NEGATIVE clearly: "does it finish before frost" is
// a question only something that must finish in one season can be asked. A
// tree's year closes rather than ending, which is why it is drawn as a loop
// where the crop is drawn as a line — the shape of the picture is the argument.

import { Tx } from "@tollbooth-dpyc/web/react";
import { Claim, Facts, YearWheel } from "../components/Diagram";
import { useT, WORDS, type Translate } from "../i18n";

/// Clockwise from the top, January at noon.
const year = (t: Translate) => [
  { emoji: "❄️", label: t("views.lifeOfATree.stage.dormant"), at: 0.02 },
  { emoji: "🌡️", label: t("views.lifeOfATree.stage.chillBanked"), at: 0.14 },
  { emoji: "🌱", label: t("views.lifeOfATree.stage.budBreak"), at: 0.29 },
  { emoji: "🌸", label: t("views.lifeOfATree.stage.bloom"), at: 0.40 },
  { emoji: "🍏", label: t("views.lifeOfATree.stage.fruitSet"), at: 0.52 },
  { emoji: "🍎", label: t("views.lifeOfATree.stage.harvest"), at: 0.70 },
  { emoji: "🍂", label: t("views.lifeOfATree.stage.leafFall"), at: 0.84 },
];

export default function LifeOfATree() {
  const t = useT();
  return (
    <article>
      <h1 className="figure mb-1 text-[1.5rem] font-bold">{t("views.lifeOfATree.title")}</h1>
      <p className="eyebrow mb-4">{t("views.lifeOfATree.eyebrow")}</p>

      <Claim>{t("views.lifeOfATree.claim")}</Claim>

      <p className="text-[0.84375rem] leading-relaxed">
        {t("views.lifeOfATree.intro")}
      </p>

      <YearWheel stages={year(t)} centre={t("views.lifeOfATree.centre")}
        foot={t("views.lifeOfATree.foot")} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-rule border-l-4 border-l-frost bg-panel px-4 py-3">
          <p className="eyebrow">{t("views.lifeOfATree.surviveQ")}</p>
          <p className="mt-1 text-[0.84375rem] leading-relaxed">
            {t("views.lifeOfATree.surviveA")}
          </p>
        </div>
        <div className="rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
          <p className="eyebrow">{t("views.lifeOfATree.fruitQ")}</p>
          <p className="mt-1 text-[0.84375rem] leading-relaxed">
            <Tx ns={WORDS} k="views.lifeOfATree.fruitA" components={{ b: <b /> }} />
          </p>
        </div>
      </div>

      <Facts items={[
        [t("views.lifeOfATree.fact.frost"), <>{t("views.lifeOfATree.fact.frostBody")}</>],
        [t("views.lifeOfATree.fact.tag"), <>{t("views.lifeOfATree.fact.tagBody")}</>],
        [t("views.lifeOfATree.fact.woodlot"), <>{t("views.lifeOfATree.fact.woodlotBody")}</>],
      ]} />
    </article>
  );
}
