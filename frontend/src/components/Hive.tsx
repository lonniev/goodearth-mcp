// The skep. An instrument, not wallpaper.
//
// Honeybee flight is temperature-gated near 55°F, so bee traffic in the corner
// is a readout of the active region's current heat — the same threshold that
// gates a lot of the grower's own field work. Warm and they fly; cold and the
// hive is quiet; a live frost watch and it is shut. No words, no chrome.
//
// Sits behind the content at low contrast so it can never compete with a frost
// warning. prefers-reduced-motion parks it with the bees settled on the skep.

export type HiveMood = "flying" | "quiet" | "closed" | "unknown";

/// Honeybees stop foraging below roughly 55 °F. A live frost watch shuts the
/// hive outright — nothing is working on a night like that.
export function hiveMood(tempF: number | null, frostWatch: boolean): HiveMood {
  if (frostWatch) return "closed";
  if (tempF == null) return "unknown";
  return tempF >= 55 ? "flying" : "quiet";
}

const LABEL: Record<HiveMood, string> = {
  flying: "Warm enough for the bees to be working.",
  quiet: "Below flight temperature — the hive is quiet.",
  closed: "Frost watch — the hive is shut.",
  unknown: "",
};

export default function Hive({ mood = "unknown" }: { mood?: HiveMood }) {
  // Bee count IS the reading. Two out foraging when warm, one at the entrance
  // when cold, none when shut.
  const quiet = mood === "quiet";

  return (
    <svg
      viewBox="0 0 150 120"
      className="pointer-events-none fixed right-4 bottom-3 w-[150px] opacity-25 hidden md:block"
      role="img"
      aria-label={LABEL[mood] || "Beehive"}
    >
      <g fill="none" stroke="var(--color-ink)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M30 100h90M38 100V108M112 100V108" />
        <path d="M45 100c-4-14-2-34 10-48s26-22 20-52" />
        <path d="M105 100c4-14 2-34-10-48S69-22 75 0" />
        <path d="M43 86h64M47 72h56M52 58h46M58 44h34M65 30h20" />
        <path d="M68 100a7 7 0 0 1 14 0" />
      </g>
      <g fill="var(--color-honey)">
        {/* One bee always sits at the entrance unless the hive is shut. */}
        {mood !== "closed" && (
          <ellipse className="ge-bee" cx="75" cy="95" rx="3.2" ry="2.2" />
        )}
        {/* Foragers are drawn by the roaming Bees layer, which works the whole
            page. The skep keeps only its doorway, or the two would double up. */}
        {quiet && <ellipse className="ge-bee" cx="61" cy="88" rx="3" ry="2.1" />}
      </g>
    </svg>
  );
}
