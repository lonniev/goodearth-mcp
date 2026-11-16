// Good Earth's decoration on the shared top-up tiles: a plant's life, seed to orchard.

import { Bean, Flower2, Sprout, TreeDeciduous, Wheat } from "lucide-react";
import type { DecorateTile } from "@tollbooth-dpyc/web/react";
import { tr } from "../i18n/index.ts";
import type { MessageKey } from "../i18n/en.ts";

const LOOKS: Record<number, { name: MessageKey; Mark: typeof Sprout }> = {
  100: { name: "lib.tiles.seed", Mark: Bean },
  500: { name: "lib.tiles.sprout", Mark: Sprout },
  1_000: { name: "lib.tiles.bloom", Mark: Flower2 },
  5_000: { name: "lib.tiles.harvest", Mark: Wheat },
  25_000: { name: "lib.tiles.orchard", Mark: TreeDeciduous },
};

export const decorateTile: DecorateTile = (sats) => {
  const look = LOOKS[sats];
  return look && { name: tr(look.name), mark: <look.Mark size={18} aria-hidden /> };
};
