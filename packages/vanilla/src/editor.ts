import { placePopup, type EditorKind, type SelectOption } from "@trapezium/core"

import { currentDocument, el } from "./dom.js"

/**
 * The editors a cell becomes, built as DOM.
 *
 * The same markup and the same keys as the React editors: the browser's own
 * text, number, date and time boxes, and a list of choices narrowed by typing
 * for the one thing the browser has no box for. Which editor, what it starts
 * with and what its text means are decided in the core; this only builds and
 * listens.
 */

/** How an edit ended, which decides where the keyboard goes next. */
export type CommitReason = "enter" | "tab" | "shift-tab" | "blur" | "custom"

export type EditorHandle = {
  /** The element that goes in the cell. */
  element: HTMLElement
  /** Gives the focus to the editor, with the caret where a person expects it. */
  focus(): void
  /** What has been typed so far, for putting the editor back after a rebuild. */
  text(): string
  /** Marks the editor invalid and says why beside it, or clears both. */
  setError(message: string | undefined): void
  /** Takes away anything the editor put outside the cell. */
  dispose(): void
}

type Callbacks = {
  onCommit: (text: string, reason: CommitReason) => void
  onCancel: () => void
}

/**
 * Keys every editor shares, stopped as well as handled so the grid does not
 * also act on them: Escape closes the editor and nothing else.
 */
function sharedKeys(event: KeyboardEvent, commit: (reason: CommitReason) => void, cancel: () => void): boolean {
  if (event.isComposing) return false
  if (event.key === "Enter" || event.key === "Escape" || event.key === "Tab") {
    event.preventDefault()
    event.stopPropagation()
    if (event.key === "Escape") cancel()
    else commit(event.key === "Enter" ? "enter" : event.shiftKey ? "shift-tab" : "tab")
    return true
  }
  return false
}

function inputType(kind: EditorKind): string {
  if (kind === "number") return "number"
  if (kind === "date") return "date"
  if (kind === "datetime") return "datetime-local"
  if (kind === "time") return "time"
  return "text"
}

/** A popup outside the table, against an element inside it: below, or above when there is no room. */
export function openPopup(anchor: HTMLElement, content: HTMLElement, theme: string | undefined): { dispose(): void } {
  const wrapper = el("div", { class: "tpz tpz-portal", "data-theme": theme }, [content])
  wrapper.style.visibility = "hidden"
  currentDocument().body.append(wrapper)

  const place = () => {
    const rect = anchor.getBoundingClientRect()
    const size = content.getBoundingClientRect()
    const position = placePopup(rect, { width: size.width, height: size.height }, { width: window.innerWidth, height: window.innerHeight })
    wrapper.style.top = `${String(position.top)}px`
    wrapper.style.left = `${String(position.left)}px`
    wrapper.dataset["side"] = position.side
    wrapper.style.visibility = ""
  }

  place()
  window.addEventListener("scroll", place, true)
  window.addEventListener("resize", place)
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(place)
  observer?.observe(content)

  return {
    dispose() {
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
      observer?.disconnect()
      wrapper.remove()
    },
  }
}

/** Shared by both built-in editors: the error message beside the editor. */
function errorPopup(anchor: HTMLElement, input: HTMLInputElement, theme: string | undefined, id: string) {
  let open: { dispose(): void } | undefined

  return {
    set(message: string | undefined) {
      open?.dispose()
      open = undefined
      if (message === undefined) {
        input.removeAttribute("aria-invalid")
        input.removeAttribute("aria-describedby")
        return
      }
      input.setAttribute("aria-invalid", "true")
      input.setAttribute("aria-describedby", id)
      open = openPopup(anchor, el("div", { id, class: "tpz-editor-error", role: "alert", text: message }), theme)
    },
    dispose() {
      open?.dispose()
    },
  }
}

/** A text, number, date, time or list-of-words box. */
export function buildInputEditor(options: {
  kind: EditorKind
  initial: string
  seeded: boolean
  step: string | undefined
  label: string
  theme: string | undefined
  /** Unique to the cell, for the ids the editor gives its parts. */
  id: string
} & Callbacks): EditorHandle {
  const { kind, initial, seeded, step, label, theme, id, onCommit, onCancel } = options
  const input = el("input", {
    class: "tpz-editor-input",
    type: inputType(kind),
    inputmode: kind === "number" ? "decimal" : undefined,
    step,
    "aria-label": label,
    autocomplete: "off",
    spellcheck: "false",
  })
  input.value = initial
  const wrapper = el("div", { class: "tpz-editor", "data-kind": kind }, [input])
  const error = errorPopup(wrapper, input, theme, `${id}-error`)

  // A commit by key has already ended the edit; the blur that follows must not commit again.
  let done = false
  const commit = (reason: CommitReason) => {
    done = reason !== "blur"
    onCommit(input.value, reason)
  }

  input.addEventListener("keydown", (event) => {
    sharedKeys(event, commit, () => {
      done = true
      onCancel()
    })
  })
  input.addEventListener("blur", () => {
    if (!done) commit("blur")
    done = false
  })

  return {
    element: wrapper,
    focus() {
      input.focus({ preventScroll: true })
      try {
        if (seeded) input.setSelectionRange(input.value.length, input.value.length)
        else input.select()
      } catch {
        // Number and date inputs have no selection to set.
      }
    },
    text: () => input.value,
    setError: error.set,
    dispose: error.dispose,
  }
}

