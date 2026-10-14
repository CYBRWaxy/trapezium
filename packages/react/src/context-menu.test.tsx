import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Table } from "./table.js"

afterEach(cleanup)

type Invoice = { id: string; reference: string; amount: number; due: string }

const invoices: Invoice[] = [
  { id: "a", reference: "INV-1", amount: 1240, due: "2026-01-15" },
  { id: "b", reference: "INV-2", amount: 80, due: "2026-02-01" },
]

describe("onRowContextMenu", () => {
  it("hands over the row and the cell under the pointer, with the text it shows", () => {
    const onRowContextMenu = vi.fn()
    render(
      <Table
        data={invoices}
        columns={["reference", { key: "amount", type: "currency" }, { key: "due", type: "date" }]}
        format={{ currency: "AUD" }}
        selection
        onRowContextMenu={onRowContextMenu}
      />,
    )

    fireEvent.contextMenu(screen.getByText("Jan 15, 2026"))
    const [row, event, info] = onRowContextMenu.mock.calls[0] ?? []
    expect(row).toBe(invoices[0])
    expect(event.type).toBe("contextmenu")
    expect(info).toMatchObject({ rowId: "a", columnKey: "due", text: "Jan 15, 2026" })
    expect(info.column.key).toBe("due")

    fireEvent.contextMenu(screen.getByText("A$80.00"))
    expect(onRowContextMenu.mock.calls[1]?.[2]).toMatchObject({ rowId: "b", columnKey: "amount", text: "A$80.00" })
  })

  it("says no column over the table's own, like the checkbox", () => {
    const onRowContextMenu = vi.fn()
    render(<Table data={invoices} columns={["reference"]} selection onRowContextMenu={onRowContextMenu} />)
    fireEvent.contextMenu(screen.getByRole("checkbox", { name: "Select row 1" }))
    expect(onRowContextMenu.mock.calls[0]?.[2]).toMatchObject({ rowId: "a", columnKey: null, text: null })
  })

  it("leaves the browser's menu alone unless the handler prevents it", () => {
    const prevented: boolean[] = []
    render(
      <Table
        data={invoices}
        columns={["reference"]}
        onRowContextMenu={(_, event, info) => {
          if (info.rowId === "b") event.preventDefault()
        }}
      />,
    )
    prevented.push(!fireEvent.contextMenu(screen.getByText("INV-1")))
    prevented.push(!fireEvent.contextMenu(screen.getByText("INV-2")))
    expect(prevented).toEqual([false, true])
  })

  it("says when the row is a pinned one", () => {
    const onRowContextMenu = vi.fn()
    render(
      <Table
        data={invoices}
        columns={["reference"]}
        pinnedRows={{ bottom: [{ id: "total", reference: "Total", amount: 1320, due: "" }] }}
        onRowContextMenu={onRowContextMenu}
      />,
    )
    fireEvent.contextMenu(screen.getByText("Total"))
    expect(onRowContextMenu.mock.calls[0]?.[2]).toMatchObject({ rowId: "total", pinned: "bottom", text: "Total" })
  })
})
