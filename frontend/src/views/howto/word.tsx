// A glossary word inside a translated sentence. `Tx` hands an element the
// words between its tags as children, and `Term` takes its word as `label`,
// so this passes one to the other: `"…the <dew>dew point</dew> is…"` drawn
// with `components={{ dew: <Word of="dew_point" /> }}`.

import type { ReactNode } from "react";
import Term from "../../components/Term";

export function Word({ of, align, children }: {
  of: string;
  align?: "left" | "right";
  children?: ReactNode;
}) {
  return <Term label={children} of={of} align={align} />;
}
