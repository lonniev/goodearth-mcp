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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { once } from "../lib/once";
import { useShare } from "../components/Share";
import { todoSheet } from "../lib/exports";
import Provenance from "../components/Provenance";
import { QuoteScroller, useLanguageLocale } from "@tollbooth-dpyc/web/react";
import { AGRARIAN_QUOTES, AGRARIAN_SOURCE, quoteStyles } from "../lib/quotes";
import { Pager, SortHeaders, type Column } from "../components/RecordTable";
import SearchBox from "../components/SearchBox";
import { remembered, RESTORED_EVENT } from "../lib/undoEvents";
import {
  CELL, Empty, ErrorBox, FIELD, ICON, IconButton, Pill, RowActions, Section, TrashGlyph,
} from "../components/ui";
import { getStoredNpub, isNetworkError } from "@tollbooth-dpyc/web";
import {
  taskDelete, taskList, taskSave, taskSetDone,
  type TaskInput, type TaskRow, type TaskSort, type Timeframe,
} from "../lib/mcp";
import { entries, overlayTasks, subscribe } from "../lib/outbox";
import { migrateLocalTodos } from "../lib/todos";
import { makeFeedRefresher, publishedToken } from "../lib/publishFeed";
import type { SavedRegion } from "../lib/regions";
import { useTour } from "@tollbooth-dpyc/web/react";
import AddPanel from "../components/AddPanel";
import { tour } from "../lib/tour/targets";
import { useT, type Translate } from "../i18n";

const nice = (iso: string | null | undefined, locale: string) =>
  iso ? new Date(iso.length > 10 ? iso : iso + "T12:00:00")
    .toLocaleDateString(locale, { month: "short", day: "numeric" }) : "—";

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "");

const frames = (t: Translate): { key: Timeframe; label: string }[] => [
  { key: "day", label: t("views.todo.frame.day") },
  { key: "week", label: t("views.todo.frame.week") },
  { key: "month", label: t("views.todo.frame.month") },
  { key: "season", label: t("views.todo.frame.season") },
  { key: "all", label: t("views.todo.frame.all") },
];

/// Column header text and the sort key it asks the server for. A header that
/// is not in this list cannot be sorted by, which mirrors the server's own
/// whitelist rather than hoping the two agree.
const cols = (t: Translate): Column<TaskSort>[] => [
  { key: "done", label: t("views.todo.col.done") },
  { key: "title", label: t("views.todo.col.task") },
  { key: "due", label: t("views.todo.col.due") },
  { key: "starts", label: t("views.todo.col.time") },
  { label: "" },
];

