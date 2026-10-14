/**
 * Remembering what the pipeline worked out last time.
 *
 * Filtering, searching and sorting a hundred thousand rows takes a tenth of a
 * second or more, and almost nothing a person does to a table changes the
 * answer: turning a page, ticking a box, moving the keyboard to the next
 * cell, opening a detail row. Without this every one of those ran the whole
 * pipeline again. With it, each stage is kept until something it depends on
 * changes — the rows, the columns, the formatting, or the part of the state
 * that stage reads — and a later stage is redone without the earlier ones.
 *
 * One cache per table, held by the adapter and handed to `getRows`, so two
 * tables over the same rows never read each other's answers and nothing is
 * kept at module scope. A stage is recognised by the rows array it ran on
 * (by identity — replace the array to change the data, as every framework
 * already does), a string of the plain values it read, and the identity of
 * the functions it called.
 */

import type { AnyRow, FormatContext, ResolvedColumn, TableState } from "./types.js"
import type { TypeRegistry } from "./registry.js"

/** One remembered stage. */
type Stage<T> = { rows: object; key: string; deps: readonly unknown[]; value: T }

/** What a table remembers between runs of the pipeline. Make one with `createPipelineCache`. */
export type PipelineCache<TRow = AnyRow> = {
  filtered?: Stage<TRow[]>
  searched?: Stage<TRow[]>
  sorted?: Stage<TRow[]>
}

/** A cache for one table. Keep it for the table's life; it holds nothing once the rows are dropped. */
export function createPipelineCache<TRow = AnyRow>(): PipelineCache<TRow> {
  return {}
}

/** Runs a stage, or hands back what it produced last time if nothing it reads has changed. */
export function remembered<TRow>(
  cache: PipelineCache<TRow> | undefined,
  stage: "filtered" | "searched" | "sorted",
  rows: object,
  key: string,
  deps: readonly unknown[],
  compute: () => TRow[],
): TRow[] {
  if (!cache) return compute()
  const entry = cache[stage]
  if (entry && entry.rows === rows && entry.key === key && sameDeps(entry.deps, deps)) return entry.value
  const value = compute()
  cache[stage] = { rows, key, deps, value }
  return value
}

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((entry, index) => Object.is(entry, b[index]))
}

/**
 * What a stage reads from the columns, the types and the formatting — as a
 * string for the plain values and a list for the functions, whose identity is
 * all that can be compared.
 */
export function columnsSignature<TRow, TNode>(
  columns: readonly ResolvedColumn<TRow, TNode>[],
  types: TypeRegistry,
  format: FormatContext,
): { key: string; deps: unknown[] } {
  const key = JSON.stringify([
    columns.map((column) => [
      column.key,
      column.type,
      column.sortable,
      column.searchable,
      column.filterKind,
      column.formatOptions ?? null,
    ]),
    format.locale,
    format.timeZone,
    format.currency,
    format.currencyInMinorUnits,
    format.emptyText,
    // A relative time reads differently from minute to minute, and no sooner.
    format.now ? Math.floor(format.now.getTime() / 60_000) : null,
  ])
  const deps: unknown[] = [types]
  for (const column of columns) deps.push(column.accessor, column.compare)
  return { key, deps }
}

/** The parts of the state each stage reads. */
export function stageKeys(state: TableState): { filtered: string; searched: string; sorted: string } {
  const filtered = JSON.stringify([state.filters, state.match])
  const searched = JSON.stringify([filtered, state.search.trim()])
  return { filtered, searched, sorted: JSON.stringify([searched, state.sort]) }
}
