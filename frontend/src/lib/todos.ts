// To-dos.
//
// Tasks born from the analytics — cover beds ahead of a frost watch, scout
// after a threshold crossing, sow when a window opens — plus whatever else the
// grower writes down. They are published to the calendar as VTODO, which is
// what makes them arrive as reminders rather than as another appointment on an
// already full day.
//
// localStorage first, like every other patron collection here; NIP-78
// `goodearth/todos` is where they belong once the write-through lands.

export interface Todo {
  id: string;
  regionId: string;
  title: string;
  due?: string;
  note?: string;
  done: boolean;
  /// 1 is highest. RFC 5545 priority, clamped server-side.
  priority?: number;
  createdAt: string;
}

const KEY = "goodearth:todos:v1";

function read(): Todo[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Todo[]) : [];
  } catch { return []; }
}

function write(all: Todo[]): Todo[] {
  try { window.localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* noop */ }
  return all;
}

export function listTodos(regionId?: string): Todo[] {
  const all = read().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;      // open work first
    return (a.due ?? "9999").localeCompare(b.due ?? "9999");
  });
  return regionId ? all.filter((t) => t.regionId === regionId) : all;
}

export function saveTodo(t: Todo): Todo[] {
  return write([...read().filter((x) => x.id !== t.id), t]);
}

export function deleteTodo(id: string): Todo[] {
  return write(read().filter((x) => x.id !== id));
}

export function toggleTodo(id: string): Todo[] {
  return write(read().map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
}

export function makeTodo(
  title: string, regionId: string, due?: string, note?: string, priority?: number,
): Todo | string {
  if (!title.trim()) return "What needs doing?";
  if (due && Number.isNaN(Date.parse(due))) return "Due date must be a real date.";
  return {
    id: `td-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    regionId,
    title: title.trim().slice(0, 200),
    ...(due ? { due } : {}),
    ...(note?.trim() ? { note: note.trim().slice(0, 500) } : {}),
    ...(priority ? { priority } : {}),
    done: false,
    createdAt: new Date().toISOString(),
  };
}
