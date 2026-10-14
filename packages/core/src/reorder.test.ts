import { describe, expect, it } from "vitest"

import { applyRowMove, canReorderRows, moveRowTo, stepRow } from "./reorder.js"

const ids = ["a", "b", "c", "d"]

describe("moving a row", () => {
  it("puts it beside another and names its new neighbours", () => {
    expect(moveRowTo(ids, "a", "c", "after")).toEqual({ order: ["b", "c", "a", "d"], afterId: "c", beforeId: "d" })
    expect(moveRowTo(ids, "d", "a", "before")).toEqual({ order: ["d", "a", "b", "c"], afterId: null, beforeId: "a" })
    expect(moveRowTo(ids, "a", "d", "after")).toEqual({ order: ["b", "c", "d", "a"], afterId: "d", beforeId: null })
  })

  it("is nothing when the row lands where it was, or the rows are not in the list", () => {
    expect(moveRowTo(ids, "b", "c", "before")).toBeUndefined()
    expect(moveRowTo(ids, "b", "a", "after")).toBeUndefined()
    expect(moveRowTo(ids, "b", "b", "after")).toBeUndefined()
    expect(moveRowTo(ids, "x", "a", "after")).toBeUndefined()
  })

  it("steps one place at a time, and not past the ends", () => {
    expect(stepRow(ids, "b", 1)).toEqual({ order: ["a", "c", "b", "d"], afterId: "c", beforeId: "d" })
    expect(stepRow(ids, "b", -1)).toEqual({ order: ["b", "a", "c", "d"], afterId: null, beforeId: "a" })
    expect(stepRow(ids, "a", -1)).toBeUndefined()
    expect(stepRow(ids, "d", 1)).toBeUndefined()
  })

  it("is only offered while the table is unsorted", () => {
    expect(canReorderRows([])).toBe(true)
    expect(canReorderRows([{ key: "name", direction: "asc" }])).toBe(false)
  })
})

describe("applying a move to the data", () => {
  const rows = ids.map((id) => ({ id }))

  it("takes the row out and puts it after or before its new neighbour", () => {
    expect(applyRowMove(rows, ids, { rowId: "a", afterId: "c", beforeId: "d" }).map((row) => row.id)).toEqual(["b", "c", "a", "d"])
    expect(applyRowMove(rows, ids, { rowId: "d", afterId: null, beforeId: "a" }).map((row) => row.id)).toEqual(["d", "a", "b", "c"])
  })

  it("leaves the data alone for a move it cannot place", () => {
    expect(applyRowMove(rows, ids, { rowId: "x", afterId: "a", beforeId: null }).map((row) => row.id)).toEqual(ids)
    expect(applyRowMove(rows, ids, { rowId: "a", afterId: "x", beforeId: null }).map((row) => row.id)).toEqual(ids)
    expect(applyRowMove(rows, ids, { rowId: "a", afterId: null, beforeId: null }).map((row) => row.id)).toEqual(ids)
  })

  it("places a row among neighbours that are not next to each other in the data — a filtered view", () => {
    // On screen: a, c, d (b is filtered out). Dropping d between a and c.
    expect(applyRowMove(rows, ids, { rowId: "d", afterId: "a", beforeId: "c" }).map((row) => row.id)).toEqual(["a", "d", "b", "c"])
  })
})
