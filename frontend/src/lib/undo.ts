// What you last removed, and how to put it back.
//
// Nothing here is a trick. A crop, pest, wildlife or observation row is
// RETIRED rather than deleted — `retired_at` is stamped and the row stays —
// and saving it again under the same `item_id` sets that column back to NULL.
// So an undo restores the row that was there, not a copy of it. A task is the
// one exception: `task_delete` really deletes, but `task_save` accepts the id
// back, so the task returns under the id it had.
//
// This exists instead of a confirmation dialog. A modal taxes every delete
// that was meant, which is nearly all of them, and within a week it is
// dismissed by reflex — so it stops guarding at exactly the moment it would
// have mattered. Undo costs nothing when you meant it and recovers fully when
// you did not.
//
// Kept in localStorage rather than sessionStorage on purpose: a mis-tap
// noticed after a reload is still a mis-tap, and a stack that empties when the
// tab closes would be gone precisely when someone came back to fix something.

// A TYPE-only import, which is erased entirely — so this module pulls in no
// network code and stays runnable under the plain node test runner. Putting
// something back is I/O and lives in `undoRestore.ts` for that reason; the
// stack itself is arithmetic over a list and is where the mistakes would be.
import type { ItemKind } from "./mcp.ts";

/// How many removals stay recoverable. Five is the owner's figure and it is a
/// reasonable one: an undo list long enough to scroll is a second record to
/// reason about, and the honest recovery for something removed twenty actions
/// ago is to type it again.
export const MAX_ENTRIES = 5;

const KEY_BASE = "goodearth:undo:v1";

/// Scoped to the patron, because an entry here is a ROW — a crop's name, its
/// target, the block it sat on — and the Undo button writes it back.
///
/// Unscoped, a new npub on this browser was offered "Removed Zinnia ·
/// succession 4" from the patron before them, and pressing Undo would have
/// saved that row into their own record. A leak that writes is worse than one
/// that only shows.
function key(): string {
  try {
    return `${KEY_BASE}:${window.localStorage.getItem("goodearth:patron_npub:v1") ?? ""}`;
  } catch {
    return KEY_BASE;
  }
}

export type UndoKind = ItemKind | "task";

export interface UndoEntry {
  /// This entry's own id, not the row's — two removals of the same row (undo,
  /// remove again) are two entries and must not collapse into one.
  id: string;
  kind: UndoKind;
  /// The block the row belonged to. A task carries its region here too, so
  /// restoring never has to guess which ground it was on.
  blockId: string;
  /// What to say it was. The row's own words, so the bar names the thing the
  /// person removed rather than a kind and an id.
  label: string;
  /// Everything needed to put it back, in the shape its save tool takes.
  item: Record<string, unknown>;
  at: number;
}

function read(): UndoEntry[] {
  try {
    const raw = window.localStorage.getItem(key());
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as UndoEntry[]).filter(isEntry) : [];
  } catch {
    return [];
  }
}

function isEntry(e: unknown): e is UndoEntry {
  const x = e as Partial<UndoEntry>;
  return !!x && typeof x.id === "string" && typeof x.kind === "string"
    && typeof x.label === "string" && typeof x.item === "object" && !!x.item;
}

function write(entries: UndoEntry[]): UndoEntry[] {
  const kept = entries.slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(key(), JSON.stringify(kept));
  } catch { /* private window or quota — this session still works from memory */ }
  return kept;
}

/// Everything still recoverable, newest first.
export function list(): UndoEntry[] {
  return read();
}

/// Record a removal. Returns the stack as it now stands.
export function push(e: Omit<UndoEntry, "id" | "at">): UndoEntry[] {
  const entry: UndoEntry = {
    ...e,
    id: `u-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    at: Date.now(),
  };
  return write([entry, ...read()]);
}

/// Forget one entry without restoring it — used after a successful undo, and
/// when a restore fails for a reason retrying will not fix.
export function drop(id: string): UndoEntry[] {
  return write(read().filter((e) => e.id !== id));
}

export function clear(): UndoEntry[] {
  return write([]);
}

/// "just now", "4 min ago", "2 h ago" — how long the chance has been sitting
/// there. Coarse on purpose: the exact second is not the decision.
export function since(at: number, now = Date.now()): string {
  const mins = Math.floor((now - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}
