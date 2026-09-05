// The life of a plant, and why heat rather than dates.
//
// The one idea worth a page: a crop does not count days, it counts warmth.
// Everything else this service does to a crop follows from that, and it is a
// claim best made in a picture — the stages sit at fixed HEAT and therefore at
// moving DATES, which no sentence shows as quickly as two rulers do.

import { Claim, Facts, StageRun } from "../components/Diagram";

/// Positions are the shape of a season, not a scale to read values off.
/// A crop's early stages come fast and its ripening is the long half.
const STAGES = [
  { emoji: "🌱", label: "sown", at: 0.0 },
  { emoji: "🌿", label: "emerges", at: 0.12, figure: "~120" },
  { emoji: "🍃", label: "leafs out", at: 0.3, figure: "~400" },
  { emoji: "🌸", label: "flowers", at: 0.58, figure: "~900" },
  { emoji: "🍅", label: "sets fruit", at: 0.76, figure: "~1,200" },
  { emoji: "🧺", label: "harvest", at: 1.0, figure: "~1,600" },
];

export default function LifeOfAPlant() {
  return (
    <article className="max-w-3xl">
      <h1 className="figure mb-1 text-[24px] font-bold">The life of a plant</h1>
      <p className="eyebrow mb-4">and what a growing degree day is</p>

      <Claim>A crop does not count days. It counts warmth.</Claim>

      <p className="text-[13.5px] leading-relaxed">
        Every plant has a temperature below which it does no growing — its{" "}
        <b>base</b>. Above that, each day adds the degrees it spent there. Add
        them up and you have <b>growing degree days</b>: the season measured in
        what the plant actually responds to.
      </p>

      <StageRun stages={STAGES} axis="growing degree days →"
        foot={<>Figures are the shape of a tomato's season, to read as an
          example rather than as your cultivar's. A seed packet's own numbers
          are the ones that count.</>} />

      <div className="rounded-md border border-rule border-l-4 border-l-growth bg-panel px-4 py-3">
        <p className="text-[13.5px] leading-relaxed">
          <b>Which is why the dates move.</b> A warm spring and a cold one reach
          900&nbsp;GDD weeks apart, and the plant flowers at 900 in both. Count
          days and you are early one year and late the next; count heat and you
          are on time in either.
        </p>
      </div>

      <Facts items={[
        ["One day's heat",
          <>The day's mean, minus the base, never below zero. A night at
            20&nbsp;°F below base does not un-grow a plant.</>],
        ["The base is the plant's",
          <>Winter wheat counts from 32&nbsp;°F and field corn from
            50&nbsp;°F on the same acre.</>],
        ["The ground is yours",
          <>A bench and a hollow on one farm do not share a season, so every
            answer here comes back with the spread across your block.</>],
      ]} />
    </article>
  );
}
