import type { AnyRow, DetailOptions, TableState } from "./types.js"

/**
 * Detail rows, read the same way by every adapter.
 *
 * Which rows have a detail and which of those are open is decided here once,
 * so that "expand all", a row's expander and the server render all agree.
 */

/** The ids among `rowIds` whose row has a detail, in order. */
export function expandableIds<TRow extends AnyRow>(
  rows: readonly TRow[],
  rowIds: readonly string[],
  detail: Pick<DetailOptions<TRow>, "canExpand"> | undefined,
): string[] {
  if (!detail) return []
  if (!detail.canExpand) return [...rowIds]

  const ids: string[] = []
  rows.forEach((row, index) => {
    const id = rowIds[index]
    if (id !== undefined && detail.canExpand?.(row) !== false) ids.push(id)
  })
  return ids
}

/**
 * Whether a row's detail is showing: it is named in the state *and* the row
 * has a detail at all. A state carried in from a link may name a row that
 * `canExpand` refuses, and that row stays closed.
 */
export function isDetailOpen<TRow extends AnyRow>(
  state: TableState,
  row: TRow,
  id: string,
  detail: Pick<DetailOptions<TRow>, "canExpand"> | undefined,
): boolean {
  if (!detail || !(state.expanded ?? []).includes(id)) return false
  return detail.canExpand ? detail.canExpand(row) : true
}
