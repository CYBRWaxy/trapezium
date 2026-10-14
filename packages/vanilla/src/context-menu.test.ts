/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTable } from "./table.js"

type Invoice = { id: string; reference: string; due: string }

const invoices: Invoice[] = [
  { id: "a", reference: "INV-1", due: "2026-01-15" },
  { id: "b", reference: "INV-2", due: "2026-02-01" },
]

let host: HTMLElement

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
})

afterEach(() => host.remove())

describe("onRowContextMenu", () => {
  it("hands over the row and the cell under the pointer, with the text it shows", () => {
    const onRowContextMenu = vi.fn()
    createTable(host, { data: invoices, columns: ["reference", { key: "due", type: "date" }], selection: true, onRowContextMenu })

    host.querySelector('tr[data-row-id="a"] td[data-key="due"]')?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
    expect(onRowContextMenu.mock.calls[0]?.[0]).toBe(invoices[0])
    expect(onRowContextMenu.mock.calls[0]?.[2]).toMatchObject({ rowId: "a", columnKey: "due", text: "Jan 15, 2026" })

    host.querySelector('tr[data-row-id="b"] input')?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))
    expect(onRowContextMenu.mock.calls[1]?.[2]).toMatchObject({ rowId: "b", columnKey: null, text: null })
  })

  it("follows a handler passed later", () => {
    const later = vi.fn()
    const table = createTable(host, { data: invoices, columns: ["reference"] })
    table.setOptions({ onRowContextMenu: later })
    host.querySelector('tr[data-row-id="a"] td')?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }))
    expect(later).toHaveBeenCalledTimes(1)
  })
})
