// What the agent guide (/llms.txt) says about Good Earth, beside the shared
// sections @tollbooth-dpyc/web writes. vite.config.ts builds the guide from
// this; crawlable.test.ts renders the same guide and reads it.
import type { AgentGuideOptions } from "@tollbooth-dpyc/web/agent-guide";

export const agentGuideOptions: AgentGuideOptions = {
  name: "Good Earth",
  summary:
    "Climate timing for cottage gardens and small specialty-crop and flower farms. A grower draws their plot on a map, and Good Earth works out the weather on that ground — growing degree days, first and last frost, soil temperature, planting windows, disease weather and drying days — including how much it varies across the plot, from its terrain.",
  site: "https://goodearth.tollbooth-dpyc.com",
  mcpUrl: "https://goodearth-mcp.fastmcp.app/mcp",
  toolPrefix: "goodearth",
  source: "https://github.com/lonniev/goodearth-mcp",
  registryName: "io.github.lonniev/goodearth-mcp",
  body: "agent-guide.md",
  links: [{ label: "AI catalog", url: "https://goodearth.tollbooth-dpyc.com/.well-known/ai-catalog.json" }],
};
