/**
 * Telling a click on a row from a click on something inside it.
 *
 * A row can do things when it is clicked — call `onRowClick`, open its detail,
 * start a drag that selects — and so can a link, a button or a checkbox in one
 * of its cells. A person clicking the button means the button. Every adapter
 * asks the same question the same way, so the answer cannot drift.
 *
 * Nothing here runs until an adapter calls it from an event handler, so the
 * core still touches no DOM of its own while rendering, on a server or off.
 */

/**
 * The elements a row-level gesture leaves alone: anything that is a control
 * in its own right, and anything marked `data-tpz-interactive` by a renderer
 * that built a control out of something else.
 */
export const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='option']",
  "[role='textbox']",
  "[role='slider']",
  "[role^='menu']",
  "[data-tpz-interactive]",
].join(", ")

/**
 * Whether a click's target is a control inside `within` (a row, a cell),
 * rather than the row itself or plain text in it.
 *
 * The control has to be inside `within`: a table rendered inside somebody's
 * `<label>` would otherwise find that label and ignore every click.
 */
export function isInteractiveTarget(target: EventTarget | null, within: Node): boolean {
  const element = elementOf(target)
  if (!element) return false

  const control = element.closest(INTERACTIVE_SELECTOR)
  return control !== null && within.contains(control)
}

/** The element an event happened on — a text node's parent, when it was text. */
function elementOf(target: EventTarget | null): Element | null {
  if (target === null) return null
  if (typeof Element !== "undefined" && target instanceof Element) return target
  if (typeof Node !== "undefined" && target instanceof Node) return target.parentElement
  return null
}
