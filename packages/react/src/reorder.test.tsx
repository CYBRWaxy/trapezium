import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import { useState } from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { applyRowMove, type RowMove } from "@trapezium/core"

import { Table } from "./table.js"
import type { TableProps } from "./types.js"

afterEach(cleanup)

type Task = { id: string; parent: string | null; name: string; locked?: boolean }

const tasks: Task[] = [
  { id: "a", parent: null, name: "Alpha" },
  { id: "b", parent: null, name: "Bravo" },
  { id: "b1", parent: "b", name: "Bravo one" },
  { id: "b2", parent: "b", name: "Bravo two" },
  { id: "c", parent: null, name: "Charlie" },
  { id: "d", parent: null, name: "Delta", locked: true },
]

/** A table that applies every move to its own rows, as an app would. */
function Board(props: Partial<TableProps<Task>> & { onMove?: (move: RowMove<Task>) => void | Promise<unknown> }) {
  const { onMove, ...rest } = props
  const [rows, setRows] = useState(tasks)
  return (
    <Table
      data={rows}
      columns={["name"]}
      getParentId={(task) => task.parent}
      aria-label="Tasks"
      rowReorder={{
        canDrag: (task) => !task.locked,
        onReorder: (move) => {
          const result = onMove?.(move)
          if (result) return result
          setRows((current) => applyRowMove(current, current.map((task) => task.id), move))
        },
      }}
      {...rest}
    />
  )
}

const names = () => [...document.querySelectorAll('tbody tr[data-row-id] [data-key="name"]')].map((cell) => cell.textContent)

describe("moving rows", () => {
  it("leads every row with a handle, except the rows that stay put", () => {
    render(<Board />)
    expect(document.querySelectorAll('thead [data-key="__drag"]')).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Move row 1" })).toBeDefined()
    expect(document.querySelector('tr[data-row-id="d"] .tpz-drag-handle')).toBeNull()
  })

  it("moves a row with Alt and an arrow, reports its new neighbours, says so, and keeps the keyboard on it", async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<Board onMove={(move) => void onMove(move)} />)

    screen.getByRole("button", { name: "Move row 1" }).focus()
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}")

    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ rowId: "a", afterId: "b", beforeId: "c" })
    expect(screen.getByRole("status").textContent).toBe("Moved to position 2 of 4")
  })

  it("shows the order the data then has", async () => {
    const user = userEvent.setup()
    render(<Board />)
    screen.getByRole("button", { name: "Move row 1" }).focus()
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}")
    expect(names()).toEqual(["Bravo", "Bravo one", "Bravo two", "Alpha", "Charlie", "Delta"])
    // Still on the row it moved.
    expect(document.activeElement?.closest("tr")?.getAttribute("data-row-id")).toBe("a")
  })

  it("moves a child among its siblings only, and says whose child it is", async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<Board onMove={(move) => void onMove(move)} />)

    const handle = document.querySelector<HTMLElement>('tr[data-row-id="b1"] .tpz-drag-handle')
    handle?.focus()
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}")
    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ rowId: "b1", afterId: "b2", beforeId: null, parentId: "b" })

    onMove.mockClear()
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}")
    // The last child cannot leave its parent.
    expect(onMove).not.toHaveBeenCalled()
  })

  it("takes a parent's children with it", async () => {
    const user = userEvent.setup()
    render(<Board />)
    document.querySelector<HTMLElement>('tr[data-row-id="b"] .tpz-drag-handle')?.focus()
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}")
    expect(names()).toEqual(["Bravo", "Bravo one", "Bravo two", "Alpha", "Charlie", "Delta"])
  })

  it("is not offered while the table is sorted", async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<Board onMove={(move) => void onMove(move)} defaultState={{ sort: [{ key: "name", direction: "asc" }] }} />)
    const handle = screen.getByRole("button", { name: "Move row 1" })
    expect(handle.getAttribute("aria-disabled")).toBe("true")
    handle.focus()
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}")
    expect(onMove).not.toHaveBeenCalled()
  })

  it("shows the new order while a promise is pending, and goes back if it rejects", async () => {
    const user = userEvent.setup()
    let reject: (error: Error) => void = () => {}
    render(<Board onMove={() => new Promise((_, no) => (reject = no))} />)

    screen.getByRole("button", { name: "Move row 1" }).focus()
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}")
    expect(names()).toEqual(["Bravo", "Bravo one", "Bravo two", "Alpha", "Charlie", "Delta"])

    await act(async () => {
      reject(new Error("Offline"))
      await Promise.resolve()
    })
    expect(names()).toEqual(["Alpha", "Bravo", "Bravo one", "Bravo two", "Charlie", "Delta"])
    expect(screen.getByRole("status").textContent).toBe("The move was not saved")
  })

  it("moves a row from any cell with Alt and an arrow when the keyboard moves between cells", async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    render(<Board cellNavigation onMove={(move) => void onMove(move)} />)
    act(() => document.querySelector<HTMLElement>('tr[data-row-id="c"] td[data-key="name"]')?.focus())
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}")
    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ rowId: "c", afterId: "a", beforeId: "b" })
  })

  it("drops a dragged row beside the row it is let go over", () => {
    const onMove = vi.fn()
    render(<Board onMove={(move) => void onMove(move)} />)

    const rowOf = (id: string) => document.querySelector<HTMLElement>(`tr[data-row-id="${id}"]`)
    // jsdom has no layout: each row is given a box, and the point under the pointer is the row there.
    const boxes: Record<string, number> = { a: 0, b: 32, b1: 64, b2: 96, c: 128, d: 160 }
    for (const [id, top] of Object.entries(boxes)) {
      const row = rowOf(id)
      if (row) row.getBoundingClientRect = () => ({ top, bottom: top + 32, left: 0, right: 500, width: 500, height: 32, x: 0, y: top, toJSON: () => ({}) })
    }
    const original = document.elementFromPoint
    document.elementFromPoint = (_x: number, y: number) => {
      const id = Object.entries(boxes).find(([, top]) => y >= top && y < top + 32)?.[0]
      return id ? rowOf(id) : null
    }

    const handle = document.querySelector<HTMLElement>('tr[data-row-id="a"] .tpz-drag-handle')
    if (!handle) throw new Error("no handle")
    // jsdom's pointer events carry no coordinates, so mouse events stand in for them.
    const pointer = (target: Element | Document, type: string, clientY: number) =>
      fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY }))
    pointer(handle, "pointerdown", 10)
    pointer(document, "pointermove", 140)
    expect(rowOf("c")?.dataset["drop"]).toBe("before")
    expect(rowOf("a")?.dataset["dragging"]).toBe("true")
    pointer(document, "pointermove", 150)
    expect(rowOf("c")?.dataset["drop"]).toBe("after")
    pointer(document, "pointerup", 150)

    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ rowId: "a", afterId: "c", beforeId: "d" })
    expect(rowOf("c")?.dataset["drop"]).toBeUndefined()
    expect(rowOf("a")?.dataset["dragging"]).toBeUndefined()
    document.elementFromPoint = original
  })

  it("passes the automated accessibility checks", async () => {
    const { container } = render(<Board selection />)
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})

describe("moving rows on a server", () => {
  it("renders the handles, and hydrates without a mismatch", () => {
    const element = <Table data={tasks} columns={["name"]} rowReorder={{ onReorder: () => {} }} />
    const html = renderToString(element)
    expect(html).toContain('class="tpz-drag-handle"')

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
