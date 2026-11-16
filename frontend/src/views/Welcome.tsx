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
import { GUIDE_META, GUIDED } from "../lib/guides";
import type { ViewKey } from "../lib/views";
import { Tx, useTour } from "@tollbooth-dpyc/web/react";
import { tour } from "../lib/tour/targets";
import { useT, WORDS, type Translate } from "../i18n";

const explainers = (t: Translate): { view: ViewKey; emoji: string; title: string; said: string }[] => [
  { view: "plant", emoji: "🌱", title: t("views.lifeOfAPlant.title"), said: t("views.welcome.plantSaid") },
  { view: "pest", emoji: "🐛", title: t("views.lifeOfAPest.title"), said: t("views.welcome.pestSaid") },
  { view: "tree", emoji: "🌳", title: t("views.lifeOfATree.title"), said: t("views.welcome.treeSaid") },
  { view: "animal", emoji: "🦌", title: t("views.lifeOfAnAnimal.title"), said: t("views.welcome.animalSaid") },
  { view: "disease", emoji: "🍄", title: t("views.lifeOfADisease.title"), said: t("views.welcome.diseaseSaid") },
];

export default function Welcome({ onView, onSignIn, signedIn }: {
  onView: (v: ViewKey) => void;
  onSignIn: () => void;
  /// Reading this from inside. The guides are the same pages either way —
  /// they are the point of this view for a grower — but the pitch around them
  /// is not: an invitation to sign in, and an argument for why the thing is
  /// worth having, are both answered by the fact that they are here.
  signedIn?: boolean;
}) {
  // A stranger's first tour: the key, the free reading, the guides.
  useTour("welcome", { ready: !signedIn });
  const t = useT();
  return (
    <div>
      <h1 className="figure text-[1.875rem] leading-tight font-bold">
        {signedIn ? t("views.welcome.guides") : t("views.welcome.headline")}
      </h1>

      {!signedIn && (
        <>
          {/* Says what the alternative IS, rather than denying something
              nobody claimed. "A farm is not a point" answered a question the
              reader had not asked — and "not a SINGLE POINT IN SPACE", which
              was the first attempt at fixing it, only made the denial more
              precise. The contrast a grower actually lives with is a forecast
              from a station miles away. */}
          <Claim>{t("views.welcome.claim")}</Claim>
          <p className="text-[0.875rem] leading-relaxed">
            {t("views.welcome.spread")}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button onClick={onSignIn} {...tour("welcome.signin")}
              className="min-h-11 rounded-full border-[1.5px] border-ink bg-ink px-5 text-[0.84375rem] font-semibold text-paper">
              {t("views.welcome.signIn")}
            </button>
            <span className="text-[0.78125rem] text-ink-soft">
              {t("views.welcome.noKyc")}
            </span>
          </div>
        </>
      )}

      {/* The teaching, free and unsigned. Five pages, one idea each. */}
      <h2 className={`figure mb-2.5 text-[1.125rem] font-semibold ${signedIn ? "mt-5" : "mt-8"}`}>
        {t("views.welcome.howCounted")}
      </h2>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" {...tour("welcome.explainers")}>
        {explainers(t).map((e) => (
          <button key={e.view} onClick={() => onView(e.view)}
            className="rounded-md border border-rule bg-panel p-4 text-left active:border-ink">
            <span className="text-[1.625rem]" aria-hidden="true">{e.emoji}</span>
            <span className="figure mt-1 block text-[0.90625rem] font-semibold">{e.title}</span>
            <span className="mt-1 block text-[0.78125rem] leading-relaxed text-ink-soft">
              {e.said}
            </span>
          </button>
        ))}
      </div>

      {/* How each page is used: the (?) in the top bar lands here too. One
          card per working page, in the rail's order, so a grower finds the
          guide under the word the rail already uses. */}
      <h2 className="figure mt-8 mb-2.5 text-[1.125rem] font-semibold">
        {t("views.welcome.howUsed")}
      </h2>
      {signedIn && (
        <p className="mb-2.5 text-[0.78125rem] text-ink-soft">
          {t("views.welcome.compass")}
        </p>
      )}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4" {...tour("welcome.guides")}>
        {GUIDED.map((p) => {
          const m = GUIDE_META[p];
          return (
            <button key={p} onClick={() => onView(`how-${p}`)}
              className="rounded-md border border-rule bg-panel p-4 text-left active:border-ink">
              <span className="text-[1.625rem]" aria-hidden="true">{m.emoji}</span>
              <span className="figure mt-1 block text-[0.90625rem] font-semibold">{m.title}</span>
              <span className="mt-1 block text-[0.78125rem] leading-relaxed text-ink-soft">
                {m.said}
              </span>
            </button>
          );
        })}
      </div>

      {!signedIn && (
        <>
      <h2 className="figure mt-8 mb-2.5 text-[1.125rem] font-semibold">{t("views.welcome.answersHeading")}</h2>
      <ul className="grid gap-x-6 gap-y-2 text-[0.84375rem] leading-relaxed sm:grid-cols-2">
        {[
          ["🌡️", t("views.welcome.answers.season")],
          // A tester read this as a requirement — ten years of records they would
          // have to have kept and typed in. It is the opposite: the ten years
          // are the archive we read FOR them, over their own ground.
          ["❄️", t("views.welcome.answers.frost")],
          ["🌱", t("views.welcome.answers.sow")],
          ["🐛", t("views.welcome.answers.pest")],
          ["🍎", t("views.welcome.answers.tree")],
          ["📅", t("views.welcome.answers.calendar")],
        ].map(([emoji, said]) => (
          <li key={said} className="flex gap-2">
            <span aria-hidden="true">{emoji}</span><span>{said}</span>
          </li>
        ))}
      </ul>

      {/* Checkable, not "trust us" — the same argument References makes at
          length, in the one line that earns the click. */}
      <p className="mt-8 text-[0.8125rem] leading-relaxed text-ink-soft">
        <Tx ns={WORDS} k="views.welcome.checkable" components={{
          sources: <button onClick={() => onView("references")}
            className="underline decoration-dotted underline-offset-2" />,
          running: <button onClick={() => onView("about")}
            className="underline decoration-dotted underline-offset-2" />,
        }} />
      </p>
        </>
      )}
    </div>
  );
}
