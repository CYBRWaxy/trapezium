import { describe, expect, it } from "vitest"

import { entryCell, isNavigationKey, nextCell, type NavigationGrid } from "./navigation.js"
import { getRows } from "./pipeline.js"
import { defaultTypeRegistry } from "./registry.js"
import { DEFAULT_FORMAT } from "./format.js"
import { resolveColumns } from "./columns.js"
import { clearFocus, createState, focusCell } from "./state.js"
import { DEFAULT_URL_KEYS, pickUrlState, stateFromUrl, stateToQueryString } from "./url.js"

const grid: NavigationGrid = {
  rows: ["r1", "r2", "r3", "r4", "r5"],
  columns: ["__select", "name", "age", "plan"],
}

const at = (rowId: string, key: string) => ({ rowId, key })

describe("nextCell", () => {
  it("moves one cell with each arrow", () => {
    expect(nextCell(grid, at("r2", "name"), "ArrowDown")).toEqual(at("r3", "name"))
    expect(nextCell(grid, at("r2", "name"), "ArrowUp")).toEqual(at("r1", "name"))
    expect(nextCell(grid, at("r2", "name"), "ArrowRight")).toEqual(at("r2", "age"))
    expect(nextCell(grid, at("r2", "name"), "ArrowLeft")).toEqual(at("r2", "__select"))
  })

  it("stays put at every edge rather than wrapping", () => {
    expect(nextCell(grid, at("r1", "name"), "ArrowUp")).toBeUndefined()
    expect(nextCell(grid, at("r5", "name"), "ArrowDown")).toBeUndefined()
    expect(nextCell(grid, at("r3", "__select"), "ArrowLeft")).toBeUndefined()
    expect(nextCell(grid, at("r3", "plan"), "ArrowRight")).toBeUndefined()
  })

  it("goes to the ends of the row with Home and End, and of the grid with Control", () => {
    expect(nextCell(grid, at("r3", "age"), "Home")).toEqual(at("r3", "__select"))
    expect(nextCell(grid, at("r3", "age"), "End")).toEqual(at("r3", "plan"))
    expect(nextCell(grid, at("r3", "age"), "Home", { ctrlKey: true })).toEqual(at("r1", "__select"))
    expect(nextCell(grid, at("r3", "age"), "End", { ctrlKey: true })).toEqual(at("r5", "plan"))
  })

  it("moves a page of rows, stopping at the first and last", () => {
    expect(nextCell(grid, at("r1", "age"), "PageDown", { pageRows: 2 })).toEqual(at("r3", "age"))
    expect(nextCell(grid, at("r4", "age"), "PageDown", { pageRows: 2 })).toEqual(at("r5", "age"))
    expect(nextCell(grid, at("r2", "age"), "PageUp", { pageRows: 3 })).toEqual(at("r1", "age"))
    expect(nextCell(grid, at("r5", "age"), "PageDown")).toBeUndefined()
  })

  it("swaps left and right when the text runs right to left", () => {
    expect(nextCell(grid, at("r2", "name"), "ArrowLeft", { rtl: true })).toEqual(at("r2", "age"))
    expect(nextCell(grid, at("r2", "name"), "ArrowRight", { rtl: true })).toEqual(at("r2", "__select"))
  })

  it("answers nothing for a cell the grid does not hold", () => {
    expect(nextCell(grid, at("gone", "name"), "ArrowDown")).toBeUndefined()
    expect(nextCell(grid, at("r1", "gone"), "ArrowDown")).toBeUndefined()
  })

  it("knows which keys are its own", () => {
    expect(isNavigationKey("PageDown")).toBe(true)
    expect(isNavigationKey("Enter")).toBe(false)
    expect(isNavigationKey("a")).toBe(false)
  })
})

