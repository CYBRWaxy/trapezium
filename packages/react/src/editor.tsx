import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  editorOptions,
  editorStep,
  placePopup,
  toEditorText,
  type AnyRow,
  type EditorKind,
  type FormatContext,
  type SelectOption,
} from "@trapezium/core"

import { useTableContext } from "./context.js"
import type { TableColumn } from "./types.js"

/**
 * The editor a cell becomes while it is being edited.
 *
 * Built-in editors are plain form controls — the browser's own text, number,
 * date and time boxes, with their pickers and their accessibility — and one
 * thing the browser lacks: a list of choices you can narrow by typing. All the
 * rules about which editor, what it starts with and what its text means are
 * the core's; this is only markup and keys.
 */

/** How an edit ended, which decides where the keyboard goes next. */
export type CommitReason = "enter" | "tab" | "shift-tab" | "blur" | "custom"

export type CellEditorProps<TRow extends AnyRow> = {
  column: TableColumn<TRow>
  row: TRow
  rowId: string
  value: unknown
  /** The character typed to open the editor, which replaces the value. */
  seed: string | undefined
  kind: EditorKind
  format: FormatContext
  /** Why the last attempt to commit was refused, shown beside the editor. */
  error: string | undefined
  /** Text from a built-in editor, or a value from a custom one. */
  onCommit: (input: { text: string } | { value: unknown }, reason: CommitReason) => void
  onCancel: () => void
}

export function CellEditor<TRow extends AnyRow>(props: CellEditorProps<TRow>) {
  const { column, row, rowId, value, seed, kind, format, error, onCommit, onCancel } = props
  /*
    Held in state rather than a ref: a popup inside the editor is placed in a
    layout effect, which runs before the editor's own element is attached, and
    has to be told again once it is.
  */
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null)
  const errorId = useId()

  let editor: ReactNode
  if (kind === "custom" && column.renderEditor) {
    editor = column.renderEditor({
      value,
      initialText: seed ?? "",
      row,
      rowId,
      column,
      commit: (next) => onCommit({ value: next }, "custom"),
      cancel: onCancel,
    })
  } else if (kind === "select" || kind === "boolean") {
    editor = (
      <EditorCombobox
        options={editorOptions(column, kind, format)}
        current={toEditorText(value, kind, column, format)}
        seed={seed}
        label={`Edit ${column.header}`}
        invalid={error !== undefined}
        errorId={error ? errorId : undefined}
        anchor={anchor}
        onCommit={(text, reason) => onCommit({ text }, reason)}
        onCancel={onCancel}
      />
    )
  } else {
    editor = (
      <EditorInput
        kind={kind}
        initial={seed ?? toEditorText(value, kind, column, format)}
        seeded={seed !== undefined}
        step={kind === "number" ? editorStep(column) : undefined}
        label={`Edit ${column.header}`}
        invalid={error !== undefined}
        errorId={error ? errorId : undefined}
        onCommit={(text, reason) => onCommit({ text }, reason)}
        onCancel={onCancel}
      />
    )
  }

  return (
    <div ref={setAnchor} className="tpz-editor" data-kind={kind}>
      {editor}
      {error && (
        <Popup anchor={anchor}>
          <div id={errorId} className="tpz-editor-error" role="alert">
            {error}
          </div>
        </Popup>
      )}
    </div>
  )
}

/** Which input type a built-in editor uses. */
function inputType(kind: EditorKind): string {
  switch (kind) {
    case "number":
      return "number"
    case "date":
      return "date"
    case "datetime":
      return "datetime-local"
    case "time":
      return "time"
    default:
      return "text"
  }
}

/**
 * Keys every editor shares. Each is stopped as well as handled, so the grid
 * around the editor does not also act on it — Escape must close the editor
 * and nothing else, not clear the selection or close a dialog the table is in.
 */
function editorKeys(
  event: React.KeyboardEvent,
  commit: (reason: CommitReason) => void,
  cancel: () => void,
): boolean {
  if (event.nativeEvent.isComposing) return false

  if (event.key === "Enter") {
    event.preventDefault()
    event.stopPropagation()
    commit("enter")
    return true
  }
  if (event.key === "Escape") {
    event.preventDefault()
    event.stopPropagation()
    cancel()
    return true
  }
  if (event.key === "Tab") {
    event.preventDefault()
    event.stopPropagation()
    commit(event.shiftKey ? "shift-tab" : "tab")
    return true
  }
  return false
}

function EditorInput({
  kind,
  initial,
  seeded,
  step,
  label,
  invalid,
  errorId,
  onCommit,
  onCancel,
}: {
  kind: EditorKind
  initial: string
  seeded: boolean
  step: string | undefined
  label: string
  invalid: boolean
  errorId: string | undefined
  onCommit: (text: string, reason: CommitReason) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  // A commit by key has already ended the edit; the blur that follows must not commit again.
  const done = useRef(false)

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus({ preventScroll: true })
    // Typing opened it: the caret goes after what was typed. Otherwise the
    // value is selected, so typing replaces it.
    try {
      if (seeded) input.setSelectionRange(input.value.length, input.value.length)
      else input.select()
    } catch {
      // Number and date inputs do not have a selection to set.
    }
  }, [seeded])

  const commit = (reason: CommitReason) => {
    done.current = reason !== "blur"
    onCommit(inputRef.current?.value ?? "", reason)
  }

  return (
    <input
      ref={inputRef}
      className="tpz-editor-input"
      type={inputType(kind)}
      inputMode={kind === "number" ? "decimal" : undefined}
      step={step}
      defaultValue={initial}
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={errorId}
      autoComplete="off"
      spellCheck={false}
      onKeyDown={(event) => {
        editorKeys(event, commit, () => {
          done.current = true
          onCancel()
        })
      }}
      onBlur={() => {
        if (!done.current) commit("blur")
        done.current = false
      }}
    />
  )
}

