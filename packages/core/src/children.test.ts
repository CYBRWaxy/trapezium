import { describe, expect, it } from "vitest"

import { parentIdsWithChildren } from "./children.js"
import { resolveColumns } from "./columns.js"
import { DEFAULT_FORMAT } from "./format.js"
import { getRows } from "./pipeline.js"
import { defaultTypeRegistry } from "./registry.js"
import { createState, isCollapsed, setCollapsed, toggleCollapsed } from "./state.js"
import type { TableState } from "./types.js"
import { DEFAULT_URL_KEYS, stateFromUrl, stateToQueryString } from "./url.js"

type Line = { id: string; parent?: string | null; name: string; amount: number }

/*
  Two orders with lines, one order with none, and a line whose order is not in
  the data.
*/
const rows: Line[] = [
  { id: "o1", name: "Order Ada", amount: 300 },
  { id: "l1", parent: "o1", name: "Bolts", amount: 50 },
  { id: "o2", name: "Order Tom", amount: 100 },
  { id: "l2", parent: "o1", name: "Anvil", amount: 250 },
  { id: "l3", parent: "o2", name: "Chain", amount: 100 },
  { id: "o3", name: "Order Zoe", amount: 200 },
  { id: "l9", parent: "gone", name: "Orphan", amount: 5 },
]

const columns = resolveColumns({ rows, columns: ["name", "amount"], state: createState(), types: defaultTypeRegistry }).visible

function run(partial: Partial<TableState> = {}, extra: { server?: boolean; total?: number; reveal?: string; accumulate?: boolean } = {}) {
  return getRows({
    rows,
    columns,
    state: createState({ pageSize: 0, ...partial }),
    types: defaultTypeRegistry,
    format: DEFAULT_FORMAT,
    getParentId: (row) => row.parent,
    ...extra,
  })
}

const names = (result: { rows: Line[] }) => result.rows.map((row) => row.name)

