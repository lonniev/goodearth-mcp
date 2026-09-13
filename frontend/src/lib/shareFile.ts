// Hand a file to the person holding the device.
//
// The share sheet on a touch-first device that has one for files — a tablet or
// a phone, where a "download" lands in a folder nobody opens. A download
// everywhere else.
//
// Desktop is decided by the POINTER, not by whether the browser offers a share
// sheet. Chrome and Edge on Windows 11 do offer one for files, and following it
// is why a tester's Export "did nothing": the bundle takes several calls to
// assemble, the click that asked for it has expired by then, the sheet is
// refused, and the page waited for a second click on a button whose changed
// label a desktop user never notices. The Windows sheet offers Mail and Nearby
// Share anyway, not "save this file", which is what a desktop user wanted.
//
// "blocked" is still its own answer on a tablet. Safari opens the sheet only
// from a fresh tap, so the caller keeps the file and asks for one more tap,
// which the sheet then accepts.

export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "blocked";

/// The share sheet only on a touch-first device that can share files.
export function handOffMode(o: { canShareFiles: boolean; coarsePointer: boolean }): "share" | "download" {
  return o.canShareFiles && o.coarsePointer ? "share" : "download";
}

export async function shareOrDownload(file: File, title: string): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const canShareFiles = !!nav.share && !!nav.canShare?.({ files: [file] });
  const coarsePointer = typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;

  if (handOffMode({ canShareFiles, coarsePointer }) === "share") {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (e) {
      const name = (e as Error).name;
      if (name === "AbortError") return "cancelled";
      if (name === "NotAllowedError") return "blocked";
      // Anything else: the sheet is broken here, so download instead.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
