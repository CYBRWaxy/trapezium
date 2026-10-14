/**
 * Selecting rows by dragging across them.
 *
 * A press on a row that moves becomes a sweep: every row between the one
 * pressed and the one under the pointer is chosen, and the table scrolls when
 * the pointer nears an edge so the sweep can go further than the screen. A
 * press that does not move is a click, and is left alone — and the click that
 * ends a sweep is swallowed, so a row's own click does not fire as well.
 *
 * Like the row drag, it touches the DOM only when called from a pointer event.
 */

import { createEdgeScroller } from "./drag.js"

export type DragSelectOptions = {
  /** The `pointerdown` on the row. */
  event: PointerEvent
  /** The row pressed. */
  row: HTMLElement
  /** The row a point is over, or `undefined` — a pinned row, a detail row, the header. */
  rowFor(element: Element): HTMLElement | undefined
  /** Called as the sweep grows and shrinks, with the row it began on and the one it has reached. */
  onSweep(from: HTMLElement, to: HTMLElement): void
}

/** How far a press moves before it is a sweep rather than a click, in pixels. */
const THRESHOLD = 5

export function startDragSelect(options: DragSelectOptions): () => void {
  const { event, row } = options
  const page = row.ownerDocument
  const view = page.defaultView
  if (!view || event.pointerType === "touch") return () => undefined

  const startX = event.clientX
  const startY = event.clientY
  let sweeping = false
  let reached: HTMLElement = row
  const scroller = createEdgeScroller(row, () => {
    // The pointer has not moved but the rows have scrolled under it.
    track(lastX, lastY)
  })
  let lastX = startX
  let lastY = startY

  const track = (clientX: number, clientY: number) => {
    const under = page.elementFromPoint(clientX, clientY)
    const next = under ? options.rowFor(under) : undefined
    if (!next || next === reached) return
    reached = next
    options.onSweep(row, reached)
  }

  const onMove = (move: PointerEvent) => {
    lastX = move.clientX
    lastY = move.clientY
    if (!sweeping) {
      if (Math.hypot(move.clientX - startX, move.clientY - startY) < THRESHOLD) return
      sweeping = true
      row.closest(".tpz")?.setAttribute("data-sweeping", "true")
      // The press's own row is the first of the sweep.
      options.onSweep(row, row)
      scroller.start()
    }
    move.preventDefault()
    scroller.update(move.clientY)
    track(move.clientX, move.clientY)
  }

  // The click that ends a sweep is the sweep's, not the row's.
  const swallowClick = (click: Event) => {
    click.stopPropagation()
    click.preventDefault()
  }

  const onUp = () => {
    const swept = sweeping
    stop()
    if (!swept) return
    page.addEventListener("click", swallowClick, { capture: true, once: true })
    // A release outside the table makes no click to swallow; nothing must be left waiting for one.
    view.setTimeout(() => page.removeEventListener("click", swallowClick, { capture: true }), 0)
  }

  function stop() {
    scroller.stop()
    page.removeEventListener("pointermove", onMove)
    page.removeEventListener("pointerup", onUp)
    page.removeEventListener("pointercancel", stop)
    row.closest(".tpz")?.removeAttribute("data-sweeping")
  }

  page.addEventListener("pointermove", onMove)
  page.addEventListener("pointerup", onUp)
  page.addEventListener("pointercancel", stop)
  return stop
}
