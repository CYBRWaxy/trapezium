/**
 * @vitest-environment jsdom
 *
 * The component with reactive props, which needs runes and so a `.svelte.ts`
 * module. It checks the one thing the component adds over the action: that a
 * new `data` prop takes the cheap path and leaves the arrangement alone.
 */
import { afterEach, describe, expect, it } from "vitest"
import { flushSync, mount, unmount } from "svelte"

import Table from "./Table.svelte"

type Person = { id: string; name: string; plan: string }

const people: Person[] = [
  { id: "1", name: "Ada", plan: "pro" },
  { id: "2", name: "Tom", plan: "free" },
]

let host: HTMLElement | undefined
let instance: Record<string, unknown> | undefined

afterEach(() => {
  if (instance) void unmount(instance)
  host?.remove()
  instance = undefined
  host = undefined
})

function names(): string[] {
  return [...(host?.querySelectorAll("tbody td") ?? [])].map((cell) => cell.textContent?.trim() ?? "")
}

describe("<Table> with reactive props", () => {
  it("keeps the sort, and the search box, when only the data changes", () => {
    const props = $state<{ data: Person[]; columns: string[]; search: boolean; onStateChange?: () => void }>({
      data: people,
      columns: ["name"],
      search: true,
      onStateChange: () => {},
    })

    host = document.createElement("div")
    document.body.append(host)
    flushSync(() => {
      instance = mount(Table, { target: host!, props }) as Record<string, unknown>
    })

    host.querySelector<HTMLButtonElement>(".tpz-th-button")?.click()
    host.querySelector<HTMLButtonElement>(".tpz-th-button")?.click()
    expect(names()).toEqual(["Tom", "Ada"])

    // Someone is typing when the rows arrive. The box must be the same element
    // afterwards, or the keyboard focus and the half-typed word go with it.
    const box = host.querySelector<HTMLInputElement>("input[type=search]")
    expect(box).toBeTruthy()

    flushSync(() => {
      props.data = [...people, { id: "3", name: "Zoe", plan: "pro" }]
    })

    expect(names()).toEqual(["Zoe", "Tom", "Ada"])
    expect(host.querySelector("input[type=search]")).toBe(box)
  })
})
