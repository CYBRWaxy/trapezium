/**
 * A hundred thousand rows in the browser's memory: what each interaction costs.
 *
 * `getRows` — the whole pipeline a table runs between one interaction and the
 * next — timed for the three things people do to a big table: sort it, narrow
 * it with a set filter, and search it. Each is timed the first time and again,
 * because the table remembers: a page turn, a ticked box or a moved cursor
 * afterwards should cost nothing, and the second keystroke of a search a
 * fraction of the first.
 *
 * Run it with `node bench/scale.mjs` after `pnpm build`.
 */

import { performance } from "node:perf_hooks"

import {
  createPipelineCache,
  createState,
  createTypeRegistry,
  DEFAULT_FORMAT,
  getRows,
  resolveColumns,
  warmSearch,
} from "../packages/core/dist/index.js"

import { columns as allColumns, customTypes, makeRows } from "./dataset.mjs"

const types = createTypeRegistry(customTypes)
const format = { ...DEFAULT_FORMAT, now: new Date("2026-08-13T12:00:00.000Z") }
const SIZE = Number(process.argv[2] ?? 100_000)

/** Median of `runs` timings, in milliseconds. `fresh` gets a new cache each time: the first time is what is measured. */
function measure(work, runs = 7) {
  const timings = []
  for (let index = 0; index < runs; index += 1) {
    const started = performance.now()
    work()
    timings.push(performance.now() - started)
  }
  return timings.sort((a, b) => a - b)[Math.floor(timings.length / 2)]
}

function scenario(label, columns) {
  // Fresh rows for every scenario, so no search text built for one is reused by the next.
  const rows = makeRows(SIZE, 3)
  const resolved = resolveColumns({ columns, rows, state: createState(), types }).visible
  const run = (cache, state) => getRows({ rows, columns: resolved, state: createState({ pageSize: 50, ...state }), types, format, cache })

  const sort = { sort: [{ key: "name", direction: "asc" }] }
  const setFilter = { filters: [{ key: "plan", operator: "in", value: ["pro", "team"] }] }

  // The first time each is asked, on a table that has done nothing yet.
  const sortFirst = measure(() => run(createPipelineCache(), sort))
  const filterFirst = measure(() => run(createPipelineCache(), setFilter))

  // The first keystroke of a search, before any row's search text exists, can only be measured once.
  const searchRows = makeRows(SIZE, 3)
  const searchResolved = resolveColumns({ columns, rows: searchRows, state: createState(), types }).visible
  const searchRun = (cache, state) =>
    getRows({ rows: searchRows, columns: searchResolved, state: createState({ pageSize: 50, ...state }), types, format, cache })
  let started = performance.now()
  searchRun(createPipelineCache(), { search: "a" })
  const searchFirst = performance.now() - started
  // The first keystroke after the table has built its search text in idle time, as it does with a search box.
  const warmedRows = makeRows(SIZE, 3)
  const warmedResolved = resolveColumns({ columns, rows: warmedRows, state: createState(), types }).visible
  started = performance.now()
  warmSearch(warmedRows, warmedResolved, types, format, 0, Number.POSITIVE_INFINITY)
  const warmingTook = performance.now() - started
  started = performance.now()
  getRows({ rows: warmedRows, columns: warmedResolved, state: createState({ pageSize: 50, search: "a" }), types, format })
  const searchWarmed = performance.now() - started

  // Each later keystroke, with a cache that has the last one — as typing does.
  const typing = createPipelineCache()
  const searchNext = measure(() => {
    searchRun(typing, { search: "ad" })
    searchRun(typing, { search: "a" })
  }) / 2

  // Everything at once, then the interactions that change nothing the pipeline reads.
  const cache = createPipelineCache()
  const everything = { ...sort, ...setFilter, search: "e" }
  started = performance.now()
  run(cache, everything)
  const all = performance.now() - started
  const pageTurn = measure(() => run(cache, { ...everything, page: 7 }))
  const tick = measure(() => run(cache, { ...everything, page: 7, selection: ["1", "2"], focus: { rowId: "9", key: "name" } }))

  return { label, sortFirst, filterFirst, searchFirst, warmingTook, searchWarmed, searchNext, all, pageTurn, tick }
}

/** The ten columns most tables have: an id, text, numbers, money, a date, a choice and some tags. */
const TEN = ["id", "name", "email", "count", "amountCents", "seenAt", "birthday", "plan", "status", "tags"]

const results = [
  scenario(`${String(allColumns.length)} columns`, allColumns),
  scenario("10 columns", allColumns.filter((column) => TEN.includes(column.key))),
]

console.log(`\nTrapezium — ${SIZE.toLocaleString()} rows, getRows in milliseconds (median of 7)\n`)
const rowsOut = [
  ["sort by text", "sortFirst"],
  ["set filter (2 of 4 values)", "filterFirst"],
  ["search, first keystroke, cold", "searchFirst"],
  ["  building the search text in idle time", "warmingTook"],
  ["search, first keystroke, after it", "searchWarmed"],
  ["search, each later keystroke", "searchNext"],
  ["sort + set filter + search, cold", "all"],
  ["then turn the page", "pageTurn"],
  ["then tick a box / move the cursor", "tick"],
]
console.log("".padEnd(42) + results.map((result) => result.label.padStart(14)).join(""))
for (const [label, field] of rowsOut) {
  console.log(label.padEnd(42) + results.map((result) => result[field].toFixed(2).padStart(14)).join(""))
}
console.log()
