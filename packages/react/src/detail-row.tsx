import { memo, type ReactNode } from "react"
import type { AnyRow, DetailContext } from "@trapezium/core"

import type { ClassResolver } from "./classes.js"

/**
 * The row a detail opens into, below the row it belongs to.
 *
 * One cell spanning every column, holding whatever the caller's `render`
 * returned, at whatever height that is — the browser lays it out in normal
 * flow, so nothing is measured and the server's markup is already the right
 * height. Inside it the content is held to the width of the table's frame
 * rather than the width of every column, so a detail on a table that scrolls
 * sideways stays in view instead of stretching across columns nobody can see.
 *
 * Memoised like a row, for the same reason: an appended page must not re-run
 * every open detail's renderer.
 */
export type DetailRowProps<TRow extends AnyRow> = {
  row: TRow
  id: string
  rowIndex: number
  /** The element id the row's expander points at. */
  detailId: string
  colSpan: number
  /** Shown, or kept in the document but hidden because `keepMounted` asked for it. */
  open: boolean
  render: (context: DetailContext<TRow>) => ReactNode
  classes: ClassResolver
  onCollapse: (id: string) => void
}

function DetailRowInner<TRow extends AnyRow>({
  row,
  id,
  rowIndex,
  detailId,
  colSpan,
  open,
  render,
  classes,
  onCollapse,
}: DetailRowProps<TRow>) {
  return (
    <tr className={classes("detailRow")} id={detailId} data-detail-for={id} hidden={!open}>
      <td className={classes("detailCell")} colSpan={colSpan} data-wrap="true">
        <div className="tpz-detail">{render({ row, rowId: id, rowIndex, collapse: () => onCollapse(id) })}</div>
      </td>
    </tr>
  )
}

/* The same cast as `Row`, for the same reason: `memo` drops the generic. */
export const DetailRow = memo(DetailRowInner) as typeof DetailRowInner
