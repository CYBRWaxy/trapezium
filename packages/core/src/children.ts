/**
 * Child rows: one level of rows that belong under another.
 *
 * A row names its parent with the table's `getParentId`; it is then drawn
 * directly under that parent and goes everywhere the parent goes. This is the
 * pipeline for that table — the same filter, search, sort and paginate as
 * every other, applied to families instead of to rows:
 *
 * - **Filtering and search** look at every row on its own. A parent is shown
 *   when it matches or when any of its children does — in the second case as
 *   *context*, so the matching child is not left floating. A parent that
 *   matches with no child that does is shown alone. A child is shown when it
 *   matches.
 * - **Sorting** orders the parents, and orders each parent's children among
 *   themselves by the same levels. A child never leaves its parent.
 * - **Paging** counts parents. A page of 25 is 25 families, each with all of
 *   its children, so a parent and its children are never split across two
 *   pages. `total` counts families too.
 * - **Collapsing** a parent (`state.collapsed`) leaves its children out of
 *   what is drawn, but not out of what matches: an export still has them,
 *   under their parent.
 *
 * One level only. A row whose parent is itself a child is placed under the
 * top of that chain, and a row whose parent is not in the data is shown as a
 * row of its own — in server mode that is a child whose parent is on another
 * page.
 */

import { filterRows } from "./filter.js"
import { pageCount, resolveRowId, searchRows, sortRows, type PipelineOptions } from "./pipeline.js"
import type { AnyRow, RowInfo, TableRows } from "./types.js"
import { clamp } from "./util.js"

type Family = {
  /** Index of the parent in the rows given. */
  parent: number
  /** Indexes of the children shown, in order. */
  children: number[]
  /** Shown only because a child matched. */
  context: boolean
}

export function getRowsWithChildren<TRow extends AnyRow, TNode>(
  options: PipelineOptions<TRow, TNode> & { getParentId: (row: TRow) => string | null | undefined },
): TableRows<TRow> {
  const { rows, columns, state, types, format, server, getParentId, getRowId } = options

  const ids = rows.map((row, index) => resolveRowId(row, index, getRowId))
  const position = new Map(ids.map((id, index) => [id, index]))

  /*
    Each row's top-level parent, or -1 for a row that is a parent (or stands
    alone). Followed up the chain so a grandchild lands under the top, with a
    guard against a chain that loops back on itself.
  */
  const top = rows.map((_, index) => {
    let current = index
    const seen = new Set<number>()
    for (;;) {
      seen.add(current)
      const parentId = parentKey(getParentId(rows[current]!))
      const parent = parentId === undefined ? undefined : position.get(parentId)
      if (parent === undefined) break
      // A chain that comes back round has no top; every row in it stands alone.
      if (seen.has(parent)) return -1
      current = parent
    }
    return current === index ? -1 : current
  })

  const childrenOf = new Map<number, number[]>()
  top.forEach((parent, index) => {
    if (parent === -1) return
    const list = childrenOf.get(parent)
    if (list) list.push(index)
    else childrenOf.set(parent, [index])
  })

  // Every row on its own: what the filters and the search let through.
  const matched = server
    ? new Set(rows)
    : new Set(searchRows(filterRows(rows, columns, state.filters, state.match, types.get, format), columns, state.search, types, format))

  let families: Family[] = []
  rows.forEach((row, index) => {
    if (top[index] !== -1) return
    const children = (childrenOf.get(index) ?? []).filter((child) => matched.has(rows[child]!))
    const self = matched.has(row)
    if (!self && children.length === 0) return
    families.push({ parent: index, children, context: !self })
  })

  if (!server && state.sort.length > 0) families = sortFamilies(families, options)

  const total = server ? (options.total ?? families.length) : families.length
  const pages = pageCount(total, state.pageSize)

  let page = state.page
  if (!server && options.reveal !== undefined && state.pageSize > 0) {
    const at = families.findIndex(
      (family) => ids[family.parent] === options.reveal || family.children.some((child) => ids[child] === options.reveal),
    )
    if (at !== -1) {
      const revealed = Math.floor(at / state.pageSize) + 1
      page = options.accumulate ? Math.max(revealed, state.page) : revealed
    }
  }
  page = server ? state.page : clamp(page, 1, pages)

  const start = server || options.accumulate ? 0 : (page - 1) * state.pageSize
  const end = server ? families.length : page * state.pageSize
  const shown = state.pageSize > 0 && !server ? families.slice(start, end) : families

  const collapsed = new Set(state.collapsed ?? [])
  const out: TRow[] = []
  const info: RowInfo[] = []
  for (const family of shown) {
    const parentId = ids[family.parent]!
    out.push(rows[family.parent]!)
    info.push({ depth: 0, childCount: family.children.length, context: family.context })
    if (collapsed.has(parentId)) continue
    for (const child of family.children) {
      out.push(rows[child]!)
      info.push({ depth: 1, parentId, childCount: 0, context: false })
    }
  }

  // What an export means: every family, children always included, under their parents.
  const every: TRow[] = []
  for (const family of families) {
    every.push(rows[family.parent]!)
    for (const child of family.children) every.push(rows[child]!)
  }

  const topLevel = top.filter((parent) => parent === -1).length

  return {
    rows: out,
    matched: every,
    info,
    total,
    totalUnfiltered: server ? total : topLevel,
    pageCount: pages,
    page,
    filtered: server ? state.filters.length > 0 || state.search.trim() !== "" : families.length !== topLevel,
  }
}

/**
 * The ids of the rows that have children among `rows` — what "collapse all"
 * folds. A row counts whatever the filters say, so folding everything and then
 * searching does not leave some parents open.
 */
export function parentIdsWithChildren<TRow extends AnyRow>(
  rows: readonly TRow[],
  getParentId: (row: TRow) => string | null | undefined,
  getRowId?: (row: TRow, index: number) => string,
): string[] {
  const ids = new Set(rows.map((row, index) => resolveRowId(row, index, getRowId)))
  const parents = new Set<string>()
  for (const row of rows) {
    const parent = parentKey(getParentId(row))
    if (parent !== undefined && ids.has(parent)) parents.add(parent)
  }
  return [...parents]
}

/** A parent id as the table compares it: a string, or nothing for a row with no parent. */
function parentKey(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined || value === "") return undefined
  return String(value)
}

/** Parents in the sort's order, and each one's children in the same order among themselves. */
function sortFamilies<TRow extends AnyRow, TNode>(families: Family[], options: PipelineOptions<TRow, TNode>): Family[] {
  const { rows, columns, state, types, format } = options
  const byParent = new Map(families.map((family) => [rows[family.parent]!, family]))
  const sortedParents = sortRows(
    families.map((family) => rows[family.parent]!),
    columns,
    state,
    types,
    format,
  )

  const indexOf = new Map(rows.map((row, index) => [row, index]))
  return sortedParents
    .map((parent) => byParent.get(parent))
    .filter((family): family is Family => family !== undefined)
    .map((family) => {
      if (family.children.length < 2) return family
      const sortedChildren = sortRows(
        family.children.map((child) => rows[child]!),
        columns,
        state,
        types,
        format,
      )
      const children = sortedChildren.map((row) => indexOf.get(row)).filter((index): index is number => index !== undefined)
      return { ...family, children }
    })
}
