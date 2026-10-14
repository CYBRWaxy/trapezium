/**
 * @vitest-environment jsdom
 *
 * Moving between cells with the keyboard, in the DOM renderer.
 */
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { focusCell, type TableState } from "@trapezium/core"

import { renderToString } from "./render-to-string.js"
import { createTable, type TableOptions } from "./table.js"

type Person = { id: string; name: string; age: number; site: string }

const people: Person[] = Array.from({ length: 30 }, (_, index) => ({
  id: `p${String(index + 1)}`,
  name: `Person ${String(index + 1)}`,
  age: 20 + index,
  site: `https://example.com/${String(index + 1)}`,
}))

let host: HTMLElement

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
})

afterEach(() => {
  host.remove()
})

function options(extra: Partial<TableOptions<Person>> = {}): TableOptions<Person> {
  return {
    data: people,
    columns: ["name", "age", "site"],
    cellNavigation: true,
    pagination: { pageSize: 10 },
    ariaLabel: "People",
    ...extra,
  }
}

function active(): string {
  const cell = document.activeElement
  if (!(cell instanceof HTMLElement)) return ""
  const td = cell.closest("td")
  return `${td?.parentElement?.dataset["rowId"] ?? ""}/${td?.dataset["key"] ?? ""}${td === cell ? "" : ` > ${cell.tagName.toLowerCase()}`}`
}

function press(key: string, init: KeyboardEventInit = {}) {
  const target = document.activeElement ?? document.body
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  // A real Space on a focused checkbox would tick it; the test does what the browser would.
  return event
}

function enterGrid() {
  host.querySelector<HTMLElement>('tbody td[tabindex="0"]')?.focus()
}

describe("cell navigation", () => {
  it("makes the table a grid with one stop in the tab order", () => {
    createTable(host, options())
    expect(host.querySelector("table")?.getAttribute("role")).toBe("grid")
    expect(host.querySelectorAll('tbody td[tabindex="0"]')).toHaveLength(1)
    expect(host.querySelector('tbody td[tabindex="0"]')?.parentElement?.dataset["rowId"]).toBe("p1")
  })

  it("moves with the arrows, Home, End and Page keys, and stays put at the edges", () => {
    createTable(host, options())
    enterGrid()

    press("ArrowDown")
    press("ArrowDown")
    press("ArrowRight")
    expect(active()).toBe("p3/age")
    press("End")
    expect(active()).toBe("p3/site")
    press("ArrowRight")
    expect(active()).toBe("p3/site")
    press("Home")
    expect(active()).toBe("p3/name")
    press("End", { ctrlKey: true })
    expect(active()).toBe("p10/site")
    press("Home", { ctrlKey: true })
    expect(active()).toBe("p1/name")
    press("ArrowUp")
    expect(active()).toBe("p1/name")
  })

  it("moves the tab stop with the keyboard, without rebuilding the rows", () => {
    createTable(host, options())
    const firstRow = host.querySelector('tbody tr[data-row-id="p1"]')
    enterGrid()
    press("ArrowDown")
    press("ArrowRight")

    const stops = [...host.querySelectorAll<HTMLElement>('tbody td[tabindex="0"]')]
    expect(stops).toHaveLength(1)
    expect(stops[0]?.parentElement?.dataset["rowId"]).toBe("p2")
    expect(stops[0]?.dataset["key"]).toBe("age")
    expect(host.querySelector('tbody tr[data-row-id="p1"]')).toBe(firstRow)
  })

  it("reports the active cell in the state and highlights its row", () => {
    const onStateChange = vi.fn<(state: TableState) => void>()
    createTable(host, options({ onStateChange }))
    enterGrid()
    press("ArrowDown")
    expect(onStateChange.mock.calls.at(-1)?.[0].focus).toEqual({ rowId: "p2", key: "name" })
    expect(host.querySelector('tr[data-row-id="p2"]')?.getAttribute("data-focused")).toBe("true")
    expect(host.querySelector('tr[data-row-id="p1"]')?.hasAttribute("data-focused")).toBe(false)
  })

  it("goes into a cell's link with Enter and comes back out with Escape", () => {
    createTable(host, options({ defaultState: { focus: { rowId: "p2", key: "site" } } }))
    enterGrid()
    press("Enter")
    expect(active()).toBe("p2/site > a")
    press("Escape")
    expect(active()).toBe("p2/site")
  })

  it("works the selection checkbox and the expander from their cells", () => {
    createTable(host, options({ selection: true, detail: { render: ({ row }) => `About ${row.name}` } }))
    enterGrid()
    expect(active()).toBe("p1/__select")
    press(" ")
    expect(host.querySelector(".tpz-count")?.textContent).toBe("1 selected")

    press("ArrowRight")
    press("Enter")
    expect(host.querySelector(".tpz-detail")?.textContent).toBe("About Person 1")
    expect(active()).toBe("p1/__expand")
    expect(host.querySelector<HTMLInputElement>("tbody input.tpz-checkbox")?.tabIndex).toBe(-1)
  })

  it("puts the focus back on the active cell when the rows are rebuilt under it", () => {
    const table = createTable(host, options())
    enterGrid()
    press("ArrowDown")
    // New row objects: every row is built again.
    table.setData(people.map((person) => ({ ...person })))
    expect(active()).toBe("p2/name")
  })

  it("is off by default", () => {
    createTable(host, { data: people, columns: ["name"] })
    expect(host.querySelector("table")?.hasAttribute("role")).toBe(false)
    expect(host.querySelectorAll("tbody td[tabindex]")).toHaveLength(0)
  })

  it("passes the automated accessibility checks as a grid", async () => {
    createTable(host, options({ selection: true }))
    const results = await axe.run(host, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    })
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })
})

