import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import { useState } from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { focusCell, type TableState } from "@trapezium/core"

import { Table } from "./table.js"
import type { TableProps } from "./types.js"

afterEach(cleanup)

type Person = { id: string; name: string; age: number; site: string }

const people: Person[] = Array.from({ length: 30 }, (_, index) => ({
  id: `p${String(index + 1)}`,
  name: `Person ${String(index + 1)}`,
  age: 20 + index,
  site: `https://example.com/${String(index + 1)}`,
}))

function setup(props: Partial<TableProps<Person>> = {}) {
  return render(
    <Table
      data={people}
      columns={["name", "age", "site"]}
      cellNavigation
      pagination={{ pageSize: 10 }}
      aria-label="People"
      {...props}
    />,
  )
}

/** Where the focus is, as "row id / column key". */
function active(): string {
  const cell = document.activeElement
  if (!(cell instanceof HTMLElement)) return ""
  const td = cell.closest("td")
  return `${td?.parentElement?.dataset["rowId"] ?? ""}/${td?.dataset["key"] ?? ""}${td === cell ? "" : ` > ${cell.tagName.toLowerCase()}`}`
}

describe("cell navigation", () => {
  it("makes the table a grid with one stop in the tab order", async () => {
    const user = userEvent.setup()
    setup()

    expect(screen.getByRole("grid", { name: "People" })).toBeDefined()
    expect(document.querySelectorAll('tbody td[tabindex="0"]')).toHaveLength(1)

    await user.tab()
    // Past the toolbar's columns button, onto the first cell.
    while (!active().startsWith("p")) await user.tab()
    expect(active()).toBe("p1/name")
  })

  it("moves with the arrows, Home, End and Page keys, and stays put at the edges", async () => {
    const user = userEvent.setup()
    setup()
    const first = document.querySelector<HTMLElement>('tbody td[tabindex="0"]')
    act(() => first?.focus())

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}")
    expect(active()).toBe("p3/age")
    await user.keyboard("{End}")
    expect(active()).toBe("p3/site")
    await user.keyboard("{ArrowRight}")
    expect(active()).toBe("p3/site")
    await user.keyboard("{Home}")
    expect(active()).toBe("p3/name")
    await user.keyboard("{Control>}{End}{/Control}")
    expect(active()).toBe("p10/site")
    await user.keyboard("{Control>}{Home}{/Control}")
    expect(active()).toBe("p1/name")
    await user.keyboard("{ArrowUp}")
    expect(active()).toBe("p1/name")
    await user.keyboard("{PageDown}")
    expect(active().startsWith("p1/")).toBe(false)
  })

  it("keeps the one tab stop on the cell the keyboard was last on", async () => {
    const user = userEvent.setup()
    setup()
    act(() => document.querySelector<HTMLElement>('tbody td[tabindex="0"]')?.focus())
    await user.keyboard("{ArrowDown}{ArrowRight}")

    const stops = [...document.querySelectorAll<HTMLElement>('tbody td[tabindex="0"]')]
    expect(stops).toHaveLength(1)
    expect(stops[0]?.parentElement?.dataset["rowId"]).toBe("p2")
    expect(stops[0]?.dataset["key"]).toBe("age")
  })

  it("reports the active cell in the state, and highlights its row", async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn<(state: TableState) => void>()
    setup({ onStateChange })
    act(() => document.querySelector<HTMLElement>('tbody td[tabindex="0"]')?.focus())
    await user.keyboard("{ArrowDown}")

    expect(onStateChange.mock.calls.at(-1)?.[0].focus).toEqual({ rowId: "p2", key: "name" })
    expect(document.querySelector('tr[data-row-id="p2"]')?.getAttribute("data-focused")).toBe("true")
  })

  it("makes a clicked cell the active one", async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn<(state: TableState) => void>()
    setup({ onStateChange })
    await user.click(screen.getByText("Person 4"))
    expect(active()).toBe("p4/name")
    expect(onStateChange.mock.calls.at(-1)?.[0].focus).toEqual({ rowId: "p4", key: "name" })
  })

  it("goes into a cell's link with Enter and comes back out with Escape", async () => {
    const user = userEvent.setup()
    setup({ defaultState: { focus: { rowId: "p2", key: "site" } } })
    act(() => document.querySelector<HTMLElement>('tbody td[tabindex="0"]')?.focus())

    await user.keyboard("{Enter}")
    expect(active()).toBe("p2/site > a")
    await user.keyboard("{Escape}")
    expect(active()).toBe("p2/site")
  })

  it("works the selection checkbox and the expander from their cells", async () => {
    const user = userEvent.setup()
    setup({ selection: true, detail: { render: ({ row }) => `About ${row.name}` } })
    act(() => document.querySelector<HTMLElement>('tbody td[tabindex="0"]')?.focus())
    expect(active()).toBe("p1/__select")

    await user.keyboard(" ")
    expect(screen.getByText("1 selected")).toBeDefined()

    await user.keyboard("{ArrowRight}{Enter}")
    expect(screen.getByText("About Person 1")).toBeDefined()
    // Still on the cell: the row was not rebuilt from under it.
    expect(active()).toBe("p1/__expand")

    // Neither control is a stop of its own.
    expect(document.querySelector<HTMLInputElement>("tbody input.tpz-checkbox")?.tabIndex).toBe(-1)
  })

  it("is off by default: a plain table, with no tab stops in its cells", () => {
    render(<Table data={people} columns={["name"]} />)
    expect(screen.getByRole("table")).toBeDefined()
    expect(document.querySelectorAll("tbody td[tabindex]")).toHaveLength(0)
  })

  it("passes the automated accessibility checks as a grid", async () => {
    const { container } = setup({ selection: true })
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    })
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })
})

