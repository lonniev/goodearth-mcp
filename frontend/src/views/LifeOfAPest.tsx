// The life of an insect, and why a threshold beats a spray calendar.
//
// The plant page establishes that heat is the clock. This page says the pest
// reads the same clock — which is the whole reason a grower can be told when
// to walk the rows rather than when to reach for something.

import { Claim, Facts, StageRun } from "../components/Diagram";

const STAGES = [
  { emoji: "🥚", label: "eggs", at: 0.0 },
  { emoji: "🐛", label: "larvae", at: 0.26, figure: "the damage" },
  { emoji: "🪱", label: "pupae", at: 0.56 },
  { emoji: "🦋", label: "adults", at: 0.78, figure: "first flight" },
  { emoji: "🥚", label: "eggs again", at: 1.0, figure: "second flight" },
];

export default function LifeOfAPest() {
  return (
    <article className="max-w-3xl">
      <h1 className="figure mb-1 text-[24px] font-bold">The life of an insect</h1>
      <p className="eyebrow mb-4">and why it is worth counting</p>

      <Claim>The pest is on the same clock as the crop.</Claim>

      <p className="text-[13.5px] leading-relaxed">
        An insect develops on accumulated warmth too, from its own base. So its
        stages arrive at heat totals rather than on dates — and a stage that
        arrives at a number can be seen coming.
      </p>

      <StageRun stages={STAGES} axis="growing degree days from the biofix →"
        foot={<><b>Biofix</b> is the day the count starts — usually the first
          sustained catch in a trap, sometimes simply the first of January.</>} />

      <div className="rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
        <p className="text-[13.5px] leading-relaxed">
          <b>The useful moment is before the damage, not after it.</b> Larvae
          are what eats the crop, and by the time you find them the decision
          you had is gone. Counting from the biofix tells you which week to
          walk the rows and look.
        </p>
      </div>

      <Facts items={[
        ["Thresholds are yours",
          <>Good Earth times the stage you set. The numbers belong to your
            extension service and vary by region and biotype.</>],
        ["Dated for this ground",
          <>USA-NPN models a set of pests nationally; this reads them at your
            block's own coordinates.</>],
        ["No treatment advice",
          <>What to do about what you find is between you and your agronomist.
            This says when to look.</>],
      ]} />
    </article>
  );
}
