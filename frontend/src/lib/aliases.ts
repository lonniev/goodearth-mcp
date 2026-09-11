// A plot's other names — the ones a grower says that share no words with
// the saved one.
//
// Kept apart from the page so the rules are tested rather than eyeballed. They
// mirror the server's: case and spacing do not make a name different, and an
// alias that repeats the plot's own name is not another name.

const fold = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function sameName(a: string, b: string): boolean {
  return fold(a) === fold(b);
}

/// Trimmed, blanks dropped, duplicates and the plot's own name dropped, first
/// spelling kept.
export function cleanAliases(list: string[], name: string): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const a = raw.trim().replace(/\s+/g, " ");
    if (!a || sameName(a, name) || out.some((o) => sameName(o, a))) continue;
    out.push(a);
  }
  return out;
}

/// The list with one more, or unchanged when the entry adds nothing.
export function withAlias(list: string[], entry: string, name: string): string[] {
  return cleanAliases([...list, entry], name);
}
