# Chart harness

Renders `SeasonChart` against a fixture so the parts of it that only exist on
screen can be **measured** rather than imagined. The live curve comes from a
paid MCP call, so a browser without a patron's proof cannot draw one — and
these questions ("does the plot fill a full screen", "does the label still run
through its neighbours") are exactly the ones that cannot be answered from a
unit test.

    npx vite build --config .probe/vite.config.ts
    (cd .probe-dist && python3 -m http.server 8898)

Then drive it with a DevTools-protocol client and
`Emulation.setDeviceMetricsOverride` — `--window-size` sets the WINDOW, and the
layout viewport comes back a different number, so read the width back from
inside the page before believing any measurement taken through it.

**`probe.css` is load-bearing.** Tailwind v4 scans outward from the CSS file,
and this build's root is `.probe/` — so without the `@source "../src"` line it
emits none of the classes the components actually use. The first version of
this harness shipped without it, rendered a page with no `w-full`, no
`min-h-11`, no flex wrapping, and reported a full-screen coverage of 0.81 for a
layout that was really 0.53. Every number taken through it was wrong, and the
change built on those numbers went out. Validate the probe before trusting what
it says about the thing.

Not part of the app build: `npm run build` reads `vite.config.ts` at the root
and never looks in here.
