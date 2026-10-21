// Prices — every tool, what it is for, and what it costs, with how long a
// top-up lasts. The fleet's price sheet, read live from the pricing model and
// dressed in the almanac's type; the free `get_pricing_model` call is the only
// one it makes, which is why a visitor may see it.

import { PriceSheet } from "@tollbooth-dpyc/web/react";

export default function Prices() {
  return <PriceSheet />;
}