describe("child rows", () => {
  it("draws each child directly under its parent, in the order given", () => {
    const result = run()
    expect(names(result)).toEqual(["Order Ada", "Bolts", "Anvil", "Order Tom", "Chain", "Order Zoe", "Orphan"])
    expect(result.info?.map((info) => info.depth)).toEqual([0, 1, 1, 0, 1, 0, 0])
    expect(result.info?.[0]).toEqual({ depth: 0, childCount: 2, context: false })
    expect(result.info?.[1]).toEqual({ depth: 1, parentId: "o1", childCount: 0, context: false })
  })

  it("counts families, not rows", () => {
    const result = run()
    expect(result.total).toBe(4)
    expect(result.totalUnfiltered).toBe(4)
    expect(result.filtered).toBe(false)
  })

  it("shows a row whose parent is missing as a row of its own", () => {
    const result = run()
    expect(result.info?.[names(result).indexOf("Orphan")]).toEqual({ depth: 0, childCount: 0, context: false })
  })

  describe("sorting", () => {
    it("orders the parents, and each parent's children among themselves", () => {
      const result = run({ sort: [{ key: "amount", direction: "asc" }] })
      expect(names(result)).toEqual(["Orphan", "Order Tom", "Chain", "Order Zoe", "Order Ada", "Bolts", "Anvil"])

      const descending = run({ sort: [{ key: "name", direction: "desc" }] })
      expect(names(descending)).toEqual(["Orphan", "Order Zoe", "Order Tom", "Chain", "Order Ada", "Bolts", "Anvil"])
    })
  })

  describe("filtering and search", () => {
    it("shows a matching child under its parent, the parent marked as context", () => {
      const result = run({ search: "anvil" })
      expect(names(result)).toEqual(["Order Ada", "Anvil"])
      expect(result.info?.[0]).toEqual({ depth: 0, childCount: 1, context: true })
      expect(result.total).toBe(1)
      expect(result.filtered).toBe(true)
    })

    it("shows a matching parent alone when none of its children match", () => {
      const result = run({ search: "Order Tom" })
      expect(names(result)).toEqual(["Order Tom"])
      expect(result.info?.[0]).toEqual({ depth: 0, childCount: 0, context: false })
    })

    it("shows a matching parent with its matching children, and not the others", () => {
      const result = run({ filters: [{ key: "amount", operator: "gte", value: 250 }] })
      expect(names(result)).toEqual(["Order Ada", "Anvil"])
      expect(result.info?.[0]?.context).toBe(false)
    })

    it("hands an export every matching row, children under their parents", () => {
      expect(names({ rows: run({ search: "o" }).matched })).toEqual([
        "Order Ada",
        "Bolts",
        "Order Tom",
        "Order Zoe",
        "Orphan",
      ])
    })
  })

  describe("paging", () => {
    it("pages by family, so a parent and its children are never split", () => {
      const first = run({ pageSize: 1, page: 1 })
      expect(names(first)).toEqual(["Order Ada", "Bolts", "Anvil"])
      expect(first.pageCount).toBe(4)

      const second = run({ pageSize: 1, page: 2 })
      expect(names(second)).toEqual(["Order Tom", "Chain"])
    })

    it("keeps every page loaded so far in the append modes", () => {
      expect(names(run({ pageSize: 2, page: 2 }, { accumulate: true }))).toHaveLength(7)
    })

    it("reveals the page a child is on", () => {
      const result = run({ pageSize: 1, page: 1 }, { reveal: "l3" })
      expect(result.page).toBe(2)
      expect(names(result)).toEqual(["Order Tom", "Chain"])
    })
  })

  describe("folding", () => {
    it("leaves a folded parent's children out of what is drawn, but not out of an export", () => {
      const result = run({ collapsed: ["o1"] })
      expect(names(result)).toEqual(["Order Ada", "Order Tom", "Chain", "Order Zoe", "Orphan"])
      expect(result.info?.[0]?.childCount).toBe(2)
      expect(result.matched).toHaveLength(7)
    })

    it("is toggled, set and read in the state", () => {
      let state = toggleCollapsed(createState(), "o1")
      expect(isCollapsed(state, "o1")).toBe(true)
      state = setCollapsed(state, ["o2", "o3"], true)
      expect(state.collapsed).toEqual(["o1", "o2", "o3"])
      state = setCollapsed(state, ["o1", "o2"], false)
      expect(state.collapsed).toEqual(["o3"])
      expect(toggleCollapsed(state, "o3").collapsed).toEqual([])
    })

    it("travels in the URL when asked", () => {
      const include = [...DEFAULT_URL_KEYS, "collapsed" as const]
      const state = createState({ collapsed: ["o1", "o,2"] })
      expect(stateToQueryString(state)).toBe("")
      const query = stateToQueryString(state, { include })
      expect(query.startsWith("fold=")).toBe(true)
      expect(stateFromUrl(query, { include }).collapsed).toEqual(["o1", "o,2"])
    })

    it("finds every parent with children, for collapsing them all", () => {
      expect(parentIdsWithChildren(rows, (row) => row.parent).sort()).toEqual(["o1", "o2"])
    })
  })

  describe("in server mode", () => {
    it("groups the page it is given without filtering, sorting or paging it", () => {
      const result = run({ search: "anvil", pageSize: 2, page: 3 }, { server: true, total: 40 })
      expect(names(result)).toEqual(["Order Ada", "Bolts", "Anvil", "Order Tom", "Chain", "Order Zoe", "Orphan"])
      expect(result.total).toBe(40)
      expect(result.page).toBe(3)
      expect(result.filtered).toBe(true)
    })
  })

  describe("deeper chains", () => {
    it("places a grandchild under the top of its chain, and survives a loop", () => {
      const deep: Line[] = [
        { id: "a", name: "A", amount: 1 },
        { id: "b", parent: "a", name: "B", amount: 2 },
        { id: "c", parent: "b", name: "C", amount: 3 },
        { id: "x", parent: "y", name: "X", amount: 4 },
        { id: "y", parent: "x", name: "Y", amount: 5 },
      ]
      const result = getRows({
        rows: deep,
        columns,
        state: createState({ pageSize: 0 }),
        types: defaultTypeRegistry,
        format: DEFAULT_FORMAT,
        getParentId: (row) => row.parent,
      })
      expect(names(result).slice(0, 3)).toEqual(["A", "B", "C"])
      expect(result.info?.slice(0, 3).map((info) => info.depth)).toEqual([0, 1, 1])
      // A loop has no top: both rows are shown, neither lost.
      expect(names(result)).toHaveLength(5)
    })
  })
})
