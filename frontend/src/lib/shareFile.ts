// Hand a file to the person holding the device.
//
// The share sheet where the device has one that takes files — a tablet or a
// phone, where a "download" lands somewhere nobody looks — and a download
// where it does not.
//
// "blocked" is its own answer. Safari opens the sheet only from a tap, and a
// file that took a few calls to assemble arrives after the tap has expired.
// The caller keeps the file and asks for one more tap, which the sheet then
// accepts; falling back to a download there would hand a tablet user a file
// in a folder they never open.

export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "blocked";

export async function shareOrDownload(file: File, title: string): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
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
