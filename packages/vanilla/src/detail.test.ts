/**
 * @vitest-environment jsdom
 *
 * Detail rows in the DOM renderer, which Vue and Svelte share.
 */
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { TableState } from "@trapezium/core"

import { el } from "./dom.js"
import { renderToString } from "./render-to-string.js"
import { createTable, type TableOptions } from "./table.js"

type Order = { id: string; customer: string; total: number; lines: number }

const orders: Order[] = [
  { id: "a", customer: "Ada", total: 120, lines: 2 },
  { id: "b", customer: "Tom", total: 80, lines: 0 },
  { id: "c", customer: "Zoe", total: 300, lines: 5 },
]

let host: HTMLElement

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
})

afterEach(() => {
  host.remove()
})

function options(extra: Partial<TableOptions<Order>> = {}): TableOptions<Order> {
  return {
    data: orders,
    columns: ["customer", "total"],
    detail: { render: ({ row }) => `Lines of ${row.customer}` },
    ariaLabel: "Orders",
    ...extra,
  }
}

function shape(): string[] {
  return [...host.querySelectorAll("tbody tr")].map((tr) =>
    tr.classList.contains("tpz-detail-row")
      ? `detail:${tr.textContent ?? ""}`
      : (tr.querySelector('[data-key="customer"]')?.textContent ?? ""),
  )
}

function expander(name: string | RegExp): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>(".tpz-expander")].find((candidate) => {
    const label = candidate.getAttribute("aria-label") ?? ""
    return typeof name === "string" ? label === name : name.test(label)
  })
  if (!button) throw new Error(`no expander called ${String(name)}`)
  return button
}

