import { act, cleanup, render } from "@testing-library/react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Table } from "./table.js"

afterEach(cleanup)

const rows = [
  { id: "a", name: "Anvil", note: "A long note", flag: "x" },
  { id: "b", name: "Bucket", note: "Another long note", flag: "y" },
]

const cell = (key: string, part: "th" | "td" = "td") =>
  document.querySelector<HTMLElement>(`${part}[data-key="${key}"]`)

describe("column widths", () => {
  it("holds a width: the cells take it as width, minimum and maximum, around a box for the content", () => {
    render(<Table data={rows} columns={["name", { key: "flag", width: 56, pin: "end" }]} />)
    for (const part of ["th", "td"] as const) {
      const flag = cell("flag", part)
      expect(flag?.dataset["size"]).toBe("fixed")
      expect(flag?.style.width).toBe("56px")
      expect(flag?.style.minWidth).toBe("56px")
      expect(flag?.style.maxWidth).toBe("56px")
    }
    expect(cell("flag")?.firstElementChild?.className).toBe("tpz-box")
    expect(cell("name")?.querySelector(".tpz-box")).toBeNull()
  })

  it("caps a column at its maxWidth and keeps it to its content", () => {
    render(<Table data={rows} columns={["name", { key: "note", maxWidth: 160 }]} />)
    expect(cell("note")?.dataset["size"]).toBe("fit")
    expect(cell("note")?.style.getPropertyValue("--tpz-col-cap")).toBe("160px")
    expect(cell("note")?.querySelector(".tpz-box")?.textContent).toBe("A long note")
  })

  it("gives the spare width to the growing columns", () => {
    render(<Table data={rows} columns={["name", { key: "note", grow: 2 }, { key: "flag", grow: 1 }]} />)
    expect(cell("name")?.dataset["size"]).toBe("fit")
    expect(cell("note")?.dataset["size"]).toBe("grow")
    expect(cell("note")?.style.width).toBe("66.67%")
    expect(cell("flag", "th")?.style.width).toBe("33.33%")
  })
})

describe("pinning by width", () => {
  const element = <Table data={rows} columns={["note", { key: "name", pin: { side: "start", below: 640 } }]} />

  it("marks the cells and writes the container query into the table, on the server too", () => {
    const html = renderToString(element)
    expect(html).toContain('data-pin-when="start-below-640"')
    expect(html).toContain("@container tpz (max-width: 639.98px)")
    // It stays where it is in the order: after the note.
    expect(html.indexOf('data-key="note"')).toBeLessThan(html.indexOf('data-key="name"'))
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

  it("gives the cells their offset as a custom property, never as left", () => {
    render(<Table data={rows} selection columns={["note", { key: "name", pin: { side: "start", below: 640 } }]} />)
    const name = cell("name")
    expect(name?.style.left).toBe("")
    expect(name?.style.getPropertyValue("--tpz-pin-offset")).toMatch(/px$/)
  })
})
