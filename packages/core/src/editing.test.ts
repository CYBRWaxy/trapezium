import { describe, expect, it } from "vitest"

import { resolveColumns } from "./columns.js"
import {
  editValuesEqual,
  editorKind,
  editorOptions,
  editorStep,
  fromEditorText,
  hasEditableColumns,
  isCellEditable,
  placePopup,
  toEditorText,
  typedCharacter,
  validateEdit,
} from "./editing.js"
import { DEFAULT_FORMAT } from "./format.js"
import { defaultTypeRegistry } from "./registry.js"
import { createState } from "./state.js"
import type { ColumnDef, FormatContext, ResolvedColumn } from "./types.js"

type Row = Record<string, unknown>

function column(definition: ColumnDef<Row>, rows: Row[] = [{}]): ResolvedColumn<Row> {
  const resolved = resolveColumns({ columns: [definition], rows, state: createState(), types: defaultTypeRegistry }).visible[0]
  if (!resolved) throw new Error("no column")
  return resolved
}

const format: FormatContext = { ...DEFAULT_FORMAT }

describe("which cells can be edited", () => {
  it("is nothing by default, everything with true, and what the function says otherwise", () => {
    const row = { locked: true }
    expect(isCellEditable(column({ key: "a" }), row)).toBe(false)
    expect(isCellEditable(column({ key: "a", editable: true }), row)).toBe(true)
    expect(isCellEditable(column({ key: "a", editable: (r) => r["locked"] !== true }), row)).toBe(false)
  })

  it("knows when a table has anything editable at all", () => {
    expect(hasEditableColumns([column({ key: "a" })])).toBe(false)
    expect(hasEditableColumns([column({ key: "a" }), column({ key: "b", editable: () => false })])).toBe(true)
  })
})

describe("the editor a column gets", () => {
  const kind = (definition: ColumnDef<Row>) => editorKind(column(definition), defaultTypeRegistry)

  it("follows the type", () => {
    expect(kind({ key: "a", type: "text" })).toBe("text")
    expect(kind({ key: "a", type: "email" })).toBe("text")
    expect(kind({ key: "a", type: "number" })).toBe("number")
    expect(kind({ key: "a", type: "currency" })).toBe("number")
    expect(kind({ key: "a", type: "percent" })).toBe("number")
    expect(kind({ key: "a", type: "boolean" })).toBe("boolean")
    expect(kind({ key: "a", type: "date" })).toBe("date")
    expect(kind({ key: "a", type: "datetime" })).toBe("datetime")
    expect(kind({ key: "a", type: "time" })).toBe("time")
    expect(kind({ key: "a", type: "tags" })).toBe("tags")
  })

  it("is a list when the column has options, whatever its type, except tags", () => {
    const options = [{ value: "a" }, { value: "b" }]
    expect(kind({ key: "a", type: "badge", formatOptions: { options } })).toBe("select")
    expect(kind({ key: "a", type: "text", formatOptions: { options } })).toBe("select")
    expect(kind({ key: "a", type: "tags", formatOptions: { options } })).toBe("tags")
  })

  it("is the caller's own when it renders one, and none for what has no text box", () => {
    expect(kind({ key: "a", renderEditor: () => null })).toBe("custom")
    expect(kind({ key: "a", type: "json" })).toBe("none")
    expect(kind({ key: "a", type: "image" })).toBe("none")
    expect(kind({ key: "a", type: "address" })).toBe("none")
  })

  it("offers the column's options, labelled, with a way to clear it first", () => {
    const options = editorOptions(
      column({ key: "a", formatOptions: { options: [{ value: "pro", label: "Professional" }, { value: "free" }] } }),
      "select",
      format,
    )
    expect(options).toEqual([
      { value: "", label: "—" },
      { value: "pro", label: "Professional" },
      { value: "free", label: "free" },
    ])
    expect(editorOptions(column({ key: "a", type: "boolean" }), "boolean", format).map((option) => option.label)).toEqual(["—", "Yes", "No"])
  })

  it("steps a number box by the column's precision", () => {
    expect(editorStep(column({ key: "a" }))).toBe("any")
    expect(editorStep(column({ key: "a", formatOptions: { decimals: 2 } }))).toBe("0.01")
    expect(editorStep(column({ key: "a", formatOptions: { decimals: 0 } }))).toBe("1")
  })
})