describe("making a cell active from outside", () => {
  function Banner(props: Partial<TableProps<Person>>) {
    const [state, setState] = useState<Partial<TableState>>({})
    return (
      <>
        <button onClick={() => setState((current) => focusCell({ ...(current as TableState) }, "p25", "age"))}>
          Show person 25
        </button>
        <Table
          data={people}
          columns={["name", "age"]}
          pagination={{ pageSize: 10 }}
          state={state}
          onStateChange={setState}
          {...props}
        />
      </>
    )
  }

  it("brings the row's page up, highlights it and puts the keyboard on it", async () => {
    const user = userEvent.setup()
    const scrolled: Element[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this)
    }

    render(<Banner cellNavigation />)
    await user.click(screen.getByRole("button", { name: "Show person 25" }))

    expect(screen.getByText("Person 25")).toBeDefined()
    expect(screen.getByRole("button", { name: "Page 3" }).getAttribute("aria-current")).toBe("page")
    expect(document.querySelector('tr[data-row-id="p25"]')?.getAttribute("data-focused")).toBe("true")
    expect(active()).toBe("p25/age")
    expect(scrolled.some((element) => element.closest("tr")?.getAttribute("data-row-id") === "p25")).toBe(true)

    Element.prototype.scrollIntoView = original
  })

  it("does not drag the table back once the user pages away", async () => {
    const user = userEvent.setup()
    render(<Banner />)
    await user.click(screen.getByRole("button", { name: "Show person 25" }))
    await user.click(screen.getByRole("button", { name: "Page 1" }))
    expect(screen.getByText("Person 1")).toBeDefined()
    expect(screen.queryByText("Person 25")).toBeNull()
  })

  it("highlights and scrolls without cell navigation, leaving the focus alone", async () => {
    const user = userEvent.setup()
    render(<Banner />)
    const button = screen.getByRole("button", { name: "Show person 25" })
    await user.click(button)
    expect(document.querySelector('tr[data-row-id="p25"]')?.getAttribute("data-focused")).toBe("true")
    expect(document.activeElement).toBe(button)
  })
})

describe("cell navigation on a server", () => {
  const element = (
    <Table
      data={people}
      columns={["name", "age"]}
      cellNavigation
      pagination={{ pageSize: 10 }}
      defaultState={{ focus: { rowId: "p14", key: "age" } }}
    />
  )

  it("renders the page the active row is on, with the tab stop on its cell", () => {
    const html = renderToString(element)
    expect(html).toContain('role="grid"')
    expect(html).toContain("Person 14")
    expect(html).not.toContain("Person 1<")
    expect(html.match(/tabindex="0"/gi)).toHaveLength(1)
    expect(html).toMatch(/data-focused="true" data-row-id="p14"/)
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
