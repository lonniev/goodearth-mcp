/**
 * Cloudflare Pages Function — the subscribable calendar.
 *
 * A calendar client speaks HTTP and knows nothing about MCP, JSON-RPC or npub
 * proofs, and there is nowhere in an iCalendar subscription to put one. So the
 * site serves the feed: this Function calls the MCP's free `calendar_feed`
 * tool with the token from the URL and returns what it gets as text/calendar.
 *
 * Serving lives here rather than on the MCP because rendering a subscription is
 * a presentation concern and the MCP is a tool service. It also means the URL
 * a grower hands to their calendar carries the farm's domain rather than the
 * infrastructure's.
 *
 * The unguessable token IS the credential. It is validated as hex before any
 * upstream call, so a malformed path costs nothing and reaches nothing.
 */

const UPSTREAM = "https://goodearth-mcp.fastmcp.app/mcp";

const TEXT = { "Content-Type": "text/plain; charset=utf-8" };

/** MCP replies as SSE or JSON depending on the Accept header; handle both. */
function parseToolResult(body) {
  let payload = body;
  if (body.startsWith("event:") || body.includes("\ndata: ")) {
    const line = body.split("\n").find((l) => l.startsWith("data: "));
    if (!line) return null;
    payload = line.slice(6);
  }
  const env = JSON.parse(payload);
  const text = env?.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

export async function onRequestGet(context) {
  const raw = String(context.params.token ?? "");
  // The route is /calendar/{token}.ics; strip the suffix a client may or may
  // not include, then require hex so nothing else reaches the upstream.
  const token = raw.replace(/\.ics$/i, "").trim().toLowerCase();
  if (!token || token.length > 64 || !/^[0-9a-f]+$/.test(token)) {
    return new Response("Not found", { status: 404, headers: TEXT });
  }

  let result;
  try {
    const r = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "goodearth_calendar_feed", arguments: { token } },
      }),
    });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    result = parseToolResult(await r.text());
  } catch {
    // A calendar client polls on a schedule and will come back. 503 tells it
    // to, where a 404 would make some clients drop the subscription outright.
    return new Response("Temporarily unavailable", { status: 503, headers: TEXT });
  }

  if (!result?.success || !result.ics) {
    return new Response("Not found", { status: 404, headers: TEXT });
  }

  return new Response(result.ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="goodearth-${token.slice(0, 8)}.ics"`,
      // A polite default poll rate for clients that respect it.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
