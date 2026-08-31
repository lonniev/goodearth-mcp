// Something worth reading while the ground is being measured.
//
// Ported from optionality-mcp's QuoteScroller, which ports the Studio app's
// LoadingQuoteView — same mechanism, different corpus. Optionality rotates the
// Austrian tradition because it is a market game; Good Earth rotates the
// agrarian one, because it is about land.
//
// Fetched once per session from the dpyc-community registry so the set can be
// edited without a redeploy, with an inline fallback for offline and first
// load. Tailwind rather than the injected <style> block the sibling uses —
// this app already has the tokens.

import { useEffect, useRef, useState } from "react";

interface Quote { text: string; author: string }

const REMOTE_URL =
  "https://raw.githubusercontent.com/lonniev/dpyc-community/main/quotes-agrarian.json";

const FALLBACK: ReadonlyArray<Quote> = [
  { text: "If more of us valued food and cheer and song above hoarded gold, it would be a merrier world.",
    author: "J.R.R. Tolkien, The Hobbit" },
  { text: "Those who labour in the earth are the chosen people of God, if ever He had a chosen people.",
    author: "Thomas Jefferson, Notes on the State of Virginia" },
  { text: "O fortunate farmers, excessively fortunate, if only they knew their own blessings!",
    author: "Virgil, Georgics" },
  { text: "No race can prosper till it learns that there is as much dignity in tilling a field as in writing a poem.",
    author: "Booker T. Washington, Up From Slavery" },
  { text: "Farming looks mighty easy when your plow is a pencil and you're a thousand miles from the corn field.",
    author: "Dwight D. Eisenhower" },
  { text: "Too much capitalism does not mean too many capitalists, but too few capitalists.",
    author: "G.K. Chesterton, The Uses of Diversity" },
  { text: "Observe the seasons, and do each thing in its own time.",
    author: "Hesiod, Works and Days" },
];

let cached: Quote[] | null = null;
let inflight: Promise<Quote[]> | null = null;

function shuffle<T>(arr: ReadonlyArray<T>): T[] {
  const c = arr.slice();
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

async function fetchQuotes(): Promise<Quote[]> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch(REMOTE_URL, { cache: "no-cache" });
      if (!r.ok) throw new Error(String(r.status));
      const body = (await r.json()) as { quotes?: Quote[] };
      const clean = (Array.isArray(body?.quotes) ? body.quotes : []).filter(
        (q) => typeof q?.text === "string" && typeof q?.author === "string",
      );
      cached = clean.length ? clean : FALLBACK.slice();
    } catch {
      cached = FALLBACK.slice();
    }
    return cached!;
  })();
  return inflight;
}

export default function QuoteScroller({
  heading, intervalMs = 6500, fadeMs = 450,
}: { heading?: string; intervalMs?: number; fadeMs?: number }) {
  const [quotes, setQuotes] = useState<Quote[]>(() => shuffle(FALLBACK));
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const fade = useRef<number | null>(null);
  const tick = useRef<number | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), 30);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let alive = true;
    void fetchQuotes().then((list) => {
      if (!alive) return;
      setQuotes(shuffle(list));
      setIndex(0);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (quotes.length <= 1) return;
    const run = () => {
      setVisible(false);
      fade.current = window.setTimeout(() => {
        setIndex((prev) => {
          let next = Math.floor(Math.random() * quotes.length);
          while (quotes.length > 1 && next === prev) {
            next = Math.floor(Math.random() * quotes.length);
          }
          return next;
        });
        setVisible(true);
      }, fadeMs);
    };
    tick.current = window.setInterval(run, intervalMs);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
      if (fade.current) window.clearTimeout(fade.current);
    };
  }, [quotes, intervalMs, fadeMs]);

  const q = quotes[index % quotes.length] ?? FALLBACK[0];

  return (
    <div className="px-4 py-6 text-center" aria-live="polite">
      {heading && <div className="eyebrow mb-5">{heading}</div>}
      <div
        className="mx-auto flex min-h-[124px] max-w-[520px] flex-col justify-center gap-3"
        style={{ opacity: visible ? 1 : 0, transition: `opacity ${fadeMs}ms ease` }}
      >
        <p className="figure text-[17px] font-normal italic leading-relaxed text-ink">
          <span className="mr-0.5 not-italic text-honey">&ldquo;</span>
          {q.text}
          <span className="ml-0.5 not-italic text-honey">&rdquo;</span>
        </p>
        <p className="data text-[10.5px] uppercase tracking-[0.22em] text-ink-soft">
          {q.author}
        </p>
      </div>
    </div>
  );
}
