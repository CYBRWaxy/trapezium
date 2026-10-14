import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import { useState } from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CellEdit } from "@trapezium/core"

import { Table } from "./table.js"
import type { Column, TableProps } from "./types.js"

afterEach(cleanup)

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

const columns: Column<Item>[] = [
  { key: "name", editable: true },
  { key: "qty", type: "number", editable: true, validate: (value) => (typeof value === "number" && value >= 0) || "Must be zero or more" },
  { key: "price", type: "currency", editable: (row) => !row.locked, formatOptions: { currencyInMinorUnits: true } },
  { key: "plan", type: "select", editable: true, formatOptions: { options: PLANS } },
  { key: "due", type: "date", editable: true },
]

/** A table that keeps its own rows and applies every edit, the way an app would. */
function Editable(props: Partial<TableProps<Item>> & { onEdit?: (edit: CellEdit<Item>) => void | Promise<unknown> }) {
  const { onEdit, ...rest } = props
  const [rows, setRows] = useState(items)
  return (
    <Table
      data={rows}
      columns={columns}
      aria-label="Items"
      onCellEdit={(edit) => {
        const result = onEdit?.(edit)
        setRows((current) => current.map((row) => (row.id === edit.rowId ? { ...row, [edit.key]: edit.value } : row)))
        return result
      }}
      {...rest}
    />
  )
}

function cell(rowId: string, key: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`tr[data-row-id="${rowId}"] td[data-key="${key}"]`)
  if (!found) throw new Error(`no cell ${rowId}/${key}`)
  return found
}

function editor(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(".tpz-editor-input")
  if (!input) throw new Error("no editor open")
  return input
}

