// The life of a fungus, and why its clock is water rather than heat.
//
// The plant and insect pages teach that warmth is the clock. This page has to
// unteach it for disease: a hot dry August banks heat all month and grows no
// botrytis. So it says what the clock is, what each model watches, where the
// weather comes from — and what "quiet" on the Dashboard means, because a
// tester read it as "you have not entered anything yet".

import { Claim, Facts, StageRun } from "../components/Diagram";

const STAGES = [
  { emoji: "🍂", label: "spore lands", at: 0.0 },
  { emoji: "💧", label: "leaf stays wet", at: 0.3, figure: "hours, not days" },
  { emoji: "🌱", label: "spore germinates", at: 0.62 },
  { emoji: "🍄", label: "infection", at: 0.84, figure: "the infection period" },
  { emoji: "🔎", label: "spots show", at: 1.0, figure: "days later" },
];

const DISEASES: { emoji: string; disease: string; crops: string; watches: string }[] = [
  { emoji: "🥔", disease: "Late blight", crops: "potato, tomato",
    watches: "Two days running, each with a warm night and six humid hours (the Hutton criteria)." },
  { emoji: "🍅", disease: "Early blight", crops: "potato, tomato",
    watches: "A score for every wet period, from its length and warmth, added up over the season (Wallin severity values)." },
  { emoji: "🍎", disease: "Apple scab", crops: "apple, crabapple",
    watches: "How many wet hours a spring rain lasted at the temperature it fell (the modified Mills table)." },
  { emoji: "🌼", disease: "Grey mould (botrytis)", crops: "cut flowers, strawberry, grape",
    watches: "One unbroken wet stretch — about six hours when it is warm, eighteen when it is cool." },
  { emoji: "🥒", disease: "Powdery mildew", crops: "cucurbits, grape, rose",
    watches: "The opposite case: humid air with NO rain. Rain sets this one back." },
];

const STATUS: { word: string; tone: string; means: string }[] = [
  { word: "forecast", tone: "bg-clay/15 text-clay",
    means: "The next 10 days of forecast weather meet the model's criteria. The date is when." },
  { word: "recent", tone: "bg-honey/20 text-ink",
    means: "An infection period happened on your ground in the last 14 days." },
  { word: "quiet", tone: "bg-band text-ink-soft",
    means: "Neither. The weather over the last two weeks and the next ten has not met the criteria." },
];

export default function LifeOfADisease() {
  return (
    <article className="max-w-3xl">
      <h1 className="figure mb-1 text-[24px] font-bold">The life of a fungus</h1>
      <p className="eyebrow mb-4">and why it counts wet hours</p>

      <Claim>A fungus does not count warmth. It counts how long the leaf stays wet.</Claim>

      <p className="text-[13.5px] leading-relaxed">
        A spore on a dry leaf waits. It needs a film of water, or air near
        saturation, for long enough to germinate and get in — and the warmer it
        is, the fewer hours that takes. So disease weather is measured in hours
        of wetness at a temperature, not in degree days.
      </p>

      <StageRun stages={STAGES} axis="Hours the leaf stays wet →"
        foot={<>A dry break can reset the count, which is why the length of one
          unbroken wet stretch matters more than the day's total rain.</>} />

      <h2 className="figure mt-6 mb-2.5 text-[18px] font-semibold">The five it watches</h2>
      <ul className="space-y-2">
        {DISEASES.map((d) => (
          <li key={d.disease} className="flex gap-3 rounded-md border border-rule bg-panel px-3.5 py-2.5">
            <span className="text-[22px]" aria-hidden="true">{d.emoji}</span>
            <div>
              <p className="text-[13.5px]">
                <b>{d.disease}</b>{" "}
                <span className="text-[12px] text-ink-soft">· {d.crops}</span>
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">{d.watches}</p>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="figure mt-6 mb-2.5 text-[18px] font-semibold">How it is predicted</h2>
      <p className="text-[13.5px] leading-relaxed">
        Every hour since the season began, and every hour of the next ten days,
        is read for the middle of your plot: temperature, humidity, dew point and
        rain, from a weather model run on a 2 km grid. An hour counts as wet when
        the humidity reaches 90%, or when rain falls into air already close to
        its dew point. Each of the five models then reads those hours by its own
        published rule.
      </p>
      <p className="mt-2 text-[13.5px] leading-relaxed">
        It runs on every plot whether or not you have entered anything. The
        crops you record only decide which diseases lead the card — a model
        written for apples is set aside on ground that grows none.
      </p>

      <h2 className="figure mt-6 mb-2.5 text-[18px] font-semibold">What the card is telling you</h2>
      <dl className="space-y-2">
        {STATUS.map((s) => (
          <div key={s.word} className="flex items-baseline gap-3">
            <dt className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${s.tone}`}>
              {s.word}
            </dt>
            <dd className="text-[13px] leading-relaxed">{s.means}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
        <p className="text-[13.5px] leading-relaxed">
          <b>Quiet is an answer, not a blank.</b> A dry fortnight is the ordinary
          result, and it is as useful to know as a warning. Open a row to see the
          last time that disease's weather did happen this season.
        </p>
      </div>

      <Facts items={[
        ["Estimated, not measured",
          <>Nobody publishes leaf wetness for arbitrary ground, so it is worked
            out from humidity and rain. A station with a wetness sensor, like
            Cornell's NEWA, is nearer the truth.</>],
        ["Weather, not spores",
          <>An infection period says the conditions allowed infection. Whether
            spores were there is a separate question, and a field walk answers it.</>],
        ["No treatment advice",
          <>What to do about it belongs to your extension service. This says
            when the weather was right for it.</>],
      ]} />

      <p className="mt-5 text-[12.5px] leading-relaxed text-ink-soft">
        Every feed and every model rule, with its citation, is on the References
        page; the words are in Words.
      </p>
    </article>
  );
}
