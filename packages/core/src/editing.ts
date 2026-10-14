/**
 * Editing a cell, as rules rather than as markup.
 *
 * Which editor a column gets, what text that editor starts with, what value
 * the text turns back into, whether that value is allowed — all of it is
 * decided here, so the React editor and the DOM one agree, and so it can be
 * tested without a browser.
 *
 * The table never changes the data. An edit ends in the caller's
 * `onCellEdit`, with the value the editor produced in the same shape as the
 * value it replaces: a number for a number, a `Date` for a `Date`, a calendar
 * day as `"YYYY-MM-DD"` when that is how it arrived.
 */

import { isDateOnly, minorUnitScale, toDate, toNumber } from "./format.js"
import type { TypeRegistry } from "./registry.js"
import type { AnyRow, FormatContext, ResolvedColumn, SelectOption } from "./types.js"
import { isEmpty } from "./util.js"

/**
 * The editors the table has built in, plus `"custom"` for a column with its
 * own `renderEditor` and `"none"` for a type there is no sensible text box for
 * — an image, a file, an address, a blob of JSON.
 */
export type EditorKind =
  | "text"
  | "number"
  | "select"
  | "boolean"
  | "date"
  | "datetime"
  | "time"
  | "tags"
  | "custom"
  | "none"

/** Whether a row's cell in a column can be edited. */
export function isCellEditable<TRow extends AnyRow, TNode>(column: ResolvedColumn<TRow, TNode>, row: TRow): boolean {
  const editable = column.editable
  if (editable === undefined || editable === false) return false
  if (editable === true) return true
  return editable(row)
}

/** Whether any of the columns can be edited at all — what switches cell navigation on. */
export function hasEditableColumns<TRow, TNode>(columns: readonly ResolvedColumn<TRow, TNode>[]): boolean {
  return columns.some((column) => column.editable !== undefined && column.editable !== false)
}

/** The editor a column's cells open into. */
export function editorKind<TRow, TNode>(column: ResolvedColumn<TRow, TNode>, types: TypeRegistry): EditorKind {
  if (column.renderEditor) return "custom"

  const type = types.get(column.type).name
  if (type === "tags") return "tags"
  if (column.formatOptions?.options?.length) return "select"

  switch (type) {
    case "boolean":
      return "boolean"
    case "number":
    case "currency":
    case "percent":
      return "number"
    case "date":
      return "date"
    case "datetime":
    case "relativeTime":
      return "datetime"
    case "time":
      return "time"
    case "json":
    case "image":
    case "file":
    case "address":
      return "none"
    default:
      return "text"
  }
}

/**
 * The choices a `select` or `boolean` editor offers.
 *
 * A select offers the column's options, labelled as the cells label them. A
 * checkbox column offers Yes and No. Either may be cleared, which is the
 * first choice, shown as the table's empty text.
 */
export function editorOptions<TRow, TNode>(
  column: ResolvedColumn<TRow, TNode>,
  kind: EditorKind,
  format: FormatContext,
): SelectOption[] {
  const empty: SelectOption = { value: "", label: format.emptyText }
  if (kind === "boolean") return [empty, { value: "true", label: "Yes" }, { value: "false", label: "No" }]
  if (kind !== "select") return []
  return [empty, ...(column.formatOptions?.options ?? []).map((option) => ({ ...option, label: option.label ?? option.value }))]
}

/** The `step` a number editor takes: one unit of the column's last decimal place, or any. */
export function editorStep<TRow, TNode>(column: ResolvedColumn<TRow, TNode>): string {
  const decimals = column.formatOptions?.decimals
  if (decimals === undefined) return "any"
  return decimals <= 0 ? "1" : (1 / 10 ** decimals).toFixed(decimals)
}

/**
 * The text an editor starts with, for a value.
 *
 * In the units a person reads rather than the ones stored: an amount kept in
 * cents is edited in dollars, a timestamp in the table's time zone.
 */
export function toEditorText<TRow, TNode>(
  value: unknown,
  kind: EditorKind,
  column: ResolvedColumn<TRow, TNode>,
  format: FormatContext,
): string {
  if (isEmpty(value)) return ""
  const context = { ...format, ...column.formatOptions }

  switch (kind) {
    case "number": {
      const number = toNumber(value)
      if (number === undefined) return ""
      return String(column.type === "currency" && context.currencyInMinorUnits ? number / minorUnitScale(context.currency, context.locale) : number)
    }
    case "boolean":
      return value === true || value === "true" || value === 1 ? "true" : "false"
    case "select":
      return String(value)
    case "tags":
      return Array.isArray(value) ? value.map(String).join(", ") : String(value)
    case "date": {
      if (isDateOnly(value)) return String(value).trim()
      const date = toDate(value)
      return date ? date.toISOString().slice(0, 10) : ""
    }
    case "datetime": {
      const date = toDate(value)
      if (!date) return ""
      const parts = zonedParts(date, context.timeZone)
      return `${parts.date}T${parts.time}`
    }
    case "time": {
      if (typeof value === "string" && /^\d{1,2}:\d{2}/.test(value.trim())) {
        const [hours = "0", minutes = "00"] = value.trim().split(":")
        return `${hours.padStart(2, "0")}:${minutes.slice(0, 2)}`
      }
      const date = toDate(value)
      return date ? zonedParts(date, context.timeZone).time : ""
    }
    default:
      return typeof value === "object" ? "" : String(value)
  }
}

/**
 * The value an editor's text stands for, in the shape of the value it
 * replaces. An empty box is `null`: the cell was cleared.
 */
