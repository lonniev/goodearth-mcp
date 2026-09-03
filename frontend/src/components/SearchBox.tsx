// Search is an act, not a side effect of typing.
//
// The Tasks page filtered as the grower typed, and `search` was a dependency
// of its loader — so typing "mulch" fired FIVE `task_list` calls, each one
// billed, four of them for prefixes nobody wanted the answer to. On a service
// where a read costs sats, live filtering is not a convenience; it is a charge
// for keystrokes.
//
// So the draft lives here and escapes only on submit. The owner's words:
// "There is no request to live filter the tables as the user fills in a field
// value. Let them key in what they want to search for and then click [Search]".

import { useEffect, useState } from "react";

export default function SearchBox({
  value, onSearch, placeholder,
}: {
  /// The term currently applied — not the draft. Passing it in lets a page
  /// clear the search from elsewhere and have the field follow.
  value: string;
  onSearch: (term: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);

  // Follow the applied term when something else changes it (a cleared filter,
  // a different block). Typing is unaffected: this only fires when `value`
  // itself moves.
  useEffect(() => { setDraft(value); }, [value]);

  const submit = () => onSearch(draft.trim());
  const dirty = draft.trim() !== value;

  return (
    <div className="ml-auto flex items-center gap-1.5">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter is how anyone who types for a living submits a search box.
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          // Escape abandons the draft rather than clearing the results, which
          // would be a search nobody asked for.
          if (e.key === "Escape") setDraft(value);
        }}
        placeholder={placeholder ?? "search — regex ok"}
        aria-label="Search"
        className="h-11 w-full max-w-[14rem] rounded border border-rule bg-white px-2.5 text-[16px] focus:border-honey focus:outline-none"
      />
      <button
        onClick={submit}
        // Dark only when pressing it would change something, so the control
        // says whether there is an unrun search sitting in the box.
        title="Search"
        className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-semibold ${
          dirty ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft active:bg-band"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
        </svg>
        Search
      </button>
      {value && (
        <button
          onClick={() => { setDraft(""); onSearch(""); }}
          aria-label="Clear search"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[18px] text-ink-soft active:text-clay"
        >
          ×
        </button>
      )}
    </div>
  );
}
