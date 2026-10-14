import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import { useEffect, useState } from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { TableState } from "@trapezium/core"

import { Table } from "./table.js"
import type { TableProps } from "./types.js"

afterEach(cleanup)

type Order = { id: string; customer: string; total: number; lines: number }

const orders: Order[] = [
  { id: "a", customer: "Ada", total: 120, lines: 2 },
  { id: "b", customer: "Tom", total: 80, lines: 0 },
  { id: "c", customer: "Zoe", total: 300, lines: 5 },
]

function setup(props: Partial<TableProps<Order>> = {}) {
  return render(
    <Table
      data={orders}
      columns={["customer", "total"]}
      detail={{ render: ({ row }) => <p>Lines of {row.customer}</p> }}
      aria-label="Orders"
      {...props}
    />,
  )
}

/** Each body row's kind and first cell, in document order. */
function bodyShape(): string[] {
  return [...document.querySelectorAll("tbody tr")].map((tr) =>
    tr.classList.contains("tpz-detail-row")
      ? `detail:${tr.textContent ?? ""}`
      : (tr.querySelector('[data-key="customer"]')?.textContent ?? ""),
  )
}

describe("detail rows", () => {
  it("leads with an expander column and opens nothing until asked", () => {
    setup()
    expect(document.querySelectorAll('thead [data-key="__expand"]')).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: /^Show details for row/ })).toHaveLength(3)
    expect(bodyShape()).toEqual(["Ada", "Tom", "Zoe"])
  })

  it("opens a row's detail below it, spanning every column, and closes it again", async () => {
    const user = userEvent.setup()
    setup({ selection: true })

    await user.click(screen.getByRole("button", { name: "Show details for row 1" }))
    expect(bodyShape()).toEqual(["Ada", "detail:Lines of Ada", "Tom", "Zoe"])

    const cell = document.querySelector(".tpz-detail-cell")
    // Selection, expander and both columns.
    expect(cell?.getAttribute("colspan")).toBe("4")

    const button = screen.getByRole("button", { name: "Hide details for row 1" })
    expect(button.getAttribute("aria-expanded")).toBe("true")
    expect(document.getElementById(button.getAttribute("aria-controls") ?? "")).toBe(
      document.querySelector(".tpz-detail-row"),
    )

    await user.click(button)
    expect(bodyShape()).toEqual(["Ada", "Tom", "Zoe"])
  })

  it("keeps any number open at once", async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole("button", { name: "Show details for row 1" }))
    await user.click(screen.getByRole("button", { name: "Show details for row 3" }))
    expect(bodyShape()).toEqual(["Ada", "detail:Lines of Ada", "Tom", "Zoe", "detail:Lines of Zoe"])
  })

  it("is worked from the keyboard", async () => {
    const user = userEvent.setup()
    setup()
    screen.getByRole("button", { name: "Show details for row 2" }).focus()
    await user.keyboard("{Enter}")
    expect(bodyShape()).toEqual(["Ada", "Tom", "detail:Lines of Tom", "Zoe"])
    await user.keyboard(" ")
    expect(bodyShape()).toEqual(["Ada", "Tom", "Zoe"])
  })

  it("reports the open rows in the state, and follows a controlled state", async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn<(state: TableState) => void>()
    const { rerender } = setup({ onStateChange })

    await user.click(screen.getByRole("button", { name: "Show details for row 3" }))
    expect(onStateChange.mock.calls.at(-1)?.[0].expanded).toEqual(["c"])

    rerender(
      <Table
        data={orders}
        columns={["customer", "total"]}
        detail={{ render: ({ row }) => `Lines of ${row.customer}` }}
        state={{ expanded: ["b"] }}
      />,
    )
    expect(bodyShape()).toEqual(["Ada", "Tom", "detail:Lines of Tom", "Zoe"])
  })

  it("leaves rows that canExpand refuses without an expander, even when the state names them", () => {
    setup({
      detail: { render: () => "Lines", canExpand: (row) => row.lines > 0 },
      defaultState: { expanded: ["b"] },
    })
    expect(screen.getAllByRole("button", { name: /details for row/ })).toHaveLength(2)
    expect(document.querySelectorAll(".tpz-detail-row")).toHaveLength(0)
  })

  it("opens and closes every row on the page from the header", async () => {
    const user = userEvent.setup()
    setup({ detail: { render: ({ row }) => row.customer, canExpand: (row) => row.lines > 0 } })

    await user.click(screen.getByRole("button", { name: "Show details for every row on this page" }))
    expect(document.querySelectorAll(".tpz-detail-row")).toHaveLength(2)

    await user.click(screen.getByRole("button", { name: "Hide details for every row on this page" }))
    expect(document.querySelectorAll(".tpz-detail-row")).toHaveLength(0)
  })

  it("is closed by the collapse it is handed", async () => {
    const user = userEvent.setup()
    setup({
      detail: { render: ({ collapse }) => <button onClick={collapse}>Done</button> },
      defaultState: { expanded: ["a"] },
    })
    await user.click(screen.getByRole("button", { name: "Done" }))
    expect(document.querySelectorAll(".tpz-detail-row")).toHaveLength(0)
  })

  it("never counts as a row: not in the total, the page size or the selection", async () => {
    const user = userEvent.setup()
    setup({
      selection: true,
      pagination: { pageSize: 2 },
      defaultState: { expanded: ["a", "b"] },
    })

    // Two rows on the page, each with its detail open.
    expect(document.querySelectorAll("tbody tr")).toHaveLength(4)
    expect(screen.getByText("3 rows")).toBeDefined()

    await user.click(screen.getByRole("checkbox", { name: "Select all rows on this page" }))
    expect(screen.getByText("2 selected")).toBeDefined()
  })

  it("follows its row through a sort", async () => {
    const user = userEvent.setup()
    setup({ defaultState: { expanded: ["a"] } })
    await user.click(screen.getByRole("button", { name: "Total" }))
    await user.click(screen.getByRole("button", { name: "Total" }))
    expect(bodyShape()).toEqual(["Zoe", "Ada", "detail:Lines of Ada", "Tom"])
  })

  describe("toggleOnRowClick", () => {
    it("opens the detail from anywhere on the row, but not from a control in it", async () => {
      const user = userEvent.setup()
      const onRowClick = vi.fn()
      setup({
        onRowClick,
        columns: ["customer", { key: "act", header: "", render: () => <button>Act</button> }],
        detail: { render: ({ row }) => `Lines of ${row.customer}`, toggleOnRowClick: true },
      })

      await user.click(screen.getByText("Tom"))
      expect(bodyShape()).toEqual(["Ada", "Tom", "detail:Lines of Tom", "Zoe"])
      expect(onRowClick).toHaveBeenCalledTimes(1)

      await user.click(screen.getAllByRole("button", { name: "Act" })[0]!)
      expect(bodyShape()).toEqual(["Ada", "Tom", "detail:Lines of Tom", "Zoe"])
      expect(onRowClick).toHaveBeenCalledTimes(1)
    })

    it("is off by default, so a row click only reaches onRowClick", async () => {
      const user = userEvent.setup()
      const onRowClick = vi.fn()
      setup({ onRowClick })
      await user.click(screen.getByText("Tom"))
      expect(onRowClick).toHaveBeenCalledTimes(1)
      expect(document.querySelectorAll(".tpz-detail-row")).toHaveLength(0)
    })
  })

  describe("keepMounted", () => {
    function Loader({ id, mounts }: { id: string; mounts: string[] }) {
      useEffect(() => {
        mounts.push(id)
      }, [id, mounts])
      return <span>Loaded {id}</span>
    }

    it("unmounts a closed detail by default", async () => {
      const user = userEvent.setup()
      const mounts: string[] = []
      setup({ detail: { render: ({ rowId }) => <Loader id={rowId} mounts={mounts} /> } })

      const toggle = () => user.click(screen.getByRole("button", { name: /details for row 1$/ }))
      await toggle()
      await toggle()
      await toggle()
      expect(mounts).toEqual(["a", "a"])
    })

    it("keeps a closed detail mounted and hidden, so reopening it does not load again", async () => {
      const user = userEvent.setup()
      const mounts: string[] = []
      setup({ detail: { render: ({ rowId }) => <Loader id={rowId} mounts={mounts} />, keepMounted: true } })

      // Nothing is mounted before it has been opened.
      expect(document.querySelectorAll(".tpz-detail-row")).toHaveLength(0)

      const toggle = () => user.click(screen.getByRole("button", { name: /details for row 1$/ }))
      await toggle()
      await toggle()
      const kept = document.querySelector<HTMLElement>(".tpz-detail-row")
      expect(kept?.hidden).toBe(true)

      await toggle()
      expect(mounts).toEqual(["a"])
      expect(document.querySelector<HTMLElement>(".tpz-detail-row")?.hidden).toBe(false)
    })
  })

  it("keeps the rows already on screen when a page is appended, details and all", async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 6 }, (_, index) => ({ id: String(index), customer: `C${index}`, total: index, lines: 1 }))
    const renders: string[] = []
    render(
      <Table
        data={many}
        columns={["customer"]}
        pagination={{ mode: "loadMore", pageSize: 3 }}
        defaultState={{ expanded: ["0"] }}
        detail={{
          render: ({ rowId }) => {
            renders.push(rowId)
            return `Detail ${rowId}`
          },
        }}
      />,
    )

    const before = renders.length
    await user.click(screen.getByRole("button", { name: /Load more/ }))
    expect(document.querySelectorAll("tbody tr")).toHaveLength(7)
    // The open detail was not rendered again for the sake of rows below it.
    expect(renders.length).toBe(before)
  })

  it("works in server mode, where the rows are one page", () => {
    setup({ server: true, total: 30, defaultState: { expanded: ["c"] } })
    expect(bodyShape()).toEqual(["Ada", "Tom", "Zoe", "detail:Lines of Zoe"])
  })

  it("passes the automated accessibility checks, open and closed", async () => {
    const { container } = setup({ defaultState: { expanded: ["a"] }, selection: true })
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    })
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })
})

