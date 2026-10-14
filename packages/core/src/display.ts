/**
 * The text a cell shows, for code outside the table that has to say the same
 * thing — a "Copy cell" item in a context menu, a tooltip, an announcement.
 *
 * Worked out the way every cell works it out: the type's formatter with the
 * column's own formatting over the table's, then the column's `format` if it
 * has one. A column with a custom `render` shows markup, but its text is still
 * this — the same text global search matches and a renderer is handed as
 * `context.text`.
 */

import { formatWithType, type TypeRegistry } from "./registry.js"
import type { AnyRow, CellContext, FormatContext, ResolvedColumn } from "./types.js"

/**
 * The text of one cell. An empty cell is `""`: the dash a table draws there is
 * a placeholder for the eye, not a value to copy.
 */
export function cellDisplayText<TRow extends AnyRow, TNode = unknown>(
  row: TRow,
  column: ResolvedColumn<TRow, TNode>,
  options: { types: TypeRegistry; format: FormatContext; rowId?: string; rowIndex?: number },
): string {
  const value = column.accessor(row)
  const context: CellContext<TRow, TNode> = {
    value,
    row,
    rowIndex: options.rowIndex ?? 0,
    rowId: options.rowId ?? "",
    column,
    text: formatWithType(options.types.get(column.type), value, { ...options.format, ...column.formatOptions }),
    format: options.format,
  }
  return column.format ? column.format(context) : context.text
}