describe("text and value", () => {
  it("edits numbers as they are, and cents as dollars", () => {
    const amount = column({ key: "a", type: "currency" })
    expect(toEditorText(1240.5, "number", amount, format)).toBe("1240.5")
    const cents = column({ key: "a", type: "currency", formatOptions: { currencyInMinorUnits: true } })
    expect(toEditorText(124050, "number", cents, format)).toBe("1240.5")
    expect(fromEditorText("1240.50", "number", cents, 0, format)).toBe(124050)
    // Yen has no minor unit.
    const yen = column({ key: "a", type: "currency", formatOptions: { currencyInMinorUnits: true, currency: "JPY" } })
    expect(fromEditorText("1240", "number", yen, 0, format)).toBe(1240)
  })

  it("reads an empty number box as cleared, and nonsense as not a number", () => {
    const number = column({ key: "a", type: "number" })
    expect(fromEditorText("", "number", number, 4, format)).toBeNull()
    expect(fromEditorText("abc", "number", number, 4, format)).toBeNaN()
    expect(fromEditorText("1,240", "number", number, 4, format)).toBe(1240)
  })

  it("keeps a calendar day a calendar day, and a Date a Date", () => {
    const date = column({ key: "a", type: "date" })
    expect(toEditorText("2026-01-15", "date", date, format)).toBe("2026-01-15")
    expect(fromEditorText("2026-02-01", "date", date, "2026-01-15", format)).toBe("2026-02-01")
    expect(fromEditorText("2026-02-01", "date", date, null, format)).toBe("2026-02-01")

    const asDate = fromEditorText("2026-02-01", "date", date, new Date("2026-01-15T00:00:00Z"), format)
    expect(asDate).toBeInstanceOf(Date)
    expect(asDate instanceof Date && asDate.toISOString()).toBe("2026-02-01T00:00:00.000Z")

    expect(fromEditorText("2026-02-01", "date", date, "2026-01-15T00:00:00.000Z", format)).toBe("2026-02-01T00:00:00.000Z")
  })

  it("edits a timestamp in the table's time zone, and stores it as the instant it means", () => {
    const sydney: FormatContext = { ...format, timeZone: "Australia/Sydney" }
    const datetime = column({ key: "a", type: "datetime" })
    // 10pm UTC on 14 Jan is 9am on 15 Jan in Sydney, in daylight saving.
    expect(toEditorText("2026-01-14T22:00:00.000Z", "datetime", datetime, sydney)).toBe("2026-01-15T09:00")
    expect(fromEditorText("2026-01-15T10:30", "datetime", datetime, "2026-01-14T22:00:00.000Z", sydney)).toBe(
      "2026-01-14T23:30:00.000Z",
    )
    // And in winter, at another offset.
    expect(fromEditorText("2026-07-15T10:30", "datetime", datetime, "", sydney)).toBe("2026-07-15T00:30:00.000Z")
  })

  it("keeps epoch numbers in their unit", () => {
    const datetime = column({ key: "a", type: "datetime" })
    expect(fromEditorText("2026-01-15T00:00", "datetime", datetime, 1_700_000_000, format)).toBe(1_768_435_200)
    expect(fromEditorText("2026-01-15T00:00", "datetime", datetime, 1_700_000_000_000, format)).toBe(1_768_435_200_000)
  })

  it("edits a time of day, keeping seconds when the column has them", () => {
    const time = column({ key: "a", type: "time" })
    expect(toEditorText("9:05", "time", time, format)).toBe("09:05")
    expect(toEditorText("14:30:15", "time", time, format)).toBe("14:30")
    expect(fromEditorText("15:45", "time", time, "14:30:15", format)).toBe("15:45:00")
    expect(fromEditorText("15:45", "time", time, "14:30", format)).toBe("15:45")
  })

  it("reads choices, yes and no, and lists", () => {
    const plan = column({ key: "a", formatOptions: { options: [{ value: "1" }, { value: "2" }] } })
    expect(fromEditorText("2", "select", plan, "1", format)).toBe("2")
    expect(fromEditorText("2", "select", plan, 1, format)).toBe(2)
    expect(fromEditorText("", "select", plan, "1", format)).toBeNull()

    const active = column({ key: "a", type: "boolean" })
    expect(toEditorText(true, "boolean", active, format)).toBe("true")
    expect(fromEditorText("false", "boolean", active, true, format)).toBe(false)

    const tags = column({ key: "a", type: "tags" })
    expect(toEditorText(["a", "b"], "tags", tags, format)).toBe("a, b")
    expect(fromEditorText(" a ,b,, c", "tags", tags, [], format)).toEqual(["a", "b", "c"])
  })

  it("leaves an untouched empty text cell as it was", () => {
    const text = column({ key: "a" })
    expect(fromEditorText("", "text", text, null, format)).toBeNull()
    expect(fromEditorText("", "text", text, "x", format)).toBe("")
    expect(fromEditorText("  ada ", "text", text, "x", format)).toBe("  ada ")
  })
})

