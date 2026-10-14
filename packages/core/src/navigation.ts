/**
 * Moving the active cell with the keyboard.
 *
 * The table is a grid of rows by columns, and every arrow key, Home, End,
 * Page Up and Page Down is a question about that grid alone — so the answer is
 * worked out here, from the ids and keys in order, and every adapter only has
 * to put the focus where it says.
 *
 * Rows are whatever the table shows as rows a person can land on: pinned rows,
 * the page's rows, child rows under their parents. Detail rows are not in it;
 * what is inside a detail is reached with Tab like anything else.
 */

/** The rows and columns a keyboard moves across, in the order they are on screen. */
export type NavigationGrid = {
  rows: readonly string[]
  /** The table's own columns (`__select`, `__expand`) included, in order. */
  columns: readonly string[]
}

/** The keys that move the active cell. */
export type NavigationKey =
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "Home"
  | "End"
  | "PageUp"
  | "PageDown"

const NAVIGATION_KEYS: ReadonlySet<string> = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
])

/** Whether a key is one `nextCell` answers. */
export function isNavigationKey(key: string): key is NavigationKey {
  return NAVIGATION_KEYS.has(key)
}

export type NextCellOptions = {
  /**
   * Control (or Command) is held: Home and End go to the first and last cell
   * of the whole grid rather than of the row.
   */
  ctrlKey?: boolean
  /** How many rows Page Up and Page Down move. Defaults to 10. */
  pageRows?: number
  /**
   * The text runs right to left, so the left arrow moves towards the end of a
   * row and the right arrow towards its start.
   */
  rtl?: boolean
}

/**
 * Where the active cell goes when a key is pressed, or `undefined` when it
 * stays put — at an edge, or for a cell the grid does not contain.
 *
 * Nothing wraps: the right arrow at the end of a row stays there rather than
 * jumping to the next row, because a person reading across a row and suddenly
 * finding themselves on another one has lost their place.
 */
export function nextCell(
  grid: NavigationGrid,
  from: { rowId: string; key: string },
  key: NavigationKey,
  options: NextCellOptions = {},
): { rowId: string; key: string } | undefined {
  const row = grid.rows.indexOf(from.rowId)
  const column = grid.columns.indexOf(from.key)
  if (row === -1 || column === -1) return undefined

  const lastRow = grid.rows.length - 1
  const lastColumn = grid.columns.length - 1
  const page = Math.max(1, options.pageRows ?? 10)

  let nextRow = row
  let nextColumn = column
  const towardsEnd = options.rtl ? "ArrowLeft" : "ArrowRight"

  switch (key) {
    case "ArrowUp":
      nextRow = row - 1
      break
    case "ArrowDown":
      nextRow = row + 1
      break
    case "ArrowLeft":
    case "ArrowRight":
      nextColumn = key === towardsEnd ? column + 1 : column - 1
      break
    case "Home":
      nextColumn = 0
      if (options.ctrlKey) nextRow = 0
      break
    case "End":
      nextColumn = lastColumn
      if (options.ctrlKey) nextRow = lastRow
      break
    case "PageUp":
      nextRow = Math.max(0, row - page)
      break
    case "PageDown":
      nextRow = Math.min(lastRow, row + page)
      break
  }

  if (nextRow < 0 || nextRow > lastRow || nextColumn < 0 || nextColumn > lastColumn) return undefined
  if (nextRow === row && nextColumn === column) return undefined

  const rowId = grid.rows[nextRow]
  const columnKey = grid.columns[nextColumn]
  if (rowId === undefined || columnKey === undefined) return undefined
  return { rowId, key: columnKey }
}

/**
 * The cell the keyboard lands on when it enters the grid: the active cell if
 * it is on screen, the first cell of the active row if only a row is active,
 * and otherwise the first cell of the first row. This is the one cell with
 * `tabindex="0"`, so Tab reaches the grid once and arrows do the rest.
 */
export function entryCell(
  grid: NavigationGrid,
  focus: { rowId: string; key?: string } | null | undefined,
): { rowId: string; key: string } | undefined {
  const firstColumn = grid.columns[0]
  if (firstColumn === undefined) return undefined

  if (focus && grid.rows.includes(focus.rowId)) {
    const key = focus.key !== undefined && grid.columns.includes(focus.key) ? focus.key : firstColumn
    return { rowId: focus.rowId, key }
  }

  const firstRow = grid.rows[0]
  return firstRow === undefined ? undefined : { rowId: firstRow, key: firstColumn }
}
