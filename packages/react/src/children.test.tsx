import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { TableState } from "@trapezium/core"

import { Table } from "./table.js"
import type { TableProps } from "./types.js"

afterEach(cleanup)

type Line = { id: string; parent: string | null; name: string; amount: number }

const rows: Line[] = [
  { id: "o1", parent: null, name: "Order Ada", amount: 300 },
  { id: "l1", parent: "o1", name: "Bolts", amount: 50 },
  { id: "l2", parent: "o1", name: "Anvil", amount: 250 },
  { id: "o2", parent: null, name: "Order Tom", amount: 100 },
  { id: "l3", parent: "o2", name: "Chain", amount: 100 },
  { id: "o3", parent: null, name: "Order Zoe", amount: 200 },
]

function setup(props: Partial<TableProps<Line>> = {}) {
  return render(
    <Table
      data={rows}
      columns={["name", "amount"]}
      getParentId={(row) => row.parent}
      aria-label="Orders"
      {...props}
    />,
  )
}

/** Each body row's name, indented by depth. */
function shape(): string[] {
  return [...document.querySelectorAll<HTMLElement>("tbody tr[data-row-id]")].map(
    (tr) => `${tr.dataset["depth"] === "1" ? "  " : ""}${tr.querySelector('[data-key="name"]')?.textContent ?? ""}`,
  )
}

describe("child rows", () => {
  it("draws each child under its parent, indented, with a toggle on the parent", () => {
    setup()
    expect(shape()).toEqual(["Order Ada", "  Bolts", "  Anvil", "Order Tom", "  Chain", "Order Zoe"])
    expect(screen.getByRole("button", { name: "Hide 2 child rows of row 1" }).getAttribute("aria-expanded")).toBe("true")
    // A row with no children has the slot but no toggle, so its text lines up.
    const zoe = document.querySelector('tr[data-row-id="o3"] .tpz-tree')
    expect(zoe?.children).toHaveLength(0)
    // Pages and totals count parents.
    expect(screen.getByText("3 rows")).toBeDefined()
  })

  it("folds and unfolds a parent's children, and reports it in the state", async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn<(state: TableState) => void>()
    setup({ onStateChange })

    await user.click(screen.getByRole("button", { name: "Hide 2 child rows of row 1" }))
    expect(shape()).toEqual(["Order Ada", "Order Tom", "  Chain", "Order Zoe"])
    expect(onStateChange.mock.calls.at(-1)?.[0].collapsed).toEqual(["o1"])

    await user.click(screen.getByRole("button", { name: "Show 2 child rows of row 1" }))
    expect(shape()).toEqual(["Order Ada", "  Bolts", "  Anvil", "Order Tom", "  Chain", "Order Zoe"])
  })

  it("keeps children with their parent through a sort, sorted among themselves", async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole("button", { name: "Amount" }))
    expect(shape()).toEqual(["Order Tom", "  Chain", "Order Zoe", "Order Ada", "  Bolts", "  Anvil"])
  })

  it("shows a matching child's parent, marked as context", () => {
    setup({ search: true, defaultState: { search: "anvil" } })
    expect(shape()).toEqual(["Order Ada", "  Anvil"])
    expect(document.querySelector('tr[data-row-id="o1"]')?.getAttribute("data-context")).toBe("true")
  })

  it("never splits a family across pages", () => {
    setup({ pagination: { pageSize: 1 } })
    expect(shape()).toEqual(["Order Ada", "  Bolts", "  Anvil"])
    expect(screen.getByText("1–1 of 3")).toBeDefined()
  })

  it("lets children be selected like any row, and hands rowClassName where a row sits", async () => {
    const user = userEvent.setup()
    const classes = vi.fn((_: Line, __: number, info?: { depth: number }) => (info?.depth === 1 ? "child" : undefined))
    setup({ selection: true, rowClassName: classes })
    expect(document.querySelector('tr[data-row-id="l1"]')?.classList.contains("child")).toBe(true)

    await user.click(screen.getByRole("checkbox", { name: "Select row 2" }))
    expect(screen.getByText("1 selected")).toBeDefined()
  })

  it("exports children under their parents", async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    setup({ export: { onExport }, defaultState: { collapsed: ["o1"] } })
    await user.click(screen.getByRole("button", { name: "Export" }))
    await user.click(screen.getByRole("button", { name: "Download CSV" }))
    await vi.waitFor(() => expect(onExport).toHaveBeenCalled())
    const exported = onExport.mock.calls[0]?.[1] as Line[]
    expect(exported.map((row) => row.name)).toEqual(["Order Ada", "Bolts", "Anvil", "Order Tom", "Chain", "Order Zoe"])
  })

  it("makes the table a tree grid when the keyboard moves between cells", () => {
    setup({ cellNavigation: true, defaultState: { collapsed: ["o2"] } })
    expect(screen.getByRole("treegrid", { name: "Orders" })).toBeDefined()
    const ada = document.querySelector('tr[data-row-id="o1"]')
    expect(ada?.getAttribute("aria-level")).toBe("1")
    expect(ada?.getAttribute("aria-expanded")).toBe("true")
    expect(document.querySelector('tr[data-row-id="o2"]')?.getAttribute("aria-expanded")).toBe("false")
    expect(document.querySelector('tr[data-row-id="l1"]')?.getAttribute("aria-level")).toBe("2")
  })

  it("passes the automated accessibility checks, as a table and as a tree grid", async () => {
    const { container, unmount } = setup()
    let results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
    unmount()

    const grid = setup({ cellNavigation: true })
    results = await axe.run(grid.container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})

describe("child rows on a server", () => {
  const element = (
    <Table data={rows} columns={["name"]} getParentId={(row) => row.parent} defaultState={{ collapsed: ["o2"] }} />
  )

  it("renders the families, folded where the state says", () => {
    const html = renderToString(element)
    expect(html).toContain('data-depth="1"')
    expect(html).toContain("Bolts")
    expect(html).not.toContain("Chain")
  })

  it("hydrates without a mismatch", () => {
    const container = document.createElement("div")
    container.innerHTML = renderToString(element)
    document.body.append(container)
    const problems: unknown[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => problems.push(args))
    act(() => {
      hydrateRoot(container, element)
    })
    spy.mockRestore()
    container.remove()
    expect(problems).toEqual([])
  })
})