describe("inline editing", () => {
  it("opens on a double click, commits on Enter, reports the edit and goes back to the cell", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<Editable onEdit={onEdit} />)

    await user.dblClick(cell("a", "name"))
    expect(editor().value).toBe("Anvil")
    expect(document.activeElement).toBe(editor())

    await user.clear(editor())
    await user.type(editor(), "Axe{Enter}")

    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0]?.[0]).toMatchObject({ rowId: "a", key: "name", value: "Axe", previousValue: "Anvil" })
    expect(document.querySelector(".tpz-editor-input")).toBeNull()
    expect(cell("a", "name").textContent).toBe("Axe")
    expect(document.activeElement).toBe(cell("a", "name"))
  })

  it("switches cell navigation on and makes the grid editable", () => {
    render(<Editable />)
    const grid = screen.getByRole("grid", { name: "Items" })
    expect(grid.getAttribute("aria-readonly")).toBe("false")
    expect(cell("b", "price").getAttribute("aria-readonly")).toBe("true")
    expect(cell("a", "price").getAttribute("data-editable")).toBe("true")
  })

  it("cancels on Escape, changing nothing, and keeps the Escape to itself", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const outside = vi.fn()
    document.addEventListener("keydown", outside)
    render(<Editable onEdit={onEdit} />)

    await user.dblClick(cell("a", "name"))
    await user.type(editor(), "zzz")
    await user.keyboard("{Escape}")

    expect(onEdit).not.toHaveBeenCalled()
    expect(cell("a", "name").textContent).toBe("Anvil")
    expect(document.activeElement).toBe(cell("a", "name"))
    expect(outside.mock.calls.filter(([event]) => (event as KeyboardEvent).key === "Escape")).toHaveLength(0)
    document.removeEventListener("keydown", outside)
  })

  it("opens from the keyboard with Enter or F2, and by typing — seeded with what was typed", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<Editable onEdit={onEdit} />)

    act(() => cell("a", "name").focus())
    await user.keyboard("{Enter}")
    expect(editor().value).toBe("Anvil")
    await user.keyboard("{Escape}")

    await user.keyboard("{F2}")
    expect(editor().value).toBe("Anvil")
    await user.keyboard("{Escape}")

    await user.keyboard("Z")
    expect(editor().value).toBe("Z")
    await user.keyboard("ed{Enter}")
    expect(onEdit.mock.calls.at(-1)?.[0].value).toBe("Zed")
  })

  it("commits and moves to the next editable cell on Tab, and the previous on Shift+Tab, skipping the rest", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<Editable onEdit={onEdit} />)

    await user.dblClick(cell("b", "qty"))
    await user.clear(editor())
    await user.type(editor(), "7")
    await user.keyboard("{Tab}")

    expect(onEdit.mock.calls.at(-1)?.[0]).toMatchObject({ rowId: "b", key: "qty", value: 7 })
    // Bucket is locked, so its price is skipped.
    expect(editor().closest("td")?.dataset["key"]).toBe("plan")
    expect(editor().closest("tr")?.dataset["rowId"]).toBe("b")

    await user.keyboard("{Shift>}{Tab}{/Shift}")
    expect(editor().closest("td")?.dataset["key"]).toBe("qty")
  })

  it("commits when the editor loses the focus", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(
      <>
        <button>Elsewhere</button>
        <Editable onEdit={onEdit} />
      </>,
    )
    await user.dblClick(cell("c", "name"))
    await user.type(editor(), "s")
    await user.click(screen.getByRole("button", { name: "Elsewhere" }))
    expect(onEdit.mock.calls.at(-1)?.[0].value).toBe("Chains")
  })

  it("refuses an invalid value: nothing is committed, and the editor says why", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<Editable onEdit={onEdit} />)

    await user.dblClick(cell("a", "qty"))
    await user.clear(editor())
    await user.type(editor(), "-3{Enter}")

    expect(onEdit).not.toHaveBeenCalled()
    expect(editor().getAttribute("aria-invalid")).toBe("true")
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toBe("Must be zero or more")
    expect(editor().getAttribute("aria-describedby")).toBe(alert.id)

    await user.clear(editor())
    await user.type(editor(), "4{Enter}")
    expect(onEdit.mock.calls.at(-1)?.[0].value).toBe(4)
  })

  it("does not report an edit that changed nothing", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<Editable onEdit={onEdit} />)
    await user.dblClick(cell("a", "name"))
    await user.keyboard("{Enter}")
    expect(onEdit).not.toHaveBeenCalled()
  })

  it("edits an amount kept in cents in dollars, and hands back cents", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<Editable onEdit={onEdit} />)
    await user.dblClick(cell("a", "price"))
    expect(editor().value).toBe("12.5")
    await user.clear(editor())
    await user.type(editor(), "13.75{Enter}")
    expect(onEdit.mock.calls.at(-1)?.[0].value).toBe(1375)
  })

  it("never opens a cell the row refuses", async () => {
    const user = userEvent.setup()
    render(<Editable />)
    await user.dblClick(cell("b", "price"))
    expect(document.querySelector(".tpz-editor-input")).toBeNull()
  })

  it("applies parse before validation and before reporting", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(
      <Editable
        onEdit={onEdit}
        columns={[{ key: "name", editable: true, parse: (value) => String(value).toUpperCase() }]}
      />,
    )
    await user.dblClick(cell("a", "name"))
    await user.clear(editor())
    await user.type(editor(), "hammer{Enter}")
    expect(onEdit.mock.calls.at(-1)?.[0].value).toBe("HAMMER")
  })

  it("opens with a single click when asked", async () => {
    const user = userEvent.setup()
    render(<Editable editTrigger="click" />)
    await user.click(cell("a", "name"))
    expect(editor().value).toBe("Anvil")
  })

  describe("saving", () => {
    it("shows the cell as saving while the promise is pending, then what the data says", async () => {
      const user = userEvent.setup()
      let resolve: () => void = () => {}
      render(<Editable onEdit={() => new Promise<void>((done) => (resolve = done))} />)

      await user.dblClick(cell("a", "qty"))
      await user.clear(editor())
      await user.type(editor(), "9{Enter}")

      expect(cell("a", "qty").getAttribute("data-pending")).toBe("true")
      expect(cell("a", "qty").getAttribute("aria-busy")).toBe("true")
      expect(cell("a", "qty").textContent).toBe("9")

      await act(async () => resolve())
      expect(cell("a", "qty").hasAttribute("data-pending")).toBe(false)
      expect(cell("a", "qty").textContent).toBe("9")
    })

    it("puts the old value back and marks the cell when the promise rejects", async () => {
      const user = userEvent.setup()
      function Failing() {
        return (
          <Table
            data={items}
            columns={columns}
            onCellEdit={() => Promise.reject(new Error("Offline"))}
          />
        )
      }
      render(<Failing />)

      await user.dblClick(cell("a", "qty"))
      await user.clear(editor())
      await user.type(editor(), "9{Enter}")

      await waitFor(() => expect(cell("a", "qty").getAttribute("data-failed")).toBe("true"))
      expect(cell("a", "qty").hasAttribute("data-pending")).toBe(false)
      expect(cell("a", "qty").getAttribute("title")).toBe("Offline")
      expect(cell("a", "qty").textContent).toContain("2")
      expect(cell("a", "qty").querySelector(".tpz-sr")?.textContent).toBe(", not saved: Offline")
    })
  })

  describe("a list of choices", () => {
    it("is a combobox narrowed by typing, chosen with the arrows and Enter", async () => {
      const user = userEvent.setup()
      const onEdit = vi.fn()
      render(<Editable onEdit={onEdit} />)

      await user.dblClick(cell("a", "plan"))
      const box = screen.getByRole("combobox", { name: "Edit Plan" })
      expect(box.getAttribute("aria-expanded")).toBe("true")
      const list = screen.getByRole("listbox")
      expect(box.getAttribute("aria-controls")).toBe(list.id)
      expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["—", "Free", "Professional", "Team"])
      // The current choice is the active one.
      expect(screen.getByRole("option", { selected: true }).textContent).toBe("Professional")

      await user.type(box, "e")
      expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Free", "Professional", "Team"])
      await user.keyboard("{ArrowDown}{ArrowDown}")
      expect(box.getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { selected: true }).id)
      await user.keyboard("{Enter}")

      expect(onEdit.mock.calls.at(-1)?.[0]).toMatchObject({ key: "plan", value: "team", previousValue: "pro" })
      expect(screen.queryByRole("listbox")).toBeNull()
    })

    it("is chosen with a click", async () => {
      const user = userEvent.setup()
      const onEdit = vi.fn()
      render(<Editable onEdit={onEdit} />)
      await user.dblClick(cell("a", "plan"))
      await user.click(screen.getByRole("option", { name: "Free" }))
      expect(onEdit.mock.calls.at(-1)?.[0].value).toBe("free")
    })

    it("closes without a change when nothing was chosen and the focus leaves", async () => {
      const user = userEvent.setup()
      const onEdit = vi.fn()
      render(
        <>
          <button>Elsewhere</button>
          <Editable onEdit={onEdit} />
        </>,
      )
      await user.dblClick(cell("a", "plan"))
      await user.click(screen.getByRole("button", { name: "Elsewhere" }))
      expect(onEdit).not.toHaveBeenCalled()
      expect(screen.queryByRole("listbox")).toBeNull()
    })
  })

  it("uses the browser's date picker for a date, and hands back a calendar day", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<Editable onEdit={onEdit} />)
    await user.dblClick(cell("a", "due"))
    expect(editor().type).toBe("date")
    expect(editor().value).toBe("2026-01-15")
    await user.clear(editor())
    await user.type(editor(), "2026-04-02{Enter}")
    expect(onEdit.mock.calls.at(-1)?.[0].value).toBe("2026-04-02")
  })

  it("hands a custom editor its value and the means to commit or cancel", async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(
      <Editable
        onEdit={onEdit}
        columns={[
          {
            key: "qty",
            type: "number",
            editable: true,
            renderEditor: ({ value, commit, cancel }) => (
              <span>
                <button onClick={() => commit(Number(value) + 1)}>Add one</button>
                <button onClick={cancel}>Never mind</button>
              </span>
            ),
          },
        ]}
      />,
    )

    await user.dblClick(cell("a", "qty"))
    await user.click(screen.getByRole("button", { name: "Add one" }))
    expect(onEdit.mock.calls.at(-1)?.[0].value).toBe(3)

    await user.dblClick(cell("a", "qty"))
    await user.click(screen.getByRole("button", { name: "Never mind" }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(document.querySelector(".tpz-editor")).toBeNull()
  })

  it("passes the automated accessibility checks with an editor open", async () => {
    const user = userEvent.setup()
    const { container } = render(<Editable />)
    await user.dblClick(cell("a", "plan"))
    const results = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    })
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
    void container
  })

  it("warns once in development when nothing receives the edits", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    render(<Table data={items} columns={[{ key: "name", editable: true }]} />)
    expect(warn.mock.calls.some(([message]) => String(message).includes("onCellEdit"))).toBe(true)
    warn.mockRestore()
  })
})

describe("editing on a server", () => {
  const element = <Table data={items} columns={columns} onCellEdit={() => {}} />

  it("renders no editor, only the editable cells", () => {
    const html = renderToString(element)
    expect(html).not.toContain("tpz-editor")
    expect(html).toContain('data-editable="true"')
    expect(html).toContain('role="grid"')
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