describe("detail rows on a server", () => {
  const element = (
    <Table
      data={orders}
      columns={["customer", "total"]}
      id="orders"
      defaultState={{ expanded: ["b"] }}
      detail={{ render: ({ row }) => <p>{`Lines of ${row.customer}`}</p> }}
    />
  )

  it("renders open rows already open", () => {
    const html = renderToString(element)
    expect(html).toContain("Lines of Tom")
    expect(html).not.toContain("Lines of Ada")
    expect(html.indexOf(">Tom<")).toBeLessThan(html.indexOf("Lines of Tom"))
    expect(html.indexOf("Lines of Tom")).toBeLessThan(html.indexOf(">Zoe<"))
    expect(html).toContain('aria-controls="orders-detail-b"')
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

  it("hydrates without a mismatch when no id is given", () => {
    const bare = (
      <Table data={orders} defaultState={{ expanded: ["a"] }} detail={{ render: () => "Detail" }} />
    )
    const container = document.createElement("div")
    container.innerHTML = renderToString(bare)
    document.body.append(container)

    const problems: unknown[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => problems.push(args))
    act(() => {
      hydrateRoot(container, bare)
    })
    spy.mockRestore()
    container.remove()

    expect(problems).toEqual([])
  })
})

describe("a controlled table driving its detail rows", () => {
  it("opens the rows a parent decides", () => {
    function Parent() {
      const [expanded, setExpanded] = useState<string[]>([])
      return (
        <>
          <button onClick={() => setExpanded(["a", "c"])}>Open two</button>
          <Table
            data={orders}
            columns={["customer"]}
            state={{ expanded }}
            onStateChange={(next) => setExpanded(next.expanded ?? [])}
            detail={{ render: ({ row }) => `Lines of ${row.customer}` }}
          />
        </>
      )
    }

    render(<Parent />)
    fireEvent.click(screen.getByRole("button", { name: "Open two" }))
    expect(bodyShape()).toEqual(["Ada", "detail:Lines of Ada", "Tom", "Zoe", "detail:Lines of Zoe"])
  })
})