export default function TodoView({
  region, onCost, onView,
}: {
  region: SavedRegion;
  onCost: (sats: number) => void;
  onView?: (v: "account") => void;
}) {
  const t = useT();
  const locale = useLanguageLocale();
  const [page, setPage] = useState<{ rows: TaskRow[]; total: number; page: number; pages: number } | null>(null);
  /// The page of tasks in hand, for the share button in the top bar.
  useShare(useMemo(() => (page ? todoSheet(region, page.rows, page.total) : null), [region, page]));
  /// The add form, folded until it is wanted.
  const [addOpen, setAddOpen] = useState(false);
  useTour("todo", { actions: {
    "open-add": () => setAddOpen(true),
    "show-times": () => { setAddOpen(true); setReminderOnly(false); },
  } });
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
      if (!r.success) { setErr(r.error || t("views.todo.err.read")); return; }
      setPage({ rows: r.rows ?? [], total: r.total ?? 0, page: r.page ?? 0, pages: r.pages ?? 1 });
      setRanAt(new Date());
    } catch (e) {
      if (isNetworkError(e)) {
        setErr(t("views.todo.err.noSignal"));
        setPage((p) => p ?? { rows: [], total: 0, page: 0, pages: 1 });
      } else setErr((e as Error).message);
    }
    finally { setBusy(false); }
  }, [region.id, frame, search, sortCol, sortDir, pageNo, t]);

  // Tasks written without signal, laid over the list until they are sent. The
  // list is read again whenever the outbox shrinks, so a sent task trades its
  // waiting mark for the server's own row.
  const [queue, setQueue] = useState(() => entries());
  useEffect(() => subscribe(setQueue), []);
  const lastQueued = useRef(queue.length);
  useEffect(() => {
    if (queue.length < lastQueued.current) void load();
    lastQueued.current = queue.length;
  }, [queue.length, load]);
  const shown = useMemo(() => page && overlayTasks<TaskRow>(
    page.rows, queue, getStoredNpub(), region.id,
    (a) => ({
      id: String(a.task_id), title: String(a.title ?? ""),
      note: (a.note as string | undefined) ?? null, due: (a.due as string | undefined) ?? null,
      starts_at: (a.starts_at as string | undefined) || null,
      ends_at: (a.ends_at as string | undefined) || null,
      reminder_only: a.reminder_only !== false, done: Boolean(a.done),
    }),
  ), [page, queue, region.id]);

  // Lift any device-local tasks before the first read, so the page never shows
  // an empty list to someone who had tasks a moment ago.
  useEffect(() => { void migrateLocalTodos(region.id).then(() => load()); }, [region.id, load]);

  // Tasks are read here rather than through `useBlockItems`, so this page
  // needs its own ear for a row put back from the header's undo mark.
  useEffect(() => {
    const again = () => { refreshFeed.soon(); void load(); };
    window.addEventListener(RESTORED_EVENT, again);
    return () => window.removeEventListener(RESTORED_EVENT, again);
  }, [load]);

  function sortBy(col: TaskSort) {
    if (col === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
    setPageNo(0);
  }

  /// Set before the first await, so a second tap is dropped even before the
  /// re-render that disables the button. See `once`.
  const addingRef = useRef(false);
  const [adding, setAdding] = useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Held now: React clears `e.currentTarget` once the handler yields, and
    // reading it after the save threw — the task saved, but the form never
    // cleared and the list never reloaded, so the tap looked lost and was
    // tapped again. Four copies of one task.
    const form = e.currentTarget;
    const f = new FormData(form);
    const title = String(f.get("title") ?? "").trim();
    if (!title) { setErr(t("views.todo.err.title")); return; }
    setErr("");
    await once(addingRef, async () => {
      setAdding(true);
      try {
        const r = await taskSave(region.id, {
          title,
          note: String(f.get("note") ?? "") || undefined,
          due: String(f.get("due") ?? "") || undefined,
          starts_at: reminderOnly ? undefined : String(f.get("starts") ?? "") || undefined,
          ends_at: reminderOnly ? undefined : String(f.get("ends") ?? "") || undefined,
          reminder_only: reminderOnly,
        });
        if (!r.success) { setErr(r.error || t("views.todo.err.save")); return; }
        refreshFeed.now();
        form.reset();
        setReminderOnly(true);
        void load();
      } catch (e2) {
        setErr((e2 as Error).message);
      } finally {
        setAdding(false);
      }
    });
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

  const startEdit = (task: TaskRow) => setDraft({
    task_id: task.id, title: task.title, note: task.note ?? "", due: task.due ?? "",
    starts_at: hhmm(task.starts_at), ends_at: hhmm(task.ends_at),
    reminder_only: task.reminder_only,
  });

  async function commit() {
    if (!draft) return;
    if (!draft.title.trim()) { setErr(t("views.todo.err.title")); return; }
    setSaving(true); setErr("");
    try {
      const r = await taskSave(region.id, {
        ...draft,
        task_id: draft.task_id || undefined,
        starts_at: draft.reminder_only ? "" : draft.starts_at,
        ends_at: draft.reminder_only ? "" : draft.ends_at,
      });
      if (!r.success) { setErr(r.error || t("views.todo.err.save")); return; }
      setDraft(null);
      refreshFeed.now();
      void load();
    } finally { setSaving(false); }
  }

  return (
    <>
      {err && <ErrorBox>{err}</ErrorBox>}

      {/* ── Write it down ──────────────────────────────────────────────── */}
      {/* The iCal control stays on the toggle's row: it opens a settings page
          and belongs in the page's own row. The ADD button is at the foot of
          the form, where the thing it submits actually is. */}
      <AddPanel label={t("views.todo.newTask")} open={addOpen} onOpen={setAddOpen}
        aside={
          <IconButton path={ICON.settings} label="iCal" tone="quiet" tour="todo.gear"
            title={t("views.todo.feedSettings")} onClick={() => onView?.("account")} />
        }>
      <form id="new-task" onSubmit={add} className="mb-4 rounded-md border border-rule bg-panel p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[0.6875rem] text-ink-soft lg:col-span-2" {...tour("todo.title")}>
            {t("views.todo.whatNeedsDoing")}
            <input name="title" placeholder={t("views.todo.titlePlaceholder")} className={FIELD} />
          </label>
          <label className="block text-[0.6875rem] text-ink-soft" {...tour("todo.due")}>
            {t("views.todo.due")}
            <input name="due" type="date" className={FIELD} />
          </label>
          <label className="flex min-h-11 items-center gap-2 self-end text-[0.78125rem]" {...tour("todo.reminder")}>
            <input type="checkbox" checked={reminderOnly}
              onChange={(e) => setReminderOnly(e.target.checked)}
              className="h-5 w-5 accent-[var(--color-ink)]" />
            {t("views.todo.reminderOnlyQ")}
          </label>
        </div>

        {/* Times only mean something for a task that takes a slot. Hiding them
            for a reminder keeps the form from asking for what it will ignore. */}
        {!reminderOnly && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" {...tour("todo.times")}>
            <label className="block text-[0.6875rem] text-ink-soft">
              {t("views.todo.from")}
              <input name="starts" type="time" className={FIELD} />
            </label>
            <label className="block text-[0.6875rem] text-ink-soft">
              {t("views.todo.to")}
              <input name="ends" type="time" className={FIELD} />
            </label>
          </div>
        )}

        {/* The act, AFTER the fields it acts on — a tester read the page top
          * to bottom and reached the button before the boxes — but on the
          * Note's row rather than a row of its own, so the list below gets
          * that height back. */}
        <div className="mt-3 flex items-end gap-3">
          <label className="block min-w-0 flex-1 text-[0.6875rem] text-ink-soft">
            {t("views.todo.note")}
            <input name="note" placeholder={t("views.todo.notePlaceholder")} className={FIELD} {...tour("todo.note")} />
          </label>
          <IconButton path={ICON.add} label={adding ? t("views.todo.adding") : t("views.todo.task")} form="new-task" tour="todo.add"
            title={t("views.todo.addTask")} disabled={adding} />
        </div>
      </form>
      </AddPanel>

      {/* ── What's on the list ─────────────────────────────────────────── */}
      <Section emoji="✅" title={t("views.todo.planned")} tour="todo.list">
        <Provenance tool="goodearth_task_list" at={ranAt} onCost={onCost} />
      </Section>

      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <span className="flex flex-wrap items-center gap-1.5" {...tour("todo.frames")}>
        {frames(t).map((f) => (
          <Pill key={f.key} active={frame === f.key}
            onClick={() => { setFrame(f.key); setPageNo(0); }}>
            {f.label}
          </Pill>
        ))}
        {/* Runs on submit, never on keystroke. This box used to refetch per
            character, so typing "mulch" billed five task_list calls. */}
        </span>
        <span {...tour("todo.search")}>
        <SearchBox value={search} placeholder={t("views.todo.searchPlaceholder")}
          onSearch={(q) => { setSearch(q); setPageNo(0); }} />
        </span>
      </div>

      {busy && !page ? (
        <div className="rounded-md border border-rule bg-panel"><QuoteScroller quotes={AGRARIAN_QUOTES} source={AGRARIAN_SOURCE} heading={t("views.todo.reading")} intervalMs={6500} classNames={quoteStyles} /></div>
      ) : shown && shown.rows.length ? (
        <>
          <div className="overflow-x-auto rounded-md border border-rule bg-panel [-webkit-overflow-scrolling:touch]">
            <table className="w-full text-[0.8125rem]">
              <thead>
                <SortHeaders cols={cols(t)} sort={sortCol} dir={sortDir} onSort={sortBy} />
              </thead>
              <tbody>
                {shown.rows.map((task) => (draft?.task_id === task.id ? (
                  <Editor key={task.id} draft={draft} onChange={setDraft} onCommit={commit}
                    onCancel={() => setDraft(null)} saving={saving} />
                ) : (
                  <tr key={task.id} className="border-b border-rule last:border-b-0">
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={task.done}
                        onChange={async () => { await taskSetDone(task.id, !task.done); refreshFeed.soon(); void load(); }}
                        aria-label={task.done ? t("views.todo.markNotDone", { title: task.title }) : t("views.todo.markDone", { title: task.title })}
                        className="h-5 w-5 accent-[var(--color-ink)]" />
                    </td>
                    <td onClick={() => startEdit(task)}
                      className={`cursor-text px-3 py-2.5 ${task.done ? "text-ink-soft line-through" : "font-medium"}`}>
                      {task.title}
                      {shown.pending.has(task.id) && (
                        <small className="ml-1.5 text-[0.65625rem] font-normal text-ink-soft">{t("views.todo.waiting")}</small>
                      )}
                      {task.note &&<small className="block text-[0.6875rem] font-normal text-ink-soft">{task.note}</small>}
                    </td>
                    <td onClick={() => startEdit(task)}
                      className="data cursor-text px-3 py-2.5 whitespace-nowrap text-[0.75rem]">{nice(task.due, locale)}</td>
                    <td onClick={() => startEdit(task)}
                      className="data cursor-text px-3 py-2.5 whitespace-nowrap text-[0.75rem] text-ink-soft">
                      {task.reminder_only ? t("views.todo.reminder") : `${hhmm(task.starts_at)}–${hhmm(task.ends_at)}`}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={async () => {
                        // A task is the one row the record really deletes.
                        // `task_save` takes the id back, so an undo returns it
                        // under the id it had rather than as a new task — but
                        // everything needed to rebuild it has to be kept here,
                        // because after the delete there is nothing to read.
                        remembered({
                          kind: "task", blockId: region.id, label: task.title,
                          item: {
                            task_id: task.id, title: task.title,
                            ...(task.note ? { note: task.note } : {}),
                            ...(task.due ? { due: task.due } : {}),
                            ...(task.starts_at ? { starts_at: task.starts_at } : {}),
                            ...(task.ends_at ? { ends_at: task.ends_at } : {}),
                            reminder_only: task.reminder_only, done: task.done,
                          },
                        });
                        await taskDelete(task.id); refreshFeed.soon(); void load();
                      }}
                        aria-label={t("views.todo.removeTitle", { title: task.title })} title={t("views.todo.remove")}
                        className="inline-flex h-11 w-11 items-center justify-center text-ink-soft active:text-clay"><TrashGlyph /></button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>

          <Pager page={page?.page ?? 0} pages={page?.pages ?? 1} total={page?.total ?? 0}
            noun="task" onPage={setPageNo} />
        </>
      ) : (
        <Empty>
          {search || frame !== "all"
            ? t("views.todo.noMatch")
            : t("views.todo.empty", { plot: region.name })}
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
  const t = useT();
  const cell = CELL;
  const set = (patch: Partial<TaskInput>) => onChange({ ...draft, ...patch });

  return (
    <tr className="border-b border-rule bg-band/40 last:border-b-0">
      <td className="px-3 py-2.5 align-top" />
      <td className="px-3 py-2 align-top">
        <input autoFocus value={draft.title} className={cell}
          placeholder={t("views.todo.titlePlaceholder")}
          onChange={(e) => set({ title: e.target.value })}
          // Enter saves and Escape abandons, because a row editor that can
          // only be dismissed with the mouse is slower than the form it replaced.
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onCommit(); }
            if (e.key === "Escape") onCancel();
          }} />
        <input value={draft.note ?? ""} className={`${cell} mt-1 text-[0.75rem]`}
          placeholder={t("views.todo.notePlaceholder")}
          onChange={(e) => set({ note: e.target.value })} />
      </td>
      <td className="px-3 py-2 align-top">
        <input type="date" value={draft.due ?? ""} className={cell}
          onChange={(e) => set({ due: e.target.value })} />
      </td>
      <td className="px-3 py-2 align-top">
        <label className="flex items-center gap-1.5 text-[0.75rem] whitespace-nowrap">
          <input type="checkbox" checked={draft.reminder_only ?? true}
            onChange={(e) => set({ reminder_only: e.target.checked })}
            className="h-4 w-4 accent-[var(--color-ink)]" />
          {t("views.todo.reminderOnly")}
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
        <RowActions onCommit={onCommit} onCancel={onCancel} saving={saving} what={t("views.todo.whatTask")} />
      </td>
    </tr>
  );
}
