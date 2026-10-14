import { describe, expect, it } from "vitest"

import { resolveColumns } from "./columns.js"
import { DEFAULT_FORMAT } from "./format.js"
import { createPipelineCache } from "./pipeline-cache.js"
import { getRows } from "./pipeline.js"
import { createTypeRegistry, defaultTypeRegistry } from "./registry.js"
import { createState } from "./state.js"
import type { TableState } from "./types.js"

type Row = { id: string; name: string; n: number }

const rows: Row[] = Array.from({ length: 50 }, (_, index) => ({ id: String(index), name: `Name ${String(index % 7)}`, n: index }))

/** A column whose accessor counts how often the pipeline reads it — once per row per stage that runs. */
function counted() {
  const reads = { count: 0 }
  const columns = resolveColumns({
    rows,
    state: createState(),
    types: defaultTypeRegistry,
    columns: [
      {
        key: "name",
        accessor: (row: Row) => {
          reads.count += 1
          return row.name
        },
      },
      "n",
    ],
  }).visible
  return { reads, columns }
}

describe("the pipeline cache", () => {
  it("turns a page, ticks a box and moves the cursor without filtering, searching or sorting again", () => {
    const cache = createPipelineCache<Row>()
    const { reads, columns } = counted()
    const run = (state: Partial<TableState>) =>
      getRows({ rows, columns, state: createState({ pageSize: 10, search: "name 3", sort: [{ key: "name", direction: "desc" }], ...state }), types: defaultTypeRegistry, format: DEFAULT_FORMAT, cache })

    const first = run({})
    expect(reads.count).toBeGreaterThan(0)
    const after = reads.count

    const second = run({ page: 2, selection: ["1"], focus: { rowId: "3" }, expanded: ["4"] })
    expect(reads.count).toBe(after)
    expect(second.total).toBe(first.total)
  })

  it("runs again exactly the stages a change reaches", () => {
    const cache = createPipelineCache<Row>()
    const { columns } = counted()
    const base = { rows, columns, types: defaultTypeRegistry, format: DEFAULT_FORMAT, cache }

    const sorted = getRows({ ...base, state: createState({ pageSize: 0, sort: [{ key: "n", direction: "desc" }] }) })
    expect(sorted.rows[0]?.n).toBe(49)

    // A new sort reorders the same matches.
    const ascending = getRows({ ...base, state: createState({ pageSize: 0, sort: [{ key: "n", direction: "asc" }] }) })
    expect(ascending.rows[0]?.n).toBe(0)

    // A new filter changes what matches.
    const filtered = getRows({ ...base, state: createState({ pageSize: 0, filters: [{ key: "n", operator: "lt", value: 3 }] }) })
    expect(filtered.rows.map((row) => row.n)).toEqual([0, 1, 2])
  })

  it("starts again for new rows, new columns, new types or new formatting", () => {
    // A remembered answer is the very array handed back last time; a fresh one is a new array.
    const cache = createPipelineCache<Row>()
    const { columns } = counted()
    const state = createState({ pageSize: 0, sort: [{ key: "n", direction: "desc" }] })
    const run = (overrides: Partial<Parameters<typeof getRows<Row>>[0]> = {}) =>
      getRows({ rows, columns, state, types: defaultTypeRegistry, format: DEFAULT_FORMAT, cache, ...overrides }).matched

    const first = run()
    expect(run()).toBe(first)
    expect(run({ state: { ...state, page: 3, selection: ["2"] } })).toBe(first)

    expect(run({ rows: [...rows] })).not.toBe(first)
    const second = run()
    expect(run({ types: createTypeRegistry({}) })).not.toBe(second)
    const third = run()
    expect(run({ format: { ...DEFAULT_FORMAT, locale: "fr" } })).not.toBe(third)
    const fourth = run()
    expect(run({ columns: counted().columns })).not.toBe(fourth)
  })

  it("is not needed: without one every run starts from nothing, and gives the same answer", () => {
    const { columns } = counted()
    const state = createState({ pageSize: 5, page: 2, sort: [{ key: "n", direction: "desc" }] })
    const plain = getRows({ rows, columns, state, types: defaultTypeRegistry, format: DEFAULT_FORMAT })
    const cached = getRows({ rows, columns, state, types: defaultTypeRegistry, format: DEFAULT_FORMAT, cache: createPipelineCache<Row>() })
    expect(cached.rows).toEqual(plain.rows)
  })

  it("keeps the same accessor for a key from one resolve to the next, so the cache can tell nothing changed", () => {
    const resolve = () => resolveColumns({ rows, state: createState(), types: defaultTypeRegistry, columns: ["name"] }).visible[0]?.accessor
    expect(resolve()).toBe(resolve())
  })
})
