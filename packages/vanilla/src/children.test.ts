/**
 * @vitest-environment jsdom
 *
 * Child rows in the DOM renderer.
 */
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { TableState } from "@trapezium/core"

import { renderToString } from "./render-to-string.js"
import { createTable, type TableOptions } from "./table.js"

type Line = { id: string; parent: string | null; name: string; amount: number }

const rows: Line[] = [
  { id: "o1", parent: null, name: "Order Ada", amount: 300 },
  { id: "l1", parent: "o1", name: "Bolts", amount: 50 },
  { id: "l2", parent: "o1", name: "Anvil", amount: 250 },
  { id: "o2", parent: null, name: "Order Tom", amount: 100 },
  { id: "l3", parent: "o2", name: "Chain", amount: 100 },
  { id: "o3", parent: null, name: "Order Zoe", amount: 200 },
]

let host: HTMLElement

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
})

afterEach(() => host.remove())

function options(extra: Partial<TableOptions<Line>> = {}): TableOptions<Line> {
  return { data: rows, columns: ["name", "amount"], getParentId: (row) => row.parent, ariaLabel: "Orders", ...extra }
}

function shape(): string[] {
  return [...host.querySelectorAll<HTMLElement>("tbody tr[data-row-id]")].map(
    (tr) => `${tr.dataset["depth"] === "1" ? "  " : ""}${tr.querySelector('[data-key="name"]')?.textContent ?? ""}`,
  )
}

function toggle(label: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>(".tpz-tree-toggle")].find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  )
  if (!button) throw new Error(`no toggle "${label}"`)
  return button
}

describe("child rows", () => {
  it("draws each child under its parent, with a toggle on the parent", () => {
    createTable(host, options())
    expect(shape()).toEqual(["Order Ada", "  Bolts", "  Anvil", "Order Tom", "  Chain", "Order Zoe"])
    expect(toggle("Hide 2 child rows of row 1").getAttribute("aria-expanded")).toBe("true")
    expect(host.querySelector(".tpz-count")?.textContent).toBe("3 rows")
  })

  it("folds and unfolds, reports it, and keeps the toggle's focus", () => {
    const onStateChange = vi.fn<(state: TableState) => void>()
    createTable(host, options({ onStateChange }))

    const button = toggle("Hide 2 child rows of row 1")
    button.focus()
    button.click()
    expect(shape()).toEqual(["Order Ada", "Order Tom", "  Chain", "Order Zoe"])
    expect(onStateChange.mock.calls.at(-1)?.[0].collapsed).toEqual(["o1"])
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Show 2 child rows of row 1")

    toggle("Show 2 child rows of row 1").click()
    expect(shape()).toHaveLength(6)
  })

  it("keeps children with their parent through a sort", () => {
    const table = createTable(host, options())
    table.setState({ sort: [{ key: "amount", direction: "asc" }] })
    expect(shape()).toEqual(["Order Tom", "  Chain", "Order Zoe", "Order Ada", "  Bolts", "  Anvil"])
  })

  it("shows a matching child's parent, marked as context", () => {
    createTable(host, options({ defaultState: { search: "anvil" } }))
    expect(shape()).toEqual(["Order Ada", "  Anvil"])
    expect(host.querySelector('tr[data-row-id="o1"]')?.getAttribute("data-context")).toBe("true")
  })

  it("never splits a family across pages", () => {
    createTable(host, options({ pagination: { pageSize: 1 } }))
    expect(shape()).toEqual(["Order Ada", "  Bolts", "  Anvil"])
  })

  it("is a tree grid with cell navigation", () => {
    createTable(host, options({ cellNavigation: true }))
    expect(host.querySelector("table")?.getAttribute("role")).toBe("treegrid")
    expect(host.querySelector('tr[data-row-id="l1"]')?.getAttribute("aria-level")).toBe("2")
    expect(host.querySelector('tr[data-row-id="o1"]')?.getAttribute("aria-expanded")).toBe("true")
  })

  it("passes the automated accessibility checks", async () => {
    createTable(host, options({ selection: true }))
    const results = await axe.run(host, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})

describe("child rows on a server", () => {
  it("renders the families, folded where the state says, as the client does", () => {
    const server = options({ defaultState: { collapsed: ["o2"] } })
    const html = renderToString(server)
    expect(html).toContain('data-depth="1"')
    expect(html).not.toContain("Chain")
    const table = createTable(host, server)
    expect(host.innerHTML).toBe(html)
    table.destroy()
  })
})
