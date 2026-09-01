// Tasks — the work. The calendar that carries it off this screen lives on the
// Account page, behind the gear at the top of this one.
//
// One word for one thing. This page had three — a "To-Do" title, a "+ Task"
// button and a "Tasks" heading — for the single idea it holds. The title went,
// since the rail already names the view, and the row it occupied is where the
// add button lives now.
//
// A grower does not live in this app. They live in whatever calendar tells
// them about the school run and the market stall, so publishing is a setup
// step you do once — which is a poor thing to lead a working page with. This
// page leads with the two things used daily: writing a task down, and seeing
// what is due.
//
// The list is sorted, filtered, searched and paged by the SERVER. A season's
// tasks are not a thing to download in full so a browser can slice them.

import { useCallback, useEffect, useMemo, useState } from "react";
import Provenance from "../components/Provenance";
import QuoteScroller from "../components/QuoteScroller";
import { Empty, ErrorBox, FIELD, Pill, Section } from "../components/ui";
import {
  taskDelete, taskList, taskSave, taskSetDone,
  type TaskInput, type TaskRow, type TaskSort, type Timeframe,
} from "../lib/mcp";
import { migrateLocalTodos } from "../lib/todos";
import { makeFeedRefresher, publishedToken } from "../lib/publishFeed";
import type { SavedRegion } from "../lib/regions";

const nice = (iso?: string | null) =>
  iso ? new Date(iso.length > 10 ? iso : iso + "T12:00:00")
    .toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "");

const FRAMES: { key: Timeframe; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "season", label: "Season" },
  { key: "all", label: "All" },
];

/// Column header text and the sort key it asks the server for. A header that
/// is not in this list cannot be sorted by, which mirrors the server's own
/// whitelist rather than hoping the two agree.
const COLS: { key: TaskSort; label: string }[] = [
  { key: "done", label: "" },
  { key: "title", label: "Task" },
  { key: "due", label: "Due" },
  { key: "starts", label: "Time" },
];

