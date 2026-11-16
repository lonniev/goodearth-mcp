// The life of a fungus, and why its clock is water rather than heat.
//
// The plant and insect pages teach that warmth is the clock. This page has to
// unteach it for disease: a hot dry August banks heat all month and grows no
// botrytis. So it says what the clock is, what each model watches, where the
// weather comes from — and what "clear" on the Dashboard means. It was
// "quiet", which a tester read as "you have not entered anything yet".

import { Tx } from "@tollbooth-dpyc/web/react";
import { Claim, Facts, StageRun } from "../components/Diagram";
import { useT, WORDS, type Translate } from "../i18n";

const stages = (t: Translate) => [
  { emoji: "🍂", label: t("views.lifeOfADisease.stage.sporeLands"), at: 0.0 },
  { emoji: "💧", label: t("views.lifeOfADisease.stage.leafWet"), at: 0.3, figure: t("views.lifeOfADisease.stage.hoursNotDays") },
  { emoji: "🌱", label: t("views.lifeOfADisease.stage.germinates"), at: 0.62 },
  { emoji: "🍄", label: t("views.lifeOfADisease.stage.infection"), at: 0.84, figure: t("views.lifeOfADisease.stage.infectionPeriod") },
  { emoji: "🔎", label: t("views.lifeOfADisease.stage.spotsShow"), at: 1.0, figure: t("views.lifeOfADisease.stage.daysLater") },
];

// Disease and crop names stay in English; what each model watches is said in
// the reader's language.
const diseases = (t: Translate): { emoji: string; disease: string; crops: string; watches: string }[] => [
  { emoji: "🥔", disease: "Late blight", crops: "potato, tomato",
    watches: t("views.lifeOfADisease.watches.lateBlight") },
  { emoji: "🍅", disease: "Early blight", crops: "potato, tomato",
    watches: t("views.lifeOfADisease.watches.earlyBlight") },
  { emoji: "🍎", disease: "Apple scab", crops: "apple, crabapple",
    watches: t("views.lifeOfADisease.watches.appleScab") },
  { emoji: "🌼", disease: "Grey mould (botrytis)", crops: "cut flowers, strawberry, grape",
    watches: t("views.lifeOfADisease.watches.botrytis") },
  { emoji: "🥒", disease: "Powdery mildew", crops: "cucurbits, grape, rose",
    watches: t("views.lifeOfADisease.watches.powderyMildew") },
];

const status = (t: Translate): { word: string; label: string; tone: string; means: string }[] => [
  { word: "forecast", label: t("views.lifeOfADisease.status.forecast"), tone: "bg-clay/15 text-clay",
    means: t("views.lifeOfADisease.status.forecastMeans") },
  { word: "recent", label: t("views.lifeOfADisease.status.recent"), tone: "bg-honey/20 text-ink",
    means: t("views.lifeOfADisease.status.recentMeans") },
  { word: "clear", label: t("views.lifeOfADisease.status.clear"), tone: "bg-band text-ink-soft",
    means: t("views.lifeOfADisease.status.clearMeans") },
];

export default function LifeOfADisease() {
  const t = useT();
  return (
    <article>
      <h1 className="figure mb-1 text-[1.5rem] font-bold">{t("views.lifeOfADisease.title")}</h1>
      <p className="eyebrow mb-4">{t("views.lifeOfADisease.eyebrow")}</p>

      <Claim>{t("views.lifeOfADisease.claim")}</Claim>

      <p className="text-[0.84375rem] leading-relaxed">
        {t("views.lifeOfADisease.intro")}
      </p>

      <StageRun stages={stages(t)} axis={t("views.lifeOfADisease.axis")}
        foot={t("views.lifeOfADisease.foot")} />

      <h2 className="figure mt-6 mb-2.5 text-[1.125rem] font-semibold">{t("views.lifeOfADisease.fiveHeading")}</h2>
      <ul className="space-y-2">
        {diseases(t).map((d) => (
          <li key={d.disease} className="flex gap-3 rounded-md border border-rule bg-panel px-3.5 py-2.5">
            <span className="text-[1.375rem]" aria-hidden="true">{d.emoji}</span>
            <div>
              <p className="text-[0.84375rem]">
                <b>{d.disease}</b>{" "}
                <span className="text-[0.75rem] text-ink-soft">· {d.crops}</span>
              </p>
              <p className="mt-0.5 text-[0.78125rem] leading-relaxed text-ink-soft">{d.watches}</p>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="figure mt-6 mb-2.5 text-[1.125rem] font-semibold">{t("views.lifeOfADisease.predictedHeading")}</h2>
      <p className="text-[0.84375rem] leading-relaxed">
        {t("views.lifeOfADisease.predicted")}
      </p>
      <p className="mt-2 text-[0.84375rem] leading-relaxed">
        {t("views.lifeOfADisease.runsOnEvery")}
      </p>

      <h2 className="figure mt-6 mb-2.5 text-[1.125rem] font-semibold">{t("views.lifeOfADisease.cardHeading")}</h2>
      <dl className="space-y-2">
        {status(t).map((s) => (
          <div key={s.word} className="flex items-baseline gap-3">
            <dt className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-[0.6875rem] font-semibold ${s.tone}`}>
              {s.label}
            </dt>
            <dd className="text-[0.8125rem] leading-relaxed">{s.means}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
        <p className="text-[0.84375rem] leading-relaxed">
          <Tx ns={WORDS} k="views.lifeOfADisease.clearIsAnswer" components={{ b: <b /> }} />
        </p>
      </div>

      <Facts items={[
        [t("views.lifeOfADisease.fact.estimated"), <>{t("views.lifeOfADisease.fact.estimatedBody")}</>],
        [t("views.lifeOfADisease.fact.weather"), <>{t("views.lifeOfADisease.fact.weatherBody")}</>],
        [t("views.lifeOfADisease.fact.noAdvice"), <>{t("views.lifeOfADisease.fact.noAdviceBody")}</>],
      ]} />

      <p className="mt-5 text-[0.78125rem] leading-relaxed text-ink-soft">
        {t("views.lifeOfADisease.seeReferences")}
      </p>
    </article>
  );
}