export function fromEditorText<TRow, TNode>(
  text: string,
  kind: EditorKind,
  column: ResolvedColumn<TRow, TNode>,
  previous: unknown,
  format: FormatContext,
): unknown {
  const trimmed = text.trim()
  const context = { ...format, ...column.formatOptions }

  switch (kind) {
    case "number": {
      if (trimmed === "") return null
      const number = toNumber(trimmed)
      if (number === undefined) return Number.NaN
      if (column.type === "currency" && context.currencyInMinorUnits) {
        return Math.round(number * minorUnitScale(context.currency, context.locale))
      }
      return number
    }
    case "boolean":
      return trimmed === "" ? null : trimmed === "true"
    case "select": {
      if (trimmed === "") return null
      // A column of numeric codes stays a column of numbers.
      return typeof previous === "number" && /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : trimmed
    }
    case "tags":
      return trimmed === "" ? [] : trimmed.split(",").map((entry) => entry.trim()).filter(Boolean)
    case "date": {
      if (trimmed === "") return null
      return reshapeInstant(new Date(`${trimmed}T00:00:00.000Z`), previous, true)
    }
    case "datetime": {
      if (trimmed === "") return null
      const [day = "", time = "00:00"] = trimmed.split("T")
      return reshapeInstant(zonedToUtc(day, time, context.timeZone), previous, false)
    }
    case "time": {
      if (trimmed === "") return null
      // Seconds kept when the column has them.
      return typeof previous === "string" && /^\d{1,2}:\d{2}:\d{2}/.test(previous.trim()) && trimmed.length === 5
        ? `${trimmed}:00`
        : trimmed
    }
    default:
      return text === "" && isEmpty(previous) ? previous : text
  }
}

/**
 * An instant in the shape its column already uses: a `Date`, epoch
 * milliseconds or seconds, a calendar day, or an ISO string.
 */
function reshapeInstant(date: Date, previous: unknown, dayOnly: boolean): unknown {
  if (Number.isNaN(date.getTime())) return Number.NaN
  if (previous instanceof Date) return date
  if (typeof previous === "number") return Math.abs(previous) < 1e11 ? Math.round(date.getTime() / 1000) : date.getTime()
  if (dayOnly && (previous === null || previous === undefined || isDateOnly(previous))) return date.toISOString().slice(0, 10)
  return date.toISOString()
}

/** A date's calendar day and time of day in a zone, as `YYYY-MM-DD` and `HH:mm`. */
function zonedParts(date: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00"
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` }
}

/**
 * The instant at which a zone's clocks show a day and a time.
 *
 * Found by taking the wall time as if it were UTC and correcting by the zone's
 * offset at that moment — twice, because the first correction can cross a
 * change of daylight saving and change the offset.
 */
function zonedToUtc(day: string, time: string, timeZone: string): Date {
  const wall = Date.parse(`${day}T${time.length === 5 ? `${time}:00` : time}.000Z`)
  if (Number.isNaN(wall)) return new Date(Number.NaN)

  let guess = wall
  for (let pass = 0; pass < 2; pass += 1) {
    const shown = zonedParts(new Date(guess), timeZone)
    const shownAsUtc = Date.parse(`${shown.date}T${shown.time}:00.000Z`)
    guess += wall - shownAsUtc
  }
  return new Date(guess)
}

/**
 * Whether an edited value may be committed: the column's `validate`, and the
 * editor's own sense — a number box holding something that is not a number,
 * a date that is not a date. Returns the message to show, or `undefined`.
 */
export function validateEdit<TRow, TNode>(
  column: ResolvedColumn<TRow, TNode>,
  value: unknown,
  row: TRow,
): string | undefined {
  if (typeof value === "number" && Number.isNaN(value)) return "Not a valid value"

  const verdict = column.validate?.(value, row)
  if (verdict === undefined || verdict === null || verdict === true || verdict === "") return undefined
  if (verdict === false) return "Not a valid value"
  return verdict
}

/**
 * Whether an edit changed anything. Two empties are the same, a `Date` is
 * compared by its time, and a list by its members — so closing an editor
 * without changing it reports nothing.
 */
export function editValuesEqual(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((entry, index) => Object.is(entry, b[index]))
  return Object.is(a, b)
}

/** The text a key press types, when it is a printable character that should open an editor. */
export function typedCharacter(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): string | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) return undefined
  // One character — or one emoji, which is two code units.
  return [...event.key].length === 1 && event.key !== " " ? event.key : undefined
}

/** A rectangle, in viewport pixels — what `getBoundingClientRect` returns. */
export type PopupRect = { top: number; left: number; right: number; bottom: number }

/**
 * Where a popup goes against the thing it belongs to: below it, lined up with
 * its start, moved back inside the viewport sideways, and flipped above it
 * when there is not room below but there is above.
 */
export function placePopup(
  anchor: PopupRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  options: { align?: "start" | "end"; margin?: number } = {},
): { top: number; left: number; side: "below" | "above" } {
  const margin = options.margin ?? 4
  const wanted = options.align === "end" ? anchor.right - size.width : anchor.left
  const left = Math.max(margin, Math.min(wanted, viewport.width - size.width - margin))

  const below = anchor.bottom + margin
  const fitsBelow = below + size.height <= viewport.height - margin
  const above = anchor.top - size.height - margin
  if (!fitsBelow && above >= margin) return { top: above, left, side: "above" }
  return { top: below, left, side: "below" }
}