/**
 * A list of choices narrowed by typing — the WAI-ARIA combobox pattern. The
 * text box keeps the focus; the arrows move the active choice, named to a
 * screen reader through `aria-activedescendant`. The list is drawn outside
 * the table so its scroll area cannot clip it.
 */
export function buildComboboxEditor(options: {
  kind: EditorKind
  choices: SelectOption[]
  current: string
  seed: string | undefined
  label: string
  theme: string | undefined
  id: string
} & Callbacks): EditorHandle {
  const { kind, choices, current, seed, label, theme, id, onCommit, onCancel } = options
  const listId = `${id}-list`
  const currentLabel = choices.find((choice) => choice.value === current)?.label ?? current

  const input = el("input", {
    class: "tpz-editor-input",
    role: "combobox",
    "aria-label": label,
    "aria-expanded": "true",
    "aria-controls": listId,
    "aria-autocomplete": "list",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: currentLabel,
  })
  input.value = seed ?? ""
  const wrapper = el("div", { class: "tpz-editor", "data-kind": kind }, [input])
  const list = el("div", { id: listId, role: "listbox", "aria-label": label, class: "tpz-menu tpz-editor-list" })
  const error = errorPopup(wrapper, input, theme, `${id}-error`)

  let matching: SelectOption[] = []
  let active = 0
  let touched = seed !== undefined
  let done = false
  let popup: { dispose(): void } | undefined

  const draw = () => {
    const needle = input.value.trim().toLowerCase()
    matching = needle === ""
      ? [...choices]
      : choices.filter(
          (choice) =>
            choice.value !== "" &&
            ((choice.label ?? choice.value).toLowerCase().includes(needle) || choice.value.toLowerCase().includes(needle)),
        )
    active = Math.max(0, Math.min(active, matching.length - 1))

    list.replaceChildren(
      ...(matching.length === 0
        ? [el("div", { class: "tpz-menu-label", text: "No matches" })]
        : matching.map((choice, index) => {
            const option = el("div", {
              id: `${listId}-${String(index)}`,
              role: "option",
              class: "tpz-editor-option",
              "aria-selected": index === active ? "true" : "false",
              "data-current": choice.value === current ? "true" : undefined,
              text: choice.label ?? choice.value,
            })
            // Pressing an option must not blur the box first, or the blur would end the edit before the choice lands.
            option.addEventListener("mousedown", (event) => event.preventDefault())
            option.addEventListener("click", () => {
              done = true
              onCommit(choice.value, "enter")
            })
            option.addEventListener("mouseenter", () => {
              active = index
              mark()
            })
            return option
          })),
    )
    mark()
  }

  const mark = () => {
    for (const [index, option] of [...list.querySelectorAll<HTMLElement>('[role="option"]')].entries()) {
      option.setAttribute("aria-selected", index === active ? "true" : "false")
    }
    if (matching[active]) input.setAttribute("aria-activedescendant", `${listId}-${String(active)}`)
    else input.removeAttribute("aria-activedescendant")
  }

  if (seed === undefined) {
    const index = choices.findIndex((choice) => choice.value === current)
    active = index === -1 ? 0 : index
  }
  draw()

  const commit = (reason: CommitReason) => {
    done = reason !== "blur"
    const chosen = matching[active]
    if (!chosen || (reason === "blur" && !touched)) {
      done = true
      onCancel()
      return
    }
    onCommit(chosen.value, reason)
  }

  input.addEventListener("input", () => {
    touched = true
    active = 0
    draw()
  })

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      event.stopPropagation()
      touched = true
      active = event.key === "ArrowDown" ? Math.min(matching.length - 1, active + 1) : Math.max(0, active - 1)
      mark()
      const option = list.children[active]
      if (option && typeof option.scrollIntoView === "function") option.scrollIntoView({ block: "nearest" })
      return
    }
    if (event.key === "Home" || event.key === "End") {
      event.stopPropagation()
      return
    }
    sharedKeys(event, commit, () => {
      done = true
      onCancel()
    })
  })

  input.addEventListener("blur", () => {
    if (!done) commit("blur")
    done = false
  })

  return {
    element: wrapper,
    focus() {
      popup ??= openPopup(wrapper, list, theme)
      input.focus({ preventScroll: true })
      if (seed !== undefined) input.setSelectionRange(input.value.length, input.value.length)
    },
    text: () => input.value,
    setError: error.set,
    dispose() {
      popup?.dispose()
      popup = undefined
      error.dispose()
    },
  }
}
