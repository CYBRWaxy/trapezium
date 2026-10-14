/**
 * @vitest-environment jsdom
 *
 * Header renderers and column descriptions in the DOM renderer.
 */
import axe from "axe-core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { el } from "./dom.js"
import { renderToString } from "./render-to-string.js"
import { createTable, type TableOptions } from "./table.js"

type Item = { id: string; name: string; amount: number }
const items: Item[] = [
  { id: "a", name: "Anvil", amount: 30 },
  { id: "b", name: "Bucket", amount: 10 },
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

describe("renderHeader", () => {
  it("draws the header's text, follows the sort, and keeps the controls around it", () => {
    const table = createTable(host, {
      data: items,
      columns: [
        "name",
        {
          key: "amount",
          renderHeader: ({ column, sort }) =>
            el("span", { class: "custom", text: `${column.header} AUD${sort ? ` (${sort.direction})` : ""}` }),
        },
      ],
    })
    expect(host.querySelector('th[data-key="amount"] .custom')?.textContent).toBe("Amount AUD")
    const button = host.querySelector<HTMLButtonElement>('th[data-key="amount"] .tpz-th-button')
    expect(button?.getAttribute("aria-label")).toBe("Amount")

    button?.click()
    expect(host.querySelector('th[data-key="amount"]')?.getAttribute("aria-sort")).toBe("ascending")
    expect(host.querySelector('th[data-key="amount"] .custom')?.textContent).toBe("Amount AUD (asc)")
    // The same button: the header was patched, not rebuilt.
    expect(host.querySelector('th[data-key="amount"] .tpz-th-button')).toBe(button)
    expect(host.querySelector('th[data-key="amount"] .tpz-th-menu')).toBeTruthy()
    void table
  })

  it("is written by a server, as the client writes it", () => {
    const options: TableOptions<Item> = {
      data: items,
      columns: [{ key: "amount", renderHeader: () => el("b", { class: "custom", text: "Amount (AUD)" }) }],
    }
    const html = renderToString(options)
    expect(html).toContain('<b class="custom">Amount (AUD)</b>')
    const table = createTable(host, options)
    expect(host.innerHTML).toBe(html)
    table.destroy()
  })
})

describe("description", () => {
  it("is linked to the header, and shown as a tooltip while the header has the keyboard", async () => {
    createTable(host, { data: items, id: "items", columns: [{ key: "amount", description: "Excludes tax" }] })
    const button = host.querySelector<HTMLElement>('th[data-key="amount"] .tpz-th-button')
    expect(button?.getAttribute("aria-describedby")).toBe("items-desc-amount")
    expect(document.getElementById("items-desc-amount")?.textContent).toBe("Excludes tax")
    expect(host.querySelector('th[data-key="amount"]')?.getAttribute("data-described")).toBe("true")

    button?.focus()
    await vi.waitFor(() => expect(document.querySelector(".tpz-tooltip")?.textContent).toBe("Excludes tax"))
    button?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    expect(document.querySelector(".tpz-tooltip")).toBeNull()
  })

  it("passes the automated accessibility checks", async () => {
    createTable(host, { data: items, columns: [{ key: "amount", description: "Excludes tax" }, "name"] })
    const results = await axe.run(host, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
