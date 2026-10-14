/**
 * @vitest-environment jsdom
 *
 * Editing in Vue: `@cell-edit`, a component as an editor, and the keyboard
 * reaching cells without being asked.
 */
import { afterEach, describe, expect, it } from "vitest"
import { createApp, defineComponent, h, nextTick, ref } from "vue"

import type { CellEdit } from "@trapezium/core"

import { Table, type VueColumn } from "./table.js"

type Item = { id: string; name: string; qty: number }

let host: HTMLElement | undefined
let unmount: (() => void) | undefined

afterEach(() => {
  unmount?.()
  host?.remove()
  host = undefined
  unmount = undefined
})

function mount(columns: Array<VueColumn | string>, edits: CellEdit[]) {
  host = document.createElement("div")
  document.body.append(host)
  const rows = ref<Item[]>([
    { id: "a", name: "Anvil", qty: 2 },
    { id: "b", name: "Bucket", qty: 5 },
  ])
  const app = createApp(
    defineComponent(() => () =>
      h(Table, {
        data: rows.value,
        columns,
        onCellEdit: (edit: CellEdit) => {
          edits.push(edit)
          rows.value = rows.value.map((row) => (row.id === edit.rowId ? { ...row, [edit.key]: edit.value } : row))
        },
      }),
    ),
  )
  app.mount(host)
  unmount = () => app.unmount()
}

function cell(rowId: string, key: string): HTMLElement {
  const found = host?.querySelector<HTMLElement>(`tr[data-row-id="${rowId}"] td[data-key="${key}"]`)
  if (!found) throw new Error(`no cell ${rowId}/${key}`)
  return found
}

describe("editing in Vue", () => {
  it("is a grid without being asked, and reports edits through @cell-edit", async () => {
    const edits: CellEdit[] = []
    mount([{ key: "name", editable: true }, "qty"], edits)
    await nextTick()

    expect(host?.querySelector("table")?.getAttribute("role")).toBe("grid")

    cell("a", "name").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    const input = host?.querySelector<HTMLInputElement>(".tpz-editor-input")
    if (!input) throw new Error("no editor")
    input.value = "Axe"
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await nextTick()

    expect(edits.map((edit) => [edit.rowId, edit.key, edit.value])).toEqual([["a", "name", "Axe"]])
    expect(cell("a", "name").textContent).toBe("Axe")
  })

  it("renders a component as a custom editor", async () => {
    const edits: CellEdit[] = []
    const Stepper = defineComponent({
      props: { value: { type: Number, required: true }, commit: { type: Function, required: true } },
      setup: (props) => () => h("button", { class: "stepper", onClick: () => props.commit(props.value + 1) }, "+1"),
    })
    mount(
      [
        {
          key: "qty",
          type: "number",
          editable: true,
          renderEditor: ({ value, commit }) => h(Stepper, { value: Number(value), commit }),
        },
      ],
      edits,
    )
    await nextTick()

    cell("b", "qty").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    host?.querySelector<HTMLButtonElement>(".tpz-editor .stepper")?.click()
    await nextTick()
    expect(edits.at(-1)?.value).toBe(6)
  })
})