describe("making a cell active from outside", () => {
  it("brings the row's page up, highlights it, scrolls to it and focuses it", () => {
    const scrolled: Element[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this)
    }
    const onStateChange = vi.fn<(state: TableState) => void>()

    const table = createTable(host, options({ onStateChange }))
    table.setOptions({ state: focusCell(table.getState(), "p25", "age") })

    expect(host.textContent).toContain("Person 25")
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("3")
    expect(onStateChange.mock.calls.at(-1)?.[0].page).toBe(3)
    expect(host.querySelector('tr[data-row-id="p25"]')?.getAttribute("data-focused")).toBe("true")
    expect(active()).toBe("p25/age")
    expect(scrolled.length).toBeGreaterThan(0)

    Element.prototype.scrollIntoView = original
  })

  it("does not drag the table back once the user pages away", () => {
    const table = createTable(host, options())
    table.setOptions({ state: focusCell(table.getState(), "p25") })
    table.setState({ page: 1 })
    expect(host.textContent).toContain("Person 1")
    expect(host.textContent).not.toContain("Person 25")
  })

  it("highlights without taking the focus when the cells are not navigable", () => {
    const outside = document.createElement("button")
    document.body.append(outside)
    outside.focus()

    const table = createTable(host, options({ cellNavigation: false }))
    table.setOptions({ state: focusCell(table.getState(), "p4") })
    expect(host.querySelector('tr[data-row-id="p4"]')?.getAttribute("data-focused")).toBe("true")
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })
})

describe("cell navigation on a server", () => {
  const server = options({ defaultState: { focus: { rowId: "p14", key: "age" } } })

  it("renders the active row's page with the tab stop on its cell", () => {
    const html = renderToString(server)
    expect(html).toContain('role="grid"')
    expect(html).toContain("Person 14")
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html).toContain('data-focused="true" data-row-id="p14"')
  })

  it("is byte for byte what the client renders", () => {
    const html = renderToString(server)
    const table = createTable(host, server)
    expect(host.innerHTML).toBe(html)
    table.destroy()
  })
})
