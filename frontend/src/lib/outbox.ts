// Field entries made without signal.
//
// A grower records standing in a field, which is where the signal is worst: a
// cut, a sighting, a note, a task. Until now a write out there failed with a
// transport error and the entry was simply gone. Here it waits instead, and
// goes to the server when the signal comes back.
//
// Only WRITES wait here, and only until the server has them. Nothing is read
// back from here as the record — `record.test.ts` holds the line that this
// browser is never a second source of truth — and whatever a view draws from
// here is marked as still waiting.
//
// Sending one twice is safe. Every queued write names its row (`item_id`,
// `task_id`) and the server upserts on it, so a write that reached the server
// just before the signal dropped its reply is replayed as an update of the
// same row, never a copy.

export const OUTBOX_KEY = "goodearth.outbox.v1";

/// The writes a grower makes in the field. Every other call is an answer, and
/// every answer needs the weather and so the signal; queueing one would only
/// delay its failure.
export const QUEUEABLE: ReadonlySet<string> = new Set([
  "block_item_save", "task_save", "task_set_done", "task_delete",
]);

/// Server answers that mean "not now", not "not this". The entry stays in
/// line and is tried again, rather than being set aside as refused.
const TRANSIENT = new Set([
  "upstream_unavailable", "persistence_unavailable", "service_unavailable",
]);

export interface Pending {
  id: string;
  /// Whose write it is. Replayed only for the same grower: a phone handed to
  /// someone else must not deliver the first grower's notes into the second
  /// grower's record.
  npub: string;
  tool: string;
  /// The call's own arguments. Never the npub or proof — those are added when
  /// it is sent, from whoever is signed in then.
  args: Record<string, unknown>;
  queuedAt: string;
  /// The server refused it as sent. Retrying cannot change that, so it stops
  /// holding up the line and waits for the grower to see why.
  refused?: string;
}

interface Backing {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function backing(): Backing | null {
  try {
    return (globalThis as { window?: { localStorage?: Backing } }).window?.localStorage ?? null;
  } catch {
    return null;
  }
}

/// Used when the browser will not store (a private window, a full quota), so
/// an entry at least survives this session instead of vanishing on the spot.
let memory: Pending[] | null = null;

export function entries(): Pending[] {
  if (memory) return memory;
  const raw = backing()?.getItem(OUTBOX_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as Pending[]) : [];
  } catch {
    return [];
  }
}

const listeners = new Set<(list: Pending[]) => void>();

