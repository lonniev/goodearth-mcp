// What goes on the wire, decided in one place a test can reach.
//
// The page and the service ship on different clocks: Cloudflare Pages had a
// build live 43 seconds after a merge and the MCP takes minutes. In between, a
// new client talks to a server that has never heard of the newest argument.
//
// That is survivable if the argument is only sent when it MEANS something. It
// was not: `with_lifecycle: false` went on every call, so a finder that had
// worked for weeks answered `unexpected_keyword_argument` for several minutes
// — the whole page, not just the new filter.
//
// The rule this file exists to hold: an optional argument at its default is
// omitted, never sent as an explicit default.

/// The arguments for `nearby_species`.
export function nearbyArgs(
  block: string, kingdom: string, q: string, page: number, withLifecycle: boolean,
): Record<string, unknown> {
  return {
    block, kingdom, q, page,
    ...(withLifecycle ? { with_lifecycle: true } : {}),
  };
}
