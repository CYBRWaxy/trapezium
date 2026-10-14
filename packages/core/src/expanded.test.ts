import { describe, expect, it } from "vitest"

import { collapseAll, createState, isExpanded, setExpanded, setPage, setSearch, toggleExpanded } from "./state.js"
import { DEFAULT_URL_KEYS, pickUrlState, stateFromUrl, stateToQueryString } from "./url.js"

describe("detail rows in the state", () => {
  it("starts with nothing open", () => {
    expect(createState().expanded).toEqual([])
  })

  it("opens and closes one row at a time, leaving the others open", () => {
    let state = toggleExpanded(createState(), "a")
    state = toggleExpanded(state, "b")
    expect(state.expanded).toEqual(["a", "b"])

    state = toggleExpanded(state, "a")
    expect(state.expanded).toEqual(["b"])
    expect(isExpanded(state, "b")).toBe(true)
    expect(isExpanded(state, "a")).toBe(false)
  })

  it("opens or closes a set of rows without touching the rest", () => {
    let state = createState({ expanded: ["x"] })
    state = setExpanded(state, ["a", "b"], true)
    expect(state.expanded).toEqual(["x", "a", "b"])

    state = setExpanded(state, ["a", "x"], false)
    expect(state.expanded).toEqual(["b"])
  })

  it("closes everything, and returns the same state when nothing was open", () => {
    const open = createState({ expanded: ["a", "b"] })
    expect(collapseAll(open).expanded).toEqual([])

    const closed = createState()
    expect(collapseAll(closed)).toBe(closed)
  })

  it("reads a state that predates the key as nothing open", () => {
    const old = { ...createState() }
    delete old.expanded
    expect(isExpanded(old, "a")).toBe(false)
    expect(toggleExpanded(old, "a").expanded).toEqual(["a"])
    expect(setExpanded(old, ["a"], false).expanded).toEqual([])
    expect(collapseAll(old)).toBe(old)
  })

  it("keeps rows open across paging and searching, which do not change what a row is", () => {
    let state = createState({ expanded: ["a"] })
    state = setPage(state, 3)
    state = setSearch(state, "ada")
    expect(state.expanded).toEqual(["a"])
  })
})

describe("detail rows in the URL", () => {
  it("are left out unless asked for", () => {
    expect(DEFAULT_URL_KEYS).not.toContain("expanded")
    expect(stateToQueryString(createState({ expanded: ["a"] }))).toBe("")
  })

  it("round-trip when asked for, ids with separators included", () => {
    const include = [...DEFAULT_URL_KEYS, "expanded" as const]
    const state = createState({ expanded: ["a", "b,c", "d:e~f"] })
    const query = stateToQueryString(state, { include })

    expect(query.startsWith("open=")).toBe(true)
    expect(stateFromUrl(query, { include }).expanded).toEqual(["a", "b,c", "d:e~f"])
  })

  it("write nothing when nothing is open", () => {
    expect(stateToQueryString(createState(), { include: ["expanded"] })).toBe("")
  })

  it("are controlled by pickUrlState only when the URL carries them", () => {
    const state = createState({ expanded: ["a"] })
    expect(pickUrlState(state)).not.toHaveProperty("expanded")
    expect(pickUrlState(state, { include: ["expanded"] })).toEqual({ expanded: ["a"] })
  })
})
