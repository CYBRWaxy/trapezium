/**
 * @vitest-environment jsdom
 *
 * Pinned rows in the DOM renderer.
 */
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderToString } from "./render-to-string.js"
import { createTable, type TableOptions } from "./table.js"

type Item = { id: string; name: string; amount: number | null }

const items: Item[] = [
  { id: "a", name: "Anvil", amount: 30 },
  { id: "b", name: "Bucket", amount: 10 },
  { id: "c", name: "Chain", amount: 20 },
]
const draft: Item = { id: "new", name: "", amount: null }
const totals: Item = { id: "total", name: "Total", amount: 60 }

let host: HTMLElement

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
})

afterEach(() => host.remove())

function options(extra: Partial<TableOptions<Item>> = {}): TableOptions<Item> {
  return {
    data: items,
    columns: ["name", "amount"],
    pinnedRows: { top: [draft], bottom: [totals] },
    ariaLabel: "Items",
    ...extra,
  }
}

const bodyNames = () =>
  [...host.querySelectorAll('tbody:not([data-pinned]) tr[data-row-id] [data-key="name"]')].map((cell) => cell.textContent)

describe("pinned rows", () => {
  it("draws them in bodies of their own above and below the data", () => {
    createTable(host, options())
    const bodies = [...host.querySelectorAll("table > tbody")]
    expect(bodies.map((tbody) => tbody.getAttribute("data-pinned"))).toEqual(["top", null, "bottom"])
    expect(bodies[2]?.textContent).toContain("Total")
  })

  it("is never sorted, filtered, counted or paged", () => {
    const table = createTable(host, options({ pagination: { pageSize: 2 } }))
    expect(host.querySelector(".tpz-count")?.textContent).toBe("3 rows")
    table.setState({ sort: [{ key: "amount", direction: "asc" }] })
    expect(bodyNames()).toEqual(["Bucket", "Chain"])
    table.setState({ search: "zzz" })
    expect(bodyNames()).toEqual([])
    expect(host.querySelector('tbody[data-pinned="bottom"]')?.textContent).toContain("Total")
  })

  it("cannot be selected", () => {
    createTable(host, options({ selection: true }))
    expect(host.querySelector('tbody[data-pinned] input[type="checkbox"]')).toBeNull()
    host.querySelector<HTMLInputElement>('thead [data-key="__select"] input')?.click()
    expect(host.querySelector(".tpz-count")?.textContent).toBe("3 selected")
  })

  it("is edited like any row, and the edit says it was a pinned one", () => {
    const onCellEdit = vi.fn()
    createTable(host, options({ columns: [{ key: "name", editable: true }, "amount"], onCellEdit }))
    const cell = host.querySelector<HTMLElement>('tbody[data-pinned="top"] td[data-key="name"]')
    cell?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    const input = host.querySelector<HTMLInputElement>(".tpz-editor-input")
    if (!input) throw new Error("no editor")
    input.value = "Drill"
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    expect(onCellEdit.mock.calls.at(-1)?.[0]).toMatchObject({ rowId: "new", value: "Drill", pinned: "top" })
  })

  it("is reached by the keyboard", () => {
    createTable(host, options({ cellNavigation: true }))
    expect(host.querySelector('td[tabindex="0"]')?.parentElement?.dataset["rowId"]).toBe("new")
    host.querySelector<HTMLElement>('tr[data-row-id="a"] td[data-key="name"]')?.focus()
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }))
    expect((document.activeElement as HTMLElement | null)?.parentElement?.dataset["rowId"]).toBe("new")
  })

  it("passes the automated accessibility checks", async () => {
    createTable(host, options({ selection: true }))
    const results = await axe.run(host, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})

describe("pinned rows on a server", () => {
  it("are written, a row height apart, as the client writes them", () => {
    const server = options({ pinnedRows: { top: [draft, { ...draft, id: "new2" }] } })
    const html = renderToString(server)
    expect(html).toContain("--tpz-pinned-offset: calc(1 * var(--tpz-row-height))")
    const table = createTable(host, server)
    expect(host.innerHTML).toBe(html)
    table.destroy()
  })
})
