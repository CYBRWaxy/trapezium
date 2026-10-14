import { expect, test, type Page } from "@playwright/test"

/**
 * A row of one line is exactly `--tpz-row-height`, whatever its cells hold.
 *
 * 28, 32 and 40 at compact, normal and relaxed — under a fixed height, where
 * it was always true for text, and under `rowHeight: "auto"`, where every cell
 * is padded and anything a pixel taller than the line made the row grow: a
 * badge at interface size, the checkbox's own margin, a 14px icon sitting on
 * an 11px baseline, a 1.75rem button. Only a browser can say how tall a row
 * ended up, so everything here measures rendered boxes.
 *
 * The tables are built on the plain JavaScript page, which is the DOM renderer
 * Vue and Svelte use too; the React playground is measured separately.
 */

declare global {
  interface Window {
    Trapezium: { createTable(host: HTMLElement, options: Record<string, unknown>): unknown }
  }
}

const PLAIN = "http://localhost:4330/"
const PLAYGROUND = "http://localhost:4330/examples/playground/dist/"

const DENSITIES = [
  { density: "compact", rowHeight: 28 },
  { density: "normal", rowHeight: 32 },
  { density: "relaxed", rowHeight: 40 },
] as const

const MODES = ["fixed", "auto"] as const

/** The playground's buttons for each. */
const LABELS: Record<string, string> = { compact: "Compact", normal: "Normal", relaxed: "Relaxed", fixed: "Fixed", auto: "Auto" }

type Built = {
  heights: number[]
  boxCentre: number
  lineCentre: number
  badge: { height: number; size: number }
  cell: number
  /** The renderer sized to `--tpz-cell-content-height`, and the content box of the cell it is in. */
  fill: { height: number; well: number }
}

/** One table per call: every built-in type, a selection column and a button renderer, one line each. */
async function build(page: Page, density: string, rowHeight: string | number): Promise<Built> {
  return page.evaluate(
    async ({ density, rowHeight }) => {
      document.querySelectorAll(".cell-layout-host").forEach((node) => node.remove())
      const host = document.createElement("div")
      host.className = "cell-layout-host"
      document.body.append(host)

      const row = (index: number) => ({
        id: String(index),
        name: `Ada ${String(index)}`,
        status: "open",
        tags: ["red", "blue"],
        avatar: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'/%3E",
        paid: index % 2 === 0,
        amount: 1240,
        due: "2026-01-02",
        site: "https://example.com",
        email: "ada@example.com",
        meta: { a: 1 },
        address: { line1: "1 Main St", city: "Paris" },
        percent: 0.4,
        at: "10:30",
        plan: "pro",
      })

      window.Trapezium.createTable(host, {
        data: [row(0), row(1), row(2)],
        density,
        rowHeight,
        selection: true,
        pagination: false,
        columns: [
          { key: "name" },
          { key: "status", type: "badge" },
          { key: "tags", type: "tags" },
          { key: "avatar", type: "image" },
          { key: "paid", type: "boolean" },
          { key: "amount", type: "currency" },
          { key: "due", type: "date" },
          { key: "site", type: "url" },
          { key: "email", type: "email" },
          { key: "meta", type: "json" },
          { key: "address", type: "address" },
          { key: "percent", type: "percent" },
          { key: "at", type: "time" },
          { key: "plan", type: "select" },
          {
            key: "open",
            header: "",
            render: () => {
              const button = document.createElement("button")
              button.className = "tpz-btn"
              button.textContent = "Open"
              return button
            },
          },
          {
            // A renderer that fills the cell, which is what the variable is for.
            key: "fill",
            header: "Fill",
            render: () => {
              const block = document.createElement("div")
              block.className = "fill"
              block.style.setProperty("height", "var(--tpz-cell-content-height)")
              return block
            },
          },
        ],
      })

      const rows = [...host.querySelectorAll("tbody tr")]
      const first = rows[0]!
      const top = first.getBoundingClientRect().top
      const box = first.querySelector(".tpz-checkbox")!.getBoundingClientRect()
      const name = first.querySelector<HTMLElement>('td[data-key="name"]')!
      const style = getComputedStyle(name)
      const badge = first.querySelector<HTMLElement>("td .tpz-badge")!
      const fill = first.querySelector<HTMLElement>(".fill")!
      const fillCell = fill.closest("td")!
      const fillStyle = getComputedStyle(fillCell)
      // Where the first line of text is: the top of the content box, plus half a line.
      const lineCentre =
        name.getBoundingClientRect().top - top + Number.parseFloat(style.paddingTop) + Number.parseFloat(style.lineHeight) / 2

      return {
        heights: rows.map((node) => node.getBoundingClientRect().height),
        boxCentre: box.top + box.height / 2 - top,
        // A fixed row centres its content in the cell, above the bottom border.
        lineCentre: style.verticalAlign === "top" ? lineCentre : name.clientHeight / 2,
        badge: { height: badge.getBoundingClientRect().height, size: Number.parseFloat(getComputedStyle(badge).fontSize) },
        cell: Number.parseFloat(style.fontSize),
        fill: {
          height: fill.getBoundingClientRect().height,
          well:
            fillCell.clientHeight - Number.parseFloat(fillStyle.paddingTop) - Number.parseFloat(fillStyle.paddingBottom),
        },
      }
    },
    { density, rowHeight },
  )
}

