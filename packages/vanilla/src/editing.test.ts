/**
 * @vitest-environment jsdom
 *
 * Inline editing in the DOM renderer, which Vue and Svelte share.
 */
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CellEdit } from "@trapezium/core"

import { renderToString } from "./render-to-string.js"
import { createTable, type TableInstance, type TableOptions, type VanillaColumn } from "./table.js"

type Item = { id: string; name: string; qty: number; price: number; plan: string; due: string; locked: boolean }

const items: Item[] = [
  { id: "a", name: "Anvil", qty: 2, price: 1250, plan: "pro", due: "2026-01-15", locked: false },
  { id: "b", name: "Bucket", qty: 5, price: 300, plan: "free", due: "2026-02-01", locked: true },
  { id: "c", name: "Chain", qty: 1, price: 999, plan: "team", due: "2026-03-10", locked: false },
]

const PLANS = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Professional" },
  { value: "team", label: "Team" },
]

const columns: VanillaColumn<Item>[] = [
  { key: "name", editable: true },
  { key: "qty", type: "number", editable: true, validate: (value) => (typeof value === "number" && value >= 0) || "Must be zero or more" },
  { key: "price", type: "currency", editable: (row) => !row.locked, formatOptions: { currencyInMinorUnits: true } },
  { key: "plan", type: "select", editable: true, formatOptions: { options: PLANS } },
  { key: "due", type: "date", editable: true },
]

let host: HTMLElement

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
})

afterEach(() => {
  host.remove()
  document.querySelectorAll(".tpz-portal").forEach((node) => node.remove())
})

/** A table that applies every edit to its own rows, the way an app would. */
function editable(extra: Partial<TableOptions<Item>> = {}, onEdit?: (edit: CellEdit<Item>) => void | Promise<unknown>) {
  let rows = [...items]
  let table: TableInstance<Item> | undefined
  table = createTable(host, {
    data: rows,
    columns,
    ariaLabel: "Items",
    onCellEdit: (edit) => {
      const result = onEdit?.(edit)
      rows = rows.map((row) => (row.id === edit.rowId ? { ...row, [edit.key]: edit.value } : row))
      table?.setData(rows)
      return result
    },
    ...extra,
  })
  return table
}

function cell(rowId: string, key: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(`tr[data-row-id="${rowId}"] td[data-key="${key}"]`)
  if (!found) throw new Error(`no cell ${rowId}/${key}`)
  return found
}

function editor(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>(".tpz-editor-input")
  if (!input) throw new Error("no editor open")
  return input
}

function dblclick(element: HTMLElement) {
  element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
}

function key(target: Element, name: string, init: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }))
}

