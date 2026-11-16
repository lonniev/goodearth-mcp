// The life of an animal.
//
// The other three explainers all say the same thing in the end: heat is the
// clock. This one is the exception, and that is why it is worth a page. An
// animal's year is mostly run by day length, which does not vary at all.
//
// Reuses the YearWheel rather than the StageRun. A crop's life is a line that
// has to finish. An animal's year comes back round.

import { Claim, Facts, YearWheel } from "../components/Diagram";
import { useT, type Translate } from "../i18n";

/// Clockwise from January at the top. Northern temperate, which is where the
/// feeds this service reads actually cover.
const year = (t: Translate) => [
  { emoji: "❄️", label: t("views.lifeOfAnAnimal.stage.winterSleep"), at: 0.03 },
  { emoji: "🐦", label: t("views.lifeOfAnAnimal.stage.firstArrival"), at: 0.24 },
  { emoji: "🪺", label: t("views.lifeOfAnAnimal.stage.nesting"), at: 0.36 },
  { emoji: "🐣", label: t("views.lifeOfAnAnimal.stage.youngFledge"), at: 0.48 },
  { emoji: "🦌", label: t("views.lifeOfAnAnimal.stage.youngDisperse"), at: 0.61 },
  { emoji: "🍂", label: t("views.lifeOfAnAnimal.stage.southbound"), at: 0.76 },
  { emoji: "🐻", label: t("views.lifeOfAnAnimal.stage.denning"), at: 0.89 },
];

export default function LifeOfAnAnimal() {
  const t = useT();
  return (
    <article>
      <h1 className="figure mb-1 text-[1.5rem] font-bold">{t("views.lifeOfAnAnimal.title")}</h1>
      <p className="eyebrow mb-4">{t("views.lifeOfAnAnimal.eyebrow")}</p>

      <Claim>{t("views.lifeOfAnAnimal.claim")}</Claim>

      <p className="text-[0.84375rem] leading-relaxed">
        {t("views.lifeOfAnAnimal.intro")}
      </p>

      <YearWheel stages={year(t)} centre={t("views.lifeOfAnAnimal.centre")}
        foot={t("views.lifeOfAnAnimal.foot")} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
          <p className="eyebrow">{t("views.lifeOfAnAnimal.migrationQ")}</p>
          <p className="mt-1 text-[0.84375rem] leading-relaxed">
            {t("views.lifeOfAnAnimal.migrationA")}
          </p>
        </div>
        <div className="rounded-md border border-rule border-l-4 border-l-frost bg-panel px-4 py-3">
          <p className="eyebrow">{t("views.lifeOfAnAnimal.hibernationQ")}</p>
          <p className="mt-1 text-[0.84375rem] leading-relaxed">
            {t("views.lifeOfAnAnimal.hibernationA")}
          </p>
        </div>
      </div>

      <Facts items={[
        [t("views.lifeOfAnAnimal.fact.clocks"), <>{t("views.lifeOfAnAnimal.fact.clocksBody")}</>],
        [t("views.lifeOfAnAnimal.fact.record"), <>{t("views.lifeOfAnAnimal.fact.recordBody")}</>],
        [t("views.lifeOfAnAnimal.fact.counts"), <>{t("views.lifeOfAnAnimal.fact.countsBody")}</>],
      ]} />
    </article>
  );
}
