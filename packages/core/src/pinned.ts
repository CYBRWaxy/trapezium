/**
 * Pinned rows: rows held at the top or bottom of the table, outside the data.
 *
 * A "new entry" row above everything, a totals row below it. They are drawn
 * through the same columns, renderers and editors as every other row, but
 * the pipeline never sees them: they are not filtered, searched, sorted,
 * paged, counted, selected or exported, and they stay in view while the body
 * scrolls.
 */

import type { AnyRow, GetRowId } from "./types.js"

/** Which edge a pinned row is held against. */
export type PinnedSide = "top" | "bottom"

/**
 * A pinned row's id: the table's `getRowId` when it has one, the row's own
 * `id`, `uuid` or `key` when it has one of those, and otherwise its side and
 * position — `"top-0"`, `"bottom-1"` — rather than the bare index a data row
 * would fall back to, which would collide with the first rows of the data.
 */
export function pinnedRowId<TRow extends AnyRow>(
  row: TRow,
  index: number,
  side: PinnedSide,
  getRowId?: GetRowId<TRow>,
): string {
  if (getRowId) return getRowId(row, index)
  const own = row["id"] ?? row["uuid"] ?? row["key"]
  if (typeof own === "string" || typeof own === "number") return String(own)
  return `${side}-${String(index)}`
}

/**
 * How far a pinned row sits from its edge before anything has been measured:
 * one row height for every pinned row between it and the edge. Right for
 * rows of one line, and replaced by the measured distance once the table is
 * in a browser — so the server's markup and the first paint agree, and rows
 * that wrap still stack exactly.
 */
export function pinnedOffset(index: number, count: number, side: PinnedSide): string {
  const before = side === "top" ? index : count - 1 - index
  return before === 0 ? "0px" : `calc(${String(before)} * var(--tpz-row-height))`
}
