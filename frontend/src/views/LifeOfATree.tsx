// The life of a tree, and why the other two pages do not fit it.
//
// This one exists to say a NEGATIVE clearly: "does it finish before frost" is
// a question only something that must finish in one season can be asked. A
// tree's year closes rather than ending, which is why it is drawn as a loop
// where the crop is drawn as a line — the shape of the picture is the argument.

import { Claim, Facts, YearWheel } from "../components/Diagram";

/// Clockwise from the top, January at noon.
const YEAR = [
  { emoji: "❄️", label: "dormant", at: 0.02 },
  { emoji: "🌡️", label: "chill banked", at: 0.14 },
  { emoji: "🌱", label: "bud break", at: 0.29 },
  { emoji: "🌸", label: "bloom", at: 0.40 },
  { emoji: "🍏", label: "fruit set", at: 0.52 },
  { emoji: "🍎", label: "harvest", at: 0.70 },
  { emoji: "🍂", label: "leaf fall", at: 0.84 },
];

export default function LifeOfATree() {
  return (
    <article className="max-w-3xl">
      <h1 className="figure mb-1 text-[24px] font-bold">The life of a tree</h1>
      <p className="eyebrow mb-4">a year that closes rather than ends</p>

      <Claim>A tree is not asked whether it finishes before frost.</Claim>

      <p className="text-[13.5px] leading-relaxed">
        A crop has one season to get from seed to harvest, so heat against
        frost is the whole question. A tree has as many seasons as it lives.
        It is asked two others, and both are settled before it goes in the
        ground.
      </p>

      <YearWheel stages={YEAR} centre="the year"
        foot={<>Winter is not a gap between growing seasons — it is part of the
          cycle. A fruit tree that does not get cold enough for long enough
          blooms raggedly or not at all, which is why the loop starts there.</>} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-rule border-l-4 border-l-frost bg-panel px-4 py-3">
          <p className="eyebrow">Will it survive here?</p>
          <p className="mt-1 text-[13.5px] leading-relaxed">
            Every winter on record has a coldest night, and a cultivar has a
            limit. The answer is how often the first went below the second —
            nine winters in ten is a different proposition from five.
          </p>
        </div>
        <div className="rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
          <p className="eyebrow">Will it fruit here?</p>
          <p className="mt-1 text-[13.5px] leading-relaxed">
            Hours at or below 45&nbsp;°F over the winter — the{" "}
            <b>chill</b> on the nursery tag. Too few and the tree wakes
            unevenly. Vermont has chill to spare; Georgia is where it decides.
          </p>
        </div>
      </div>

      <Facts items={[
        ["Frost after bloom",
          <>The risk runs the other way from a crop's. A freeze on open
            blossom costs the year, and it comes after the danger a tomato
            faces has passed.</>],
        ["The figures are the tag's",
          <>Chill and hardiness vary by cultivar — apple runs from about 200
            hours to over 1,000. Good Earth says what your ground delivered.</>],
        ["A woodlot too",
          <>Not only fruit. Sugar maple runs on freeze and thaw, and the sap
            season is a count of the days that did both.</>],
      ]} />
    </article>
  );
}