export default function TodoView({
  region, onCost, onView,
}: {
  region: SavedRegion;
  onCost: (sats: number) => void;
  onView?: (v: "account") => void;
}) {
  const [page, setPage] = useState<{ rows: TaskRow[]; total: number; page: number; pages: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ranAt, setRanAt] = useState<Date | null>(null);

  const [frame, setFrame] = useState<Timeframe>("all");
  const [sortCol, setSortCol] = useState<TaskSort>("due");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageNo, setPageNo] = useState(0);
  const [search, setSearch] = useState("");
  const [reminderOnly, setReminderOnly] = useState(true);

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const r = await taskList(region.id, {
        timeframe: frame, search, sort_col: sortCol, sort_dir: sortDir,
        page: pageNo, page_size: 20,
      });
      if (!r.success) { setErr(r.error || "The task list could not be read."); return; }
      setPage({ rows: r.rows ?? [], total: r.total ?? 0, page: r.page ?? 0, pages: r.pages ?? 1 });
      setRanAt(new Date());
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }, [region.id, frame, search, sortCol, sortDir, pageNo]);

  // Lift any device-local tasks before the first read, so the page never shows
  // an empty list to someone who had tasks a moment ago.
  useEffect(() => { void migrateLocalTodos(region.id).then(() => load()); }, [region.id, load]);

  function sortBy(col: TaskSort) {
    if (col === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
    setPageNo(0);
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title") ?? "").trim();
    if (!title) { setErr("A task needs a title."); return; }
    setErr("");
    const r = await taskSave(region.id, {
      title,
      note: String(f.get("note") ?? "") || undefined,
      due: String(f.get("due") ?? "") || undefined,
      starts_at: reminderOnly ? undefined : String(f.get("starts") ?? "") || undefined,
      ends_at: reminderOnly ? undefined : String(f.get("ends") ?? "") || undefined,
      reminder_only: reminderOnly,
    });
    if (!r.success) { setErr(r.error || "The task could not be saved."); return; }
    refreshFeed.now();
    e.currentTarget.reset();
    setReminderOnly(true);
    void load();
  }

  /// The row being edited. A blank id means a task that does not exist yet,
  /// which is the whole trick: adding and editing are one interaction, so
  /// there is one form to get right instead of two that drift apart.
  const [draft, setDraft] = useState<TaskInput | null>(null);
  const [saving, setSaving] = useState(false);
  /// If this region is already published, its feed follows the list without
  /// anyone being told to go and press a button.
  const [feedToken, setFeedToken] = useState<string | null>(null);
  useEffect(() => { void publishedToken(region.name).then(setFeedToken); }, [region.name]);
  const refreshFeed = useMemo(
    () => makeFeedRefresher(region, feedToken), [region, feedToken],
  );

  const startEdit = (t: TaskRow) => setDraft({
    task_id: t.id, title: t.title, note: t.note ?? "", due: t.due ?? "",
    starts_at: hhmm(t.starts_at), ends_at: hhmm(t.ends_at),
    reminder_only: t.reminder_only,
  });

  async function commit() {
    if (!draft) return;
    if (!draft.title.trim()) { setErr("A task needs a title."); return; }
    setSaving(true); setErr("");
    try {
      const r = await taskSave(region.id, {
        ...draft,
        task_id: draft.task_id || undefined,
        starts_at: draft.reminder_only ? "" : draft.starts_at,
        ends_at: draft.reminder_only ? "" : draft.ends_at,
      });
      if (!r.success) { setErr(r.error || "The task could not be saved."); return; }
      setDraft(null);
      refreshFeed.now();
      void load();
    } finally { setSaving(false); }
  }

  const arrow = (c: TaskSort) => (c === sortCol ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-1.5">
        {/* Submits the form below by id, so the control can sit up here in the
            row the title used to hold without the form losing its button. */}
        <button type="submit" form="new-task" title="Add task"
          className="flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-ink px-3.5 text-[12.5px] font-semibold text-paper">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          Task
        </button>
        <button onClick={() => onView?.("account")} title="Calendar feed settings"
          className="flex min-h-11 items-center gap-1.5 rounded-full border border-rule px-3.5 text-[12.5px] text-ink-soft active:bg-band">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.4.31.6.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.13-.55 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
          </svg>
          iCal
        </button>
      </div>

      {err && <ErrorBox>{err}</ErrorBox>}

      {/* ── Write it down ──────────────────────────────────────────────── */}
      {/* No section heading: the button below names the act, and a heading
          plus a full-width submit was two rows spent saying "add". */}
      <form id="new-task" onSubmit={add} className="mb-4 rounded-md border border-rule bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[11px] text-ink-soft lg:col-span-2">
            What needs doing
            <input name="title" placeholder="Cover the east beds" className={FIELD} />
          </label>
          <label className="block text-[11px] text-ink-soft">
            Due
            <input name="due" type="date" className={FIELD} />
          </label>
          <label className="flex min-h-11 items-center gap-2 self-end text-[12.5px]">
            <input type="checkbox" checked={reminderOnly}
              onChange={(e) => setReminderOnly(e.target.checked)}
              className="h-5 w-5 accent-[var(--color-ink)]" />
            Reminder only?
          </label>
        </div>

        {/* Times only mean something for a task that takes a slot. Hiding them
            for a reminder keeps the form from asking for what it will ignore. */}
        {!reminderOnly && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-[11px] text-ink-soft">
              From
              <input name="starts" type="time" className={FIELD} />
            </label>
            <label className="block text-[11px] text-ink-soft">
              To
              <input name="ends" type="time" className={FIELD} />
            </label>
          </div>
        )}

        <label className="mt-3 block text-[11px] text-ink-soft">
          Note
          <input name="note" placeholder="Row cover is in the east barn" className={FIELD} />
        </label>
      </form>

      {/* ── What's on the list ─────────────────────────────────────────── */}
      <Section emoji="✅" title="Tasks">
        <Provenance tool="goodearth_task_list" at={ranAt} onCost={onCost} />
      </Section>

      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        {FRAMES.map((f) => (
          <Pill key={f.key} active={frame === f.key}
            onClick={() => { setFrame(f.key); setPageNo(0); }}>
            {f.label}
          </Pill>
        ))}
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPageNo(0); }}
          placeholder="search — regex ok, e.g. mulch|cover"
          className="ml-auto h-11 w-full max-w-[16rem] rounded border border-rule bg-white px-2.5 text-[13px] focus:border-honey focus:outline-none"
        />
      </div>

      {busy && !page ? (
        <div className="rounded-md border border-rule bg-panel"><QuoteScroller heading="Reading your list" /></div>
      ) : page && page.rows.length ? (
        <>
          <div className="overflow-x-auto rounded-md border border-rule bg-panel [-webkit-overflow-scrolling:touch]">
            <table className="w-full text-[13px]">
              <thead><tr>
                {COLS.map((c) => (
                  <th key={c.key}
                    onClick={() => sortBy(c.key)}
                    className="data cursor-pointer border-b-[1.5px] border-ink px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[.1em] text-ink-soft select-none">
                    {c.label}{arrow(c.key)}
                  </th>
                ))}
                <th className="border-b-[1.5px] border-ink px-3 py-2.5" />
              </tr></thead>
              <tbody>
                {page.rows.map((t) => (draft?.task_id === t.id ? (
                  <Editor key={t.id} draft={draft} onChange={setDraft} onCommit={commit}
                    onCancel={() => setDraft(null)} saving={saving} />
                ) : (
                  <tr key={t.id} className="border-b border-rule last:border-b-0">
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={t.done}
                        onChange={async () => { await taskSetDone(t.id, !t.done); refreshFeed.soon(); void load(); }}
                        aria-label={`Mark ${t.title} ${t.done ? "not done" : "done"}`}
                        className="h-5 w-5 accent-[var(--color-ink)]" />
                    </td>
                    <td onClick={() => startEdit(t)}
                      className={`cursor-text px-3 py-2.5 ${t.done ? "text-ink-soft line-through" : "font-medium"}`}>
                      {t.title}
                      {t.note && <small className="block text-[11px] font-normal text-ink-soft">{t.note}</small>}
                    </td>
                    <td onClick={() => startEdit(t)}
                      className="data cursor-text px-3 py-2.5 whitespace-nowrap text-[12px]">{nice(t.due)}</td>
                    <td onClick={() => startEdit(t)}
                      className="data cursor-text px-3 py-2.5 whitespace-nowrap text-[12px] text-ink-soft">
                      {t.reminder_only ? "reminder" : `${hhmm(t.starts_at)}–${hhmm(t.ends_at)}`}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={async () => { await taskDelete(t.id); refreshFeed.soon(); void load(); }}
                        aria-label={`Remove ${t.title}`}
                        className="inline-flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft active:text-clay">×</button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>

          {page.total > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <Pill onClick={() => setPageNo((p) => Math.max(0, p - 1))} disabled={page.page <= 0}>← Back</Pill>
            <span className="data text-[11.5px] text-ink-soft">
              page {page.page + 1} of {page.pages} · {page.total} task{page.total === 1 ? "" : "s"}
            </span>
            <Pill onClick={() => setPageNo((p) => p + 1)} disabled={page.page + 1 >= page.pages}>Next →</Pill>
          </div>
          )}
        </>
      ) : (
        <Empty>
          {search || frame !== "all"
            ? "Nothing matches that. Widen the timeframe, or clear the search."
            : `Nothing on the list for ${region.name} yet. Add one above.`}
        </Empty>
      )}

    </>
  );
}


/// One task, open for editing — a new one or an existing one, the same way.
///
/// Editing happens in the row rather than in a form above the table, so the
/// page does not hold a permanently open form for an act performed a few
/// times a day, and the thing being changed stays where it was read.
function Editor({ draft, onChange, onCommit, onCancel, saving }: {
  draft: TaskInput;
  onChange: (d: TaskInput) => void;
  onCommit: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const cell = "w-full rounded border border-rule bg-white px-2 py-1 text-[13px] focus:border-honey focus:outline-none";
  const set = (patch: Partial<TaskInput>) => onChange({ ...draft, ...patch });

  return (
    <tr className="border-b border-rule bg-band/40 last:border-b-0">
      <td className="px-3 py-2.5 align-top" />
      <td className="px-3 py-2 align-top">
        <input autoFocus value={draft.title} className={cell}
          placeholder="Cover the east beds"
          onChange={(e) => set({ title: e.target.value })}
          // Enter saves and Escape abandons, because a row editor that can
          // only be dismissed with the mouse is slower than the form it replaced.
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onCommit(); }
            if (e.key === "Escape") onCancel();
          }} />
        <input value={draft.note ?? ""} className={`${cell} mt-1 text-[12px]`}
          placeholder="Row cover is in the east barn"
          onChange={(e) => set({ note: e.target.value })} />
      </td>
      <td className="px-3 py-2 align-top">
        <input type="date" value={draft.due ?? ""} className={cell}
          onChange={(e) => set({ due: e.target.value })} />
      </td>
      <td className="px-3 py-2 align-top">
        <label className="flex items-center gap-1.5 text-[12px] whitespace-nowrap">
          <input type="checkbox" checked={draft.reminder_only ?? true}
            onChange={(e) => set({ reminder_only: e.target.checked })}
            className="h-4 w-4 accent-[var(--color-ink)]" />
          Reminder only
        </label>
        {/* Times mean nothing for a reminder, so they are not offered for one. */}
        {!draft.reminder_only && (
          <div className="mt-1 flex items-center gap-1">
            <input type="time" value={draft.starts_at ?? ""} className={cell}
              onChange={(e) => set({ starts_at: e.target.value })} />
            <span className="text-ink-soft">–</span>
            <input type="time" value={draft.ends_at ?? ""} className={cell}
              onChange={(e) => set({ ends_at: e.target.value })} />
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-right align-top whitespace-nowrap">
        <button onClick={onCommit} disabled={saving} aria-label="Save task"
          className="inline-flex h-11 w-11 items-center justify-center text-[18px] text-growth disabled:opacity-40">✓</button>
        <button onClick={onCancel} aria-label="Cancel"
          className="inline-flex h-11 w-11 items-center justify-center text-[18px] text-ink-soft active:text-clay">×</button>
      </td>
    </tr>
  );
}
