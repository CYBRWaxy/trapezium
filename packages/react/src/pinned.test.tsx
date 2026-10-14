import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Table } from "./table.js"
import type { TableProps } from "./types.js"

afterEach(cleanup)

type Item = { id: string; name: string; amount: number | null }

const items: Item[] = [
  { id: "a", name: "Anvil", amount: 30 },
  { id: "b", name: "Bucket", amount: 10 },
  { id: "c", name: "Chain", amount: 20 },
]

const draft: Item = { id: "new", name: "", amount: null }
const totals: Item = { id: "total", name: "Total", amount: 60 }

function setup(props: Partial<TableProps<Item>> = {}) {
  return render(
    <Table
      data={items}
      columns={["name", "amount"]}
      pinnedRows={{ top: [draft], bottom: [totals] }}
      aria-label="Items"
      {...props}
    />,
  )
}

const bodyNames = () =>
  [...document.querySelectorAll('tbody:not([data-pinned]) tr[data-row-id] [data-key="name"]')].map((cell) => cell.textContent)

describe("pinned rows", () => {
  it("draws them in bodies of their own above and below the data", () => {
    setup()
    const top = document.querySelector('tbody[data-pinned="top"]')
    const bottom = document.querySelector('tbody[data-pinned="bottom"]')
    expect(top?.querySelectorAll("tr")).toHaveLength(1)
    expect(bottom?.textContent).toContain("Total")
    // Above and below the data in the document too.
    const bodies = [...document.querySelectorAll("table > tbody")]
    expect(bodies.indexOf(top as Element)).toBe(0)
    expect(bodies.indexOf(bottom as Element)).toBe(bodies.length - 1)
  })

  it("is never sorted, filtered, counted or paged", async () => {
    const user = userEvent.setup()
    setup({ search: true, pagination: { pageSize: 2 } })
    expect(screen.getByText("3 rows")).toBeDefined()

    await user.click(screen.getByRole("button", { name: "Amount" }))
    expect(bodyNames()).toEqual(["Bucket", "Chain"])
    expect(document.querySelector('tbody[data-pinned="bottom"]')?.textContent).toContain("Total")

    await user.type(screen.getByRole("searchbox", { name: "Search" }), "zzz")
    await vi.waitFor(() => expect(bodyNames()).toEqual([]))
    expect(document.querySelector('tbody[data-pinned="top"] tr')).toBeTruthy()
    expect(document.querySelector('tbody[data-pinned="bottom"]')?.textContent).toContain("Total")
  })

  it("cannot be selected, and the header checkbox leaves it alone", async () => {
    const user = userEvent.setup()
    setup({ selection: true })
    expect(document.querySelector('tbody[data-pinned] input[type="checkbox"]')).toBeNull()
    await user.click(screen.getByRole("checkbox", { name: "Select all rows on this page" }))
    expect(screen.getByText("3 selected")).toBeDefined()
  })

  it("is stacked from its edge, a row height each until measured", () => {
    setup({ pinnedRows: { top: [draft, { ...draft, id: "new2" }] } })
    const second = document.querySelector<HTMLElement>('tbody[data-pinned="top"] tr[data-row-id="new2"]')
    expect(second?.style.getPropertyValue("--tpz-pinned-offset")).toMatch(/calc\(1 \* var\(--tpz-row-height\)\)|^\d+px$/)
  })

  it("is edited like any row, and the edit says it was a pinned one", async () => {
    const user = userEvent.setup()
    const onCellEdit = vi.fn()
    setup({ columns: [{ key: "name", editable: true }, "amount"], onCellEdit })

    const cell = document.querySelector<HTMLElement>('tbody[data-pinned="top"] td[data-key="name"]')
    if (!cell) throw new Error("no pinned cell")
    await user.dblClick(cell)
    await user.type(document.querySelector<HTMLInputElement>(".tpz-editor-input") ?? cell, "Drill{Enter}")
    expect(onCellEdit.mock.calls.at(-1)?.[0]).toMatchObject({ rowId: "new", key: "name", value: "Drill", pinned: "top" })
  })

  it("is reached by the keyboard: up from the body's first row lands on the pinned row above", async () => {
    const user = userEvent.setup()
    setup({ cellNavigation: true })
    const first = document.querySelector<HTMLElement>('td[tabindex="0"]')
    // The tab stop starts on the first row of the grid, which is the pinned one.
    expect(first?.parentElement?.dataset["rowId"]).toBe("new")

    act(() => document.querySelector<HTMLElement>('tr[data-row-id="a"] td[data-key="name"]')?.focus())
    await user.keyboard("{ArrowUp}")
    expect(document.activeElement?.parentElement?.dataset["rowId"]).toBe("new")
    await user.keyboard("{Control>}{End}{/Control}")
    expect(document.activeElement?.parentElement?.dataset["rowId"]).toBe("total")
  })

  it("passes the automated accessibility checks", async () => {
    const { container } = setup({ selection: true })
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})

describe("pinned rows on a server", () => {
  const element = <Table data={items} columns={["name", "amount"]} pinnedRows={{ bottom: [totals] }} />

  it("renders them, and hydrates without a mismatch", () => {
    const html = renderToString(element)
    expect(html).toContain('data-pinned="bottom"')
    expect(html).toContain("Total")

    const container = document.createElement("div")
    container.innerHTML = html
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