test.describe("one line is one row height", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAIN)
    await expect(page.locator(".tpz tbody tr").first()).toBeVisible()
  })

  for (const { density, rowHeight } of DENSITIES) {
    for (const mode of MODES) {
      test(`${density}, ${mode}: every row is ${String(rowHeight)}px`, async ({ page }) => {
        const built = await build(page, density, mode)
        // Every row, the last one too: it has no bottom border, and is the same height without it.
        for (const height of built.heights) expect(height).toBe(rowHeight)
        // And the renderer sized to the variable filled the cell rather than collapsing.
        expect(built.fill.height).toBe(built.fill.well)
      })

      test(`${density}, ${mode}: the checkbox is centred on the first line`, async ({ page }) => {
        const built = await build(page, density, mode)
        expect(Math.abs(built.boxCentre - built.lineCentre)).toBeLessThanOrEqual(0.5)
      })
    }

    test(`${density}: a badge in a cell is one line, a step below the cell's text`, async ({ page }) => {
      const built = await build(page, density, "auto")
      expect(built.badge.height).toBe(16)
      expect(built.badge.size).toBe(built.cell - 1)
    })

    test(`${density}: a renderer filling the cell does not grow an exact row`, async ({ page }) => {
      const built = await build(page, density, 48)
      for (const height of built.heights) expect(height).toBe(48)
      expect(built.fill.height).toBe(built.fill.well)
    })
  }

  test("a badge outside a cell keeps the interface size", async ({ page }) => {
    const size = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(".tpz")!
      const badge = document.createElement("span")
      badge.className = "tpz-badge"
      badge.textContent = "outside"
      root.append(badge)
      const measured = [Number.parseFloat(getComputedStyle(badge).fontSize), badge.getBoundingClientRect().height]
      badge.remove()
      return measured
    })
    expect(size[0]).toBe(12)
    expect(size[1]).toBeGreaterThan(16)
  })
})

test.describe("in React", () => {
  test("a one-line row is the row height at every density, fixed and auto", async ({ page }) => {
    await page.goto(PLAYGROUND)
    // The table with every feature on, whose controls switch density and row height.
    const table = page.locator(".tpz").filter({ has: page.locator(".tpz-search") }).first()
    await expect(table.locator("tbody tr").first()).toBeVisible()

    for (const { density, rowHeight } of DENSITIES) {
      for (const mode of MODES) {
        await page.getByRole("button", { name: LABELS[density], exact: true }).first().click()
        await page.getByRole("button", { name: LABELS[mode], exact: true }).first().click()
        await expect(table).toHaveAttribute("data-density", density)

        const heights = await table.locator("tbody tr").evaluateAll((rows) =>
          rows
            // The notes column wraps on purpose; a row where it took two lines is not one line.
            .filter((row) => {
              const notes = row.querySelector('td[data-key="notes"]')
              if (!notes) return true
              // The text's own lines: a range over the whole cell also returns a rect for each element in it.
              const tops = new Set<number>()
              const walker = document.createTreeWalker(notes, NodeFilter.SHOW_TEXT)
              for (let text = walker.nextNode(); text; text = walker.nextNode()) {
                const range = document.createRange()
                range.selectNodeContents(text)
                for (const rect of range.getClientRects()) tops.add(Math.round(rect.top))
              }
              return tops.size <= 1
            })
            .map((row) => row.getBoundingClientRect().height),
        )

        expect(heights.length).toBeGreaterThan(3)
        for (const height of heights) expect(height, `${density} ${mode}`).toBe(rowHeight)
      }
    }
  })
})
