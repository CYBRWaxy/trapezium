import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  INTERACTIVE_SELECTOR,
  cellDisplayText,
  warmSearchWhenIdle,
  clearSelection,
  rangeSelection,
  startDragSelect,
  applyRowMove,
  canReorderRows,
  moveRowTo,
  resolveRowId,
  startRowDrag,
  stepRow,
  canResetSort,
  editValuesEqual,
  editorKind,
  entryCell,
  focusCell,
  fromEditorText,
  hasEditableColumns,
  isCellEditable,
  isInteractiveTarget,
  pinnedOffset,
  pinnedRowId,
  typedCharacter,
  validateEdit,
  isNavigationKey,
  nextCell,
  expandableIds as expandableIdsOf,
  isDetailOpen,
  setExpanded,
  toggleCollapsed,
  toggleExpanded,
  formatWithType,
  copyText,
  downloadText,
  resetSort,
  resolveSelection,
  resolveSorting,
  sortLevels as sortLevelsOf,
  rowsToExport,
  selectRange,
  selectableIds as selectableIdsOf,
  setSelected,
  toCsv,
  toDelimitedText,
  toSelectOptions,
  toggleSelection,
  type AnyRow,
  type CellFocus,
  type RowMove,
  type SelectOption,
  type TableState,
} from "@trapezium/core"

import { createClasses } from "./classes.js"
import { TableContext } from "./context.js"
import { DetailRow } from "./detail-row.js"
import { CellEditor, type CommitReason } from "./editor.js"
import { HeaderCell } from "./header-cell.js"
import { Icon } from "./icon.js"
import { InfiniteSentinel, Pagination } from "./pagination.js"
import { Row } from "./row.js"
import { Toolbar } from "./toolbar.js"
import type { SearchOptions, TableProps } from "./types.js"
import { useTable } from "./use-table.js"

/**
 * The table.
 *
 * ```tsx
 * <Table data={users} />
 * ```
 *
 * That is a complete usage: columns are inferred from the data, types from the
 * values, and sorting, searching and pagination work. Everything below is for
 * the cases where the default is not what you want.
 *
 * It renders a real `<table>` — real rows, real cells, real header semantics —
 * because that is what screen readers, keyboard navigation, browser find, print
 * and "copy as table" all rely on. A grid of divs is easier to style and worse
 * at every one of those.
 */
