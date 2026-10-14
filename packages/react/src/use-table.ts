import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  DEFAULT_FORMAT,
  DEFAULT_STATE,
  createPipelineCache,
  createTypeRegistry,
  defaultTypeRegistry,
  getRows,
  COLUMN_SAMPLE_SIZE,
  resolveColumns,
  resolveHeaderSearch,
  resolveRowId,
  type FormatContext,
  type PaginationOptions,
  type PartialTableState,
  type TableState,
  type AnyRow,
} from "@trapezium/core"

import type { TableColumn, TableProps } from "./types.js"

/**
 * The table, without any markup.
 *
 * `<Table>` is this hook plus a renderer, and both are exported: use the
 * component to get the whole thing, use the hook when you want Trapezium's
 * model and your own DOM.
 *
 * Everything here is computed during render — no effects, no timers, nothing
 * that only runs in a browser — which is what makes the first server-rendered
 * paint identical to what the client would produce.
 */
export function useTable<TRow extends AnyRow>(props: TableProps<TRow>) {
  const {
    data,
    columns: columnInput,
    state: controlled,
    defaultState,
    onStateChange,
    server = false,
    total,
    getRowId,
    types: customTypes,
    format: formatOverrides,
  } = props

  // Memoised: it is a dependency of the pipeline below, and a new object every
  // render would re-run it every render.
  const pagination = useMemo(() => normalisePagination(props.pagination), [props.pagination])

  /*
    An uncontrolled table still needs somewhere to keep state, and a controlled
    one still needs somewhere to keep the parts the caller did not control.
    Holding both here means the component never branches on which mode it is
    in — it reads `state` and calls `update`, and the difference is one merge.
  */
  const [internal, setInternal] = useState<TableState>(() => ({
    ...DEFAULT_STATE,
    ...(pagination ? { pageSize: pagination.pageSize } : {}),
    ...defaultState,
    ...controlled,
  }))

  const state: TableState = useMemo(
    () => ({ ...internal, ...controlled, ...(props.density ? { density: props.density } : {}) }),
    [internal, controlled, props.density],
  )

  /*
    A page size given as a prop is configuration, so a change to it is the
    caller changing their mind and the table follows — but only on a change,
    or every render would undo the user's own choice from the page-size picker.
    Adjusting state during render is React's own answer to this: the render is
    discarded and redone before anything is painted, so nobody sees the old size.
  */
  const seededPageSize = useRef(pagination?.pageSize)
  if (pagination && pagination.pageSize !== seededPageSize.current) {
    seededPageSize.current = pagination.pageSize
    setInternal((current) => ({ ...current, pageSize: pagination.pageSize, page: 1 }))
  }

  /*
    The latest state, readable synchronously from an event handler. Two
    controls changed in the same tick — a filter applied while a debounce was
    pending — would otherwise each build their next state from the render's
    stale snapshot, and the second would undo the first.
  */
  const latest = useRef(state)
  latest.current = state

  const update = useCallback(
    (next: TableState | ((current: TableState) => TableState)) => {
      const resolved = typeof next === "function" ? next(latest.current) : next
      latest.current = resolved
      setInternal(resolved)
      onStateChange?.(resolved)
    },
    [onStateChange],
  )

  /** Applies part of the state, leaving the rest alone. */
  const patch = useCallback(
    (partial: PartialTableState) => update((current) => ({ ...current, ...partial })),
    [update],
  )

  const types = useMemo(
    () => (customTypes ? createTypeRegistry(customTypes) : defaultTypeRegistry),
    [customTypes],
  )

  // Both halves are primitives, so an options object written inline at the
  // call site does not resolve the columns again on every render.
  const headerSearch = resolveHeaderSearch(props.headerSearch)

  const format: FormatContext = useMemo(
    () => ({ ...DEFAULT_FORMAT, ...formatOverrides }),
    [formatOverrides],
  )

  /*
    Only the first `COLUMN_SAMPLE_SIZE` rows can decide an inferred type, so
    once a table has that many, adding more cannot change a column. Holding the
    sample still past that point is what stops an appended page from resolving
    the columns again — see below for why that matters.
  */
  const sample = useRef<readonly TRow[]>([])
  const nextSample = data.slice(0, COLUMN_SAMPLE_SIZE)
  if (
    nextSample.length !== sample.current.length ||
    nextSample.some((row, index) => row !== sample.current[index])
  ) {
    sample.current = nextSample
  }
  const rowSample = sample.current

  /*
    Columns are resolved against the *arrangement* — order, hiding, pinning and
    widths — and nothing else the state holds. The dependencies say so, rather
    than naming the whole state object, because the page number lives in there
    too: depending on all of it meant a new `columns` array every time a page
    was appended, which handed every row on screen a changed prop and undid the
    memo that makes appending cheap. If `resolveColumns` ever starts reading
    more of the state than this, this list has to grow with it.
  */
  const { visible, hidden, all } = useMemo(
    () =>
      resolveColumns<TRow, React.ReactNode>({
        columns: columnInput,
        rows: rowSample,
        state,
        types,
        resizable: props.resizable,
        reorderable: props.reorderable,
        headerSearch: headerSearch.enabled,
        server: Boolean(server),
      }),
    [
      columnInput,
      rowSample,
      state.order,
      state.hidden,
      state.pinned,
      state.widths,
      types,
      props.resizable,
      props.reorderable,
      headerSearch.enabled,
      Boolean(server),
    ],
  )

  // Append modes keep every page loaded so far on screen rather than replacing
  // one with the next.
  const accumulate = pagination?.mode === "infinite" || pagination?.mode === "loadMore"

  /*
    A row made active from outside — `focusCell` from a banner's link — is
    brought onto the page it is on. Only when the active row changes: once it
    has been revealed, paging away from it must not drag the table back.
    The last row revealed is remembered in an effect rather than during
    render, so a render React throws away and redoes still reveals.
  */
  // What the pipeline worked out last time, so a page turn, a tick or a moved cursor costs nothing.
  const pipelineCache = useRef(createPipelineCache<TRow>())

  const focusRow = state.focus?.rowId
  const revealed = useRef<string | undefined>(undefined)
  const reveal = !server && focusRow !== undefined && focusRow !== revealed.current ? focusRow : undefined

  const result = useMemo(
    () =>
      getRows<TRow, React.ReactNode>({
        rows: data,
        columns: visible,
        state: pagination ? state : { ...state, pageSize: 0 },
        types,
        format,
        server: Boolean(server),
        serverDistinct: typeof server === "object" && Boolean(server.distinct),
        total,
        accumulate,
        reveal: pagination ? reveal : undefined,
        getRowId,
        getParentId: props.getParentId,
        cache: pipelineCache.current,
      }),
    [data, visible, state, types, format, server, total, accumulate, pagination, reveal, getRowId, props.getParentId],
  )

  /*
    When a row was revealed, the page on screen is its page, and everything
    that reads the state — the pagination, the header links, the next
    transition — has to say so. The state handed out says it from this render
    on, which is what a server renders; a layout effect then makes it the
    table's own and tells the caller, before anything is painted.
  */
  const viewState: TableState = pagination && result.page !== state.page ? { ...state, page: result.page } : state
  latest.current = viewState

  useLayoutEffect(() => {
    revealed.current = focusRow
    if (viewState !== state) update(viewState)
  }, [focusRow, viewState, state, update])

  const rowIds = useMemo(
    () => result.rows.map((row, index) => resolveRowId(row, index, getRowId)),
    [result.rows, getRowId],
  )

  const selection = useMemo(() => new Set(state.selection), [state.selection])

  return {
    /** The rows to render, after everything has been applied. */
    rows: result.rows,
    /**
     * Every row matching the filters and the search, before pagination — what
     * an export means by "what I am looking at".
     */
    matchedRows: result.matched,
    /** Ids for those rows, in the same order. */
    rowIds,
    /** With child rows, where each of those rows sits — depth, parent, children. */
    rowInfo: result.info,
    /** Matching rows across every page. */
    total: result.total,
    /** The page on screen — `state.page`, or the page a revealed row is on. */
    page: viewState.page,
    pageCount: result.pageCount,
    /** True when filters or search are hiding rows that exist. */
    filtered: result.filtered,

    columns: visible as TableColumn<TRow>[],
    hiddenColumns: hidden as TableColumn<TRow>[],
    allColumns: all as TableColumn<TRow>[],

    state: viewState,
    update,
    patch,
    types,
    format,
    pagination,
    selection,
    /** How long a header search waits after a keystroke, in milliseconds. */
    headerSearchDebounce: headerSearch.debounce,
    server: Boolean(server),
    /** Where the answers a server-side table cannot work out come from. */
    serverSource: typeof server === "object" ? server : undefined,
  }
}

export type TableInstance<TRow extends AnyRow = AnyRow> = ReturnType<typeof useTable<TRow>>

/** `true` means numbered pages of 25; `false` means every row on one page. */
export function normalisePagination(
  option: TableProps<AnyRow>["pagination"],
): Required<Omit<PaginationOptions, "pageSizeOptions">> & { pageSizeOptions?: number[] } | undefined {
  if (option === false) return undefined

  const given = option === true || option === undefined ? {} : option
  return {
    mode: given.mode ?? "pages",
    pageSize: given.pageSize ?? DEFAULT_STATE.pageSize,
    siblings: given.siblings ?? 1,
    pageSizeOptions: given.pageSizeOptions,
  }
}
