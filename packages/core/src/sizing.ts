/**
 * How wide each column is, and which columns freeze at which widths — as
 * attributes and custom properties an adapter puts on the cells, so the
 * stylesheet does the work and nothing is measured.
 *
 * A real `<table>` shares spare width among its columns by their content,
 * which is right until a column is meant to stay narrow: a 56px column of
 * icons came out 130px or more. Three rules fix that, all in CSS:
 *
 * - A column with a `width` holds it exactly. Its cells get the width as
 *   their width, minimum and maximum, and their content is laid out in a box
 *   that cannot push the cell wider, so long content ends in an ellipsis.
 * - A column with a `maxWidth` grows with its content up to that width, by
 *   the same box, capped.
 * - With any column given `grow`, every other column keeps to its content or
 *   its width, and the growing columns share what is left, in proportion.
 */

import type { ResolvedColumn, ResponsivePin } from "./types.js"

/** What an adapter puts on a column's cells for its width. */
export type CellSizing = {
  /**
   * `data-size`: `"fixed"` for a column holding a width, `"fit"` for one
   * keeping to its content while others grow, `"grow"` for one taking a share
   * of the spare width. Absent for a column sized the table's usual way.
   */
  size?: "fixed" | "fit" | "grow"
  /** Inline style for the cells: `width`, `minWidth`, `maxWidth`, and `--tpz-col-cap`. */
  style: Record<string, string>
  /** The cell's content goes in a `.tpz-box`, which is what holds a width or caps it. */
  box: boolean
}

/** The sizing of every visible column, by key. */
export function columnSizing<TRow, TNode>(columns: readonly ResolvedColumn<TRow, TNode>[]): Record<string, CellSizing> {
  const growing = columns.filter((column) => (column.grow ?? 0) > 0 && column.width === undefined)
  const shares = growing.reduce((sum, column) => sum + (column.grow ?? 0), 0)

  const sizing: Record<string, CellSizing> = {}
  for (const column of columns) {
    const style: Record<string, string> = {}
    let size: CellSizing["size"]
    let box = false

    if (column.width !== undefined) {
      const px = `${String(column.width)}px`
      style["width"] = px
      style["minWidth"] = px
      style["maxWidth"] = px
      size = "fixed"
      box = true
    } else {
      if (column.minWidth !== undefined) style["minWidth"] = `${String(column.minWidth)}px`
      if (column.maxWidth !== undefined) {
        style["--tpz-col-cap"] = `${String(column.maxWidth)}px`
        box = true
      }
      if ((column.grow ?? 0) > 0) {
        size = "grow"
        // Several growing columns split the room by percentage; one alone takes all of it as it is.
        if (growing.length > 1) style["width"] = `${String(Math.round(((column.grow ?? 0) / shares) * 10000) / 100)}%`
      } else if (growing.length > 0) {
        size = "fit"
      }
    }

    sizing[column.key] = { size, style, box }
  }
  return sizing
}

/**
 * The token a cell pinned by width carries in `data-pin-when`: its side and
 * its widths, in characters a stylesheet written into the page can hold.
 */
export function pinWhenToken(pin: ResponsivePin): string {
  return [pin.side, pin.below !== undefined ? `below-${String(pin.below)}` : "", pin.above !== undefined ? `above-${String(pin.above)}` : ""]
    .filter(Boolean)
    .join("-")
}

/**
 * The stylesheet that freezes the columns pinned by width: one container
 * query per width the columns name, written into the table so it renders the
 * same on a server. Empty when no column is pinned that way.
 *
 * The container is the table's root, so it is the table's width that decides,
 * not the window's — a table in a narrow sidebar freezes its column too. The
 * queries use `min-width` and `max-width` rather than the range syntax, which
 * would need a `<` in an HTML document.
 */
export function responsivePinStyles<TRow, TNode>(columns: readonly ResolvedColumn<TRow, TNode>[]): string {
  const seen = new Map<string, ResponsivePin>()
  for (const column of columns) if (column.pinWhen) seen.set(pinWhenToken(column.pinWhen), column.pinWhen)

  const rules: string[] = []
  for (const [token, pin] of seen) {
    const conditions = [
      pin.above !== undefined ? `(min-width: ${String(pin.above)}px)` : "",
      pin.below !== undefined ? `(max-width: ${String(pin.below - 0.02)}px)` : "",
    ].filter(Boolean)
    if (conditions.length === 0) continue

    const cells = `.tpz-th[data-pin-when="${token}"], .tpz-td[data-pin-when="${token}"]`
    const edge = pin.side === "start" ? "4px 0 6px -6px" : "-4px 0 6px -6px"
    // The offset is a custom property, not `left`: on a cell that is not frozen, `left` would move it.
    const inset = pin.side === "start" ? "left" : "right"
    rules.push(
      `@container tpz ${conditions.join(" and ")} {` +
        ` ${cells} { position: sticky; ${inset}: var(--tpz-pin-offset, 0px); z-index: 10; box-shadow: ${edge} rgb(0 0 0 / 25%); }` +
        ` .tpz-th[data-pin-when="${token}"] { z-index: 30; }` +
        ` .tpz-pinned-body .tpz-td[data-pin-when="${token}"] { z-index: 25; }` +
        " }",
    )
  }
  return rules.join("\n")
}
