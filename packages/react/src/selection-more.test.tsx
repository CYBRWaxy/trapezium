import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Table } from "./table.js"
import type { TableProps } from "./types.js"

afterEach(cleanup)

type Person = { id: string; name: string; team: string; archived?: boolean }

const people: Person[] = Array.from({ length: 12 }, (_, index) => ({
  id: `p${String(index + 1)}`,
  name: `Person ${String(index + 1)}`,
  team: index % 2 === 0 ? "red" : "blue",
  archived: index === 3,
}))

function setup(props: Partial<TableProps<Person>> = {}) {
  return render(
    <Table data={people} columns={["name", "team"]} pagination={{ pageSize: 5 }} aria-label="People" {...props} />,
  )
}

const selectedCount = () => document.querySelector(".tpz-count")?.textContent

describe("selecting every matching row", () => {
  it("selects the page by default", async () => {
    const user = userEvent.setup()
    setup({ selection: true })
    await user.click(screen.getByRole("checkbox", { name: "Select all rows on this page" }))
    expect(selectedCount()).toBe("5 selected")
  })

  it("selects every row the filters leave, on every page, skipping rows that cannot be selected", async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()
    setup({
      selection: { selectAll: "matching", isSelectable: (person) => !person.archived },
      onSelectionChange,
      defaultState: { filters: [{ key: "team", operator: "eq", value: "blue" }] },
    })

    const box = screen.getByRole("checkbox", { name: "Select all 6 matching rows" })
    await user.click(box)
    // Six blue people, one of whom is archived.
    expect(selectedCount()).toBe("5 selected")
    expect(onSelectionChange.mock.calls.at(-1)?.[0]).toEqual(["p2", "p6", "p8", "p10", "p12"])
    expect(screen.getByRole("checkbox", { name: "Clear selection" })).toBeDefined()

    await user.click(screen.getByRole("checkbox", { name: "Clear selection" }))
    expect(selectedCount()).toBe("6 rows")
  })

  it("asks the server for the matching rows in server mode", async () => {
    const user = userEvent.setup()
    const all = vi.fn(async () => people)
    setup({ data: people.slice(0, 5), server: { all }, total: 12, selection: { selectAll: "matching" } })

    await user.click(screen.getByRole("checkbox", { name: "Select all 12 matching rows" }))
    await waitFor(() => expect(selectedCount()).toBe("12 selected"))
    expect(all).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("checkbox", { name: "Clear selection" })).toBeDefined()
  })

  it("selects the page, and says why, when a server table cannot fetch the rest", async () => {
    const user = userEvent.setup()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    setup({ data: people.slice(0, 5), server: true, total: 12, selection: { selectAll: "matching" } })
    await user.click(screen.getByRole("checkbox", { name: "Select all 12 matching rows" }))
    expect(selectedCount()).toBe("5 selected")
    expect(warn.mock.calls.some(([message]) => String(message).includes("server.all"))).toBe(true)
    warn.mockRestore()
  })
})

describe("extending a selection from the keyboard", () => {
  it("extends with Shift and an arrow from the row the keyboard is on, giving rows up on the way back", async () => {
    const user = userEvent.setup()
    setup({ selection: true, cellNavigation: true })
    act(() => document.querySelector<HTMLElement>('tr[data-row-id="p2"] td[data-key="name"]')?.focus())

    await user.keyboard("{Shift>}{ArrowDown}{ArrowDown}{/Shift}")
    expect(selectedCount()).toBe("3 selected")
    expect(document.activeElement?.parentElement?.dataset["rowId"]).toBe("p4")

    await user.keyboard("{Shift>}{ArrowUp}{/Shift}")
    expect(selectedCount()).toBe("2 selected")
  })

  it("works from a row's checkbox without cell navigation", async () => {
    const user = userEvent.setup()
    setup({ selection: true })
    screen.getByRole("checkbox", { name: "Select row 1" }).focus()
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}")
    expect(selectedCount()).toBe("2 selected")
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "Select row 2" }))
  })

  it("clears with Escape, but not an Escape an editor has already used", async () => {
    const user = userEvent.setup()
    setup({ selection: true, columns: [{ key: "name", editable: true }, "team"], onCellEdit: () => {} })
    await user.click(screen.getByRole("checkbox", { name: "Select row 1" }))
    await user.click(screen.getByRole("checkbox", { name: "Select row 2" }))

    // Escape inside an editor closes the editor and nothing else.
    const cell = document.querySelector<HTMLElement>('tr[data-row-id="p3"] td[data-key="name"]')
    if (!cell) throw new Error("no cell")
    await user.dblClick(cell)
    await user.keyboard("{Escape}")
    expect(selectedCount()).toBe("2 selected")

    // From the cell, it clears.
    await user.keyboard("{Escape}")
    expect(selectedCount()).toBe("12 rows")
  })
})

