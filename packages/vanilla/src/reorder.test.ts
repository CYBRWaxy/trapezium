/**
 * @vitest-environment jsdom
 *
 * Moving rows in the DOM renderer.
 */
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { applyRowMove, type RowMove } from "@trapezium/core"

import { renderToString } from "./render-to-string.js"
import { createTable, type TableInstance, type TableOptions } from "./table.js"

type Task = { id: string; parent: string | null; name: string; locked?: boolean }

const tasks: Task[] = [
  { id: "a", parent: null, name: "Alpha" },
  { id: "b", parent: null, name: "Bravo" },
  { id: "b1", parent: "b", name: "Bravo one" },
  { id: "b2", parent: "b", name: "Bravo two" },
  { id: "c", parent: null, name: "Charlie" },
  { id: "d", parent: null, name: "Delta", locked: true },
]

let host: HTMLElement

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
})

afterEach(() => host.remove())

/** A table that applies every move to its own rows, as an app would. */
function board(extra: Partial<TableOptions<Task>> = {}, onMove?: (move: RowMove<Task>) => void | Promise<unknown>) {
  let rows = [...tasks]
  let table: TableInstance<Task> | undefined
  table = createTable(host, {
    data: rows,
    columns: ["name"],
    getParentId: (task) => task.parent,
    rowReorder: {
      canDrag: (task) => !task.locked,
      onReorder: (move) => {
        const result = onMove?.(move)
        if (result) return result
        rows = applyRowMove(rows, rows.map((task) => task.id), move)
        table?.setData(rows)
      },
    },
    ...extra,
  })
  return table
}

const names = () => [...host.querySelectorAll('tbody tr[data-row-id] [data-key="name"]')].map((cell) => cell.textContent)
const handle = (id: string) => host.querySelector<HTMLElement>(`tr[data-row-id="${id}"] .tpz-drag-handle`)
const altArrow = (target: Element | null, key: "ArrowUp" | "ArrowDown") =>
  target?.dispatchEvent(new KeyboardEvent("keydown", { key, altKey: true, bubbles: true, cancelable: true }))

describe("moving rows", () => {
  it("leads every row with a handle, except the rows that stay put", () => {
    board()
    expect(host.querySelectorAll('thead [data-key="__drag"]')).toHaveLength(1)
    expect(handle("a")?.getAttribute("aria-label")).toBe("Move row 1")
    expect(handle("d")).toBeNull()
  })

  it("moves a row with Alt and an arrow, reports its neighbours, says so and keeps the keyboard on it", () => {
    const onMove = vi.fn()
    board({}, (move) => void onMove(move))
    handle("a")?.focus()
    altArrow(handle("a"), "ArrowDown")
    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ rowId: "a", afterId: "b", beforeId: "c" })
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Moved to position 2 of 4")
  })

  it("shows the order the data then has, a parent taking its children with it", () => {
    board()
    handle("b")?.focus()
    altArrow(handle("b"), "ArrowUp")
    expect(names()).toEqual(["Bravo", "Bravo one", "Bravo two", "Alpha", "Charlie", "Delta"])
    expect(document.activeElement).toBe(handle("b"))
  })

  it("moves a child among its siblings only", () => {
    const onMove = vi.fn()
    board({}, (move) => void onMove(move))
    altArrow(handle("b1"), "ArrowDown")
    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ rowId: "b1", afterId: "b2", beforeId: null, parentId: "b" })
    onMove.mockClear()
    // Bravo one is now the last of Bravo's children, and cannot leave it.
    altArrow(handle("b1"), "ArrowDown")
    expect(onMove).not.toHaveBeenCalled()
  })

  it("is not offered while the table is sorted", () => {
    const onMove = vi.fn()
    board({ defaultState: { sort: [{ key: "name", direction: "asc" }] } }, (move) => void onMove(move))
    expect(handle("a")?.getAttribute("aria-disabled")).toBe("true")
    altArrow(handle("a"), "ArrowDown")
    expect(onMove).not.toHaveBeenCalled()
  })

  it("shows the new order while a promise is pending, and goes back if it rejects", async () => {
    let reject: (error: Error) => void = () => {}
    board({}, () => new Promise((_, no) => (reject = no)))
    altArrow(handle("a"), "ArrowDown")
    expect(names()).toEqual(["Bravo", "Bravo one", "Bravo two", "Alpha", "Charlie", "Delta"])
    reject(new Error("Offline"))
    await new Promise((done) => setTimeout(done, 0))
    expect(names()).toEqual(["Alpha", "Bravo", "Bravo one", "Bravo two", "Charlie", "Delta"])
    expect(host.querySelector('[role="status"]')?.textContent).toBe("The move was not saved")
  })

  it("drops a dragged row beside the row it is let go over", () => {
    const onMove = vi.fn()
    board({}, (move) => void onMove(move))
    const rowOf = (id: string) => host.querySelector<HTMLElement>(`tr[data-row-id="${id}"]`)
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
    const pointer = (target: Element | Document, type: string, clientY: number) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY }))

    const grip = handle("a")
    if (!grip) throw new Error("no handle")
    pointer(grip, "pointerdown", 10)
    pointer(document, "pointermove", 150)
    expect(rowOf("c")?.dataset["drop"]).toBe("after")
    // Over a child, a parent lands beside that child's parent.
    pointer(document, "pointermove", 70)
    expect(rowOf("b")?.dataset["drop"]).toBe("after")
    pointer(document, "pointermove", 150)
    pointer(document, "pointerup", 150)
    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ rowId: "a", afterId: "c", beforeId: "d" })
    document.elementFromPoint = original
  })

  it("passes the automated accessibility checks", async () => {
    board({ selection: true })
    const results = await axe.run(host, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})

describe("moving rows on a server", () => {
  it("renders the handles, as the client does", () => {
    const options: TableOptions<Task> = { data: tasks, columns: ["name"], rowReorder: { onReorder: () => {} } }
    const html = renderToString(options)
    expect(html).toContain('class="tpz-drag-handle"')
    const table = createTable(host, options)
    expect(host.innerHTML).toBe(html)
    table.destroy()
  })
})
