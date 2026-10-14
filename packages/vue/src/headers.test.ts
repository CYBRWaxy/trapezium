/**
 * @vitest-environment jsdom
 *
 * A component as a header's text, live and on a server.
 */
import { afterEach, describe, expect, it } from "vitest"
import { createApp, createSSRApp, defineComponent, h, nextTick } from "vue"
import { renderToString } from "vue/server-renderer"

import { Table, type VueColumn } from "./table.js"

const items = [
  { id: "a", name: "Anvil", amount: 30 },
  { id: "b", name: "Bucket", amount: 10 },
]

const Unit = defineComponent({
  props: { label: { type: String, required: true } },
  setup: (props) => () => h("span", { class: "unit" }, [props.label, h("em", "AUD")]),
})

const columns: VueColumn[] = [
  { key: "amount", description: "Excludes tax", renderHeader: ({ column }) => h(Unit, { label: column.header }) },
]

let host: HTMLElement | undefined
let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  host?.remove()
})

describe("header renderers in Vue", () => {
  it("renders a component as the header's text", async () => {
    host = document.createElement("div")
    document.body.append(host)
    const app = createApp(defineComponent(() => () => h(Table, { data: items, columns, id: "items" })))
    app.mount(host)
    unmount = () => app.unmount()
    await nextTick()
    expect(host.querySelector('th[data-key="amount"] .unit em')?.textContent).toBe("AUD")
    expect(host.querySelector('th[data-key="amount"] .tpz-th-button')?.getAttribute("aria-describedby")).toBe("items-desc-amount")
  })

  it("renders it on a server", async () => {
    const html = await renderToString(createSSRApp(defineComponent(() => () => h(Table, { data: items, columns, id: "items" }))))
    expect(html).toContain('<span class="unit">Amount<em>AUD</em></span>')
    expect(html).toContain('id="items-desc-amount"')
  })
})
