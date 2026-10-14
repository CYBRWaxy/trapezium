import { memo } from "react"
import { isInteractiveTarget, type AnyRow, type FormatContext, type TypeRegistry } from "@trapezium/core"

import { cellText, renderCell } from "./cell.js"
import type { ClassResolver } from "./classes.js"
import { Icon } from "./icon.js"
import type { TableColumn, LinkComponent } from "./types.js"

/**
 * One row, and the reason appending a page is cheap.
 *
 * This is `memo`'d, which is the whole point of it being a component at all.
 * An infinite list holds every page loaded so far, so by the tenth page the
 * table has thousands of rows on screen; without this, reaching the sentinel
 * re-runs every cell renderer and diffs every cell in the table to add
 * twenty-five rows at the bottom. With it, React skips straight past the rows
 * that have not changed and mounts only the new ones — the cost of a page is
 * the size of the page, not the size of the list.
 *
 * That only holds if the props are stable, so everything here is either a
 * primitive or memoised by the table: the row's class name and href arrive as
 * strings rather than as the functions that produced them, the handlers are
 * identity-stable, and the pin offsets are replaced only when they actually
 * change. A new object in any of these would quietly turn the memo off and
 * nothing would look broken — it would just be slow again.
 */

export type RowProps<TRow extends AnyRow> = {
  row: TRow
  id: string
  rowIndex: number
  columns: TableColumn<TRow>[]
  types: TypeRegistry
  format: FormatContext
  classes: ClassResolver
  /** Already resolved from `rowClassName`, so the memo compares a string. */
  className?: string
  /** Already resolved from `rowHref`, likewise. */
  href?: string
  selected: boolean
  selectionMode?: "single" | "multiple"
  /** False when `isSelectable` said this row is not. */
  selectable: boolean
  pinOffsets: Record<string, number>
  /** Keys of the last pinned column on each side — they carry the frozen edge. */
  pinEdges: Record<string, true>
  /** True when the table has an exact height, so cells need something to bound them. */
  fit: boolean
  onRowClick?: (row: TRow, event: React.MouseEvent) => void
  onToggle: (id: string, event: React.ChangeEvent<HTMLInputElement>) => void
  linkComponent?: LinkComponent
  /**
   * The expander, when the table has detail rows: whether this row has one,
   * whether it is open, and the id of the detail row it controls. Absent when
   * the table has no detail rows, so there is no expander column at all.
   */
  expander?: { expandable: boolean; expanded: boolean; detailId: string }
  /** Opens or closes a row's detail. Identity-stable, like `onToggle`. */
  onToggleExpanded?: (id: string) => void
  /** A click anywhere on the row toggles its detail, not only the expander. */
  toggleOnClick?: boolean
  /**
   * With cell navigation on, the key of this row's cell that is the table's
   * one stop in the tab order — `""` for a row that holds none of it.
   * Absent when cell navigation is off, and no cell is focusable at all.
   */
  activeKey?: string
  /** This row is the active one — `state.focus` names it. Highlighted. */
  focused?: boolean
}

