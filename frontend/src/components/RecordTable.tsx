// The mechanics of a record table: headers that sort, and a pager.
//
// Not a table. Four pages show four genuinely different sets of cells — a
// planting's heat bar, a pest's stages, a creature's driver, a task's times —
// and forcing them through one render-prop signature would mean restating the
// shape at every call site anyway, which is the duplication this was meant to
// remove. So each page composes its own `<table>` out of these two pieces and
// keeps its own cells.
//
// Sorting is the DATABASE's, not this component's. It orders every row the
// block holds rather than the page in hand, which is the difference between
// "the earliest set-out on this page" and "the earliest set-out you have" —
// and only one of those is the answer a grower asked for.

import type { ReactNode } from "react";

import Term from "./Term";

export interface Column<K extends string> {
  /// The sort key the server knows this column by, or undefined for a column
  /// that cannot be sorted — an actions cell, or a computed value the record
  /// does not hold. Mirrors the server's own whitelist rather than hoping the
  /// two agree: a key it does not know falls back to the default order, which
  /// looks like a header that quietly does nothing.
  key?: K;
  label: string;
  /// What this column means, revealed by a ⓘ beside the header. For the
  /// headings that are terms of art — a grower should not have to already
  /// know what a biofix is to read the row under it.
  info?: ReactNode;
  /// Column width as a CSS value, for the one or two that need it.
  width?: string;
}

export function SortHeaders<K extends string>({
  cols, sort, dir, onSort,
}: {
  cols: Column<K>[];
  sort?: K;
  dir: "asc" | "desc";
  onSort: (key: K) => void;
}) {
  return (
    <tr>
      {cols.map((c, i) => {
        const sortable = !!c.key;
        const active = sortable && c.key === sort;
        return (
          <th
            key={(c.key ?? "") + c.label + i}
            onClick={sortable ? () => onSort(c.key as K) : undefined}
            aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
            className={`data border-b-[1.5px] border-ink px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[.1em] select-none ${
              sortable ? "cursor-pointer text-ink-soft" : "text-ink-soft"
            } ${active ? "text-ink" : ""}`}
            style={c.width ? { width: c.width } : undefined}
          >
            {c.label}
            {active && <span aria-hidden="true">{dir === "asc" ? " ▲" : " ▼"}</span>}
            {c.info && <Term>{c.info}</Term>}
          </th>
        );
      })}
    </tr>
  );
}

/// Where this page sits in the record.
///
/// `total` counts every matching row rather than the ones in hand, so "12
/// plantings" stays true on page two. It renders nothing when everything fits
/// on one page: a pager that can only say "page 1 of 1" is furniture.
export function Pager({
  page, pages, total, noun, onPage,
}: {
  page: number;
  pages: number;
  total: number;
  /// Singular. "planting" gives "12 plantings" and "1 planting".
  noun: string;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="mt-2 flex items-center gap-2">
      <PagerButton onClick={() => onPage(Math.max(0, page - 1))} disabled={page <= 0}>
        ← Back
      </PagerButton>
      <span className="data text-[11.5px] text-ink-soft">
        page {page + 1} of {pages} · {total} {noun}{total === 1 ? "" : "s"}
      </span>
      <PagerButton onClick={() => onPage(page + 1)} disabled={page + 1 >= pages}>
        Next →
      </PagerButton>
    </div>
  );
}

function PagerButton({ onClick, disabled, children }: {
  onClick: () => void; disabled?: boolean; children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 shrink-0 rounded-full border border-rule px-3.5 text-[12.5px] font-medium text-ink-soft disabled:opacity-40 active:bg-band"
    >
      {children}
    </button>
  );
}
