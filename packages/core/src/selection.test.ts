import { describe, expect, it, vi } from "vitest"

import { rangeSelection, resolveSelection, selectableIds } from "./selection.js"

describe("rangeSelection", () => {
  const letters = ["a", "b", "c", "d", "e"]

  it("selects from the anchor to the target, either way round, on top of what was there", () => {
    expect(rangeSelection(["x"], letters, "b", "d")).toEqual(["x", "b", "c", "d"])
    expect(rangeSelection([], letters, "d", "b")).toEqual(["b", "c", "d"])
  })

  it("gives rows up again as the range shrinks back towards the anchor", () => {
    expect(rangeSelection([], letters, "b", "e")).toEqual(["b", "c", "d", "e"])
    expect(rangeSelection([], letters, "b", "c")).toEqual(["b", "c"])
  })

  it("starts at the target with no anchor on screen, and changes nothing for a target that is not", () => {
    expect(rangeSelection([], letters, undefined, "c")).toEqual(["c"])
    expect(rangeSelection([], letters, "gone", "c")).toEqual(["c"])
    expect(rangeSelection(["a"], letters, "b", "gone")).toEqual(["a"])
  })
})

type Row = { id: string; archived: boolean }

const rows: Row[] = [
  { id: "a", archived: false },
  { id: "b", archived: true },
  { id: "c", archived: false },
]
const ids = rows.map((row) => row.id)

describe("resolveSelection", () => {
  it("is off until asked", () => {
    expect(resolveSelection(undefined)).toBeUndefined()
    expect(resolveSelection(false)).toBeUndefined()
  })

  it("reads `true` as multiple", () => {
    expect(resolveSelection(true)?.mode).toBe("multiple")
  })

  it("takes a bare mode", () => {
    expect(resolveSelection("single")?.mode).toBe("single")
  })

  it("keeps the options and fills in the mode", () => {
    const isSelectable = (row: Row) => !row.archived
    const resolved = resolveSelection<Row>({ isSelectable })
    expect(resolved?.mode).toBe("multiple")
    expect(resolved?.isSelectable).toBe(isSelectable)
  })

  it("lets a separate onChange stand in, and the options' own win", () => {
    const fromProp = vi.fn()
    const fromOptions = vi.fn()

    expect(resolveSelection<Row>(true, fromProp)?.onChange).toBe(fromProp)
    expect(resolveSelection<Row>({ onChange: fromOptions }, fromProp)?.onChange).toBe(fromOptions)
  })
})

describe("selectableIds", () => {
  it("is every row when nothing is ruled out", () => {
    expect(selectableIds(rows, ids, undefined)).toEqual(["a", "b", "c"])
  })

  it("leaves out the rows the predicate refuses, keeping the order", () => {
    expect(selectableIds(rows, ids, (row) => !row.archived)).toEqual(["a", "c"])
  })

  it("hands the predicate the row's position", () => {
    const seen: number[] = []
    selectableIds(rows, ids, (_, index) => {
      seen.push(index)
      return true
    })
    expect(seen).toEqual([0, 1, 2])
  })
})
