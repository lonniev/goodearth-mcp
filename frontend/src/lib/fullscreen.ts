// Using the whole screen — as much as each device allows.
//
// Where the browser offers the Fullscreen API (desktop, Android, iPad Safari)
// a button takes the page full screen and hides the address and tab bars.
// iPhone Safari does NOT: its Fullscreen API is for video only, so no button
// can do it there. On an iPhone the way to the whole screen is Add to Home
// Screen — the manifest asks for a "standalone" window with no browser bars —
// so the same button there says how. Once the site is already running from
// the Home Screen there is nothing left to hide, and the button stays away.

export type FullscreenMode = "toggle" | "install" | "none";

export interface ScreenEnv {
  /// `document.fullscreenEnabled`, or WebKit's prefixed flag.
  apiEnabled: boolean;
  /// Already running from the Home Screen, with no browser bars.
  standalone: boolean;
  /// An iPhone or iPod — where only Add to Home Screen gets the whole screen.
  iphone: boolean;
}

export function fullscreenMode(env: ScreenEnv): FullscreenMode {
  if (env.apiEnabled) return "toggle";
  if (env.iphone && !env.standalone) return "install";
  return "none";
}

type WebkitDoc = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function readEnv(): ScreenEnv {
  const d = document as WebkitDoc;
  const nav = navigator as Navigator & { standalone?: boolean };
  const mm = (q: string) => typeof window.matchMedia === "function" && window.matchMedia(q).matches;
  return {
    apiEnabled: !!(d.fullscreenEnabled || d.webkitFullscreenEnabled),
    standalone: nav.standalone === true || mm("(display-mode: standalone)") || mm("(display-mode: fullscreen)"),
    iphone: /iPhone|iPod/.test(navigator.userAgent),
  };
}

export function isFullscreen(): boolean {
  const d = document as WebkitDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/// Toggle full screen for the whole page. Must run inside the user's gesture.
export async function toggleFullscreen(): Promise<void> {
  const d = document as WebkitDoc;
  if (isFullscreen()) {
    await (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
    return;
  }
  const el = document.documentElement as WebkitEl;
  await (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.());
}
