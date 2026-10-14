/**
 * @vitest-environment jsdom
 *
 * Detail rows in Vue: a component below its row, on the server and live.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { createApp, createSSRApp, defineComponent, h, nextTick, ref } from "vue"
import { renderToString } from "vue/server-renderer"

import type { TableState } from "@trapezium/core"

import { Table, type VueDetail } from "./table.js"

type Order = { id: string; customer: string; total: number }

const orders: Order[] = [
  { id: "a", customer: "Ada", total: 120 },
  { id: "b", customer: "Tom", total: 80 },
]

const Lines = defineComponent({
  props: { name: { type: String, required: true } },
  setup: (props) => () => h("p", { class: "lines" }, `Lines of ${props.name}`),
})

const detail: VueDetail = { render: ({ row }) => h(Lines, { name: String(row["customer"]) }) }

let host: HTMLElement | undefined
let unmount: (() => void) | undefined

afterEach(() => {
  unmount?.()
  host?.remove()
  host = undefined
  unmount = undefined
})

function shape(): string[] {
  return [...(host?.querySelectorAll("tbody tr") ?? [])].map((tr) =>
    tr.classList.contains("tpz-detail-row")
      ? `detail:${tr.textContent ?? ""}`
      : (tr.querySelector('[data-key="customer"]')?.textContent ?? ""),
  )
}

describe("detail rows in Vue", () => {
  it("renders a component into an opened row and reports the state", async () => {
    const states: TableState[] = []
    host = document.createElement("div")
    document.body.append(host)

    const app = createApp(
      defineComponent(() => () =>
        h(Table, {
          data: orders,
          columns: ["customer", "total"],
          detail,
          "onUpdate:state": (state: TableState) => states.push(state),
        }),
      ),
    )
    app.mount(host)
    unmount = () => app.unmount()
    await nextTick()

    host.querySelector<HTMLButtonElement>("tbody .tpz-expander")?.click()
    await nextTick()

    expect(shape()).toEqual(["Ada", "detail:Lines of Ada", "Tom"])
    expect(host.querySelector(".tpz-detail .lines")).toBeTruthy()
    expect(states.at(-1)?.expanded).toEqual(["a"])
  })

  it("follows a controlled state", async () => {
    host = document.createElement("div")
    document.body.append(host)
    const expanded = ref<string[]>([])

    const app = createApp(
      defineComponent(() => () =>
        h(Table, { data: orders, columns: ["customer"], detail, state: { expanded: expanded.value } }),
      ),
    )
    app.mount(host)
    unmount = () => app.unmount()
    await nextTick()

    expanded.value = ["b"]
    await nextTick()
    expect(shape()).toEqual(["Ada", "Tom", "detail:Lines of Tom"])
  })
})

describe("detail rows on a server", () => {
  const app = () =>
    defineComponent(() => () =>
      h(Table, { data: orders, columns: ["customer"], id: "orders", detail, defaultState: { expanded: ["b"] } }),
    )

  it("renders the open row's component into the server markup", async () => {
    const html = await renderToString(createSSRApp(app()))
    expect(html).toContain('<p class="lines">Lines of Tom</p>')
    expect(html).not.toContain("Lines of Ada")
    expect(html).toContain('aria-controls="orders-detail-b"')
  })

  it("hydrates without a mismatch", async () => {
    const html = await renderToString(createSSRApp(app()))
    host = document.createElement("div")
    host.innerHTML = html
    document.body.append(host)

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const vue = createSSRApp(app())
    vue.mount(host)
    unmount = () => vue.unmount()
    await nextTick()

    const complaints = [...warn.mock.calls, ...error.mock.calls].map((call) => String(call[0]))
    warn.mockRestore()
    error.mockRestore()

    expect(complaints.filter((message) => /mismatch/i.test(message))).toEqual([])
    expect(shape()).toEqual(["Ada", "Tom", "detail:Lines of Tom"])
  })
})