describe("validation", () => {
  it("refuses what the editor knows is wrong, and what the column refuses", () => {
    const plain = column({ key: "a" })
    expect(validateEdit(plain, Number.NaN, {})).toBe("Not a valid value")
    expect(validateEdit(plain, "x", {})).toBeUndefined()

    const age = column({ key: "a", validate: (value) => (typeof value === "number" && value >= 0) || "Must be zero or more" })
    expect(validateEdit(age, -1, {})).toBe("Must be zero or more")
    expect(validateEdit(age, 3, {})).toBeUndefined()

    const strict = column({ key: "a", validate: () => false })
    expect(validateEdit(strict, 3, {})).toBe("Not a valid value")
  })
})

describe("whether anything changed", () => {
  it("treats two empties as the same, dates by time and lists by member", () => {
    expect(editValuesEqual(null, "")).toBe(true)
    expect(editValuesEqual(undefined, [])).toBe(true)
    expect(editValuesEqual(0, null)).toBe(false)
    expect(editValuesEqual(new Date(5), new Date(5))).toBe(true)
    expect(editValuesEqual(["a", "b"], ["a", "b"])).toBe(true)
    expect(editValuesEqual(["a"], ["b"])).toBe(false)
    expect(editValuesEqual(1, "1")).toBe(false)
  })
})

describe("typing to edit", () => {
  const key = (value: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
    typedCharacter({ key: value, ctrlKey: false, metaKey: false, altKey: false, ...extra })

  it("opens on a printable character, not on a shortcut, a named key or a space", () => {
    expect(key("a")).toBe("a")
    expect(key("7")).toBe("7")
    expect(key("é")).toBe("é")
    expect(key("😀")).toBe("😀")
    expect(key("Enter")).toBeUndefined()
    expect(key("ArrowDown")).toBeUndefined()
    expect(key(" ")).toBeUndefined()
    expect(key("c", { ctrlKey: true })).toBeUndefined()
    expect(key("v", { metaKey: true })).toBeUndefined()
  })
})

describe("placing a popup", () => {
  const viewport = { width: 1000, height: 800 }

  it("goes below its anchor, lined up with its start", () => {
    expect(placePopup({ top: 100, left: 50, right: 250, bottom: 132 }, { width: 200, height: 150 }, viewport)).toEqual({
      top: 136,
      left: 50,
      side: "below",
    })
  })

  it("flips above near the bottom edge, when there is room above", () => {
    expect(placePopup({ top: 700, left: 50, right: 250, bottom: 732 }, { width: 200, height: 150 }, viewport)).toEqual({
      top: 546,
      left: 50,
      side: "above",
    })
  })

  it("stays below when there is no room either way, and moves inside the viewport sideways", () => {
    expect(placePopup({ top: 60, left: 900, right: 990, bottom: 92 }, { width: 200, height: 900 }, viewport)).toEqual({
      top: 96,
      left: 796,
      side: "below",
    })
  })

  it("lines up with the end when asked", () => {
    expect(placePopup({ top: 100, left: 500, right: 700, bottom: 132 }, { width: 120, height: 50 }, viewport, { align: "end" }).left).toBe(580)
  })
})