function RowInner<TRow extends AnyRow>({
  row,
  id,
  rowIndex,
  columns,
  types,
  format,
  classes,
  className,
  href,
  selected,
  selectionMode,
  selectable,
  pinOffsets,
  pinEdges,
  fit,
  onRowClick,
  onToggle,
  linkComponent: Link,
  expander,
  onToggleExpanded,
  toggleOnClick,
  activeKey,
  focused,
}: RowProps<TRow>) {
  // Only the active cell is in the tab order; the rest are reached by arrow.
  const tabIndex = (key: string) => (activeKey === undefined ? undefined : activeKey === key ? 0 : -1)
  // The table's own controls are worked from their cell, so they leave the tab order to it.
  const controlTabIndex = activeKey === undefined ? undefined : -1

  const togglesDetail = toggleOnClick === true && expander?.expandable === true
  const clickable = onRowClick !== undefined || togglesDetail

  return (
    <tr
      className={classes("row", className)}
      data-selected={selected ? "true" : undefined}
      data-clickable={clickable ? "true" : undefined}
      data-expanded={expander?.expanded ? "true" : undefined}
      data-focused={focused ? "true" : undefined}
      data-row-id={id}
      onClick={
        clickable
          ? (event) => {
              // A link, a button, a checkbox in the row is what was meant, not the row.
              if (isInteractiveTarget(event.target, event.currentTarget)) return
              onRowClick?.(row, event)
              if (togglesDetail) onToggleExpanded?.(id)
            }
          : undefined
      }
    >
      {selectionMode && (
        <td
          className={classes("selectCell")}
          data-pin="start"
          data-key="__select"
          tabIndex={tabIndex("__select")}
          style={{ left: pinOffsets["__select"] ?? 0 }}
        >
          <input
            type={selectionMode === "single" ? "radio" : "checkbox"}
            className="tpz-checkbox"
            checked={selected}
            disabled={!selectable}
            tabIndex={controlTabIndex}
            aria-label={`Select row ${String(rowIndex + 1)}`}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onToggle(id, event)}
          />
        </td>
      )}

      {expander && (
        <td
          className={classes("expandCell")}
          data-pin="start"
          data-key="__expand"
          tabIndex={tabIndex("__expand")}
          style={{ left: pinOffsets["__expand"] ?? 0 }}
        >
          {expander.expandable && (
            <button
              type="button"
              className="tpz-expander"
              tabIndex={controlTabIndex}
              aria-expanded={expander.expanded}
              aria-controls={expander.expanded ? expander.detailId : undefined}
              aria-label={`${expander.expanded ? "Hide" : "Show"} details for row ${String(rowIndex + 1)}`}
              onClick={(event) => {
                event.stopPropagation()
                onToggleExpanded?.(id)
              }}
            >
              <Icon name="chevronRight" size={14} />
            </button>
          )}
        </td>
      )}

      {columns.map((column, columnIndex) => {
        const context = cellText(row, id, rowIndex, column, types, format)
        const content = renderCell(context, types)
        const leading = columnIndex === 0
        const lines = typeof column.wrap === "number" ? column.wrap : undefined

        const inner =
          leading && href ? (
            Link ? (
              <Link href={href} className="tpz-link tpz-lead">
                {content}
              </Link>
            ) : (
              <a href={href} className="tpz-link tpz-lead">
                {content}
              </a>
            )
          ) : (
            content
          )

        return (
          <td
            key={column.key}
            className={classes("cell", column.className)}
            data-align={column.align}
            data-mono={column.mono ? undefined : "false"}
            data-wrap={wrapAttribute(column.wrap)}
            data-pin={column.pin}
            data-pin-edge={pinEdges[column.key] ? column.pin : undefined}
            data-key={column.key}
            // Carries the header into the cell so the card layout
            // can label it in CSS, with no second render.
            data-label={column.header}
            tabIndex={tabIndex(column.key)}
            style={{
              ...(column.pin === "start" ? { left: pinOffsets[column.key] } : {}),
              ...(column.pin === "end" ? { right: pinOffsets[column.key] } : {}),
              width: column.width,
            }}
          >
            {/*
              A table cell has to go on being a table cell, so anything that
              bounds its content needs an element of its own inside it:
              `-webkit-box` for a line clamp, and a plain block for an exact
              row height, whose cap `height` alone cannot enforce.
            */}
            {lines !== undefined ? (
              <span className="tpz-clamp" style={{ "--tpz-cell-lines": lines } as React.CSSProperties}>
                {inner}
              </span>
            ) : fit ? (
              <span className="tpz-fit">{inner}</span>
            ) : (
              inner
            )}
          </td>
        )
      })}
    </tr>
  )
}

/**
 * `true` and a line count both mean "wrap"; `false` means "stay on one line
 * even though the table is set to wrap", which is a different thing from
 * saying nothing at all.
 */
export function wrapAttribute(wrap: boolean | number | undefined): "true" | "false" | undefined {
  if (wrap === undefined) return undefined
  return wrap === false ? "false" : "true"
}

/*
  `memo` does not carry a generic through: what it returns is a component over
  `RowProps<AnyRow>`, which would erase the caller's row type at every use. The
  cast gives the memoised component the signature `RowInner` already has — the
  same function, typed as itself — which is why it is a cast and not an error
  being silenced.
*/
export const Row = memo(RowInner) as typeof RowInner
