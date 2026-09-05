// The front door.
//
// What a stranger used to get was a password box for a farm they do not have.
// The two pages that would have served them — what this is, and which feeds it
// reads — were both behind the gate, and neither costs anything to render.
//
// Brief on purpose. This page has one job: say what the thing is, show that
// there is something worth signing in for, and get out of the way. The
// explainers behind it carry the teaching.

import { Claim } from "../components/Diagram";
import type { ViewKey } from "../lib/views";

const EXPLAINERS: { view: ViewKey; emoji: string; title: string; said: string }[] = [
  { view: "plant", emoji: "🌱", title: "The life of a plant",
    said: "Why a crop counts warmth rather than days, and what a growing degree day is." },
  { view: "pest", emoji: "🐛", title: "The life of an insect",
    said: "Why a pest is on the same clock, and how that tells you the week to walk the rows." },
  { view: "tree", emoji: "🌳", title: "The life of a tree",
    said: "Why a year that closes is a different question, and what chill and hardiness decide." },
];

export default function Welcome({ onView, onSignIn }: {
  onView: (v: ViewKey) => void;
  onSignIn: () => void;
}) {
  return (
    <div className="max-w-3xl">
      <h1 className="figure text-[30px] leading-tight font-bold">
        Climate analytics for the ground you actually farm.
      </h1>

      <Claim>A farm is not a point.</Claim>
      <p className="text-[14px] leading-relaxed">
        A bench and a hollow on the same acreage do not share a frost date, and
        every free weather calculator answers for a pin. Draw your block, and
        every answer comes back with the spread across it — heat, frost, soil,
        daylight and rain, measured for that ground rather than for a zone map.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <button onClick={onSignIn}
          className="min-h-11 rounded-full border-[1.5px] border-ink bg-ink px-5 text-[13.5px] font-semibold text-paper">
          Sign in with a Nostr key
        </button>
        <span className="text-[12.5px] text-ink-soft">
          No email, no password, no KYC. Pay per answer in Bitcoin Lightning.
        </span>
      </div>

      {/* The teaching, free and unsigned. Three pages, one idea each. */}
      <h2 className="figure mt-8 mb-2.5 text-[18px] font-semibold">
        How the season is counted
      </h2>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {EXPLAINERS.map((e) => (
          <button key={e.view} onClick={() => onView(e.view)}
            className="rounded-md border border-rule bg-panel p-4 text-left active:border-ink">
            <span className="text-[26px]" aria-hidden="true">{e.emoji}</span>
            <span className="figure mt-1 block text-[14.5px] font-semibold">{e.title}</span>
            <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-soft">
              {e.said}
            </span>
          </button>
        ))}
      </div>

      <h2 className="figure mt-8 mb-2.5 text-[18px] font-semibold">What it answers</h2>
      <ul className="grid gap-x-6 gap-y-2 text-[13.5px] leading-relaxed sm:grid-cols-2">
        {[
          ["🌡️", "Where the season stands, and the spread across your block"],
          ["❄️", "First and last frost, from your own ten-year record"],
          ["🌱", "When to start seed, set it out, and the last sowing that finishes"],
          ["🐛", "When a pest's stages arrive on this ground"],
          ["🍎", "Whether a tree survives the winter here and gets its chill"],
          ["📅", "The whole season as a calendar feed you can subscribe to"],
        ].map(([emoji, said]) => (
          <li key={said} className="flex gap-2">
            <span aria-hidden="true">{emoji}</span><span>{said}</span>
          </li>
        ))}
      </ul>

      {/* Checkable, not "trust us" — the same argument References makes at
          length, in the one line that earns the click. */}
      <p className="mt-8 text-[13px] leading-relaxed text-ink-soft">
        Every number comes from a named feed with a stated resolution, and every
        model says the assumption inside it.{" "}
        <button onClick={() => onView("references")}
          className="underline decoration-dotted underline-offset-2">
          The sources
        </button>{" "}
        and{" "}
        <button onClick={() => onView("about")}
          className="underline decoration-dotted underline-offset-2">
          what is running
        </button>{" "}
        are open before you sign in.
      </p>
    </div>
  );
}