describe("entryCell", () => {
  it("is the first cell of the first row when nothing is active", () => {
    expect(entryCell(grid, null)).toEqual(at("r1", "__select"))
  })

  it("is the active cell when it is on screen", () => {
    expect(entryCell(grid, { rowId: "r3", key: "age" })).toEqual(at("r3", "age"))
  })

  it("is the active row's first cell when only a row, or an unknown column, is active", () => {
    expect(entryCell(grid, { rowId: "r3" })).toEqual(at("r3", "__select"))
    expect(entryCell(grid, { rowId: "r3", key: "hidden" })).toEqual(at("r3", "__select"))
  })

  it("falls back to the first row when the active row is not on screen", () => {
    expect(entryCell(grid, { rowId: "elsewhere", key: "age" })).toEqual(at("r1", "__select"))
  })

  it("is nothing for an empty grid", () => {
    expect(entryCell({ rows: [], columns: ["a"] }, null)).toBeUndefined()
    expect(entryCell({ rows: ["r1"], columns: [] }, null)).toBeUndefined()
  })
})

describe("the active cell in the state", () => {
  it("starts as nothing", () => {
    expect(createState().focus).toBeNull()
  })

  it("is set, and returns the same state when it would not change", () => {
    const state = focusCell(createState(), "r2", "age")
    expect(state.focus).toEqual({ rowId: "r2", key: "age" })
    expect(focusCell(state, "r2", "age")).toBe(state)
    expect(focusCell(state, "r2", "age", "center").focus).toEqual({ rowId: "r2", key: "age", align: "center" })
    expect(focusCell(state, "r2").focus).toEqual({ rowId: "r2" })
  })

  it("is cleared", () => {
    expect(clearFocus(focusCell(createState(), "r1")).focus).toBeNull()
    const none = createState()
    expect(clearFocus(none)).toBe(none)
  })

  it("travels in the URL only when asked, row and column both", () => {
    const include = [...DEFAULT_URL_KEYS, "focus" as const]
    const state = focusCell(createState(), "ord:42", "total")
    expect(stateToQueryString(state)).toBe("")

    const query = stateToQueryString(state, { include })
    expect(query).toBe("at=ord%253A42%3Atotal")
    expect(stateFromUrl(query, { include }).focus).toEqual({ rowId: "ord:42", key: "total" })
    expect(stateFromUrl("at=ord_7", { include }).focus).toEqual({ rowId: "ord_7" })
    expect(pickUrlState(state, { include: ["focus"] })).toEqual({ focus: { rowId: "ord:42", key: "total" } })
  })
})

describe("revealing a row", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({ id: `r${String(index)}`, n: index }))
  const columns = resolveColumns({ rows, state: createState(), types: defaultTypeRegistry }).visible
  const run = (state: ReturnType<typeof createState>, reveal?: string, accumulate = false) =>
    getRows({ rows, columns, state, types: defaultTypeRegistry, format: DEFAULT_FORMAT, reveal, accumulate })

  it("shows the page the row is on, and says which page that is", () => {
    const result = run(createState({ pageSize: 10 }), "r25")
    expect(result.page).toBe(3)
    expect(result.rows[0]).toBe(rows[20])
  })

  it("leaves the page alone without a row to reveal, or one that does not match", () => {
    expect(run(createState({ pageSize: 10, page: 2 })).page).toBe(2)
    expect(run(createState({ pageSize: 10, page: 2 }), "nope").page).toBe(2)
  })

  it("follows the sort and filters, because the page is the page the row is on now", () => {
    const state = createState({ pageSize: 10, sort: [{ key: "n", direction: "desc" }] })
    expect(run(state, "r25").page).toBe(1)
  })

  it("only moves forward in the append modes, where earlier pages are on screen", () => {
    expect(run(createState({ pageSize: 10, page: 3 }), "r5", true).page).toBe(3)
    const result = run(createState({ pageSize: 10, page: 1 }), "r25", true)
    expect(result.page).toBe(3)
    expect(result.rows).toHaveLength(30)
  })
})
