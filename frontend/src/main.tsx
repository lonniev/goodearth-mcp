import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { configureTollbooth } from "@tollbooth-dpyc/web";
import App from "./App";
import { GOOD_EARTH_TOOLS } from "./lib/debugSummary";
import "./index.css";

// The shared account pieces (profile, session key, avatar) read who this site
// is from here. The glyphs are the farm's, not the package's chess pieces.
configureTollbooth({
  slug: "goodearth",
  appName: "Good Earth",
  mcpUrl: import.meta.env.VITE_MCP_URL as string,
  // Good Earth's own tools log a summary from lib/mcp.ts instead — their
  // answers carry the farm's location (see lib/debugSummary.ts).
  // check_price and check_balance are routine — one per card, and again
  // after every paid read — and would bury the calls worth reading.
  quietTools: [...GOOD_EARTH_TOOLS, "check_price", "check_balance"],
  avatarChoices: [
    "🐝", "🍯", "🦋", "🐞", "🪱", "🐓",
    "🌻", "🌷", "🌸", "💐", "🌾", "🌱",
    "🥬", "🥕", "🧄", "🎃", "🍓", "🍎",
    "🚜", "🧺", "🪴", "🛖", "🌳", "🍂",
    "☀️", "🌧️", "❄️", "🌈", "🌙", "⛅",
  ],
});

// Lets the installed app open with no signal — see public/sw.js. Production
// only: in development it would serve yesterday's module graph.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* without it the app still runs; it just needs signal to open */
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
