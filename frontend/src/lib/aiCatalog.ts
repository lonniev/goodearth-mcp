/**
 * The AI catalog (`/.well-known/ai-catalog.json`) agents read to discover this
 * server by its domain. It is built from `server.json`, the MCP Registry entry,
 * at every build, so the two descriptions of one server never drift apart: a
 * card naming another version or endpoint than the registry sends a client wrong.
 */

export interface ServerJson {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  repository?: unknown;
  remotes?: unknown;
}

/** The fields a server card repeats from `server.json`. */
export const CARD_FIELDS = ["name", "title", "description", "version", "websiteUrl", "repository", "remotes"] as const;

/** `urn:air:{publisher}:{namespace}:{name}`: io.github.lonniev/goodearth-mcp → urn:air:lonniev.github.io:mcp:goodearth-mcp. */
export function identifierOf(name: string): string {
  const [reverse, short] = name.split("/");
  return `urn:air:${reverse.split(".").reverse().join(".")}:mcp:${short}`;
}

export function aiCatalogOf(server: ServerJson) {
  const data = Object.fromEntries(CARD_FIELDS.filter((k) => server[k] !== undefined).map((k) => [k, server[k]]));
  return {
    specVersion: "1.0",
    entries: [{ identifier: identifierOf(server.name), type: "application/mcp-server-card+json", data }],
  };
}
