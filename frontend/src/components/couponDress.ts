// The Coupons card in Good Earth's dress — the same ruled panel and eyebrow as
// the balance and usage cards it sits beneath. The package redeems, lists and
// forgets; this is only the look.

import type { CouponsPanelClassNames } from "@tollbooth-dpyc/web/react";

const chip =
  "min-h-11 rounded-full border border-rule px-3.5 text-[12px] text-ink-soft active:bg-band disabled:opacity-60";

export const COUPONS: CouponsPanelClassNames = {
  // `ge-coupons` styles nothing; it is how the account tour finds the panel.
  root: "ge-coupons rounded-xl border border-rule bg-panel px-4 py-3",
  heading: "eyebrow mb-1",
  intro: "mb-2.5 text-[11.5px] leading-snug text-ink-soft",
  form: "flex items-center gap-2",
  input:
    "data min-h-11 min-w-0 flex-1 rounded-full border border-rule bg-paper px-3.5 text-[13px] uppercase placeholder:normal-case placeholder:text-ink-soft focus:border-honey focus:outline-none",
  chip,
  // Redeem is the one primary action here, so it wears the honey.
  primary: `${chip} border-honey bg-honey/15 text-ink active:bg-honey/8`,
  subheading: "eyebrow mt-3.5 mb-1",
  message: "mt-2 text-[12.5px]",
  ok: "text-growth",
  error: "text-clay",
  loading: "mt-2 text-[12.5px] text-ink-soft",
  empty: "mt-2 text-[12.5px] text-ink-soft",
  list: "mt-1 divide-y divide-rule",
  row: "flex items-center gap-3 py-2 [&>div]:min-w-0 [&>div]:flex-1",
  name: "data text-[12.5px]",
  discount: "ml-1 text-[12.5px] font-semibold text-honey",
  meta: "mt-0.5 text-[11px] text-ink-soft",
  active: "text-growth",
};
