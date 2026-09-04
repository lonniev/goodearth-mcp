// Putting one back.
//
// Split from `undo.ts` so the stack stays free of network code and testable
// under the plain node runner. This half is one call and no arithmetic.

import { blockItemSave, taskSave, type TaskInput } from "./mcp";
import type { UndoEntry } from "./undo";

/// Put one back where it came from.
///
/// Throws rather than returning false: the caller has a bar on screen saying
/// the row can be recovered, and it needs to be able to say so honestly when
/// that turns out not to have worked.
export async function restore(e: UndoEntry): Promise<void> {
  if (e.kind === "task") {
    // `task_delete` really deletes, but `task_save` accepts the id back, so
    // the task returns under the id it had rather than as a new one.
    const r = await taskSave(e.blockId, e.item as unknown as TaskInput);
    if (!r.success) throw new Error(r.error || "The task could not be put back.");
    return;
  }
  // The same item_id clears `retired_at`, so this is the row returning rather
  // than a duplicate of it appearing beside the original.
  const r = await blockItemSave(e.blockId, e.kind, { items: [e.item] });
  if (!r.success) throw new Error(r.error || "The row could not be put back.");
}
