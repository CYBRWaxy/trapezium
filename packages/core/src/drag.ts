/**
 * Dragging a row by its handle.
 *
 * Pointer events rather than the browser's own drag and drop, which cannot
 * scroll the table it is dragging inside, draws a ghost the table does not
 * control, and does nothing at all on a touch screen. This one follows the
 * pointer, marks the row it would land beside, scrolls the table — or the
 * page — when the pointer nears an edge, and hands the result to the adapter.
 *
 * On a touch screen a drag starts after a long press on the handle. Until
 * then the page scrolls as it always does: nothing here stops a finger that
 * meant to scroll.
 *
 * Like `poof` and `copyText`, it touches the DOM only when it is called — from
 * a pointer event — so the core stays safe to import anywhere.
 */

export type RowDragOptions = {
  /** The `pointerdown` on the handle. */
  event: PointerEvent
  /** The row being dragged. */
  row: HTMLElement
  /**
   * The row a drop on `element` would land beside, or `undefined` where it
   * cannot land — a row of another parent, a pinned row, a detail row.
   */
  targetFor(element: Element): HTMLElement | undefined
  /** Called once, on release over a row it can land beside. */
  onDrop(target: HTMLElement, position: "before" | "after"): void
  /** How long a touch must be held before it drags, in milliseconds. Defaults to 350. */
  longPress?: number
}

/** How far a pointer moves before a press on the handle becomes a drag, in pixels. */
const THRESHOLD = 4
/** How close to an edge the pointer must be before the table scrolls, in pixels. */
const EDGE = 48
/** The fastest the table scrolls while dragging, in pixels a frame. */
const SPEED = 18

/**
 * Starts watching a press on a row's handle. Returns a function that stops
 * watching, for an adapter tearing the table down mid-drag.
 */
export function startRowDrag(options: RowDragOptions): () => void {
  const { event, row } = options
  const view = row.ownerDocument.defaultView
  if (!view) return () => undefined
  const page = row.ownerDocument

  const touch = event.pointerType === "touch"
  const startX = event.clientX
  const startY = event.clientY
  let lastY = startY
  let dragging = false
  let target: HTMLElement | undefined
  let position: "before" | "after" = "before"
  let pressTimer: ReturnType<typeof setTimeout> | undefined
  let lastX = startX

  // The rows scroll under a pointer that is holding still, so the mark is moved with them.
  const scroller = createEdgeScroller(row, () => mark(lastX, lastY))

  const begin = () => {
    dragging = true
    row.dataset["dragging"] = "true"
    row.closest(".tpz")?.setAttribute("data-row-dragging", "true")
    // A drag that has started owns the finger: from here the page must not scroll under it.
    if (touch) page.addEventListener("touchmove", preventScroll, { passive: false })
    scroller.start()
  }

  const mark = (clientX: number, clientY: number) => {
    const under = page.elementFromPoint(clientX, clientY)
    const next = under ? options.targetFor(under) : undefined
    if (target && target !== next) delete target.dataset["drop"]
    target = next === row ? undefined : next
    if (!target) return
    const rect = target.getBoundingClientRect()
    position = clientY < rect.top + rect.height / 2 ? "before" : "after"
    target.dataset["drop"] = position
  }

  const onMove = (move: PointerEvent) => {
    lastX = move.clientX
    lastY = move.clientY
    scroller.update(move.clientY)
    if (!dragging) {
      const distance = Math.hypot(move.clientX - startX, move.clientY - startY)
      // A finger that moves before the long press is up is scrolling, not dragging.
      if (touch) {
        if (distance > 8) stop()
        return
      }
      if (distance < THRESHOLD) return
      begin()
    }
    move.preventDefault()
    mark(move.clientX, move.clientY)
  }

  const onUp = () => {
    const landed = dragging ? target : undefined
    const where = position
    stop()
    if (landed) options.onDrop(landed, where)
  }

  const onKey = (key: KeyboardEvent) => {
    if (key.key !== "Escape") return
    key.preventDefault()
    key.stopPropagation()
    stop()
  }

  function stop() {
    clearTimeout(pressTimer)
    scroller.stop()
    page.removeEventListener("pointermove", onMove)
    page.removeEventListener("pointerup", onUp)
    page.removeEventListener("pointercancel", stop)
    page.removeEventListener("keydown", onKey, true)
    page.removeEventListener("touchmove", preventScroll)
    delete row.dataset["dragging"]
    row.closest(".tpz")?.removeAttribute("data-row-dragging")
    if (target) delete target.dataset["drop"]
    dragging = false
  }

  page.addEventListener("pointermove", onMove)
  page.addEventListener("pointerup", onUp)
  page.addEventListener("pointercancel", stop)
  page.addEventListener("keydown", onKey, true)
  if (touch) pressTimer = setTimeout(begin, options.longPress ?? 350)

  return stop
}

function preventScroll(event: Event) {
  event.preventDefault()
}

/**
 * Scrolls the table — or the page, when the table grows with it — while a
 * pointer held near the top or bottom edge says to, faster the closer it is.
 * Runs on animation frames rather than on pointer moves, because a pointer
 * held still at the edge is exactly when it has to keep going. `onScroll` is
 * told after every step, for whatever was under the pointer to be found again.
 */
export function createEdgeScroller(
  row: HTMLElement,
  onScroll: () => void,
): { start(): void; update(clientY: number): void; stop(): void } {
  const view = row.ownerDocument.defaultView
  const container = scrollContainer(row)
  let y = Number.NaN
  let frame = 0
  let running = false

  const step = () => {
    if (!running || !view) return
    const bounds = container ? container.getBoundingClientRect() : { top: 0, bottom: view.innerHeight }
    const delta =
      y < bounds.top + EDGE
        ? -SPEED * Math.min(1, (bounds.top + EDGE - y) / EDGE)
        : y > bounds.bottom - EDGE
          ? SPEED * Math.min(1, (y - (bounds.bottom - EDGE)) / EDGE)
          : 0
    if (delta !== 0) {
      if (container) container.scrollTop += delta
      else view.scrollBy(0, delta)
      onScroll()
    }
    frame = view.requestAnimationFrame(step)
  }

  return {
    start() {
      if (running || !view) return
      running = true
      frame = view.requestAnimationFrame(step)
    },
    update(clientY) {
      y = clientY
    },
    stop() {
      running = false
      view?.cancelAnimationFrame(frame)
    },
  }
}

/** The table's own scroll area when it scrolls up and down, or nothing — the page scrolls instead. */
function scrollContainer(row: HTMLElement): HTMLElement | undefined {
  const scroll = row.closest<HTMLElement>(".tpz-scroll")
  return scroll && scroll.scrollHeight > scroll.clientHeight + 1 ? scroll : undefined
}