function type(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("inline editing", () => {
  it("opens on a double click, commits on Enter, reports the edit and goes back to the cell", () => {
    const onEdit = vi.fn()
    editable({}, onEdit)

    dblclick(cell("a", "name"))
    expect(editor().value).toBe("Anvil")
    expect(document.activeElement).toBe(editor())

    type(editor(), "Axe")
    key(editor(), "Enter")

    expect(onEdit.mock.calls[0]?.[0]).toMatchObject({ rowId: "a", key: "name", value: "Axe", previousValue: "Anvil" })
    expect(host.querySelector(".tpz-editor-input")).toBeNull()
    expect(cell("a", "name").textContent).toBe("Axe")
    expect(document.activeElement).toBe(cell("a", "name"))
  })

  it("switches cell navigation on and makes the grid editable", () => {
    editable()
    expect(host.querySelector("table")?.getAttribute("role")).toBe("grid")
    expect(host.querySelector("table")?.getAttribute("aria-readonly")).toBe("false")
    expect(cell("b", "price").getAttribute("aria-readonly")).toBe("true")
    expect(cell("a", "price").getAttribute("data-editable")).toBe("true")
  })

  it("cancels on Escape and keeps the Escape to itself", () => {
    const onEdit = vi.fn()
    const outside = vi.fn()
    host.addEventListener("keydown", outside)
    editable({}, onEdit)

    dblclick(cell("a", "name"))
    type(editor(), "zzz")
    key(editor(), "Escape")

    expect(onEdit).not.toHaveBeenCalled()
    expect(cell("a", "name").textContent).toBe("Anvil")
    expect(document.activeElement).toBe(cell("a", "name"))
    expect(outside).not.toHaveBeenCalled()
  })

  it("opens from the keyboard with Enter, F2 and typing", () => {
    const onEdit = vi.fn()
    editable({}, onEdit)
    cell("a", "name").focus()

    key(cell("a", "name"), "Enter")
    expect(editor().value).toBe("Anvil")
    key(editor(), "Escape")

    key(cell("a", "name"), "F2")
    expect(editor().value).toBe("Anvil")
    key(editor(), "Escape")

    key(cell("a", "name"), "Z")
    expect(editor().value).toBe("Z")
    type(editor(), "Zed")
    key(editor(), "Enter")
    expect(onEdit.mock.calls.at(-1)?.[0].value).toBe("Zed")
  })

  it("commits and moves to the next editable cell on Tab, skipping one the row refuses", () => {
    const onEdit = vi.fn()
    editable({}, onEdit)

    dblclick(cell("b", "qty"))
    type(editor(), "7")
    key(editor(), "Tab")

    expect(onEdit.mock.calls.at(-1)?.[0]).toMatchObject({ rowId: "b", key: "qty", value: 7 })
    expect(editor().closest("td")?.dataset["key"]).toBe("plan")
    expect(document.activeElement).toBe(editor())

    key(editor(), "Tab", { shiftKey: true })
    expect(editor().closest("td")?.dataset["key"]).toBe("qty")
  })

  it("refuses an invalid value and says why", () => {
    const onEdit = vi.fn()
    editable({}, onEdit)
    dblclick(cell("a", "qty"))
    type(editor(), "-3")
    key(editor(), "Enter")

    expect(onEdit).not.toHaveBeenCalled()
    expect(editor().getAttribute("aria-invalid")).toBe("true")
    const alert = document.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe("Must be zero or more")
    expect(editor().getAttribute("aria-describedby")).toBe(alert?.id)

    type(editor(), "4")
    key(editor(), "Enter")
    expect(onEdit.mock.calls.at(-1)?.[0].value).toBe(4)
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it("edits an amount kept in cents in dollars", () => {
    const onEdit = vi.fn()
    editable({}, onEdit)
    dblclick(cell("a", "price"))
    expect(editor().value).toBe("12.5")
    type(editor(), "13.75")
    key(editor(), "Enter")
    expect(onEdit.mock.calls.at(-1)?.[0].value).toBe(1375)
  })

  it("never opens a cell the row refuses", () => {
    editable()
    dblclick(cell("b", "price"))
    expect(host.querySelector(".tpz-editor-input")).toBeNull()
  })

  it("opens with a single click when asked", () => {
    editable({ editTrigger: "click" })
    cell("a", "name").click()
    expect(editor().value).toBe("Anvil")
  })

  it("keeps an editor open, with what was typed, when the rows are rebuilt under it", () => {
    const table = editable()
    dblclick(cell("c", "name"))
    type(editor(), "Cha")
    table.setData(items.map((item) => ({ ...item })))
    expect(editor().value).toBe("Cha")
    expect(editor().closest("tr")?.dataset["rowId"]).toBe("c")
  })

  describe("saving", () => {
    it("shows the cell as saving while the promise is pending", async () => {
      let resolve: () => void = () => {}
      const table = createTable(host, {
        data: items,
        columns,
        onCellEdit: () => new Promise<void>((done) => (resolve = done)),
      })
      dblclick(cell("a", "qty"))
      type(editor(), "9")
      key(editor(), "Enter")

      expect(cell("a", "qty").getAttribute("data-pending")).toBe("true")
      expect(cell("a", "qty").getAttribute("aria-busy")).toBe("true")
      expect(cell("a", "qty").textContent).toBe("9")

      table.setData(items.map((item) => (item.id === "a" ? { ...item, qty: 9 } : item)))
      resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect(cell("a", "qty").hasAttribute("data-pending")).toBe(false)
      expect(cell("a", "qty").textContent).toBe("9")
    })

    it("puts the old value back and marks the cell when the promise rejects", async () => {
      createTable(host, { data: items, columns, onCellEdit: () => Promise.reject(new Error("Offline")) })
      dblclick(cell("a", "qty"))
      type(editor(), "9")
      key(editor(), "Enter")

      await new Promise((done) => setTimeout(done, 0))
      expect(cell("a", "qty").getAttribute("data-failed")).toBe("true")
      expect(cell("a", "qty").getAttribute("title")).toBe("Offline")
      expect(cell("a", "qty").textContent).toContain("2")
      expect(cell("a", "qty").querySelector(".tpz-sr")?.textContent).toBe(", not saved: Offline")
    })
  })

  describe("a list of choices", () => {
    it("is a combobox narrowed by typing, chosen with the arrows and Enter", () => {
      const onEdit = vi.fn()
      editable({}, onEdit)
      dblclick(cell("a", "plan"))

      const box = editor()
      expect(box.getAttribute("role")).toBe("combobox")
      const list = document.getElementById(box.getAttribute("aria-controls") ?? "")
      expect(list?.getAttribute("role")).toBe("listbox")
      const labels = () => [...(list?.querySelectorAll('[role="option"]') ?? [])].map((option) => option.textContent)
      expect(labels()).toEqual(["—", "Free", "Professional", "Team"])
      expect(list?.querySelector('[aria-selected="true"]')?.textContent).toBe("Professional")

      type(box, "e")
      expect(labels()).toEqual(["Free", "Professional", "Team"])
      key(box, "ArrowDown")
      key(box, "ArrowDown")
      expect(box.getAttribute("aria-activedescendant")).toBe(list?.querySelector('[aria-selected="true"]')?.id)
      key(box, "Enter")

      expect(onEdit.mock.calls.at(-1)?.[0]).toMatchObject({ key: "plan", value: "team", previousValue: "pro" })
      expect(document.querySelector('[role="listbox"]')).toBeNull()
    })

    it("is chosen with a click", () => {
      const onEdit = vi.fn()
      editable({}, onEdit)
      dblclick(cell("a", "plan"))
      const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((node) => node.textContent === "Free")
      option?.click()
      expect(onEdit.mock.calls.at(-1)?.[0].value).toBe("free")
    })
  })

  it("hands a custom editor its value and the means to commit or cancel", () => {
    const onEdit = vi.fn()
    editable(
      {
        columns: [
          {
            key: "qty",
            type: "number",
            editable: true,
            renderEditor: ({ value, commit }) => {
              const button = document.createElement("button")
              button.textContent = "Add one"
              button.addEventListener("click", () => commit(Number(value) + 1))
              return button
            },
          },
        ],
      },
      onEdit,
    )
    dblclick(cell("a", "qty"))
    host.querySelector<HTMLButtonElement>(".tpz-editor button")?.click()
    expect(onEdit.mock.calls.at(-1)?.[0].value).toBe(3)
  })

  it("passes the automated accessibility checks with an editor open", async () => {
    editable()
    dblclick(cell("a", "plan"))
    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    })
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })
})

describe("editing on a server", () => {
  const options: TableOptions<Item> = { data: items, columns, onCellEdit: () => {} }

  it("renders no editor, only the editable cells, and agrees with the client", () => {
    const html = renderToString(options)
    expect(html).not.toContain("tpz-editor")
    expect(html).toContain('data-editable="true"')
    const table = createTable(host, options)
    expect(host.innerHTML).toBe(html)
    table.destroy()
  })
})