describe("detail rows", () => {
  it("leads with an expander column and opens nothing until asked", () => {
    createTable(host, options())
    expect(host.querySelectorAll('thead [data-key="__expand"]')).toHaveLength(1)
    expect(host.querySelectorAll("tbody .tpz-expander")).toHaveLength(3)
    expect(shape()).toEqual(["Ada", "Tom", "Zoe"])
  })

  it("opens below its row, spanning every column, and closes again — keeping the expander's focus", () => {
    createTable(host, options({ selection: true }))

    const button = expander("Show details for row 1")
    button.focus()
    button.click()
    expect(shape()).toEqual(["Ada", "detail:Lines of Ada", "Tom", "Zoe"])
    expect(host.querySelector(".tpz-detail-cell")?.getAttribute("colspan")).toBe("4")

    // The same button, still focused: the rows were not rebuilt.
    expect(document.activeElement).toBe(button)
    expect(button.getAttribute("aria-expanded")).toBe("true")
    expect(document.getElementById(button.getAttribute("aria-controls") ?? "")).toBe(
      host.querySelector(".tpz-detail-row"),
    )

    button.click()
    expect(shape()).toEqual(["Ada", "Tom", "Zoe"])
    expect(button.getAttribute("aria-label")).toBe("Show details for row 1")
  })

  it("keeps any number open, and reports them in the state", () => {
    const onStateChange = vi.fn<(state: TableState) => void>()
    createTable(host, options({ onStateChange }))
    expander("Show details for row 1").click()
    expander("Show details for row 3").click()
    expect(shape()).toEqual(["Ada", "detail:Lines of Ada", "Tom", "Zoe", "detail:Lines of Zoe"])
    expect(onStateChange.mock.calls.at(-1)?.[0].expanded).toEqual(["a", "c"])
  })

  it("follows a state handed in", () => {
    const table = createTable(host, options())
    table.setOptions({ state: { expanded: ["b"] } })
    expect(shape()).toEqual(["Ada", "Tom", "detail:Lines of Tom", "Zoe"])
  })

  it("leaves rows that canExpand refuses without an expander, even when the state names them", () => {
    createTable(
      host,
      options({ detail: { render: () => "Lines", canExpand: (row) => row.lines > 0 }, defaultState: { expanded: ["b"] } }),
    )
    expect(host.querySelectorAll("tbody .tpz-expander")).toHaveLength(2)
    expect(host.querySelectorAll(".tpz-detail-row")).toHaveLength(0)
  })

  it("opens and closes every row on the page from the header", () => {
    createTable(host, options({ detail: { render: () => "x", canExpand: (row) => row.lines > 0 } }))
    expander("Show details for every row on this page").click()
    expect(host.querySelectorAll(".tpz-detail-row")).toHaveLength(2)
    expander("Hide details for every row on this page").click()
    expect(host.querySelectorAll(".tpz-detail-row")).toHaveLength(0)
  })

  it("is closed by the collapse it is handed", () => {
    createTable(
      host,
      options({
        detail: {
          render: ({ collapse }) => {
            const button = el("button", { type: "button", text: "Done" })
            button.addEventListener("click", collapse)
            return button
          },
        },
        defaultState: { expanded: ["a"] },
      }),
    )
    host.querySelector<HTMLButtonElement>(".tpz-detail button")?.click()
    expect(host.querySelectorAll(".tpz-detail-row")).toHaveLength(0)
  })

  it("follows its row through a sort", () => {
    const table = createTable(host, options({ defaultState: { expanded: ["a"] } }))
    table.setState({ sort: [{ key: "total", direction: "desc" }] })
    expect(shape()).toEqual(["Zoe", "Ada", "detail:Lines of Ada", "Tom"])
  })

  it("never counts as a row", () => {
    createTable(host, options({ selection: true, pagination: { pageSize: 2 }, defaultState: { expanded: ["a", "b"] } }))
    expect(host.querySelectorAll("tbody tr")).toHaveLength(4)
    expect(host.querySelector(".tpz-count")?.textContent).toBe("3 rows")

    host.querySelector<HTMLInputElement>('thead [data-key="__select"] input')?.click()
    expect(host.querySelector(".tpz-count")?.textContent).toBe("2 selected")
  })

  describe("toggleOnRowClick", () => {
    it("opens from anywhere on the row, but not from a control inside it", () => {
      const onRowClick = vi.fn()
      createTable(
        host,
        options({
          onRowClick,
          columns: [
            "customer",
            { key: "act", header: "", render: () => el("button", { type: "button", class: "act", text: "Act" }) },
          ],
          detail: { render: ({ row }) => `Lines of ${row.customer}`, toggleOnRowClick: true },
        }),
      )

      ;[...host.querySelectorAll<HTMLElement>('tbody [data-key="customer"]')][1]?.click()
      expect(shape()).toEqual(["Ada", "Tom", "detail:Lines of Tom", "Zoe"])
      expect(onRowClick).toHaveBeenCalledTimes(1)

      host.querySelector<HTMLButtonElement>("button.act")?.click()
      expect(onRowClick).toHaveBeenCalledTimes(1)
      expect(host.querySelectorAll(".tpz-detail-row")).toHaveLength(1)
    })
  })

  describe("keepMounted", () => {
    it("builds a detail once and keeps it hidden while closed", () => {
      let built = 0
      createTable(
        host,
        options({
          detail: {
            render: ({ row }) => {
              built += 1
              return `Lines of ${row.customer}`
            },
            keepMounted: true,
          },
        }),
      )

      expect(host.querySelectorAll(".tpz-detail-row")).toHaveLength(0)
      const button = expander(/details for row 1$/)
      button.click()
      button.click()
      expect(host.querySelector<HTMLElement>(".tpz-detail-row")?.hidden).toBe(true)
      button.click()
      expect(host.querySelector<HTMLElement>(".tpz-detail-row")?.hidden).toBe(false)
      expect(built).toBe(1)
    })

    it("keeps it through a rebuild of the rows, such as a sort", () => {
      let built = 0
      const table = createTable(
        host,
        options({
          detail: {
            render: () => {
              built += 1
              return "Lines"
            },
            keepMounted: true,
          },
          defaultState: { expanded: ["a"] },
        }),
      )
      table.setState({ sort: [{ key: "total", direction: "asc" }] })
      expect(built).toBe(1)
    })

    it("unmounts a closed detail when not asked to keep it", () => {
      let built = 0
      createTable(
        host,
        options({
          detail: {
            render: () => {
              built += 1
              return "Lines"
            },
          },
        }),
      )
      const button = expander(/details for row 1$/)
      button.click()
      button.click()
      expect(host.querySelectorAll(".tpz-detail-row")).toHaveLength(0)
      button.click()
      expect(built).toBe(2)
    })
  })

  it("adds an appended page after the last row's open detail, leaving the rest alone", () => {
    const many = Array.from({ length: 6 }, (_, index) => ({ id: String(index), customer: `C${index}`, total: index, lines: 1 }))
    createTable(host, options({ data: many, pagination: { mode: "loadMore", pageSize: 3 }, defaultState: { expanded: ["2"] } }))

    const detail = host.querySelector(".tpz-detail-row")
    host.querySelector<HTMLButtonElement>(".tpz-pagination button")?.click()

    expect(shape()).toEqual(["C0", "C1", "C2", "detail:Lines of C2", "C3", "C4", "C5"])
    expect(host.querySelector(".tpz-detail-row")).toBe(detail)
  })

  it("works in server mode", () => {
    createTable(host, options({ server: true, total: 30, defaultState: { expanded: ["c"] } }))
    expect(shape()).toEqual(["Ada", "Tom", "Zoe", "detail:Lines of Zoe"])
  })

  it("passes the automated accessibility checks", async () => {
    createTable(host, options({ selection: true, defaultState: { expanded: ["a"] } }))
    const results = await axe.run(host, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    })
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })
})

describe("detail rows on a server", () => {
  const server = options({
    id: "orders",
    defaultState: { expanded: ["b"] },
    detail: { render: ({ row }) => el("p", { text: `Lines of ${row.customer}` }) },
  })

  it("renders open rows already open", () => {
    const html = renderToString(server)
    expect(html).toContain("<p>Lines of Tom</p>")
    expect(html).not.toContain("Lines of Ada")
    expect(html).toContain('aria-controls="orders-detail-b"')
  })

  it("is byte for byte what the client renders", () => {
    const html = renderToString(server)
    const table = createTable(host, server)
    expect(host.innerHTML).toBe(html)
    table.destroy()
  })

  it("writes a detail whose renderer needs a browser as nothing, rather than failing", () => {
    const html = renderToString(
      options({
        defaultState: { expanded: ["a"] },
        detail: {
          render: () => {
            throw new Error("document is not defined")
          },
        },
      }),
    )
    expect(html).toContain('class="tpz-detail"')
  })
})
