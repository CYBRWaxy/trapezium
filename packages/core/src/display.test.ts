import { describe, expect, it } from "vitest"

import { resolveColumns } from "./columns.js"
import { cellDisplayText } from "./display.js"
import { DEFAULT_FORMAT } from "./format.js"
import { defaultTypeRegistry } from "./registry.js"
import { createState } from "./state.js"
import type { ColumnInput } from "./columns.js"

type Row = Record<string, unknown>

function text(columns: ColumnInput<Row>[], row: Row, key: string, format = DEFAULT_FORMAT) {
  const column = resolveColumns({ columns, rows: [row], state: createState(), types: defaultTypeRegistry }).all.find(
    (entry) => entry.key === key,
  )
  if (!column) throw new Error(`no column ${key}`)
  return cellDisplayText(row, column, { types: defaultTypeRegistry, format })
}

describe("cellDisplayText", () => {
  it("is what the cell shows, formatted by its type and the table's formatting", () => {
    expect(text([{ key: "due", type: "date" }], { due: "2026-01-15" }, "due")).toBe("Jan 15, 2026")
    expect(text([{ key: "total", type: "currency" }], { total: 1240 }, "total", { ...DEFAULT_FORMAT, currency: "AUD" })).toBe("A$1,240.00")
    expect(text([{ key: "plan", type: "select", formatOptions: { options: [{ value: "pro", label: "Professional" }] } }], { plan: "pro" }, "plan")).toBe("Professional")
  })

  it("follows the column's own format and a dotted path", () => {
    expect(text([{ key: "n", format: ({ value }) => `#${String(value)}` }], { n: 7 }, "n")).toBe("#7")
    expect(text(["customer.name"], { customer: { name: "Ada" } }, "customer.name")).toBe("Ada")
  })

  it("is empty for an empty cell, not the dash drawn there", () => {
    expect(text(["name"], { name: null }, "name")).toBe("")
  })
})
