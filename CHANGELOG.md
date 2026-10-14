# Changelog

Every `@trapezium/*` package is released together at the same version, so this one file covers all of them. Each entry says what changed for someone using the library, which adapters it reaches, and anything that behaves differently from before. The per-package `CHANGELOG.md` files, written by Changesets, carry the same releases in their own words.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). Before 1.0 a minor version can add to the API but never removes or renames anything without saying so here, with a migration note.

## Unreleased

### Added

- **Detail rows** (master/detail). `detail={{ render }}` opens content below a row, spanning the table, from an expander column that leads it — a chevron per row and one in the header for every row on the page. Any number open at once. Open rows are `state.expanded` (row ids), so they are controllable, saved with a view, and carried in the URL with `include: ["expanded"]` (`open=id1,id2`); the server renders open rows open. `canExpand(row)` leaves rows without one, `keepMounted` keeps a closed detail alive so it does not fetch again, and `toggleOnRowClick` opens it from anywhere on the row. A detail row is never counted, paged, sorted, selected or exported, takes its content's height with nothing measured, and works with append pagination, density, `responsive="cards"` and server mode. Every adapter; in Vue `render` may return a VNode. See [docs/rows.md](docs/rows.md#detail-rows).
- Core: `toggleExpanded`, `setExpanded`, `collapseAll`, `isExpanded`, `expandableIds`, `isDetailOpen`, `isInteractiveTarget` and `INTERACTIVE_SELECTOR`; the `DetailOptions` and `DetailContext` types; `expanded` in `URL_KEYS`.
- **Inline cell editing.** `editable: true` (or a function of the row) on a column, and `onCellEdit` on the table. A cell opens on double-click (`editTrigger: "click"` for a single click), Enter, F2 or typing a character, which seeds the editor; Enter, Tab and leaving the cell commit, Tab moves to the next editable cell, and Escape cancels without reaching anything around the table. Editors by type: text, number with the column's precision (an amount in minor units is edited in major units), a filterable ARIA combobox for any column with `formatOptions.options` and for yes/no, and the browser's date, date-time (in the table's time zone) and time pickers. `renderEditor(context)` supplies your own, with `commit(value)` and `cancel()`. Per column `parse` and `validate`: a refused value is not committed, and the editor is marked invalid with the reason beside it. The table never changes `data` — it reports `{ rowId, row, key, value, previousValue }`, values in the shape they replace — and a returned promise shows the cell as saving, then as failed if it rejects. Popups stay inside the window, flipping above near the bottom. No editor is ever open in a server render. Every adapter; in Vue `onCellEdit` is a prop (`@cell-edit`) so it can return a promise, and `renderEditor` may return a VNode. See [docs/editing.md](docs/editing.md).
- **Keyboard cell navigation.** `cellNavigation` (on automatically when a column is editable) makes the table a `role="grid"` with one tab stop: the arrows, Home, End, Control+Home/End and Page Up/Down move between cells, Enter goes into a cell's link or button and Escape comes back, and Space works the checkbox and the expander from their cells. A visible focus ring, `--tpz-focus-ring`.
- **The active cell is state** — `state.focus: { rowId, key?, align? } | null` — so moving to a row is declarative. Setting it from outside (`focusCell(state, rowId, key, align)`) brings the row onto its page in client mode, scrolls it into view, highlights it (`data-focused`, `--tpz-focused`) and, with cell navigation on, focuses the cell. The server renders the right page with the highlight on. Carried in the URL as `at=rowId:key` when `include` names `"focus"`.
- Core: `focusCell`, `clearFocus`, `nextCell`, `entryCell`, `isNavigationKey`, `isCellEditable`, `hasEditableColumns`, `editorKind`, `editorOptions`, `editorStep`, `toEditorText`, `fromEditorText`, `validateEdit`, `editValuesEqual`, `typedCharacter` and `placePopup`; the `CellFocus`, `CellEdit`, `EditorContext`, `EditorKind`, `NavigationGrid` and `NavigationKey` types; `reveal` in `getRows` and `page` in its result. Rows carry `data-row-id`.
- Class slots `expandCell`, `detailRow` and `detailCell`, and the `--tpz-detail-bg` variable.
- `id` in plain JavaScript, Svelte and Vue, as React already had: the base for the ids the table gives its own elements.

### Changed

- `onRowClick` now ignores a click on any control inside the row — a link, button, input, select, label, `[role="menu…"]`, or anything marked `data-tpz-interactive` — as the documentation already said it did. Before, only the table's own links and checkboxes were excluded, so a button rendered in a cell also fired the row's click. Every adapter.
- `TableState` has optional `expanded` and `focus` keys. They are optional so that a state written before they existed still type-checks; every table fills them in as `[]` and `null`.

## 0.3.0 — 2026-10-14

- A row of one line is exactly `--tpz-row-height` (28, 32 and 40px at compact, normal and relaxed) under `rowHeight: "fixed"` and `"auto"`, whatever the cells hold. Badges, tags and buttons in a cell are one line tall; the selection checkbox lines up with the first line of an auto-height row.
- `--tpz-cell-content-height`: the height available inside a cell, for renderers that fill it.
- A server-paged table no longer guesses `badge` from the rows on one page. `inferType` and `inferColumns` take `{ partial: true }`; `resolveColumns` takes `server`.
- Docs and `llms.txt`: a section on what a custom cell renderer should do to keep a row one line tall.

## 0.2.0 — 2026-10-11

- Multi-column sorting: shift-click a second header, levels numbered in the headers, "Then sort" in the column menu, and a reset control in the toolbar. `sortable={{ multiple, reset }}`.
- `headerSearch`: a magnifier in each header that turns it into a search box for that column, as a `contains` filter.
- The text operators (`contains`, `startsWith`, …) match what a cell shows, for every type.
- Plus fixes to boolean and time filters, header rebuilding in the DOM renderer, column resizing, `box-sizing`, and faster equality filters. New core helpers: `addSort`, `removeSort`, `resetSort`, `setColumnSearch`, `columnSearchText`, `resolveSorting`, `canResetSort`, `sortsEqual`, `sortPriority`, `resolveHeaderSearch`, `isTextOperator`, `createTextTest`.

## 0.1.1 — 2026-09-08

- A header that is a link no longer drags as a URL. "Download CSV" exports the selected rows when there are any.

## 0.1.0 — 2026-09-07

- First public release, with `rowHeight="auto"` and exact row heights, `wrap` as a line count, append pagination that renders only the new rows, and `--tpz-header-height`.
