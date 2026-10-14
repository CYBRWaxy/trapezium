# Editing and the keyboard

Cells the keyboard can move between, and cells that edit in place. Editing needs the first, so asking for it switches the first on; the first is useful on its own.

## Moving between cells

```tsx
<Table data={rows} cellNavigation />
```

The table becomes one stop in the tab order — the active cell — and the keys move from there:

| Key | |
|---|---|
| Arrow keys | One cell. Nothing wraps: the right arrow at the end of a row stays there. |
| Home / End | The first or last cell of the row. With Control (Command on a Mac), of the whole page. |
| Page Up / Page Down | As many rows as the scroll area shows, less one. |
| Enter or F2 | Opens an editable cell's editor; otherwise goes into the cell's link or button. |
| Escape | From a control inside a cell, back to the cell. |
| Space or Enter | Ticks the selection checkbox, or opens the detail row, from their cells. |

Clicking a cell makes it the active one too. The table's own checkboxes and expanders leave the tab order to their cells; links and buttons in your own cell renderers keep theirs.

With `cellNavigation` the table is `role="grid"`, which is the right role for a table you move through cell by cell — and a different experience in a screen reader from a plain table, which is why it is off until asked for. An editable column switches it on, since editing cannot work without it; pass `cellNavigation={false}` to keep a plain table that is edited with the mouse alone.

The focus ring is `--tpz-focus-ring` (the `--tpz-ring` colour by default), drawn inside the cell.

### The active cell is state

The active cell is `state.focus` — `{ rowId, key?, align? }` — so it is reported through `onStateChange`, saved with a view if you want it, and set from outside like any other state. That is how a banner, a search result or a notification takes someone straight to a row:

```tsx
import { useState } from "react"
import { Table, createState, focusCell, type TableState } from "@trapezium/react"

export function Orders({ rows }: { rows: Order[] }) {
  const [state, setState] = useState<TableState>(() => createState())

  return (
    <>
      <button onClick={() => setState((current) => focusCell(current, "ord_1042", "status", "center"))}>
        Show order 1042
      </button>
      <Table data={rows} state={state} onStateChange={setState} cellNavigation />
    </>
  )
}
```

Setting it:

- brings the row onto the page it is on, when the table pages its own data — the page in the state follows, and `onStateChange` says so;
- scrolls it into view, to `align` (`"start"`, `"center"`, `"end"` or `"nearest"`, the default);
- highlights the row (`data-focused="true"`, tinted `--tpz-focused`);
- with cell navigation on, puts the keyboard on that cell, or on the row's first cell when no `key` is given.

On the first render nothing takes the focus — a page that has only just loaded should not have the focus pulled away from wherever the browser put it — but the row is scrolled to and highlighted, and a server renders the right page with the highlight already on. Setting the same cell again does nothing; clear it with `clearFocus(state)` first to jump to it twice. Once a row has been revealed, paging away from it is not undone.

In server mode the table cannot know which page a row is on, so set `page` yourself alongside `focus`.

The URL leaves it out unless asked: `include: [...DEFAULT_URL_KEYS, "focus"]` writes `at=rowId:key`, which is how a link points at one row.

In code: `focusCell(state, rowId, key?, align?)` · `clearFocus(state)` · and for your own renderer `nextCell(grid, from, key, options)` · `entryCell(grid, focus)` · `isNavigationKey(key)`.

## Editing in place

```tsx
const [rows, setRows] = useState(initialRows)

<Table
  data={rows}
  columns={[
    { key: "name", editable: true },
    { key: "quantity", type: "number", editable: true },
    { key: "price", type: "currency", editable: (row) => !row.invoiced },
    { key: "status", type: "select", editable: true, formatOptions: { options: STATUSES } },
    { key: "due", type: "date", editable: true },
  ]}
  onCellEdit={({ rowId, key, value }) =>
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)))
  }
/>
```

`editable` is `true` or a function of the row. The table never changes `data`; it tells you what changed, and the cell shows what the data says once you have updated it.

### Opening, committing, cancelling

| | |
|---|---|
| Double-click | Opens the editor. `editTrigger="click"` makes it a single click. |
| Enter or F2 | Opens it from the keyboard, with the value selected. |
| Typing a character | Opens it with that character in place of the value, as a spreadsheet does. |
| Backspace or Delete | Opens it empty. |
| Enter | Commits. |
| Tab / Shift+Tab | Commits and opens the next or previous editable cell, across rows, skipping cells the row does not allow. |
| Leaving the cell | Commits. |
| Escape | Cancels and goes back to the cell. The Escape stops there — it does not clear the selection, close a menu or close a dialog the table is in. |

An edit that changes nothing reports nothing.

### The editors

Chosen by the column's type:

