import type { AnyRow, ResolvedSelection, SelectionInput } from "./types.js"

/**
 * Selection, read the same way by every adapter.
 *
 * A caller writes `selection`, `selection="single"` or the full options; the
 * adapters need one shape with the mode already decided. Doing that here, once,
 * is what keeps four adapters agreeing about what `true` means.
 */

/**
 * Normalises whatever the caller passed, or returns `undefined` when selection
 * is off. A separate `onChange` — the adapters' `onSelectionChange` prop — fills
 * in when the options did not bring their own.
 */
export function resolveSelection<TRow extends AnyRow>(
  option: SelectionInput<TRow> | undefined,
  onChange?: (ids: string[], rows: TRow[]) => void,
): ResolvedSelection<TRow> | undefined {
  if (!option) return undefined
  if (option === true) return { mode: "multiple", onChange }
  if (typeof option === "string") return { mode: option, onChange }
  return { ...option, mode: option.mode ?? "multiple", onChange: option.onChange ?? onChange }
}

/**
 * The ids a person may actually select, in row order.
 *
 * With no `isSelectable` that is every row; with one, the rows it allows. This
 * is the list a header checkbox selects and a shift-click range walks, so a
 * disabled row can never be swept into either.
 */
export function selectableIds<TRow extends AnyRow>(
  rows: readonly TRow[],
  rowIds: readonly string[],
  isSelectable: ((row: TRow, index: number) => boolean) | undefined,
): string[] {
  if (!isSelectable) return [...rowIds]

  const ids: string[] = []
  rows.forEach((row, index) => {
    const id = rowIds[index]
    if (id !== undefined && isSelectable(row, index)) ids.push(id)
  })
  return ids
}
