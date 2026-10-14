import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Table } from "./table.js"

afterEach(cleanup)

type Item = { id: string; name: string; amount: number }

const items: Item[] = [
  { id: "a", name: "Anvil", amount: 30 },
  { id: "b", name: "Bucket", amount: 10 },
]

describe("renderHeader", () => {
  it("draws the header's text, and the sort, the menu and the resize handle stay and work", async () => {
    const user = userEvent.setup()
    render(
      <Table
        data={items}
        columns={[
          "name",
          {
            key: "amount",
            renderHeader: ({ column, sort }) => (
              <span className="custom">
                {column.header} <em>AUD</em>
                {sort ? ` (${sort.direction})` : ""}
              </span>
            ),
          },
        ]}
      />,
    )

    expect(document.querySelector("th .custom em")?.textContent).toBe("AUD")
    // Still named for the column, whatever the renderer drew.
    const sort = screen.getByRole("button", { name: "Amount" })
    await user.click(sort)
    expect(document.querySelector('th[data-key="amount"]')?.getAttribute("aria-sort")).toBe("ascending")
    expect(document.querySelector("th .custom")?.textContent).toContain("(asc)")
    expect(screen.getByRole("button", { name: "Amount column options" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Resize Amount" })).toBeDefined()
  })

  it("is rendered on a server", () => {
    const html = renderToString(
      <Table data={items} columns={[{ key: "amount", renderHeader: () => <b className="custom">Amount (AUD)</b> }]} />,
    )
    expect(html).toContain('<b class="custom">Amount (AUD)</b>')
  })
})

describe("description", () => {
  it("is linked to the header for a screen reader, on the server and after hydration", () => {
    const element = (
      <Table data={items} id="items" columns={[{ key: "amount", description: "Excludes tax" }, "name"]} />
    )
    const html = renderToString(element)
    expect(html).toContain('id="items-desc-amount"')
    expect(html).toContain("Excludes tax")

    const container = document.createElement("div")
    container.innerHTML = html
    document.body.append(container)
    const problems: unknown[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => problems.push(args))
    act(() => {
      hydrateRoot(container, element)
    })
    spy.mockRestore()
    expect(problems).toEqual([])

    const button = container.querySelector<HTMLElement>('th[data-key="amount"] .tpz-th-button')
    const describedBy = button?.getAttribute("aria-describedby") ?? ""
    expect(document.getElementById(describedBy)?.textContent).toBe("Excludes tax")
    container.remove()
  })

  it("shows as a tooltip when the header has the keyboard, and goes on Escape", async () => {
    const user = userEvent.setup()
    render(<Table data={items} columns={[{ key: "amount", description: "Excludes tax" }]} />)
    const button = screen.getByRole("button", { name: "Amount" })

    act(() => button.focus())
    await vi.waitFor(() => expect(document.querySelector(".tpz-tooltip")?.textContent).toBe("Excludes tax"))
    expect(document.querySelector(".tpz-tooltip")?.getAttribute("aria-hidden")).toBe("true")

    await user.keyboard("{Escape}")
    expect(document.querySelector(".tpz-tooltip")).toBeNull()
  })

  it("passes the automated accessibility checks", async () => {
    const { container } = render(<Table data={items} columns={[{ key: "amount", description: "Excludes tax" }, "name"]} />)
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })
    expect(results.violations.map((violation) => violation.id)).toEqual([])
  })
})
