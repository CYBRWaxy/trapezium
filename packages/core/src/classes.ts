/**
 * Class names, and how a caller takes them over.
 *
 * Two rules, and they are the whole styling contract:
 *
 * - a class passed for a slot is *added* to the default, so overriding one
 *   thing does not cost you the rest;
 * - `unstyled` drops the defaults entirely, for anyone who wants their own
 *   design system to be the only thing on the element.
 *
 * Every adapter resolves its classes through this, so `classNames` means the
 * same thing in React as it does in a plain script.
 */

/**
 * The parts of the table a caller can restyle.
 *
 * Every slot takes a class name that is *added* to the default, so a Tailwind
 * user overrides what they care about and inherits the rest. `unstyled` drops
 * the defaults entirely for anyone who wants to start from nothing.
 */
export type TableSlots = {
  root: string
  frame: string
  toolbar: string
  search: string
  scroll: string
  table: string
  thead: string
  tbody: string
  headerRow: string
  headerCell: string
  row: string
  cell: string
  selectCell: string
  pagination: string
  empty: string
  footer: string
}

export type ClassResolver = (slot: keyof TableSlots, extra?: string) => string

/** What each slot is called when nobody has said otherwise. */
export const SLOT_CLASSES: Record<keyof TableSlots, string> = {
  root: "tpz",
  frame: "tpz-frame",
  toolbar: "tpz-toolbar",
  search: "tpz-search",
  scroll: "tpz-scroll",
  table: "tpz-table",
  thead: "tpz-thead",
  tbody: "tpz-tbody",
  headerRow: "tpz-tr",
  headerCell: "tpz-th",
  row: "tpz-tr",
  cell: "tpz-td",
  selectCell: "tpz-td tpz-select-cell",
  pagination: "tpz-pagination",
  empty: "tpz-state",
  footer: "tpz-footer",
}

export function createClasses(
  overrides: Partial<TableSlots> | undefined,
  unstyled: boolean | undefined,
): ClassResolver {
  return (slot, extra) => cx(unstyled ? undefined : SLOT_CLASSES[slot], overrides?.[slot], extra)
}

/** Joins class names, skipping the empty ones. Nothing more clever than that. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}
