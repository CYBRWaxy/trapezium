import { memo, type ReactNode } from "react"
import {
  isCellEditable,
  isInteractiveTarget,
  pinWhenToken,
  type AnyRow,
  type CellSizing,
  type FormatContext,
  type TypeRegistry,
} from "@trapezium/core"

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
  /** The table has editable columns, so each cell says whether it is one. */
  editable?: boolean
  /** The column whose cell in this row is being edited. Absent for every other row. */
  editingKey?: string
  /** Draws the editor for the cell being edited; given only to the row that has it. */
  renderEditor?: (column: TableColumn<TRow>) => ReactNode
  /**
   * Edits of this row's cells still being saved, keyed by column, with the
   * value each is saving; and the ones that failed, with why. Absent when there
   * are none, so the memo holds for every other row.
   */
  edits?: { pending: Record<string, unknown>; failed: Record<string, string> }
  /**
   * The row's place in a table with child rows: a child, a parent with
   * children (folded away or not), or a parent shown only for a child's sake.
   * Absent when the table has no child rows.
   */
  tree?: { depth: 0 | 1; childCount: number; context: boolean; folded: boolean }
  /** Folds or unfolds a parent's children. Identity-stable, like `onToggle`. */
  onToggleChildren?: (id: string) => void
  /** The table is a tree grid, so the row says its level and whether it is open. */
  treegrid?: boolean
  /**
   * A pinned row: held against the top or bottom while the body scrolls, with
   * nothing in the table's own columns — it cannot be selected or opened.
   */
  pinned?: "top" | "bottom"
  /** How far it sits from its edge, past the pinned rows between it and the edge. */
  pinnedOffset?: string
  /**
   * The drag handle, when rows can be moved: whether this row has one, and
   * whether moving is off just now (the table is sorted). Absent when rows
   * cannot be moved at all, so there is no handle column.
   */
  handle?: { draggable: boolean; disabled: boolean }
  /** A press on the handle. Identity-stable, like `onToggle`. */
  onHandleDown?: (id: string, event: React.PointerEvent<HTMLElement>) => void
  /** Alt with an arrow key on the handle: one place up or down. Identity-stable. */
  onHandleStep?: (id: string, delta: -1 | 1) => void
  /** A context menu asked for on the row. Identity-stable, like `onRowClick`. */
  onContextMenu?: (row: TRow, id: string, event: React.MouseEvent<HTMLTableRowElement>) => void
  /** How wide each column's cells are — `columnSizing(columns)`, one object for the whole table. */
  sizing?: Record<string, CellSizing>
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
  editable,
  editingKey,
  renderEditor,
  edits,
  tree,
  onToggleChildren,
  treegrid,
  pinned,
  pinnedOffset,
  handle,
  onHandleDown,
  onHandleStep,
  onContextMenu,
  sizing,
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
      data-depth={tree?.depth}
      data-parent={tree && tree.childCount > 0 ? "true" : undefined}
      data-context={tree?.context ? "true" : undefined}
      aria-level={treegrid && tree ? tree.depth + 1 : undefined}
      aria-expanded={treegrid && tree && tree.childCount > 0 ? !tree.folded : undefined}
      data-pinned={pinned}
      onContextMenu={onContextMenu ? (event) => onContextMenu(row, id, event) : undefined}
      style={pinnedOffset === undefined ? undefined : ({ "--tpz-pinned-offset": pinnedOffset } as React.CSSProperties)}
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
      {handle && (
        <td
          className={classes("dragCell")}
          data-pin="start"
          data-key="__drag"
          tabIndex={tabIndex("__drag")}
          style={{ left: pinOffsets["__drag"] ?? 0 }}
        >
          {handle.draggable && !pinned && (
            <button
              type="button"
              className="tpz-drag-handle"
              tabIndex={controlTabIndex}
              aria-label={`Move row ${String(rowIndex + 1)}`}
              aria-disabled={handle.disabled || undefined}
              title={handle.disabled ? "Clear the sort to move rows" : "Drag to move, or Alt with an arrow key"}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => {
                if (handle.disabled || event.button !== 0) return
                onHandleDown?.(id, event)
              }}
              onKeyDown={(event) => {
                if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return
                event.preventDefault()
                event.stopPropagation()
                if (!handle.disabled) onHandleStep?.(id, event.key === "ArrowUp" ? -1 : 1)
              }}
            >
              <Icon name="grip" size={14} />
            </button>
          )}
        </td>
      )}

      {selectionMode && (
        <td
          className={classes("selectCell")}
          data-pin="start"
          data-key="__select"
          tabIndex={tabIndex("__select")}
          style={{ left: pinOffsets["__select"] ?? 0 }}
        >
          {!pinned && (
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
          )}
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
          {expander.expandable && !pinned && (
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
        const pending = edits !== undefined && Object.hasOwn(edits.pending, column.key)
        const failed = edits?.failed[column.key]
        const cellEditable = editable === true && isCellEditable(column, row)
        const editing = editingKey === column.key && renderEditor !== undefined

        // A cell still saving shows the value it is saving.
        const context = cellText(row, id, rowIndex, column, types, format, pending ? { value: edits.pending[column.key] } : undefined)
        const content = renderCell(context, types)
        const leading = columnIndex === 0
        const lines = typeof column.wrap === "number" ? column.wrap : undefined
        const size = sizing?.[column.key]

        const linked =
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

        /*
          With child rows the leading cell carries the row's place in the
          tree: a toggle for a parent, the same width of nothing for a row on
          its own — so every row's text starts in the same place — and an
          indent with a connector for a child.
        */
        const inner =
          leading && tree ? (
            <>
              <span className="tpz-tree" data-depth={tree.depth}>
                {tree.childCount > 0 && (
                  <button
                    type="button"
                    className="tpz-tree-toggle"
                    tabIndex={controlTabIndex}
                    aria-expanded={!tree.folded}
                    aria-label={`${tree.folded ? "Show" : "Hide"} ${String(tree.childCount)} child ${tree.childCount === 1 ? "row" : "rows"} of row ${String(rowIndex + 1)}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleChildren?.(id)
                    }}
                  >
                    <Icon name="chevronRight" size={12} />
                  </button>
                )}
              </span>
              {linked}
            </>
          ) : (
            linked
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
            data-pin-when={column.pinWhen ? pinWhenToken(column.pinWhen) : undefined}
            data-size={size?.size}
            data-key={column.key}
            // Carries the header into the cell so the card layout
            // can label it in CSS, with no second render.
            data-label={column.header}
            tabIndex={tabIndex(column.key)}
            data-editable={cellEditable ? "true" : undefined}
            data-editing={editing ? "true" : undefined}
            data-pending={pending ? "true" : undefined}
            data-failed={failed !== undefined ? "true" : undefined}
            aria-busy={pending || undefined}
            aria-readonly={editable === true && !cellEditable ? true : undefined}
            title={failed}
            style={cellStyle(column, pinOffsets, size)}
          >
            {/*
              A table cell has to go on being a table cell, so anything that
              bounds its content needs an element of its own inside it:
              `-webkit-box` for a line clamp, and a plain block for an exact
              row height, whose cap `height` alone cannot enforce.
            */}
            {editing ? (
              renderEditor(column)
            ) : (
              <Boxed box={size?.box === true}>
                {lines !== undefined ? (
                  <span className="tpz-clamp" style={{ "--tpz-cell-lines": lines } as React.CSSProperties}>
                    {inner}
                  </span>
                ) : fit ? (
                  <span className="tpz-fit">{inner}</span>
                ) : (
                  inner
                )}
              </Boxed>
            )}
            {failed !== undefined && !editing && <span className="tpz-sr">{`, not saved: ${failed}`}</span>}
          </td>
        )
      })}
    </tr>
  )
}

/**
 * A cell's content, in the box that holds a column to its width or caps it
 * when the column has one — see `columnSizing`.
 */
function Boxed({ box, children }: { box: boolean; children: ReactNode }) {
  return box ? <span className="tpz-box">{children}</span> : <>{children}</>
}

/**
 * A cell's inline style: its column's width, and where a frozen column sits.
 * A column frozen by width gets its offset as a custom property, which only
 * the container query that freezes it reads — on a cell that is not frozen,
 * `left` would move it.
 */
export function cellStyle(
  column: { key: string; pin?: "start" | "end"; pinWhen?: { side: "start" | "end" } },
  pinOffsets: Record<string, number>,
  size: CellSizing | undefined,
): React.CSSProperties {
  const offset = pinOffsets[column.key]
  return {
    ...size?.style,
    ...(column.pin === "start" ? { left: offset } : {}),
    ...(column.pin === "end" ? { right: offset } : {}),
    ...(column.pinWhen && offset !== undefined ? { "--tpz-pin-offset": `${String(offset)}px` } : {}),
  }
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