/// Called on every change, with the whole list. Returns the unsubscribe.
export function subscribe(cb: (list: Pending[]) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function write(list: Pending[]): void {
  const store = backing();
  if (!memory && store) {
    try { store.setItem(OUTBOX_KEY, JSON.stringify(list)); } catch { memory = list; }
  } else {
    memory = list;
  }
  for (const cb of listeners) {
    try { cb(list); } catch { /* one view's error must not stop the others */ }
  }
}

export function enqueue(
  npub: string, tool: string, args: Record<string, unknown>, now: Date = new Date(),
): Pending {
  const p: Pending = {
    id: `ob-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    npub, tool, args, queuedAt: now.toISOString(),
  };
  write([...entries(), p]);
  return p;
}

export function discard(id: string): void {
  write(entries().filter((p) => p.id !== id));
}

function refuse(id: string, why: string): void {
  write(entries().map((p) => (p.id === id ? { ...p, refused: why } : p)));
}

/// This grower's writes still to send, oldest first.
export function waiting(npub: string): Pending[] {
  return entries().filter((p) => p.npub === npub && !p.refused);
}

/// This grower's writes the server would not take.
export function refused(npub: string): Pending[] {
  return entries().filter((p) => p.npub === npub && p.refused);
}

/// Whether a failed call failed for want of signal, as opposed to the server
/// saying no. Browsers word it differently: Chrome "Failed to fetch", Firefox
/// "NetworkError…", Safari "Load failed" or "The Internet connection appears
/// to be offline". A timeout and a gateway error count too — the write did
/// not land, and replaying it is safe.
export function isNetworkFailure(e: unknown, online?: boolean): boolean {
  if (online === false) return true;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /failed to fetch|networkerror|load failed|network connection was lost|appears to be offline|err_internet_disconnected|err_network|fetch failed|timed? ?out|HTTP 50[234]/i
    .test(msg);
}

export interface FlushResult {
  sent: number;
  left: number;
  /// Why it stopped before the end, if it did.
  stoppedBy?: "signal" | "sign-in" | "server";
}

export type Sender = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

let running: Promise<FlushResult> | null = null;

/// Send what is waiting, in the order it was made, and stop at the first sign
/// the signal is still gone. One drain at a time: the online event, a timer
/// and the app waking can all ask at once, and two drains would send the same
/// entry twice.
export function flush(npub: string, send: Sender): Promise<FlushResult> {
  if (!npub) return Promise.resolve({ sent: 0, left: 0 });
  running ??= drain(npub, send).finally(() => { running = null; });
  return running;
}

async function drain(npub: string, send: Sender): Promise<FlushResult> {
  let sent = 0;
  const left = () => waiting(npub).length;
  for (const p of waiting(npub)) {
    let r: unknown;
    try {
      r = await send(p.tool, p.args);
    } catch (e) {
      if (isNetworkFailure(e)) return { sent, left: left(), stoppedBy: "signal" };
      // An expired sign-in is not the entry's fault. It waits for the grower
      // to sign in again rather than being refused.
      if ((e as Error)?.name === "ProofRequiredError") return { sent, left: left(), stoppedBy: "sign-in" };
      refuse(p.id, e instanceof Error ? e.message : String(e));
      continue;
    }
    const res = r as { success?: boolean; error?: string; error_code?: string } | null;
    if (res && res.success === false) {
      if (TRANSIENT.has(String(res.error_code ?? ""))) return { sent, left: left(), stoppedBy: "server" };
      refuse(p.id, res.error ?? "The server would not take it.");
      continue;
    }
    discard(p.id);
    sent++;
  }
  return { sent, left: left() };
}

// ── What a view shows of its own waiting writes ──────────────────────────

export interface ItemOverlay {
  /// Rows saved and not yet delivered, last write winning, by `item_id`.
  saves: Map<string, Record<string, unknown>>;
  /// Rows retired and not yet delivered.
  retires: Set<string>;
}

/// This view's share of the queue: one block, one kind, and the season when
/// the kind has one.
export function pendingItems(
  list: Pending[], npub: string, block: string, kind: string, season?: number,
): ItemOverlay {
  const saves = new Map<string, Record<string, unknown>>();
  const retires = new Set<string>();
  for (const p of list) {
    if (p.npub !== npub || p.refused || p.tool !== "block_item_save") continue;
    const a = p.args;
    if (a.block !== block || a.kind !== kind) continue;
    if (season != null && a.season != null && Number(a.season) !== season) continue;
    for (const row of (a.items as Record<string, unknown>[] | undefined) ?? []) {
      const id = String(row.item_id ?? "");
      if (!id) continue;
      saves.set(id, row);
      retires.delete(id);
    }
    for (const id of (a.retire_ids as string[] | undefined) ?? []) {
      saves.delete(id);
      retires.add(id);
    }
  }
  return { saves, retires };
}

/// The rows as the server last gave them, with this grower's waiting writes
/// laid over: a waiting edit replaces its row in place, a waiting removal
/// hides it, and a waiting new row leads the list.
export function overlay<T>(
  items: T[], o: ItemOverlay, idOf: (t: T) => string, from: (row: Record<string, unknown>) => T,
): T[] {
  const fresh = new Map(o.saves);
  const out: T[] = [];
  for (const it of items) {
    const id = idOf(it);
    if (o.retires.has(id)) continue;
    const row = fresh.get(id);
    if (row) { out.push(from(row)); fresh.delete(id); } else out.push(it);
  }
  return [...[...fresh.values()].map(from), ...out];
}

/// The same for the task list, which is not a block item: a waiting save
/// replaces or adds a row, a waiting tick sets `done`, a waiting delete hides.
export function overlayTasks<T extends { id: string; done: boolean }>(
  rows: T[], list: Pending[], npub: string, regionId: string,
  make: (args: Record<string, unknown>) => T,
): { rows: T[]; pending: Set<string> } {
  const pending = new Set<string>();
  let out = [...rows];
  for (const p of list) {
    if (p.npub !== npub || p.refused) continue;
    const id = String(p.args.task_id ?? "");
    if (!id) continue;
    if (p.tool === "task_save" && p.args.region_id === regionId) {
      const row = make(p.args);
      const i = out.findIndex((r) => r.id === id);
      out = i >= 0 ? out.map((r, j) => (j === i ? row : r)) : [row, ...out];
      pending.add(id);
    } else if (p.tool === "task_set_done") {
      out = out.map((r) => (r.id === id ? { ...r, done: Boolean(p.args.done) } : r));
      if (out.some((r) => r.id === id)) pending.add(id);
    } else if (p.tool === "task_delete") {
      out = out.filter((r) => r.id !== id);
    }
  }
  return { rows: out, pending };
}
