/**
 * Work for when the browser has nothing better to do.
 *
 * `requestIdleCallback` where there is one, and a short timeout where there is
 * not (Safari, before 2025), slicing a long job so it never holds a frame.
 * Returns a function that stops it. Does nothing at all without a window, so a
 * server render never schedules anything.
 */

import { warmSearch } from "./pipeline.js"
import type { TypeRegistry } from "./registry.js"
import type { AnyRow, FormatContext, ResolvedColumn } from "./types.js"

/** Below this many rows the first search is quick enough that warming it would be wasted effort. */
export const WARM_SEARCH_FROM = 2_000

/**
 * Builds the search text of every row in idle time, so the first keystroke in
 * a large table is as quick as the next. The adapters call this while a table
 * has a search box and holds its own data.
 */
export function warmSearchWhenIdle<TRow extends AnyRow, TNode>(
  rows: readonly TRow[],
  columns: readonly ResolvedColumn<TRow, TNode>[],
  types: TypeRegistry,
  format: FormatContext,
): () => void {
  if (typeof window === "undefined" || rows.length < WARM_SEARCH_FROM) return () => undefined
  const view = window

  const idle = typeof view.requestIdleCallback === "function"
  let from = 0
  let handle: number | undefined
  let stopped = false

  const schedule = () => {
    if (stopped || from >= rows.length) return
    handle = idle
      ? view.requestIdleCallback((deadline) => {
          from = warmSearch(rows, columns, types, format, from, Math.max(2, deadline.timeRemaining()))
          schedule()
        })
      : view.setTimeout(() => {
          from = warmSearch(rows, columns, types, format, from, 6)
          schedule()
        }, 32)
  }

  schedule()
  return () => {
    stopped = true
    if (handle === undefined) return
    // Each kind of handle is cancelled by its own function: the two number their handles separately.
    if (idle) view.cancelIdleCallback(handle)
    else view.clearTimeout(handle)
  }
}
