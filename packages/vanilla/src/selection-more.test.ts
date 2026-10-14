/**
 * @vitest-environment jsdom
 *
 * Selecting every matching row, drag-select, Shift with an arrow, and Escape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTable, type TableOptions } from "./table.js"

type Person = { id: string; name: string; team: string; archived?: boolean }

const people: Person[] = Array.from({ length: 12 }, (_, index) => ({
  id: `p${String(index + 1)}`,
  name: `Person ${String(index + 1)}`,
  team: index % 2 === 0 ? "red" : "blue",
  archived: index === 3,
}))

let host: HTMLElement

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
})

afterEach(() => host.remove())

function options(extra: Partial<TableOptions<Person>> = {}): TableOptions<Person> {
  return { data: people, columns: ["name", "team"], pagination: { pageSize: 5 }, ...extra }
}

const count = () => host.querySelector(".tpz-count")?.textContent
const headerBox = () => host.querySelector<HTMLInputElement>('thead [data-key="__select"] input')
const key = (target: Element | null, name: string, init: KeyboardEventInit = {}) =>
  target?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }))

describe("selecting every matching row", () => {
  it("selects every row the filters leave, on every page, skipping rows that cannot be selected", () => {
    createTable(
      host,
      options({
        selection: { selectAll: "matching", isSelectable: (person) => !person.archived },
        defaultState: { filters: [{ key: "team", operator: "eq", value: "blue" }] },
      }),
    )
    expect(headerBox()?.getAttribute("aria-label")).toBe("Select all 6 matching rows")
    headerBox()?.click()
    expect(count()).toBe("5 selected")
    expect(headerBox()?.getAttribute("aria-label")).toBe("Clear selection")
    headerBox()?.click()
    expect(count()).toBe("6 rows")
  })

  it("asks the server for the matching rows in server mode", async () => {
    const all = vi.fn(async () => people)
    createTable(host, options({ data: people.slice(0, 5), server: { all }, total: 12, selection: { selectAll: "matching" } }))
    headerBox()?.click()
    await vi.waitFor(() => expect(count()).toBe("12 selected"))
    expect(all).toHaveBeenCalledTimes(1)
  })
})

describe("extending and clearing from the keyboard", () => {
  it("extends with Shift and an arrow, and gives rows up on the way back", () => {
    createTable(host, options({ selection: true, cellNavigation: true }))
    const cell = host.querySelector<HTMLElement>('tr[data-row-id="p2"] td[data-key="name"]')
    cell?.focus()
    key(cell, "ArrowDown", { shiftKey: true })
    key(document.activeElement, "ArrowDown", { shiftKey: true })
    expect(count()).toBe("3 selected")
    key(document.activeElement, "ArrowUp", { shiftKey: true })
    expect(count()).toBe("2 selected")
  })

  it("works from a row's checkbox, and Escape clears", () => {
    createTable(host, options({ selection: true }))
    const box = host.querySelector<HTMLInputElement>('tr[data-row-id="p1"] input.tpz-checkbox')
    box?.focus()
    key(box, "ArrowDown", { shiftKey: true })
    expect(count()).toBe("2 selected")
    key(document.activeElement, "Escape")
    expect(count()).toBe("12 rows")
  })
})

describe("drag-select", () => {
  it("selects every row a press sweeps across, swallowing the click that ends it", () => {
    const onRowClick = vi.fn()
    createTable(host, options({ selection: { dragSelect: true }, onRowClick }))
    const rows = [...host.querySelectorAll<HTMLElement>("tbody tr[data-row-id]")]
    rows.forEach((row, index) => {
      const top = index * 32
      row.getBoundingClientRect = () => ({ top, bottom: top + 32, left: 0, right: 500, width: 500, height: 32, x: 0, y: top, toJSON: () => ({}) })
    })
    const original = document.elementFromPoint
    document.elementFromPoint = (_x: number, y: number) => rows[Math.floor(y / 32)]?.querySelector("td") ?? null
    const pointer = (target: Element | Document, type: string, clientY: number) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY }))

    const start = rows[1]?.querySelector('[data-key="name"]')
    if (!start) throw new Error("no cell")
    pointer(start, "pointerdown", 40)
    pointer(document, "pointermove", 110)
    pointer(document, "pointerup", 110)
    rows[3]?.querySelector<HTMLElement>('[data-key="name"]')?.click()

    expect(count()).toBe("3 selected")
    expect(onRowClick).not.toHaveBeenCalled()
    document.elementFromPoint = original
  })
})
