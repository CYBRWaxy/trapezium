/**
 * Moving a row, as rules.
 *
 * The table never reorders the data. A drag, or Alt with an arrow key, ends
 * in the caller's `onReorder` with the row and its new neighbours — the row it
 * now comes after and the row it now comes before — which is what an ordered
 * list in a database needs to place it (a position between two others), and
 * what an array needs too.
 */

import type { AnyRow } from "./types.js"

/** Where a moved row now sits. */
export type RowMove<TRow = AnyRow> = {
  rowId: string
  row: TRow
  /** The row it now comes straight after, or `null` when it is first. */
  afterId: string | null
  /** The row it now comes straight before, or `null` when it is last. */
  beforeId: string | null
  /** For a child row, its parent — children move only among their siblings. */
  parentId?: string
}

/**
 * Rows that can be moved by hand.
 *
 * Written as methods so a narrower row type is accepted, as `SelectionOptions`
 * explains.
 */
export type RowReorderOptions<TRow = AnyRow> = {
  /** Rows that stay where they are. Defaults to every row. */
  canDrag?(row: TRow): boolean
  /**
   * Receives every move. Reorder your data to match and the table shows it.
   * Return a promise and the rows show the new order until it settles,
   * going back if it rejects.
   */
  onReorder(move: RowMove<TRow>): void | Promise<unknown>
}

/** The order of a list once one row has been put beside another, and that row's new neighbours. */
export function moveRowTo(
  ids: readonly string[],
  rowId: string,
  targetId: string,
  position: "before" | "after",
): { order: string[]; afterId: string | null; beforeId: string | null } | undefined {
  if (rowId === targetId || !ids.includes(rowId) || !ids.includes(targetId)) return undefined

  const order = ids.filter((id) => id !== rowId)
  const at = order.indexOf(targetId) + (position === "after" ? 1 : 0)
  order.splice(at, 0, rowId)

  // Dropped back where it came from.
  if (order.every((id, index) => id === ids[index])) return undefined
  return { order, afterId: order[at - 1] ?? null, beforeId: order[at + 1] ?? null }
}

/** One place up (`-1`) or down (`1`), or `undefined` at the end of the list. */
export function stepRow(
  ids: readonly string[],
  rowId: string,
  delta: -1 | 1,
): { order: string[]; afterId: string | null; beforeId: string | null } | undefined {
  const index = ids.indexOf(rowId)
  const target = ids[index + delta]
  if (index === -1 || target === undefined) return undefined
  return moveRowTo(ids, rowId, target, delta === 1 ? "after" : "before")
}

/**
 * Whether rows can be moved right now. Not while the table is sorted: the
 * rows are then in the sort's order, a row put somewhere else would not stay
 * there, and its neighbours would describe a place in the sort rather than
 * in the data.
 */
export function canReorderRows(sort: readonly unknown[]): boolean {
  return sort.length === 0
}

/**
 * The data with a move applied — what the table shows while a move is being
 * saved. The moved row is taken out and put back straight after `afterId`, or
 * straight before `beforeId`. Applied to the data rather than to the rows on
 * screen, so a parent that moves takes its children with it: the pipeline
 * puts them back under it wherever it lands.
 */
export function applyRowMove<TRow>(
  rows: readonly TRow[],
  ids: readonly string[],
  move: Pick<RowMove, "rowId" | "afterId" | "beforeId">,
): TRow[] {
  const from = ids.indexOf(move.rowId)
  const moved = rows[from]
  if (from === -1 || moved === undefined) return [...rows]

  const rest = rows.filter((_, index) => index !== from)
  const restIds = ids.filter((_, index) => index !== from)
  const anchor =
    move.afterId !== null
      ? restIds.indexOf(move.afterId) + 1
      : move.beforeId !== null
        ? restIds.indexOf(move.beforeId)
        : -1
  if (anchor < 0 || (move.afterId !== null && anchor === 0)) return [...rows]

  rest.splice(anchor, 0, moved)
  return rest
}