export function Table<TRow extends AnyRow>(props: TableProps<TRow>) {
  const {
    data,
    getRowId,
    loading,
    error,
    responsive = "scroll",
    stickyHeader = true,
    maxHeight,
    rowHeight = "fixed",
    rowHref,
    onRowClick,
    rowClassName,
    emptyState,
    emptyMessage = "Nothing to show",
    toolbar,
    appendRow,
    footer,
    caption,
    buildHref,
    linkComponent: Link,
    onNavigate,
    className,
    classNames,
    unstyled,
    theme,
    detail,
  } = props

  /*
    A move still being saved is shown by applying it to the data, so the rows
    — and a parent's children with it — are where they were dropped until the
    caller's data says otherwise. Held against the data it was made on: new
    data is the answer, and the move is forgotten.
  */
  const [pendingMove, setPendingMove] = useState<{ data: readonly TRow[]; move: RowMove<TRow> } | undefined>()
  const displayData = useMemo(() => {
    if (!pendingMove || pendingMove.data !== data) return data
    const ids = data.map((row, index) => resolveRowId(row, index, getRowId))
    return applyRowMove(data, ids, pendingMove.move)
  }, [data, pendingMove, getRowId])
  const viewProps = useMemo(() => (displayData === data ? props : { ...props, data: displayData }), [props, data, displayData])

  const table = useTable(viewProps)
  const {
    rows,
    matchedRows,
    rowIds,
    rowInfo,
    columns,
    hiddenColumns,
    state,
    update,
    types,
    format,
    pagination,
    total,
    serverSource,
    headerSearchDebounce,
  } = table

  const classes = useMemo(() => createClasses(classNames, unstyled), [classNames, unstyled])

  /*
    Memoised because they are dependencies of effects and callbacks below. A
    fresh object every render would re-run the selection report and rebuild the
    header handlers on every keystroke in the search box.
  */
  const selection = useMemo(
    () => resolveSelection(props.selection, props.onSelectionChange),
    [props.selection, props.onSelectionChange],
  )

  const search = useMemo(() => normaliseSearch(props.search), [props.search])

  /*
    Reduced to what it decides before it is memoised on, so that
    `sortable={{ multiple: false }}` written inline — a new object every
    render — does not hand every header a new `features` and re-render them all.
  */
  const sortOption = props.sortable
  const sortOptions = typeof sortOption === "object" ? sortOption : undefined
  const sortEnabled = sortOption !== false
  const sortMultiple = sortOptions?.multiple
  const sortReset = sortOptions?.reset
  // A resting sort is an array, and compared by what it says rather than by
  // which array it is, for the same reason.
  const sortResetKey = typeof sortReset === "object" ? JSON.stringify(sortReset) : String(sortReset)

  const sorting = useMemo(
    () => resolveSorting(sortEnabled ? { multiple: sortMultiple, reset: sortReset } : false),
    // `sortResetKey` stands in for `sortReset`, which is read above.
    [sortEnabled, sortMultiple, sortResetKey],
  )

  const features = useMemo(
    () => ({
      sortable: sorting !== undefined,
      multiSort: sorting?.multiple === true,
      filters: props.filters !== false,
      menu: props.columnMenu !== false,
      resizable: props.resizable !== false,
      reorderable: props.reorderable !== false,
    }),
    [sorting, props.filters, props.columnMenu, props.resizable, props.reorderable],
  )

  // The levels that really order the rows, which is what the headers number.
  const sortLevels = useMemo(() => sortLevelsOf(state.sort, columns), [state.sort, columns])

  /*
    Where a shift-click on a header link goes. A table whose controls are
    links is a table whose view lives in an address, so adding a sort level
    means going to another address — by the caller's router when it was given
    one, and by the browser when nothing at all is listening, which is the
    table with no script wired up. In between, a caller that listens for
    state is already turning state into addresses, and is left to.
  */
  const hasStateListener = props.onStateChange !== undefined
  const navigate = useMemo(() => {
    if (!buildHref) return undefined
    if (onNavigate) return onNavigate
    if (hasStateListener) return undefined
    return (href: string) => window.location.assign(href)
  }, [buildHref, onNavigate, hasStateListener])

  /*
    Offered only while the sort is somewhere other than where the table rests,
    so it appears when there is something to undo and is gone once it has been.
  */
  const resetControl = useMemo(() => {
    const resting = sorting?.reset
    if (!resting || !canResetSort(state.sort, sorting)) return undefined
    return {
      onReset: () => update((current) => resetSort(current, resting)),
      href: buildHref ? buildHref(resetSort(state, resting)) : undefined,
    }
  }, [sorting, state, update, buildHref])

  const visibleKeys = useMemo(() => columns.map((column) => column.key), [columns])

  /**
   * How a stored value reads on screen, for whichever column is asking.
   *
   * The set filter uses it so its choices match the cells — including for a
   * custom type, whose formatter is the only thing that knows that "blocker"
   * is shown as "Blocker".
   */
  const formatValue = useCallback(
    (column: (typeof columns)[number]) => (value: unknown) =>
      formatWithType(types.get(column.type), value, { ...format, ...column.formatOptions }),
    [types, format],
  )

  /*
    A set-filter column with nothing of its own asks the server, if the table
    was told how to ask. Bound per column and remembered by identity, so the
    panel fetches once and reopening it is free.
  */
  const distinctFor = useMemo(() => {
    const source = serverSource?.distinct
    if (!source) return undefined

    const bound = new Map<string, () => Promise<SelectOption[]>>()
    return (key: string) => {
      let provider = bound.get(key)
      if (!provider) {
        provider = async () => {
          const values = await source(key, latestState.current)
          return toSelectOptions(values)
        }
        bound.set(key, provider)
      }
      return provider
    }
  }, [serverSource])

  // Read when a provider actually runs, so a fetch reflects the filters in
  // force at that moment rather than the ones in force when it was bound.
  const latestState = useRef(state)
  latestState.current = state
  const reorder = props.rowReorder
  const columnCount = columns.length + (selection ? 1 : 0) + (detail ? 1 : 0) + (reorder ? 1 : 0)

  /*
    The base every generated element id is built from. The caller's `id` when
    there is one, React's own otherwise — which is the same on the server and
    in the browser, so an expander's `aria-controls` survives hydration.
  */
  const generatedId = useId()
  const baseId = props.id ?? generatedId

  /*
    Frozen columns need real pixel offsets, and only the browser knows how wide
    a column ended up. They are measured after layout and applied as custom
    properties, so the server and the first client render agree on the markup
    and the numbers arrive a frame later — rather than the two disagreeing and
    React throwing the tree away.
  */
  const headRef = useRef<HTMLTableSectionElement | null>(null)
  const [pinOffsets, setPinOffsets] = useState<Record<string, number>>({})

  // Marks the table while a column is being dragged, so it can show that
  // letting go outside will remove it.
  const [draggingColumn, setDraggingColumn] = useState(false)

  useLayoutEffect(() => {
    const head = headRef.current
    if (!head) return

    const cells = [...head.querySelectorAll<HTMLElement>("[data-pin]")]
    const next: Record<string, number> = {}

    let start = 0
    for (const cell of cells.filter((entry) => entry.dataset["pin"] === "start")) {
      next[cell.dataset["key"] ?? ""] = start
      start += cell.getBoundingClientRect().width
    }

    let end = 0
    for (const cell of cells.filter((entry) => entry.dataset["pin"] === "end").reverse()) {
      next[cell.dataset["key"] ?? ""] = end
      end += cell.getBoundingClientRect().width
    }

    setPinOffsets((current) => (shallowEqualNumbers(current, next) ? current : next))
  }, [columns, state.widths, state.density, rows.length])

  /*
    Both custom properties on one object so the memo has one identity to
    compare. A number for `rowHeight` is simply the token the whole stylesheet
    already sizes rows by, which is why it needs no rule of its own — and why
    it still respects a column that has been told to wrap.
  */
  /*
    A number is its own mode rather than only a token, because it wraps like
    `auto` does — the token alone could not say that.
  */
  const rowHeightMode = rowHeight === "fixed" ? undefined : typeof rowHeight === "number" ? "exact" : "auto"

  const rootStyle = useMemo(() => {
    const style: Record<string, string> = {}
    if (maxHeight !== undefined) {
      style["--tpz-max-height"] = typeof maxHeight === "number" ? `${String(maxHeight)}px` : maxHeight
    }
    if (typeof rowHeight === "number") style["--tpz-row-height"] = `${String(rowHeight)}px`
    // How much of the scroll area the pinned rows cover, so a cell brought into view is not left under them.
    const top = props.pinnedRows?.top?.length ?? 0
    const bottom = props.pinnedRows?.bottom?.length ?? 0
    if (top > 0) style["--tpz-pinned-top"] = `calc(${String(top)} * var(--tpz-row-height))`
    if (bottom > 0) style["--tpz-pinned-bottom"] = `calc(${String(bottom)} * var(--tpz-row-height))`
    return Object.keys(style).length > 0 ? (style as React.CSSProperties) : undefined
  }, [maxHeight, rowHeight, props.pinnedRows?.top?.length, props.pinnedRows?.bottom?.length])

  /*
    Worked out once for the table rather than per cell. The old form asked
    "is this the last pinned column?" inside every cell of every row, which
    walked the column list twice each time — quadratic in columns, multiplied
    by rows, on every render.
  */
  const pinEdges = useMemo(() => {
    const starts = columns.filter((column) => column.pin === "start")
    const ends = columns.filter((column) => column.pin === "end")
    const edges: Record<string, true> = {}
    const first = starts[starts.length - 1]?.key
    const last = ends[0]?.key
    if (first) edges[first] = true
    if (last) edges[last] = true
    return edges
  }, [columns])

  /* ── Selection ─────────────────────────────────────────────────────────── */

  const selectableIds = useMemo(
    () => selectableIdsOf(rows, rowIds, selection?.isSelectable),
    [rows, rowIds, selection],
  )

  /*
    What the header checkbox selects. "page", the rows on screen, unless the
    table was asked for "matching" — every row the filters and search leave.
    In client mode those are all here; in server mode the table holds one page,
    so they are fetched from `server.all` when the box is ticked.
  */
  const selectAllMatching = selection?.selectAll === "matching"
  const matchingSelectable = useMemo(
    () =>
      selectAllMatching && !table.server
        ? selectableIdsOf(matchedRows, matchedRows.map((row, index) => resolveRowId(row, index, getRowId)), selection?.isSelectable)
        : undefined,
    [selectAllMatching, table.server, matchedRows, getRowId, selection],
  )
  const headerScope = matchingSelectable ?? selectableIds
  const selectedInScope = headerScope.filter((id) => table.selection.has(id)).length
  const selectedOnPage = selectedInScope
  const allSelected =
    selectAllMatching && table.server
      ? selectableIds.length > 0 && selectableIds.every((id) => table.selection.has(id)) && state.selection.length >= total
      : headerScope.length > 0 && selectedInScope === headerScope.length
  const [fetchingAll, setFetchingAll] = useState(false)

  const toggleAll = () => {
    if (allSelected) {
      update((current) => (selectAllMatching ? clearSelection(current) : setSelected(current, selectableIds, false)))
      return
    }
    if (!selectAllMatching || !table.server) {
      update((current) => setSelected(current, headerScope, true))
      return
    }

    // Every matching row lives on the server; ask for them.
    const all = serverSource?.all
    if (!all) {
      warnAboutServerSelectAll()
      update((current) => setSelected(current, selectableIds, true))
      return
    }
    setFetchingAll(true)
    void Promise.resolve(all(latestState.current))
      .then((everyRow) => {
        const ids = selectableIdsOf(everyRow, everyRow.map((row, index) => resolveRowId(row, index, getRowId)), selection?.isSelectable)
        update((current) => setSelected(current, ids, true))
      })
      .finally(() => setFetchingAll(false))
  }

  /*
    A range built by the keyboard or by a sweep of the pointer: the rows
    between an anchor and wherever the gesture has reached, on top of what was
    selected when it began. Recomputed from that each time, so going back gives
    rows up.
  */
  const range = useRef<{ anchor: string; base: string[] } | undefined>(undefined)

  const extendRange = (target: string, start: string, extend: boolean) => {
    if (!range.current) {
      const anchor = extend ? (lastToggled.current ?? start) : start
      range.current = { anchor, base: extend ? [...latestState.current.selection] : [] }
    }
    const { anchor, base } = range.current
    lastToggled.current = anchor
    update((current) => ({ ...current, selection: rangeSelection(base, selectableIds, anchor, target) }))
  }

  /* A press on a row that moves becomes a sweep that selects every row it crosses. */
  const onBodyPointerDown = (event: React.PointerEvent<HTMLTableSectionElement>) => {
    if (!selection?.dragSelect || selection.mode !== "multiple" || event.button !== 0) return
    const target = event.target
    if (!(target instanceof Element)) return
    const tr = target.closest<HTMLElement>("tr[data-row-id]")
    if (!tr || isInteractiveTarget(target, tr) || target.closest('[data-editing="true"]')) return
    const start = tr.dataset["rowId"] ?? ""
    if (!selectableIds.includes(start)) return
    const extend = event.shiftKey
    // Held now: React empties the event's `currentTarget` once this handler returns.
    const tbody = event.currentTarget

    range.current = undefined
    startDragSelect({
      event: event.nativeEvent,
      row: tr,
      rowFor: (element) => {
        const over = element.closest<HTMLElement>("tr[data-row-id]")
        return over && tbody.contains(over) && selectableIds.includes(over.dataset["rowId"] ?? "") ? over : undefined
      },
      onSweep: (_, to) => extendRange(to.dataset["rowId"] ?? start, start, extend),
    })
  }

  /*
    Keys that belong to the selection, whether or not the keyboard moves
    between cells: Shift with an arrow extends it a row at a time from the
    row the keyboard is on, and Escape clears it.
  */
  const onSelectionKeyDown = (event: React.KeyboardEvent<HTMLTableElement>): boolean => {
    if (!selection || event.defaultPrevented) return false
    const target = event.target
    if (!(target instanceof HTMLElement)) return false
    const tr = target.closest<HTMLElement>("tr[data-row-id]")
    if (!tr || tr.closest("thead, tbody[data-pinned], .tpz-detail-row")) return false
    // Only from a cell, or the row's own checkbox — never from inside an editor or a control of the caller's.
    const onCell = target.tagName === "TD" || target.matches("input.tpz-checkbox")
    if (!onCell) return false

    if (event.key === "Escape" && latestState.current.selection.length > 0) {
      event.preventDefault()
      range.current = undefined
      update((current) => clearSelection(current))
      return true
    }

    if (event.shiftKey && !event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && selection.mode === "multiple") {
      const id = tr.dataset["rowId"] ?? ""
      const at = rowIds.indexOf(id)
      const next = rowIds[at + (event.key === "ArrowDown" ? 1 : -1)]
      event.preventDefault()
      if (next === undefined) return true
      if (!range.current) range.current = { anchor: id, base: [...latestState.current.selection] }
      extendRange(next, id, false)

      // The keyboard goes with the range: to the same column of the next row, or its checkbox.
      const key = target.tagName === "TD" ? target.dataset["key"] : "__select"
      const cell = key === undefined ? undefined : cellElement(next, key)
      const focusable = target.tagName === "TD" ? cell : cell?.querySelector<HTMLElement>("input.tpz-checkbox")
      focusable?.focus({ preventScroll: true })
      focusable?.scrollIntoView?.({ block: "nearest" })
      return true
    }

    // Anything else ends a keyboard range: the next Shift+arrow starts a new one.
    if (event.key !== "Shift") range.current = undefined
    return false
  }

  const onTableKeyDown = (event: React.KeyboardEvent<HTMLTableElement>) => {
    if (onSelectionKeyDown(event)) return
    if (navigable) onGridKeyDown(event)
  }

  // Shift-click selects a range, which is the one selection gesture people
  // expect from a table and almost never get.
  const lastToggled = useRef<string | undefined>(undefined)

  /*
    Read through a ref so the handler itself never changes identity. It needs
    the current ids and the current `update`, and both of those change whenever
    a page is appended or the caller passes an inline `onStateChange` — which
    would hand every memoised row a new prop and undo the memo. An event
    handler is exactly the thing that can be read late instead: it runs on a
    click, long after the render that would have rebuilt it.
  */
  const handlers = useRef({ selectableIds, mode: selection?.mode, update })
  handlers.current = { selectableIds, mode: selection?.mode, update }

  const toggleRow = useCallback((id: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const { selectableIds: ids, mode, update: apply } = handlers.current
    // React's change event does not carry the modifier keys; the click
    // underneath it does.
    const native = event.nativeEvent
    const shift = "shiftKey" in native && native.shiftKey === true
    const anchor = lastToggled.current

    if (shift && anchor && mode !== "single") {
      // The range runs over the selectable rows only, so a disabled row
      // between two chosen ones is stepped over rather than swept up.
      apply((current) => selectRange(current, ids, anchor, id, !current.selection.includes(id)))
      return
    }

    lastToggled.current = id
    apply((current) => toggleSelection(current, id, mode === "single"))
  }, [])

  /* ── Cell navigation ───────────────────────────────────────────────────── */

  // Editing needs the keyboard to reach cells, so editable columns switch it on unless told otherwise.
  const editable = useMemo(() => hasEditableColumns(columns), [columns])
  const navigable = props.cellNavigation ?? editable

  /*
    The grid the keyboard moves across: every row a person can land on, and
    every column including the table's own. The entry cell is the one in the
    tab order — the active cell when it is on screen, the first cell otherwise.
  */
  const navColumns = useMemo(
    () => [...(reorder ? ["__drag"] : []), ...(selection ? ["__select"] : []), ...(detail ? ["__expand"] : []), ...visibleKeys],
    [reorder, selection, detail, visibleKeys],
  )
  /* Pinned rows, with ids that cannot collide with the data's fallbacks. */
  const pinnedTop = useMemo(
    () => (props.pinnedRows?.top ?? []).map((row, index) => ({ row, id: pinnedRowId(row, index, "top", getRowId) })),
    [props.pinnedRows?.top, getRowId],
  )
  const pinnedBottom = useMemo(
    () => (props.pinnedRows?.bottom ?? []).map((row, index) => ({ row, id: pinnedRowId(row, index, "bottom", getRowId) })),
    [props.pinnedRows?.bottom, getRowId],
  )

  // The pinned rows are rows to the keyboard: up from the body's first row reaches the last one above it.
  const gridRows = useMemo(
    () => [...pinnedTop.map((entry) => entry.id), ...rowIds, ...pinnedBottom.map((entry) => entry.id)],
    [pinnedTop, rowIds, pinnedBottom],
  )
  const grid = useMemo(() => ({ rows: gridRows, columns: navColumns }), [gridRows, navColumns])
  const entry = navigable ? entryCell(grid, state.focus) : undefined
  const tableRef = useRef<HTMLTableElement | null>(null)

  /** The `<td>` for a cell, found by attribute so a key with a dot or a quote in it is no trouble. */
  const cellElement = useCallback((rowId: string, key: string | undefined): HTMLElement | undefined => {
    const table = tableRef.current
    if (!table) return undefined
    const row = [...table.querySelectorAll<HTMLElement>("tr[data-row-id]")].find((tr) => tr.dataset["rowId"] === rowId)
    if (!row) return undefined
    if (key === undefined) return row
    return [...row.children].find(
      (cell): cell is HTMLElement => cell instanceof HTMLElement && cell.dataset["key"] === key,
    )
  }, [])

  /*
    A cell taking the focus — by click, by Tab, by an arrow key below — makes
    it the active one. The state follows the focus rather than the other way
    round, so the browser's own focus handling is never second-guessed.
  */
  const onGridFocus = (event: React.FocusEvent<HTMLTableElement>) => {
    if (!navigable) return
    const cell = event.target
    if (!(cell instanceof HTMLElement) || cell.tagName !== "TD" || !cell.hasAttribute("tabindex")) return
    const rowId = cell.parentElement?.dataset["rowId"]
    const key = cell.dataset["key"]
    if (rowId === undefined || key === undefined) return
    if (focusCell(latestState.current, rowId, key) === latestState.current) return
    update((current) => focusCell(current, rowId, key))
  }

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLTableElement>) => {
    if (!navigable || event.defaultPrevented) return
    const target = event.target
    if (!(target instanceof HTMLElement)) return

    const cell = target.closest<HTMLElement>("td[tabindex]")
    if (!cell || !tableRef.current?.contains(cell)) return

    // From a control inside a cell, Escape goes back to the cell.
    if (cell !== target) {
      if (event.key === "Escape") {
        event.preventDefault()
        cell.focus()
      }
      return
    }

    const rowId = cell.parentElement?.dataset["rowId"]
    const key = cell.dataset["key"]
    if (rowId === undefined || key === undefined) return

    // An editable cell opens its editor on Enter or F2, and on typing — seeded with what was typed.
    if (editable && cell.dataset["editable"] === "true") {
      const typed = typedCharacter(event)
      const seed =
        event.key === "Enter" || event.key === "F2"
          ? null
          : event.key === "Backspace" || event.key === "Delete"
            ? ""
            : typed
      if (seed !== undefined) {
        event.preventDefault()
        startEdit(rowId, key, seed ?? undefined)
        return
      }
    }

    // Alt with an arrow moves the row, from any of its cells.
    if (reorder && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault()
      onHandleStep(rowId, event.key === "ArrowUp" ? -1 : 1)
      return
    }

    if (isNavigationKey(event.key) && !event.altKey && !event.shiftKey) {
      const next = nextCell(grid, { rowId, key }, event.key, {
        ctrlKey: event.ctrlKey || event.metaKey,
        pageRows: pageRowsFrom(cell),
        rtl: getComputedStyle(cell).direction === "rtl",
      })
      event.preventDefault()
      if (!next) return
      const element = cellElement(next.rowId, next.key)
      element?.focus({ preventScroll: true })
      element?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
      return
    }

    if (event.key === "Enter" || event.key === "F2" || event.key === " ") {
      // The table's own columns are worked from their cell, as a checkbox and a button would be.
      const own = cell.querySelector<HTMLElement>("input.tpz-checkbox, button.tpz-expander")
      if ((key === "__select" || key === "__expand") && own) {
        event.preventDefault()
        own.click()
        return
      }

      // Anywhere else Enter goes into the cell's link or button, and Escape comes back out.
      if (event.key !== " ") {
        const control = cell.querySelector<HTMLElement>(INTERACTIVE_SELECTOR)
        if (control) {
          event.preventDefault()
          control.focus()
        }
      }
    }
  }

  /*
    The active cell set from outside — `focusCell` from a link in a banner —
    is scrolled to and, when the cells can take the focus, focused. Compared
    by what it says rather than by identity, so a parent that hands over a new
    object with the same cell on every render does not keep moving the page.
    On the first render nothing is focused: the page has only just arrived,
    and taking the focus away from wherever the browser put it would be rude.
  */
  const focusSignature = state.focus ? JSON.stringify([state.focus.rowId, state.focus.key ?? null, state.focus.align ?? null]) : ""
  const appliedFocus = useRef<string | undefined>(undefined)

  useLayoutEffect(() => {
    const first = appliedFocus.current === undefined
    if (!first && appliedFocus.current === focusSignature) return
    appliedFocus.current = focusSignature

    const focus: CellFocus | null | undefined = latestState.current.focus
    if (!focus) return

    const target = navigable ? (entry && entry.rowId === focus.rowId ? cellElement(entry.rowId, entry.key) : undefined) : cellElement(focus.rowId, undefined)
    if (!target) return

    // Already there — or inside it, in the editor that cell has just opened.
    if (!target.contains(target.ownerDocument.activeElement)) {
      target.scrollIntoView?.({ block: focus.align ?? "nearest", inline: "nearest" })
      if (!first && navigable) target.focus({ preventScroll: true })
    }
  }, [focusSignature, navigable, entry, cellElement])

  /* ── Editing ───────────────────────────────────────────────────────────── */

  /*
    Which cell is open, why its last commit was refused, and the edits still
    being saved or that failed. All of it is this table's own business, never
    the caller's state: an editor is open only in a browser, after a person
    opened it, so a server renders none.
  */
  const [editing, setEditing] = useState<{ rowId: string; key: string; seed?: string } | undefined>()
  const [editError, setEditError] = useState<string | undefined>()
  const [edits, setEdits] = useState<Record<string, { pending: Record<string, unknown>; failed: Record<string, string> }>>({})
  const refocus = useRef<{ rowId: string; key: string } | undefined>(undefined)
  const editingRef = useRef(editing)
  editingRef.current = editing
  const cellEditRef = useRef(props.onCellEdit)
  cellEditRef.current = props.onCellEdit

  if (editable && !props.onCellEdit) warnAboutEditing()

  const rowsById = useMemo(() => {
    const map = new Map(rows.map((row, index) => [rowIds[index]!, row]))
    for (const entry of [...pinnedTop, ...pinnedBottom]) map.set(entry.id, entry.row)
    return map
  }, [rows, rowIds, pinnedTop, pinnedBottom])
  const pinnedSide = useMemo(
    () =>
      new Map<string, "top" | "bottom">([
        ...pinnedTop.map((entry) => [entry.id, "top"] as const),
        ...pinnedBottom.map((entry) => [entry.id, "bottom"] as const),
      ]),
    [pinnedTop, pinnedBottom],
  )
  const columnsByKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns])

  /** Puts a cell into editing, if it can be edited. */
  const startEdit = (rowId: string, key: string, seed?: string): boolean => {
    const row = rowsById.get(rowId)
    const column = columnsByKey.get(key)
    if (!row || !column || !isCellEditable(column, row) || editorKind(column, types) === "none") return false

    setEditError(undefined)
    setEdits((current) => withoutEdit(current, rowId, key, "failed"))
    setEditing({ rowId, key, seed })
    return true
  }

  const cancelEdit = () => {
    const current = editingRef.current
    if (!current) return
    refocus.current = { rowId: current.rowId, key: current.key }
    setEditing(undefined)
    setEditError(undefined)
  }

  /** The next editable cell after this one, or before it, in reading order across the page. */
  const nextEditable = (rowId: string, key: string, backwards: boolean) => {
    const cells: Array<{ rowId: string; key: string }> = []
    for (const id of gridRows) for (const column of columns) cells.push({ rowId: id, key: column.key })
    if (backwards) cells.reverse()

    const from = cells.findIndex((cell) => cell.rowId === rowId && cell.key === key)
    return cells.slice(from + 1).find((cell) => {
      const row = rowsById.get(cell.rowId)
      const column = columnsByKey.get(cell.key)
      return row !== undefined && column !== undefined && isCellEditable(column, row) && editorKind(column, types) !== "none"
    })
  }

  const finishEdit = (input: { text: string } | { value: unknown }, reason: CommitReason) => {
    const current = editingRef.current
    if (!current) return
    const row = rowsById.get(current.rowId)
    const column = columnsByKey.get(current.key)
    if (!row || !column) {
      setEditing(undefined)
      return
    }

    const previous = column.accessor(row)
    let value = "text" in input ? fromEditorText(input.text, editorKind(column, types), column, previous, format) : input.value
    if (column.parse) value = column.parse(value, row)

    // Refused: the editor stays open, marked, with the reason beside it. Leaving
    // the cell is the one way out that does not keep it, and it changes nothing.
    const error = validateEdit(column, value, row)
    if (error !== undefined) {
      if (reason === "blur") {
        setEditing(undefined)
        setEditError(undefined)
      } else {
        setEditError(error)
      }
      return
    }

    setEditing(undefined)
    setEditError(undefined)
    if (reason !== "blur") refocus.current = { rowId: current.rowId, key: current.key }

    if (!editValuesEqual(value, previous)) {
      const { rowId, key } = current
      const pinned = pinnedSide.get(rowId)
      const result = cellEditRef.current?.({ rowId, row, key, value, previousValue: previous, ...(pinned ? { pinned } : {}) })
      if (isPromiseLike(result)) {
        setEdits((all) => withEdit(all, rowId, key, "pending", value))
        result.then(
          () => setEdits((all) => withoutEdit(all, rowId, key, "pending")),
          (failure: unknown) =>
            setEdits((all) =>
              withEdit(withoutEdit(all, rowId, key, "pending"), rowId, key, "failed", failure instanceof Error && failure.message ? failure.message : "Could not save"),
            ),
        )
      }
    }

    // Tab carries on editing in the next editable cell, as a spreadsheet does.
    if (reason === "tab" || reason === "shift-tab") {
      const next = nextEditable(current.rowId, current.key, reason === "shift-tab")
      if (next && startEdit(next.rowId, next.key)) {
        refocus.current = undefined
        update((state) => focusCell(state, next.rowId, next.key))
      }
    }
  }

  // Back to the cell once its editor has gone, when the keyboard closed it.
  useLayoutEffect(() => {
    if (editing || !refocus.current) return
    const target = refocus.current
    refocus.current = undefined
    cellElement(target.rowId, target.key)?.focus({ preventScroll: true })
  }, [editing, cellElement])

  const onEditPointer = (event: React.MouseEvent<HTMLTableElement>) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const cell = target.closest<HTMLElement>('td[data-editable="true"]')
    if (!cell || !tableRef.current?.contains(cell) || cell.dataset["editing"] === "true") return
    if (isInteractiveTarget(target, cell)) return
    const rowId = cell.parentElement?.dataset["rowId"]
    const key = cell.dataset["key"]
    if (rowId !== undefined && key !== undefined) startEdit(rowId, key)
  }

  /** Draws the editor into the cell being edited. */
  const renderEditorFor = (row: TRow, rowId: string) => (column: (typeof columns)[number]) => (
    <CellEditor
      column={column}
      row={row}
      rowId={rowId}
      value={column.accessor(row)}
      seed={editing?.seed}
      kind={editorKind(column, types)}
      format={format}
      error={editError}
      onCommit={finishEdit}
      onCancel={cancelEdit}
    />
  )

  /* ── Moving rows ───────────────────────────────────────────────────────── */

  const reorderable = reorder !== undefined && canReorderRows(state.sort)
  const [announcement, setAnnouncement] = useState("")
  const refocusHandle = useRef<string | undefined>(undefined)

  /*
    The rows a row moves among: its siblings. For a row on its own or a
    parent, every top-level row that matches — the whole list, not only this
    page, so a row dropped at the top of page two comes after the last row of
    page one. For a child, the other children of its parent. In server mode
    the page is all there is.
  */
  const dataIds = useMemo(() => new Set(data.map((row, index) => resolveRowId(row, index, getRowId))), [data, getRowId])
  const parentOf = useCallback(
    (row: TRow): string | undefined => {
      const parent = props.getParentId?.(row)
      return parent !== null && parent !== undefined && parent !== "" && dataIds.has(String(parent)) ? String(parent) : undefined
    },
    [props.getParentId, dataIds],
  )

  const siblingsOf = (rowId: string): { ids: string[]; parentId: string | undefined } => {
    const row = rowsById.get(rowId)
    const parentId = row === undefined ? undefined : parentOf(row)
    const pool = table.server ? rows : matchedRows
    const ids: string[] = []
    pool.forEach((candidate, index) => {
      if (parentOf(candidate) === parentId) ids.push(resolveRowId(candidate, index, getRowId))
    })
    return { ids, parentId }
  }

  const reportMove = (rowId: string, result: { afterId: string | null; beforeId: string | null; order: string[] }, parentId: string | undefined) => {
    const row = rowsById.get(rowId)
    if (!row || !reorder) return
    const move: RowMove<TRow> = { rowId, row, afterId: result.afterId, beforeId: result.beforeId, ...(parentId ? { parentId } : {}) }
    setAnnouncement(`Moved to position ${String(result.order.indexOf(rowId) + 1)} of ${String(result.order.length)}`)

    const outcome = reorder.onReorder(move)
    if (isPromiseLike(outcome)) {
      const made = { data, move }
      setPendingMove(made)
      const settle = () => setPendingMove((current) => (current === made ? undefined : current))
      outcome.then(settle, () => {
        settle()
        setAnnouncement("The move was not saved")
      })
    }
  }

  const reorderRef = useRef({ siblingsOf, reportMove, reorderable, rowsById })
  reorderRef.current = { siblingsOf, reportMove, reorderable, rowsById }

  const onHandleDown = useCallback((id: string, event: React.PointerEvent<HTMLElement>) => {
    const tr = event.currentTarget.closest<HTMLElement>("tr")
    if (!tr || !reorderRef.current.reorderable) return
    const { ids, parentId } = reorderRef.current.siblingsOf(id)
    const draggedIsChild = parentId !== undefined

    startRowDrag({
      event: event.nativeEvent,
      row: tr,
      targetFor: (element) => {
        const over = element.closest<HTMLElement>("tr[data-row-id]")
        if (!over || over.closest("tbody[data-pinned]") || !tr.parentElement?.contains(over)) return undefined
        // A parent is dropped beside a parent: a child row it passes over stands for its own parent.
        const overId = over.dataset["rowId"] ?? ""
        if (ids.includes(overId)) return over
        if (!draggedIsChild && over.dataset["depth"] === "1") {
          let previous = over.previousElementSibling
          while (previous && (previous as HTMLElement).dataset["depth"] === "1") previous = previous.previousElementSibling
          return previous instanceof HTMLElement && ids.includes(previous.dataset["rowId"] ?? "") ? previous : undefined
        }
        return undefined
      },
      onDrop: (target, position) => {
        const result = moveRowTo(ids, id, target.dataset["rowId"] ?? "", position)
        if (result) reorderRef.current.reportMove(id, result, parentId)
      },
    })
  }, [])

  const onHandleStep = useCallback((id: string, delta: -1 | 1) => {
    if (!reorderRef.current.reorderable) return
    const { ids, parentId } = reorderRef.current.siblingsOf(id)
    const result = stepRow(ids, id, delta)
    if (!result) return
    refocusHandle.current = id
    reorderRef.current.reportMove(id, result, parentId)
  }, [])

  // The keyboard stays on the row it moved.
  useLayoutEffect(() => {
    const id = refocusHandle.current
    if (id === undefined) return
    refocusHandle.current = undefined
    const handle = cellElement(id, "__drag")?.querySelector<HTMLElement>(".tpz-drag-handle")
    if (handle) handle.focus()
    else cellElement(id, "__drag")?.focus()
  })

  /* ── Pinned rows ───────────────────────────────────────────────────────── */

  /*
    How far each pinned row sits from its edge. The server, and the first
    paint, count one row height per row in between; once the table is in a
    browser the real heights are measured, so rows that wrap still stack
    without overlapping — the same way frozen columns get their offsets.
  */
  const [pinnedPx, setPinnedPx] = useState<Record<string, string>>({})

  useLayoutEffect(() => {
    const table = tableRef.current
    if (!table) return
    const next: Record<string, string> = {}
    for (const side of ["top", "bottom"] as const) {
      const body = table.querySelector<HTMLElement>(`tbody[data-pinned="${side}"]`)
      if (!body) continue
      const rowsHere = [...body.querySelectorAll<HTMLElement>("tr[data-row-id]")]
      if (side === "bottom") rowsHere.reverse()
      let offset = 0
      for (const tr of rowsHere) {
        next[`${side}:${tr.dataset["rowId"] ?? ""}`] = `${String(offset)}px`
        offset += tr.getBoundingClientRect().height
      }
    }
    setPinnedPx((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
  }, [pinnedTop, pinnedBottom, columns, state.widths, state.density, rowHeight])

  /** One pinned body, drawn through the same rows as the data. */
  const pinnedBody = (side: "top" | "bottom", entries: Array<{ row: TRow; id: string }>) =>
    entries.length > 0 && (
      <tbody className={classes("tbody", "tpz-pinned-body")} data-pinned={side}>
        {entries.map(({ row, id }, index) => (
          <Row
            key={id}
            row={row}
            id={id}
            rowIndex={index}
            columns={columns}
            types={types}
            format={format}
            classes={classes}
            className={rowClassName?.(row, index)}
            selected={false}
            selectionMode={selection?.mode}
            selectable={false}
            pinOffsets={pinOffsets}
            pinEdges={pinEdges}
            fit={rowHeightMode === "exact"}
            onToggle={toggleRow}
            onContextMenu={props.onRowContextMenu ? handleContextMenu : undefined}
            linkComponent={Link}
            expander={detail ? { expandable: false, expanded: false, detailId: "" } : undefined}
            activeKey={entry ? (entry.rowId === id ? entry.key : "") : undefined}
            focused={state.focus?.rowId === id}
            editable={editable}
            editingKey={editing?.rowId === id ? editing.key : undefined}
            renderEditor={editing?.rowId === id ? renderEditorFor(row, id) : undefined}
            edits={edits[id]}
            pinned={side}
            pinnedOffset={pinnedPx[`${side}:${id}`] ?? pinnedOffset(index, entries.length, side)}
            handle={reorder ? handleOf(false, true) : undefined}
          />
        ))}
      </tbody>
    )

  /* ── Detail rows ───────────────────────────────────────────────────────── */

  const expandableIds = useMemo(() => expandableIdsOf(rows, rowIds, detail), [rows, rowIds, detail])
  const openOnPage = expandableIds.filter((id) => (state.expanded ?? []).includes(id)).length
  const allOpen = expandableIds.length > 0 && openOnPage === expandableIds.length

  /*
    Details that have been open at least once, for `keepMounted`: a closed one
    stays in the document only if there was ever something in it to keep.
    Rendering every row's detail hidden from the start would mount, and fetch
    for, a thousand details nobody has opened.
  */
  const mountedDetails = useRef(new Set<string>())

  // Read through `handlers` like the selection toggle, so every row is handed
  // the same function for the life of the table.
  const toggleDetail = useCallback((id: string) => {
    handlers.current.update((current) => toggleExpanded(current, id))
  }, [])
  const collapseDetail = useCallback((id: string) => {
    handlers.current.update((current) => setExpanded(current, [id], false))
  }, [])

  /* ── Child rows ────────────────────────────────────────────────────────── */

  const toggleChildren = useCallback((id: string) => {
    handlers.current.update((current) => toggleCollapsed(current, id))
  }, [])
  const folded = useMemo(() => new Set(state.collapsed ?? []), [state.collapsed])
  // With cell navigation a table of parents and children is a tree grid, whose rows say their level.
  const treegrid = navigable && rowInfo !== undefined

  /*
    Same trick for the caller's row click: it is nearly always written inline
    at the call site, and a fresh function every render would be enough on its
    own to re-render every row in the table.
  */
  const clickRef = useRef(onRowClick)
  clickRef.current = onRowClick

  const handleRowClick = useCallback((row: TRow, event: React.MouseEvent) => {
    clickRef.current?.(row, event)
  }, [])

  /*
    A context menu on a row hands over the row and the cell under the pointer,
    read from the cell's key — the column, and the text it shows — so nobody
    has to search the DOM for them. Read through a ref like the row click, for
    the same reason.
  */
  const contextMenuRef = useRef({ handler: props.onRowContextMenu, columns, types, format })
  contextMenuRef.current = { handler: props.onRowContextMenu, columns, types, format }

  const handleContextMenu = useCallback((row: TRow, id: string, event: React.MouseEvent<HTMLTableRowElement>) => {
    const { handler, columns: shown, types: registry, format: formatting } = contextMenuRef.current
    if (!handler) return
    const cell = event.target instanceof Element ? event.target.closest<HTMLElement>("td[data-key]") : null
    const key = cell && event.currentTarget.contains(cell) ? cell.dataset["key"] : undefined
    const column = shown.find((entry) => entry.key === key)
    const pinned = event.currentTarget.dataset["pinned"]
    handler(row, event, {
      rowId: id,
      columnKey: column ? column.key : null,
      column,
      text: column ? cellDisplayText(row, column, { types: registry, format: formatting, rowId: id }) : null,
      ...(pinned === "top" || pinned === "bottom" ? { pinned } : {}),
    })
  }, [])

  /*
    Reported in an effect rather than from the handler: the selection can also
    change from outside — a controlled state, a cleared view, a URL — and a
    caller listening for it should hear about all of them, not only the clicks.
  */
  const reported = useRef<string>("")
  useEffect(() => {
    if (!selection?.onChange) return
    const key = state.selection.join(",")
    if (key === reported.current) return
    reported.current = key

    const byId = new Map(rows.map((row, index) => [rowIds[index]!, row]))
    selection.onChange(
      state.selection,
      state.selection.map((id) => byId.get(id)).filter((row): row is TRow => row !== undefined),
    )
  }, [state.selection, rows, rowIds, selection])

  /*
    With a search box over a large table of its own data, every row's search
    text is built while the browser is idle, so the first keystroke costs what
    every later one does. Nothing happens on a server, and nothing at all for a
    table without a search box.
  */
  const searching = search !== undefined && !table.server
  useEffect(() => (searching ? warmSearchWhenIdle(displayData, columns, types, format) : undefined), [
    searching,
    displayData,
    columns,
    types,
    format,
  ])

  /* ── Export ────────────────────────────────────────────────────────────── */

  const exportOptions = props.export === true ? {} : props.export || undefined

  /*
    Everything the filters and the search leave, not the page on screen. An
    export that hands back twenty-five of four hundred rows is not an export,
    and it is the sort of thing nobody notices until a spreadsheet is wrong.
  */
  const exportRows = exportOptions?.scope === "page" ? rows : matchedRows

  // Only worth saying when the caller has given it no way to do better.
  if (
    exportOptions &&
    props.server &&
    !exportOptions.fetchRows &&
    !exportOptions.onExport &&
    !serverSource?.all
  ) {
    warnAboutServerExport()
  }

  const exportControl = exportOptions
    ? {
        onDownload: () => {
          void (async () => {
            /*
              A selection wins over everything matched, for the file as for
              the clipboard. The selected rows are usually on hand; only when
              some are not — a server-side table whose selection spans pages —
              or when nothing is selected and the caller can see more than
              this page, are the caller's rows asked for.
            */
            const fetchRows = exportOptions.fetchRows ?? serverSource?.all
            const onHand = rowsToExport(exportRows, state.selection, getRowId)
            const rows =
              fetchRows && !onHand.complete
                ? rowsToExport(await fetchRows(state), state.selection, getRowId).rows
                : onHand.rows

            if (exportOptions.onExport) {
              exportOptions.onExport(state, rows)
              return
            }

            downloadText(
              toCsv(rows, { columns, types, format, getRowId }),
              `${exportOptions.filename ?? "table"}.csv`,
            )
          })()
        },
        onCopy:
          exportOptions.clipboard === false
            ? undefined
            : () => {
                // The selection when there is one, and only what is on hand:
                // the clipboard has to be written inside the click, so there
                // is no room to fetch.
                const selected = rowsToExport(exportRows, state.selection, getRowId).rows

                void copyText(toDelimitedText(selected, { columns, types, format, delimiter: "\t", getRowId }))
              },
      }
    : undefined

  /* ── Render ────────────────────────────────────────────────────────────── */

  const showEmpty = rows.length === 0 && !loading && !error

  return (
    <TableContext.Provider value={{ theme, density: state.density }}>
    <div
      className={classes("root", className)}
      data-theme={theme}
      data-density={state.density}
      data-responsive={responsive}
      data-sticky-header={stickyHeader ? "true" : undefined}
      data-loading={loading ? "true" : undefined}
      data-dragging-out={draggingColumn ? "true" : undefined}
      data-row-height={rowHeightMode}
      style={rootStyle}
    >
      <div className={classes("frame")}>
        <Toolbar
          state={state}
          update={update}
          columns={columns}
          hiddenColumns={hiddenColumns}
          total={total}
          selectedCount={state.selection.length}
          search={search}
          columnControl={props.columnControl !== false}
          densityControl={props.densityControl === true}
          exportControl={exportControl}
          sortReset={resetControl}
          linkComponent={Link}
          onNavigate={onNavigate}
          extra={toolbar}
          className={classes("toolbar")}
          searchClassName={classes("search")}
        />

        <div className={classes("scroll")}>
          <table
            ref={tableRef}
            className={classes("table")}
            aria-label={props["aria-label"]}
            role={navigable ? (treegrid ? "treegrid" : "grid") : undefined}
            aria-readonly={navigable ? !editable : undefined}
            onKeyDown={navigable || selection ? onTableKeyDown : undefined}
            onFocus={navigable ? onGridFocus : undefined}
            onClick={editable && props.editTrigger === "click" ? onEditPointer : undefined}
            onDoubleClick={editable && props.editTrigger !== "click" ? onEditPointer : undefined}
          >
            {caption && <caption className="tpz-caption">{caption}</caption>}

            <thead className={classes("thead")} ref={headRef}>
              <tr className={classes("headerRow")}>
                {reorder && (
                  <th
                    scope="col"
                    className="tpz-th tpz-drag-cell"
                    data-pin="start"
                    data-key="__drag"
                    style={{ left: pinOffsets["__drag"] ?? 0 }}
                  >
                    <span className="tpz-sr">Move</span>
                  </th>
                )}

                {selection && (
                  <th
                    scope="col"
                    className="tpz-th tpz-select-cell"
                    data-pin="start"
                    data-key="__select"
                    style={{ left: pinOffsets["__select"] ?? 0 }}
                  >
                    {selection.mode === "multiple" && (
                      <input
                        type="checkbox"
                        className="tpz-checkbox"
                        checked={allSelected}
                        ref={(node) => {
                          if (node) node.indeterminate = selectedOnPage > 0 && !allSelected
                        }}
                        aria-label={
                          allSelected
                            ? "Clear selection"
                            : selectAllMatching
                              ? `Select all ${total.toLocaleString()} matching rows`
                              : "Select all rows on this page"
                        }
                        aria-busy={fetchingAll || undefined}
                        disabled={fetchingAll}
                        onChange={toggleAll}
                      />
                    )}
                  </th>
                )}

                {detail && (
                  <th
                    scope="col"
                    className="tpz-th tpz-expand-cell"
                    data-pin="start"
                    data-key="__expand"
                    style={{ left: pinOffsets["__expand"] ?? 0 }}
                  >
                    {expandableIds.length > 0 && (
                      <button
                        type="button"
                        className="tpz-expander"
                        aria-expanded={allOpen}
                        aria-label={allOpen ? "Hide details for every row on this page" : "Show details for every row on this page"}
                        onClick={() => update((current) => setExpanded(current, expandableIds, !allOpen))}
                      >
                        <Icon name="chevronRight" size={14} />
                      </button>
                    )}
                  </th>
                )}

                {columns.map((column) => (
                  <HeaderCell
                    key={column.key}
                    column={column}
                    state={state}
                    rows={data}
                    update={update}
                    visibleKeys={visibleKeys}
                    features={features}
                    buildHref={buildHref}
                    linkComponent={Link}
                    onNavigate={onNavigate}
                    pinOffset={pinOffsets[column.key]}
                    isPinEdge={isPinEdge(columns, column.key)}
                    theme={theme}
                    onDragStateChange={setDraggingColumn}
                    formatValue={formatValue(column)}
                    fetchOptions={column.filterOptions ? undefined : distinctFor?.(column.key)}
                    searchDebounce={headerSearchDebounce}
                    sortLevels={sortLevels}
                    navigate={navigate}
                    className={classes("headerCell", column.headerClassName)}
                    style={{ width: column.width, minWidth: column.minWidth, maxWidth: column.maxWidth }}
                  />
                ))}
              </tr>
            </thead>

            {pinnedBody("top", pinnedTop)}

            <tbody className={classes("tbody")} onPointerDown={selection?.dragSelect ? onBodyPointerDown : undefined}>
              {loading && rows.length === 0 && <SkeletonRows columns={columnCount} />}

              {error && (
                <tr>
                  <td colSpan={columnCount} className="tpz-td" data-wrap="true">
                    <div className={classes("empty")} data-tone="danger" role="alert">
                      <Icon name="warning" size={20} className="tpz-state-icon" />
                      {error}
                    </div>
                  </td>
                </tr>
              )}

              {showEmpty && (
                <tr>
                  <td colSpan={columnCount} className="tpz-td" data-wrap="true">
                    {emptyState ?? (
                      <div className={classes("empty")}>
                        <Icon name="empty" size={22} className="tpz-state-icon" />
                        {table.filtered ? "No rows match" : emptyMessage}
                      </div>
                    )}
                  </td>
                </tr>
              )}

              {rows.map((row, rowIndex) => {
                const id = rowIds[rowIndex]!
                const detailId = `${baseId}-detail-${encodeURIComponent(id)}`
                const expandable = detail ? (detail.canExpand ? detail.canExpand(row) : true) : false
                const open = isDetailOpen(state, row, id, detail)
                if (open) mountedDetails.current.add(id)
                const mountDetail = detail !== undefined && (open || (detail.keepMounted === true && mountedDetails.current.has(id)))

                /*
                  Resolved here rather than inside the row, so what the memo
                  compares is a string that changes when the class changes —
                  not the identity of a `rowClassName` written inline, which
                  changes every render and never means anything by it.
                */
                return (
                  <Fragment key={id}>
                  <Row
                    row={row}
                    id={id}
                    rowIndex={rowIndex}
                    columns={columns}
                    types={types}
                    format={format}
                    classes={classes}
                    className={rowClassName?.(row, rowIndex, rowInfo?.[rowIndex])}
                    href={rowHref?.(row)}
                    selected={table.selection.has(id)}
                    selectionMode={selection?.mode}
                    selectable={selection?.isSelectable ? selection.isSelectable(row, rowIndex) : true}
                    pinOffsets={pinOffsets}
                    pinEdges={pinEdges}
                    fit={rowHeightMode === "exact"}
                    onRowClick={onRowClick ? handleRowClick : undefined}
                    onContextMenu={props.onRowContextMenu ? handleContextMenu : undefined}
                    onToggle={toggleRow}
                    linkComponent={Link}
                    expander={detail ? { expandable, expanded: open, detailId } : undefined}
                    onToggleExpanded={detail ? toggleDetail : undefined}
                    toggleOnClick={detail?.toggleOnRowClick}
                    activeKey={entry ? (entry.rowId === id ? entry.key : "") : undefined}
                    focused={state.focus?.rowId === id}
                    editable={editable}
                    editingKey={editing?.rowId === id ? editing.key : undefined}
                    renderEditor={editing?.rowId === id ? renderEditorFor(row, id) : undefined}
                    edits={edits[id]}
                    tree={treeOf(rowInfo?.[rowIndex], folded.has(id))}
                    onToggleChildren={rowInfo ? toggleChildren : undefined}
                    treegrid={treegrid}
                    handle={reorder ? handleOf(reorder.canDrag ? reorder.canDrag(row) : true, !reorderable) : undefined}
                    onHandleDown={reorder ? onHandleDown : undefined}
                    onHandleStep={reorder ? onHandleStep : undefined}
                  />
                  {mountDetail && detail && (
                    <DetailRow
                      row={row}
                      id={id}
                      rowIndex={rowIndex}
                      detailId={detailId}
                      colSpan={columnCount}
                      open={open}
                      render={detail.render}
                      classes={classes}
                      onCollapse={collapseDetail}
                    />
                  )}
                  </Fragment>
                )
              })}

              {appendRow && (
                <tr className={classes("row")}>
                  <td colSpan={columnCount} className="tpz-td">
                    {appendRow}
                  </td>
                </tr>
              )}
            </tbody>

            {pinnedBody("bottom", pinnedBottom)}
          </table>

          {/*
            Inside the scroll area, after the last row — which is the only place
            a sentinel means "the user has reached the end".
          */}
          {pagination?.mode === "infinite" && (
            <InfiniteSentinel
              hasMore={state.page < table.pageCount}
              loading={loading}
              page={state.page}
              onMore={() => update((current) => ({ ...current, page: current.page + 1 }))}
            />
          )}
        </div>

        {footer && <div className={classes("footer")}>{footer}</div>}

        {reorder && (
          <div className="tpz-sr" role="status" aria-live="polite">
            {announcement}
          </div>
        )}

        {pagination && (
          <Pagination
            mode={pagination.mode}
            state={state}
            update={update}
            total={total}
            pageCount={table.pageCount}
            shown={rows.length}
            pageSizeOptions={pagination.pageSizeOptions}
            siblings={pagination.siblings}
            loading={loading}
            buildHref={buildHref}
            linkComponent={Link}
            onNavigate={onNavigate}
            className={classes("pagination")}
          />
        )}
      </div>
    </div>
    </TableContext.Provider>
  )
}

/*
  In server mode the table holds one page, so an export can only contain that
  page. It is the caller's data to fetch, and `onExport` is where they do it.
*/
let warnedAboutExport = false

function warnAboutServerExport(): void {
  if (warnedAboutExport) return
  if (typeof process !== "undefined" && process.env["NODE_ENV"] === "production") return

  warnedAboutExport = true
  console.warn(
    "[trapezium] Exporting in server mode can only include the rows the table has, which is one " +
      "page. Say where the rest come from — server={{ all: (state) => … }} — and the table will " +
      "write the file from whatever you fetch. See " +
      "https://github.com/Gregaly/trapezium/blob/main/docs/server-data.md#exporting",
  )
}

/**
 * A row's place in the tree, as the row is given it: primitives only, so a
 * memoised row is not re-rendered for an object that says nothing new.
 */
const TREE_CACHE = new Map<string, { depth: 0 | 1; childCount: number; context: boolean; folded: boolean }>()

function treeOf(
  info: { depth: 0 | 1; childCount: number; context: boolean } | undefined,
  folded: boolean,
): { depth: 0 | 1; childCount: number; context: boolean; folded: boolean } | undefined {
  if (!info) return undefined
  const key = `${String(info.depth)}|${String(info.childCount)}|${info.context ? 1 : 0}|${folded ? 1 : 0}`
  let tree = TREE_CACHE.get(key)
  if (!tree) {
    tree = { depth: info.depth, childCount: info.childCount, context: info.context, folded }
    TREE_CACHE.set(key, tree)
  }
  return tree
}

const HANDLE_ON = { draggable: true, disabled: false }
const HANDLE_OFF = { draggable: true, disabled: true }
const NO_HANDLE = { draggable: false, disabled: true }

/** A row's handle as one of three shared objects, so a memoised row sees the same one each render. */
function handleOf(draggable: boolean, disabled: boolean): { draggable: boolean; disabled: boolean } {
  if (!draggable) return NO_HANDLE
  return disabled ? HANDLE_OFF : HANDLE_ON
}

let warnedAboutSelectAll = false

/* "Select every matching row" with the rows on a server and no way to ask for them selects one page. */
function warnAboutServerSelectAll(): void {
  if (warnedAboutSelectAll) return
  if (typeof process !== "undefined" && process.env["NODE_ENV"] === "production") return
  warnedAboutSelectAll = true
  console.warn(
    "[trapezium] selection.selectAll is \"matching\" in server mode, but the table has no server.all to fetch " +
      "the matching rows from, so the header checkbox selected the page on screen. Pass server={{ all: (state) => … }}.",
  )
}

let warnedAboutEditing = false

/* An editable column with nowhere to send its edits edits nothing, which looks broken. */
function warnAboutEditing(): void {
  if (warnedAboutEditing) return
  if (typeof process !== "undefined" && process.env["NODE_ENV"] === "production") return
  warnedAboutEditing = true
  console.warn(
    "[trapezium] A column is `editable` but the table has no `onCellEdit`, so an edit has nowhere to go and " +
      "the cell will show its old value again. Handle onCellEdit and update your data with edit.value.",
  )
}

/** Whether a handler returned something to wait for. */
function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function"
}