describe("drag-select", () => {
  function layOut() {
    const rows = [...document.querySelectorAll<HTMLElement>("tbody tr[data-row-id]")]
    rows.forEach((row, index) => {
      const top = index * 32
      row.getBoundingClientRect = () => ({ top, bottom: top + 32, left: 0, right: 500, width: 500, height: 32, x: 0, y: top, toJSON: () => ({}) })
    })
    const original = document.elementFromPoint
    document.elementFromPoint = (_x: number, y: number) => rows[Math.floor(y / 32)]?.querySelector("td") ?? null
    return () => {
      document.elementFromPoint = original
    }
  }
  const pointer = (target: Element | Document, type: string, clientY: number, shiftKey = false) =>
    fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY, shiftKey }))

  it("selects every row a press sweeps across, and the click that ends it does not reach the row", () => {
    const onRowClick = vi.fn()
    setup({ selection: { dragSelect: true }, onRowClick })
    const restore = layOut()

    const start = document.querySelector('tr[data-row-id="p2"] td[data-key="name"]')
    if (!start) throw new Error("no cell")
    pointer(start, "pointerdown", 40)
    pointer(document, "pointermove", 110)
    pointer(document, "pointerup", 110)
    fireEvent.click(document.querySelector('tr[data-row-id="p4"] td[data-key="name"]') ?? document.body)

    expect(selectedCount()).toBe("3 selected")
    expect(onRowClick).not.toHaveBeenCalled()
    restore()
  })

  it("leaves a press that does not move as a click", () => {
    const onRowClick = vi.fn()
    setup({ selection: { dragSelect: true }, onRowClick })
    const restore = layOut()
    const cell = document.querySelector('tr[data-row-id="p2"] td[data-key="name"]')
    if (!cell) throw new Error("no cell")
    pointer(cell, "pointerdown", 40)
    pointer(document, "pointerup", 41)
    fireEvent.click(cell)
    expect(selectedCount()).toBe("12 rows")
    expect(onRowClick).toHaveBeenCalledTimes(1)
    restore()
  })

  it("extends from the last row chosen with Shift", async () => {
    const user = userEvent.setup()
    setup({ selection: { dragSelect: true } })
    await user.click(screen.getByRole("checkbox", { name: "Select row 1" }))
    const restore = layOut()
    const cell = document.querySelector('tr[data-row-id="p3"] td[data-key="name"]')
    if (!cell) throw new Error("no cell")
    pointer(cell, "pointerdown", 70, true)
    pointer(document, "pointermove", 100, true)
    pointer(document, "pointerup", 100, true)
    // Row 1, chosen before, through row 4, where the sweep ended.
    expect(selectedCount()).toBe("4 selected")
    restore()
  })

  it("ignores a press on a control inside the row", () => {
    setup({
      selection: { dragSelect: true },
      columns: ["name", { key: "act", header: "", render: () => <button>Act</button> }],
    })
    const restore = layOut()
    const button = screen.getAllByRole("button", { name: "Act" })[0]
    if (!button) throw new Error("no button")
    pointer(button, "pointerdown", 10)
    pointer(document, "pointermove", 100)
    pointer(document, "pointerup", 100)
    expect(selectedCount()).toBe("12 rows")
    restore()
  })
})
