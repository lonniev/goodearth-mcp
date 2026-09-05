"""Forget me — every row of a patron's ground, gone.

**What this does NOT touch.** The npub stays a patron of this operator, with
its balance and its purchase history intact. `balances` and `transactions` are
the SDK's tables and not this service's to delete; they are also pseudonymous
by construction, since there is no name, email or KYC anywhere in this system.
Somebody asking to be forgotten here means their farm — the plots, and what
they recorded on them.

**A real DELETE, not a retirement.** Every other removal in this service stamps
`retired_at` and keeps the row. This is the one place that is wrong: a grower
who asks to be forgotten and is soft-deleted has been told something untrue.

**One registry, because the failure here is omission.** A table added next
season and not added to this sweep leaves rows behind under a name nobody
remembers, and nothing fails — the answer just quietly is not "gone". So each
store owns a `forget_everything` that qualifies its own tables, this lists the
stores once, and `test_forget.py` greps the package for every `goodearth_*`
table constant and asserts the list covers them. That guard exists because the
same fault — fixing what was found rather than auditing what exists — got
through twice on the browser's storage keys in one week.
"""

from __future__ import annotations

from typing import Any

from goodearth_mcp import block_store, feed_store, record_cache, task_store

#: Every store holding a patron's own rows. Listed once, checked by a test.
STORES = (block_store, task_store, feed_store, record_cache)


class ForgetError(ValueError):
    """The request cannot be answered as asked."""


#: The exact words. Not a boolean, because `confirm=true` is what an agent
#: sends by reflex when a schema asks for one, and this is the single call in
#: the service that cannot be taken back.
CONFIRM_PHRASE = "FORGET MY GROUND"


async def everything(npub: str, confirm: str) -> dict[str, Any]:
    """Delete every row this patron has on this operator's ground.

    Reports what went, by table, so the answer is checkable rather than a
    reassurance — and reports zero too, because "you had nothing saved" and
    "your farm is deleted" should not read the same.
    """
    if not (npub or "").strip():
        raise ForgetError("forgetting needs to know whose ground to forget")

    if (confirm or "").strip() != CONFIRM_PHRASE:
        raise ForgetError(
            "this deletes every block, crop, pest, watch, report, task and "
            "calendar feed you have here, and it cannot be undone. Send "
            f'confirm="{CONFIRM_PHRASE}" to go ahead. Your balance and your '
            "purchase history are not touched, and you stay a patron."
        )

    removed: dict[str, int] = {}
    for store in STORES:
        removed.update(await store.forget_everything(npub))

    return {
        "success": True,
        "forgotten": removed,
        "rows": sum(removed.values()),
        "note": (
            "Every block and everything recorded on it is deleted, and any "
            "calendar feed you published has stopped resolving. You are still "
            "a patron here — your balance and purchase history are untouched — "
            "and you can begin again by saving new ground."
        ),
    }
