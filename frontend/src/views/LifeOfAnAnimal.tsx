// The life of an animal.
//
// The other three explainers all say the same thing in the end: heat is the
// clock. This one is the exception, and that is why it is worth a page. An
// animal's year is mostly run by day length, which does not vary at all.
//
// Reuses the YearWheel rather than the StageRun. A crop's life is a line that
// has to finish. An animal's year comes back round.

import { Claim, Facts, YearWheel } from "../components/Diagram";

/// Clockwise from January at the top. Northern temperate, which is where the
/// feeds this service reads actually cover.
const YEAR = [
  { emoji: "❄️", label: "winter sleep", at: 0.03 },
  { emoji: "🐦", label: "first arrival", at: 0.24 },
  { emoji: "🪺", label: "nesting", at: 0.36 },
  { emoji: "🐣", label: "young fledge", at: 0.48 },
  { emoji: "🦌", label: "young disperse", at: 0.61 },
  { emoji: "🍂", label: "southbound", at: 0.76 },
  { emoji: "🐻", label: "denning", at: 0.89 },
];

export default function LifeOfAnAnimal() {
  return (
    <article className="max-w-3xl">
      <h1 className="figure mb-1 text-[24px] font-bold">The life of an animal</h1>
      <p className="eyebrow mb-4">migration, and the winter sleep</p>

      <Claim>A bird does not read a thermometer.</Claim>

      <p className="text-[13.5px] leading-relaxed">
        Almost everything else on this site runs on heat. Animals are the
        exception. A migrating bird leaves on day length. Day length is the
        same on the same date every year, whatever the weather did. The insects
        it arrives to eat came out on warmth, and warmth moves by weeks. In
        some years the two line up. In others they do not, and that gap is
        something a grower can watch for.
      </p>

      <YearWheel stages={YEAR} centre="the year"
        foot={<>Seven moments a temperate year tends to have. Which of them
          matter is a question about your ground and your own record. Good
          Earth dates the ones you name.</>} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-rule border-l-4 border-l-honey bg-panel px-4 py-3">
          <p className="eyebrow">Migration keeps a calendar</p>
          <p className="mt-1 text-[13.5px] leading-relaxed">
            Day length is astronomy. The 13-hour day falls on the same date at
            your latitude every year. Birds that time departure by light are
            reliable to within about a week, and a warm spring does not move
            them.
          </p>
        </div>
        <div className="rounded-md border border-rule border-l-4 border-l-frost bg-panel px-4 py-3">
          <p className="eyebrow">Hibernation is two questions</p>
          <p className="mt-1 text-[13.5px] leading-relaxed">
            Going under has to do with cold and with food running out. Coming
            back out has to do with warmth. The two ends of a winter sleep
            answer to different things, so a mild autumn and a mild spring do
            not shift the dates by the same amount.
          </p>
        </div>
      </div>

      <Facts items={[
        ["Four clocks",
          <>An event here can be timed by day length, by accumulated heat, by a
            fixed count of days from a date you give, or by a date from your own
            record. Husbandry uses the third: a ewe bred in October lambs about
            147 days later whatever the winter does.</>],
        ["Your record, not natural history",
          <>Good Earth times what you tell it to watch for. It does not publish
            what an animal does — the phenophases it can offer come from
            USA-NPN, in their words.</>],
        ["Counts measure observers",
          <>What is recorded near your ground says as much about where people
            walk as about where animals live. A roadside is better watched than
            a back hayfield.</>],
      ]} />
    </article>
  );
}
