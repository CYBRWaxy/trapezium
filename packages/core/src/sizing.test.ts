import { describe, expect, it } from "vitest"

import { resolveColumns } from "./columns.js"
import { defaultTypeRegistry } from "./registry.js"
import { columnSizing, pinWhenToken, responsivePinStyles } from "./sizing.js"
import { createState, setPin } from "./state.js"
import type { ColumnDef } from "./types.js"

type Row = Record<string, unknown>

const resolve = (columns: ColumnDef<Row>[], state = createState()) =>
  resolveColumns({ columns, rows: [{}], state, types: defaultTypeRegistry }).visible

describe("column sizing", () => {
  it("holds a width exactly, as width, minimum and maximum, with the content in a box", () => {
    expect(columnSizing(resolve([{ key: "icon", width: 56 }]))["icon"]).toEqual({
      size: "fixed",
      style: { width: "56px", minWidth: "56px", maxWidth: "56px" },
      box: true,
    })
  })

  it("caps a content-sized column at its maxWidth, and floors it at its minWidth", () => {
    expect(columnSizing(resolve([{ key: "note", maxWidth: 200, minWidth: 60 }]))["note"]).toEqual({
      size: undefined,
      style: { minWidth: "60px", "--tpz-col-cap": "200px" },
      box: true,
    })
  })

  it("leaves a column with nothing said alone", () => {
    expect(columnSizing(resolve([{ key: "name" }]))["name"]).toEqual({ size: undefined, style: {}, box: false })
  })

  it("gives spare width to growing columns, keeping the rest to their content", () => {
    const sizing = columnSizing(resolve([{ key: "name" }, { key: "notes", grow: 1 }, { key: "icon", width: 56 }]))
    expect(sizing["name"]?.size).toBe("fit")
    expect(sizing["notes"]).toEqual({ size: "grow", style: {}, box: false })
    expect(sizing["icon"]?.size).toBe("fixed")
  })

  it("splits it between several growing columns in proportion", () => {
    const sizing = columnSizing(resolve([{ key: "a", grow: 2 }, { key: "b", grow: 1 }, { key: "c" }]))
    expect(sizing["a"]?.style["width"]).toBe("66.67%")
    expect(sizing["b"]?.style["width"]).toBe("33.33%")
    expect(sizing["c"]?.size).toBe("fit")
  })

  it("takes a width the user dragged to over the definition's", () => {
    const state = { ...createState(), widths: { note: 300 } }
    expect(columnSizing(resolve([{ key: "note", width: 120 }], state))["note"]?.style["width"]).toBe("300px")
  })
})

describe("pinning by width", () => {
  it("resolves to pinWhen, leaving the column where it is in the order", () => {
    const columns = resolve([{ key: "a" }, { key: "name", pin: { side: "start", below: 640 } }, { key: "b", pin: "start" }])
    expect(columns.map((column) => column.key)).toEqual(["b", "a", "name"])
    const name = columns.find((column) => column.key === "name")
    expect(name?.pin).toBeUndefined()
    expect(name?.pinWhen).toEqual({ side: "start", below: 640 })
  })

  it("gives way to a pin the user chose", () => {
    const state = setPin(createState(), "name", "end")
    const name = resolve([{ key: "name", pin: { side: "start", below: 640 } }], state)[0]
    expect(name?.pin).toBe("end")
    expect(name?.pinWhen).toBeUndefined()
  })

  it("names each width in a token a stylesheet can hold", () => {
    expect(pinWhenToken({ side: "start", below: 640 })).toBe("start-below-640")
    expect(pinWhenToken({ side: "end", above: 1024 })).toBe("end-above-1024")
    expect(pinWhenToken({ side: "start", above: 400, below: 900 })).toBe("start-below-900-above-400")
  })

  it("writes one container query per width, with no character an HTML document would misread", () => {
    const css = responsivePinStyles(
      resolve([
        { key: "a", pin: { side: "start", below: 640 } },
        { key: "b", pin: { side: "start", below: 640 } },
        { key: "c", pin: { side: "end", above: 1024 } },
      ]),
    )
    expect(css.match(/@container tpz/g)).toHaveLength(2)
    expect(css).toContain("@container tpz (max-width: 639.98px)")
    expect(css).toContain("@container tpz (min-width: 1024px)")
    expect(css).toContain('.td[data-pin-when="start-below-640"]'.slice(1))
    expect(css).toContain("left: var(--tpz-pin-offset, 0px)")
    expect(css).toContain("right: var(--tpz-pin-offset, 0px)")
    expect(css).not.toMatch(/[<>&]/)
    expect(responsivePinStyles(resolve([{ key: "a", pin: "start" }]))).toBe("")
  })
})
