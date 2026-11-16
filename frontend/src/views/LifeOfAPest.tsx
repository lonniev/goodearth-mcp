// The life of an insect, and why a threshold beats a spray calendar.
//
// The plant page establishes that heat is the clock. This page says the pest
// reads the same clock — which is the whole reason a grower can be told when
// to walk the rows rather than when to reach for something.

import { Tx } from "@tollbooth-dpyc/web/react";
import { Claim, Facts, StageRun } from "../components/Diagram";
import { useT, WORDS, type Translate } from "../i18n";

const stages = (t: Translate) => [
  { emoji: "🥚", label: t("views.lifeOfAPest.stage.eggs"), at: 0.0 },
  { emoji: "🐛", label: t("views.lifeOfAPest.stage.larvae"), at: 0.26, figure: t("views.lifeOfAPest.stage.theDamage") },
  { emoji: "🪱", label: t("views.lifeOfAPest.stage.pupae"), at: 0.56 },
  { emoji: "🦋", label: t("views.lifeOfAPest.stage.adults"), at: 0.78, figure: t("views.lifeOfAPest.stage.firstFlight") },
  { emoji: "🥚", label: t("views.lifeOfAPest.stage.eggsAgain"), at: 1.0, figure: t("views.lifeOfAPest.stage.secondFlight") },
];

export default function LifeOfAPest() {
  const t = useT();
  return (
    <article>
      <h1 className="figure mb-1 text-[1.5rem] font-bold">{t("views.lifeOfAPest.title")}</h1>
      <p className="eyebrow mb-4">{t("views.lifeOfAPest.eyebrow")}</p>

      <Claim>{t("views.lifeOfAPest.claim")}</Claim>

      <p className="text-[0.84375rem] leading-relaxed">
        {t("views.lifeOfAPest.intro")}
      </p>

      <StageRun stages={stages(t)} axis={t("views.lifeOfAPest.axis")}
        foot={<Tx ns={WORDS} k="views.lifeOfAPest.foot" components={{ b: <b /> }} />} />

      <div className="rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
        <p className="text-[0.84375rem] leading-relaxed">
          <Tx ns={WORDS} k="views.lifeOfAPest.moment" components={{ b: <b /> }} />
        </p>
      </div>

      <Facts items={[
        [t("views.lifeOfAPest.fact.thresholds"), <>{t("views.lifeOfAPest.fact.thresholdsBody")}</>],
        [t("views.lifeOfAPest.fact.dated"), <>{t("views.lifeOfAPest.fact.datedBody")}</>],
        [t("views.lifeOfAPest.fact.noAdvice"), <>{t("views.lifeOfAPest.fact.noAdviceBody")}</>],
      ]} />
    </article>
  );
}