type RowEdits = Record<string, { pending: Record<string, unknown>; failed: Record<string, string> }>

/** The edits with one cell's pending value or failure recorded. */
function withEdit(all: RowEdits, rowId: string, key: string, kind: "pending" | "failed", value: unknown): RowEdits {
  const row = all[rowId] ?? { pending: {}, failed: {} }
  const next =
    kind === "pending"
      ? { ...row, pending: { ...row.pending, [key]: value } }
      : { ...row, failed: { ...row.failed, [key]: String(value) } }
  return { ...all, [rowId]: next }
}

/** The edits without one cell's pending value or failure; the same object when there was none. */
function withoutEdit(all: RowEdits, rowId: string, key: string, kind: "pending" | "failed"): RowEdits {
  const row = all[rowId]
  if (!row || !Object.hasOwn(row[kind], key)) return all
  const rest = { ...row[kind] }
  delete rest[key]
  const next = { ...row, [kind]: rest }
  if (Object.keys(next.pending).length === 0 && Object.keys(next.failed).length === 0) {
    const without = { ...all }
    delete without[rowId]
    return without
  }
  return { ...all, [rowId]: next }
}

function SkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 5 }, (_, row) => (
        <tr key={row} className="tpz-tr" aria-hidden="true">
          {Array.from({ length: columns }, (_, cell) => (
            <td key={cell} className="tpz-td">
              <span className="tpz-skeleton" style={{ width: `${String(45 + ((row * 7 + cell * 13) % 40))}%` }} />
            </td>
          ))}
        </tr>
      ))}
      <tr className="tpz-sr">
        <td colSpan={columns} aria-live="polite">
          Loading rows
        </td>
      </tr>
    </>
  )
}

