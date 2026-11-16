import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { configureTollbooth, startLanguage } from "@tollbooth-dpyc/web";
import App from "./App";
import { registerGoodEarth } from "./i18n";
import { GOOD_EARTH_TOOLS } from "./lib/debugSummary";
import "./index.css";

// The shared account pieces (profile, session key, avatar) read who this site
// is from here. The glyphs are the farm's, not the package's chess pieces.
configureTollbooth({
  slug: "goodearth",
  appName: "Good Earth",
  mcpUrl: import.meta.env.VITE_MCP_URL as string,
  operatorUrl: "https://goodearth-mcp.fastmcp.app",
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

// Good Earth's words, then the reader's language: their choice, else their
// country's, else English. Good Earth draws its own shell, so it starts this
// itself (the package's AppShell would otherwise).
void registerGoodEarth();
void startLanguage();

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
