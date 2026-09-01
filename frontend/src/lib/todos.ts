// To-dos — now the server's, with a one-time lift from localStorage.
//
// These lived in localStorage until the list needed sorting, filtering and
// paging by something that can do it in SQL. What is left here is the
// migration: anyone who wrote tasks on this device before the move would
// otherwise open the page to an empty list and reasonably conclude the app
// had eaten them.
//
// It runs once, keyed so a second device does not re-upload what the first
// already sent, and it does not clear the local copy until every task has
// been acknowledged by the server.

import { taskSave } from "./mcp";

const KEY = "goodearth:todos:v1";
const DONE_KEY = "goodearth:todos:migrated:v1";

interface LegacyTodo {
  id: string;
  regionId: string;
  title: string;
  due?: string;
  note?: string;
  done: boolean;
  createdAt?: string;
}

function readLegacy(): LegacyTodo[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LegacyTodo[]) : [];
  } catch { return []; }
}

/// Push any device-local tasks up, once. Returns how many moved.
export async function migrateLocalTodos(regionId: string): Promise<number> {
  try {
    if (window.localStorage.getItem(DONE_KEY)) return 0;
  } catch { return 0; }

  const mine = readLegacy().filter((t) => t.regionId === regionId);
  if (!mine.length) {
    try { window.localStorage.setItem(DONE_KEY, "1"); } catch { /* noop */ }
    return 0;
  }

  let moved = 0;
  for (const t of mine) {
    // Priority is deliberately dropped rather than mapped: the field is gone
    // from the model, and inventing a substitute would be worse than losing a
    // flag the owner asked to remove.
    const r = await taskSave(regionId, {
      title: t.title,
      note: t.note,
      due: t.due,
      done: t.done,
      reminder_only: true,
    });
    if (r.success) moved += 1;
  }

  // Only once everything landed. A partial upload that cleared the local copy
  // would lose exactly the tasks that failed.
  if (moved === mine.length) {
    try {
      window.localStorage.setItem(DONE_KEY, "1");
      window.localStorage.removeItem(KEY);
    } catch { /* noop */ }
  }
  return moved;
}
