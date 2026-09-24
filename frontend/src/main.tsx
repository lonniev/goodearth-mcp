import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { configureTollbooth } from "@tollbooth-dpyc/web";
import App from "./App";
import "./index.css";

// The shared account pieces (profile, session key, avatar) read who this site
// is from here. The glyphs are the farm's, not the package's chess pieces.
configureTollbooth({
  slug: "goodearth",
  appName: "Good Earth",
  mcpUrl: import.meta.env.VITE_MCP_URL as string,
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
