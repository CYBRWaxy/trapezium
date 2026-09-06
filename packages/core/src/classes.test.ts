import { describe, expect, it } from "vitest"

import { SLOT_CLASSES, createClasses, cx } from "./classes.js"

describe("createClasses", () => {
  it("gives every slot its default", () => {
    const classes = createClasses(undefined, undefined)
    for (const slot of Object.keys(SLOT_CLASSES) as Array<keyof typeof SLOT_CLASSES>) {
      expect(classes(slot)).toBe(SLOT_CLASSES[slot])
    }
  })

  it("adds a caller's class to the default rather than replacing it", () => {
    const classes = createClasses({ row: "hover:bg-indigo-50" }, undefined)
    expect(classes("row")).toBe("tpz-tr hover:bg-indigo-50")
  })

  it("drops the defaults when unstyled, and keeps what the caller passed", () => {
    const classes = createClasses({ table: "w-full" }, true)
    expect(classes("table")).toBe("w-full")
    expect(classes("cell")).toBe("")
  })

  it("appends whatever the call site adds", () => {
    const classes = createClasses(undefined, undefined)
    expect(classes("cell", "overdue")).toBe("tpz-td overdue")
    expect(classes("cell", undefined)).toBe("tpz-td")
  })
})

describe("cx", () => {
  it("skips the empty ones", () => {
    expect(cx("a", false, null, undefined, "", "b")).toBe("a b")
  })
})