| Type | Editor |
|---|---|
| `text`, `longText`, `email`, `url`, `phone`, `id`, `code` and custom types | A text box. |
| `number`, `percent`, `currency` | A number box, stepping by the column's `formatOptions.decimals`. An amount kept in minor units (`currencyInMinorUnits`) is edited in major units and handed back in minor ones. |
| Any column with `formatOptions.options` (`select`, `badge`, …) | A list of the options, narrowed by typing — an ARIA combobox. The first choice clears the cell. |
| `boolean` | The same list: Yes, No, or cleared. |
| `date` | The browser's date picker. A calendar day comes back as `"YYYY-MM-DD"`. |
| `datetime`, `relativeTime` | The browser's date-and-time picker, in the table's `format.timeZone`, handed back as the instant it means. |
| `time` | The browser's time picker, keeping seconds when the column has them. |
| `tags` | A text box of comma-separated words, handed back as an array. |
| `json`, `image`, `file`, `address` | None — there is no honest text box for them. Give the column a `renderEditor`. |

A value is handed back in the shape of the one it replaces: a number for a number, a `Date` for a `Date`, epoch seconds for epoch seconds, a code number for a code number.

The list's choices and an editor's error are drawn outside the table, so the scroll area cannot clip them, below the cell — or above it near the bottom of the window — and kept inside the window sideways. The browser draws its own date and time pickers.

### `parse` and `validate`

```ts
{
  key: "quantity",
  type: "number",
  editable: true,
  parse: (value) => (typeof value === "number" ? Math.round(value) : value),
  validate: (value) => (typeof value === "number" && value >= 0) || "Must be zero or more",
}
```

`parse(value, row)` runs first and turns what the editor produced into what you store. `validate(value, row)` returns a message — or `false` for a generic one — to refuse it: nothing is committed, the editor is marked `aria-invalid`, and the message appears beside it, announced, until the value is fixed or the edit cancelled. Leaving the cell with an invalid value abandons the edit. A number box holding something that is not a number is refused without a `validate`.

### Saving, and failing to

`onCellEdit` receives `{ rowId, row, key, value, previousValue, pinned? }`. Return a promise to have the cell show that it is saving — it shows the new value, quieter, with `data-pending="true"` and `aria-busy="true"` — until the promise settles. If it rejects, the cell shows what the data says again and is marked `data-failed="true"`, with the error's message as its title and read out after its value. The mark goes when the cell is next edited.

```tsx
const apply = (rows: Order[], rowId: string, key: string, value: unknown) =>
  rows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row))

<Table
  data={rows}
  columns={columns}
  onCellEdit={async ({ rowId, key, value, previousValue }) => {
    setRows((current) => apply(current, rowId, key, value)) // optimistic
    try {
      await api.orders.update(rowId, { [key]: value })
    } catch (error) {
      setRows((current) => apply(current, rowId, key, previousValue)) // your rollback
      throw error // and the cell says it failed
    }
  }}
/>
```

Optimistic updates and their rollback stay yours, beside the data. Editing works the same in server mode.

### Your own editor

```tsx
{
  key: "assignee",
  editable: true,
  renderEditor: ({ value, row, commit, cancel, initialText }) => (
    <PeoplePicker initial={value} search={initialText} onPick={(person) => commit(person.id)} onClose={cancel} />
  ),
}
```

It is drawn in the cell. `commit(value)` sends the value through `parse` and `validate` like any other; `cancel()` puts the cell back. Keys inside it are yours — the table does not commit on Enter or Tab for you, and does not end the edit when the focus moves into a popover of your own. A picker that opens a popover should render it outside the table (a portal), or the scroll area clips it.

In Vue, `renderEditor` may return a VNode, and `onCellEdit` is a prop (`@cell-edit` binds to it) so that it can return a promise.

### On a server

No editor is ever open on a server — an editor is opened by a person. Editable cells carry `data-editable="true"` and the grid says it is not read-only.

### Styling

| | |
|---|---|
| `.tpz-td[data-editable="true"]` | An editable cell. |
| `.tpz-td[data-editing="true"]` | The cell being edited. The editor, `.tpz-editor-input`, fills it exactly. |
| `.tpz-td[data-pending="true"]` | Saving. |
| `.tpz-td[data-failed="true"]` | Not saved. |
| `.tpz-editor-list`, `.tpz-editor-option` | The list of choices. |
| `.tpz-editor-error` | The message beside a refused value. |
| `--tpz-focus-ring` | The editor's outline, as the active cell's. |

In code: `isCellEditable(column, row)` · `editorKind(column, types)` · `editorOptions` · `toEditorText` · `fromEditorText` · `validateEdit` · `editValuesEqual` · `placePopup` — the rules the editors follow, for anyone building their own.