/** The last pinned column on each side gets the shadow that marks the frozen edge. */
function isPinEdge(columns: Array<{ key: string; pin?: "start" | "end" }>, key: string): boolean {
  const starts = columns.filter((column) => column.pin === "start")
  const ends = columns.filter((column) => column.pin === "end")
  return starts[starts.length - 1]?.key === key || ends[0]?.key === key
}

/**
 * How many rows Page Up and Page Down move: as many as the scroll area shows,
 * less one so the row the keyboard was on stays in sight. The page's own
 * height stands in when the table grows with the page rather than scrolling.
 */
function pageRowsFrom(cell: HTMLElement): number {
  const rowHeight = cell.getBoundingClientRect().height || 32
  const scroll = cell.closest<HTMLElement>(".tpz-scroll")
  const scrolls = scroll !== null && scroll.scrollHeight > scroll.clientHeight + 1
  const height = scrolls ? scroll.clientHeight : cell.ownerDocument.defaultView?.innerHeight ?? 0
  return Math.max(1, Math.floor(height / rowHeight) - 1)
}

function normaliseSearch(option: TableProps<AnyRow>["search"]): SearchOptions | undefined {
  if (!option) return undefined
  return option === true ? {} : option
}

function shallowEqualNumbers(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  return aKeys.every((key) => a[key] === b[key])
}
