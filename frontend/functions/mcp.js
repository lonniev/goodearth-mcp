// Cloudflare Pages Function: /mcp → the goodearth-mcp operator on Horizon.
import { makeMcpProxy } from "@tollbooth-dpyc/web/pages-proxy";

export const onRequest = makeMcpProxy("https://goodearth-mcp.fastmcp.app/mcp");
