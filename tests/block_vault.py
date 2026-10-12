"""An in-memory stand-in for the blocks table, for the two queries the store makes.

`save_blocks` reads once (`… block_id IN (…) OR lookup_key IN (…)`) and writes
once (a multi-row upsert `RETURNING` the columns). This fake answers exactly
those, keeps the rows, and counts the trips, so a test can hold the store to
two trips whatever the batch's size.
"""

from __future__ import annotations

import re
from typing import Any

COLS = ["npub", "block_id", "lookup_key", "name_enc", "aliases_enc", "geometry_enc",
        "base_temp_f", "area_ha", "sample_count", "retired_at", "groups_enc"]


class BlockVault:
    def __init__(self) -> None:
        self.rows: dict[tuple[str, str], dict[str, Any]] = {}
        self.trips = 0

    async def _execute(self, sql: str, params: list[Any]) -> dict[str, Any]:
        self.trips += 1
        if sql.lstrip().upper().startswith("SELECT"):
            lists = re.findall(r"IN \(([^)]*)\)", sql)
            ids = [params[int(m) - 1] for m in re.findall(r"\$(\d+)", lists[0])]
            keys = [params[int(m) - 1] for m in re.findall(r"\$(\d+)", lists[1])]
            npub = params[0]
            return {"rows": [dict(r) for (n, _), r in self.rows.items()
                             if n == npub and (r["block_id"] in ids or r["lookup_key"] in keys)]}
        if sql.lstrip().upper().startswith("INSERT"):
            out = []
            for i in range(0, len(params), len(COLS)):
                row = dict(zip(COLS, params[i:i + len(COLS)], strict=True))
                prev = self.rows.get((row["npub"], row["block_id"]))
                row["created_at"] = prev["created_at"] if prev else "2026-10-11T00:00:00Z"
                row["updated_at"] = "2026-10-11T00:00:01Z"
                self.rows[(row["npub"], row["block_id"])] = row
                out.append(dict(row))
            return {"rows": out}
        raise AssertionError(f"unexpected query: {sql[:60]}")
