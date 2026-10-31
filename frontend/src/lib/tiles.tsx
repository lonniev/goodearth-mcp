// Good Earth's decoration on the shared top-up tiles: a plant's life, seed to orchard.

import { Bean, Flower2, Sprout, TreeDeciduous, Wheat } from "lucide-react";
import type { DecorateTile } from "@tollbooth-dpyc/web/react";

const LOOKS: Record<number, { name: string; Mark: typeof Sprout }> = {
  100: { name: "Seed", Mark: Bean },
  500: { name: "Sprout", Mark: Sprout },
  1_000: { name: "Bloom", Mark: Flower2 },
  5_000: { name: "Harvest", Mark: Wheat },
  25_000: { name: "Orchard", Mark: TreeDeciduous },
};

export const decorateTile: DecorateTile = (sats) => {
  const look = LOOKS[sats];
  return look && { name: look.name, mark: <look.Mark size={18} aria-hidden /> };
};
