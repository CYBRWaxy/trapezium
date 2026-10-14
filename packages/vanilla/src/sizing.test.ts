/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { renderToString } from "./render-to-string.js"
import { createTable, type TableOptions } from "./table.js"

const rows = [
  { id: "a", name: "Anvil", note: "A long note", flag: "x" },
  { id: "b", name: "Bucket", note: "Another long note", flag: "y" },
]

let host: HTMLElement
beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
})
afterEach(() => host.remove())

const cell = (key: string, part: "th" | "td" = "td") => host.querySelector<HTMLElement>(`${part}[data-key="${key}"]`)

describe("column widths", () => {
  it("holds a width, caps a maxWidth and shares spare width with the growing columns", () => {
    createTable(host, {
      data: rows,
      columns: ["name", { key: "note", maxWidth: 160, grow: 1 }, { key: "flag", width: 56 }],
    })
    expect(cell("flag")?.dataset["size"]).toBe("fixed")
    expect(cell("flag", "th")?.style.minWidth).toBe("56px")
    expect(cell("flag")?.firstElementChild?.className).toBe("tpz-box")
    expect(cell("note")?.dataset["size"]).toBe("grow")
    expect(cell("name")?.dataset["size"]).toBe("fit")
  })

  it("follows a width dragged to, without building the header again", () => {
    const table = createTable(host, { data: rows, columns: ["name", "note"] })
    const th = cell("note", "th")
    table.setState({ widths: { note: 220 } })
    expect(cell("note", "th")).toBe(th)
    expect(th?.style.width).toBe("220px")
    expect(th?.dataset["size"]).toBe("fixed")
    table.setState({ widths: {} })
    expect(th?.style.width).toBe("")
    expect(th?.hasAttribute("data-size")).toBe(false)
  })
})

describe("pinning by width", () => {
  const options: TableOptions<(typeof rows)[number]> = {
    data: rows,
    columns: ["note", { key: "name", pin: { side: "start", below: 640 } }],
  }

  it("writes the container query into the table, the same on a server as in the browser", () => {
    const html = renderToString(options)
    expect(html).toContain("<style>@container tpz (max-width: 639.98px)")
    expect(html).toContain('data-pin-when="start-below-640"')
    const table = createTable(host, options)
    expect(host.innerHTML).toBe(html)
    table.destroy()
  })

  it("drops the stylesheet when no column is pinned by width", () => {
    const table = createTable(host, options)
    table.setOptions({ columns: ["note", "name"] })
    expect(host.querySelector("style")).toBeNull()
  })
})