/**
 * A list of choices narrowed by typing — the WAI-ARIA combobox pattern.
 *
 * The text box keeps the focus throughout; the arrow keys move the active
 * choice, named to a screen reader through `aria-activedescendant`. The list
 * is drawn outside the table, so the scroll area cannot clip it, below the
 * cell or above it when the cell is near the bottom of the window.
 */
function EditorCombobox({
  options,
  current,
  seed,
  label,
  invalid,
  errorId,
  anchor,
  onCommit,
  onCancel,
}: {
  options: SelectOption[]
  current: string
  seed: string | undefined
  label: string
  invalid: boolean
  errorId: string | undefined
  anchor: HTMLElement | null
  onCommit: (value: string, reason: CommitReason) => void
  onCancel: () => void
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState(seed ?? "")
  const matching = filterOptions(options, query)
  const [active, setActive] = useState(() => {
    if (seed !== undefined) return 0
    const index = options.findIndex((option) => option.value === current)
    return index === -1 ? 0 : index
  })
  // Whether the person did anything — a blur after nothing at all is not a choice.
  const touched = useRef(seed !== undefined)
  const done = useRef(false)

  useLayoutEffect(() => {
    const input = inputRef.current
    input?.focus({ preventScroll: true })
    if (input && seed !== undefined) input.setSelectionRange(input.value.length, input.value.length)
  }, [seed])

  const chosen = matching[Math.min(active, matching.length - 1)]

  const commit = (reason: CommitReason) => {
    done.current = reason !== "blur"
    if (!chosen || (reason === "blur" && !touched.current)) {
      done.current = true
      onCancel()
      return
    }
    onCommit(chosen.value, reason)
  }

  const currentLabel = options.find((option) => option.value === current)?.label ?? current

  return (
    <>
      <input
        ref={inputRef}
        className="tpz-editor-input"
        role="combobox"
        aria-label={label}
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={chosen ? `${listId}-${String(matching.indexOf(chosen))}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={errorId}
        autoComplete="off"
        spellCheck={false}
        placeholder={currentLabel}
        value={query}
        onChange={(event) => {
          touched.current = true
          setQuery(event.target.value)
          setActive(0)
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            event.stopPropagation()
            touched.current = true
            const last = matching.length - 1
            setActive((index) => (event.key === "ArrowDown" ? Math.min(last, index + 1) : Math.max(0, index - 1)))
            return
          }
          if (event.key === "Home" || event.key === "End") {
            event.stopPropagation()
            return
          }
          editorKeys(event, commit, () => {
            done.current = true
            onCancel()
          })
        }}
        onBlur={() => {
          if (!done.current) commit("blur")
          done.current = false
        }}
      />
      <Popup anchor={anchor}>
        <div id={listId} role="listbox" aria-label={label} className="tpz-menu tpz-editor-list">
          {matching.length === 0 ? (
            <div className="tpz-menu-label">No matches</div>
          ) : (
            matching.map((option, index) => (
              <div
                key={option.value}
                id={`${listId}-${String(index)}`}
                role="option"
                aria-selected={option === chosen}
                className="tpz-editor-option"
                data-current={option.value === current ? "true" : undefined}
                // Pressing an option must not blur the box first, or the blur would end the edit before the choice lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  done.current = true
                  onCommit(option.value, "enter")
                }}
                onMouseEnter={() => setActive(index)}
              >
                {option.label ?? option.value}
              </div>
            ))
          )}
        </div>
      </Popup>
    </>
  )
}

/** Choices whose label or value contains what was typed, ignoring case. */
export function filterOptions(options: readonly SelectOption[], query: string): SelectOption[] {
  const needle = query.trim().toLowerCase()
  if (needle === "") return [...options]
  return options.filter(
    (option) => option.value !== "" && ((option.label ?? option.value).toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle)),
  )
}

/**
 * Something drawn outside the table, against an element inside it: below it,
 * or above when there is no room below, and kept inside the window. It follows
 * the element as anything scrolls. Rendered only in a browser.
 */
export function Popup({ anchor, children }: { anchor: HTMLElement | null; children: ReactNode }) {
  const { theme } = useTableContext()
  const popupRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number; side: string } | undefined>()

  const place = useCallback(() => {
    const target = anchor
    const popup = popupRef.current
    if (!target || !popup) return
    const rect = target.getBoundingClientRect()
    const size = popup.getBoundingClientRect()
    const view = target.ownerDocument.defaultView
    const next = placePopup(
      rect,
      { width: size.width, height: size.height },
      { width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0 },
    )
    // Only a move is a change: placing it where it already is must not render again.
    setPosition((current) =>
      current && current.top === next.top && current.left === next.left && current.side === next.side ? current : next,
    )
  }, [anchor])

  // After every render, because what is inside may have changed size — a list narrowed by typing.
  useLayoutEffect(() => {
    place()
  })

  useEffect(() => {
    const view = anchor?.ownerDocument.defaultView
    if (!view) return
    view.addEventListener("scroll", place, true)
    view.addEventListener("resize", place)
    return () => {
      view.removeEventListener("scroll", place, true)
      view.removeEventListener("resize", place)
    }
  }, [anchor, place])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      className="tpz tpz-portal"
      data-theme={theme}
      data-side={position?.side}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? "visible" : "hidden" }}
      ref={popupRef}
    >
      {children}
    </div>,
    document.body,
  )
}
