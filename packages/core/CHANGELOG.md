# @trapezium/core

## 0.4.0

### Minor Changes

- bf3711b: **Child rows, one level.** `getParentId(row)` draws each row under the row it
  belongs to, with a toggle on the parent that folds its children away
  (`state.collapsed`). Children stay with their parent through sorting, filtering
  and paging — a parent is shown for the sake of a matching child, and pages and
  totals count parents, so a family is never split across two pages. Children are
  selected, edited and exported like any other row, under their parent.
- 3174bd4: **Column sizing.** A column's `width` is now held exactly and `maxWidth` caps
  its cells as well as its header. `grow` gives a column the table's spare width
  while the rest keep to their content. `pin: { side, below }` freezes a column
  only under (or `above`) a width of the table, by a container query, so a server
  render freezes the same columns. Hovered and selected frozen cells keep an
  opaque background again.
- 1672fc6: **A context-menu hook.** `onRowContextMenu(row, event, info)` hands over the row
  and the cell under the pointer — its column, the text it shows, and the row as
  the table's own copy writes it — so a "Copy cell" or "Copy row" menu matches the
  table without searching the DOM. `cellDisplayText` gives the text any cell shows.
- 43ea506: **Detail rows.** `detail={{ render }}` opens content below a row, spanning the
  table, from an expander column that leads it. Any number of rows can be open at
  once, and which are open is `state.expanded` — controllable, saved with a view,
  and carried in the URL with `include: ["expanded"]`. The server renders open
  rows open. `canExpand` leaves rows without a detail, `keepMounted` keeps a closed
  one alive so it does not fetch again, and `toggleOnRowClick` opens it from
  anywhere on the row. A detail row is never counted, paged, sorted, selected or
  exported, and is as tall as its content with nothing measured.
  
  `onRowClick` now ignores clicks on any control inside the row — a link, button,
  input, label or menu — as the documentation said it did.
  
  New in the core: `toggleExpanded`, `setExpanded`, `collapseAll`, `isExpanded`,
  `expandableIds`, `isDetailOpen`, `isInteractiveTarget`, `INTERACTIVE_SELECTOR`.
  New class slots `expandCell`, `detailRow` and `detailCell`, and `id` in every
  adapter.
- d909e5e: **Inline cell editing.** `editable` on a column and `onCellEdit` on the table.
  A cell opens on double-click, Enter, F2 or typing, into an editor that suits its
  type — a text box, a number box, a filterable list of its options, or the
  browser's date and time pickers — or your own `renderEditor`. Enter, Tab and
  leaving the cell commit; Escape cancels. `parse` and `validate` per column. The
  table never changes the data: it reports each edit, and a returned promise shows
  the cell as saving and then as failed if it rejects.
  
  **Keyboard cell navigation.** `cellNavigation` — on by itself when a column is
  editable — makes the table a grid the arrow keys, Home, End and the Page keys
  move through, with one stop in the tab order. The active cell is `state.focus`,
  so setting it from outside (`focusCell`) brings that row onto its page, scrolls
  to it, highlights it and puts the keyboard there.
- 449efc6: **Headers.** `renderHeader`, typed since 0.1.1 but never drawn, now replaces a
  header's text with the sort, menu, search and resize controls still around it.
  A column's `description` shows as an accessible tooltip on the header, with no
  renderer needed.
- b050fd1: **Faster at 100,000 rows.** The pipeline remembers each stage until something it
  reads changes, so a page turn, a selection or a moved cursor no longer filters,
  searches and sorts everything again. Search matches each row as one remembered
  string — about seven times faster per keystroke — built in idle time when the
  table has a search box. `createPipelineCache`, `warmSearch` and
  `warmSearchWhenIdle` are exported for headless use.
- e9e3ad6: **Pinned rows.** `pinnedRows={{ top, bottom }}` holds rows outside the data at
  the top and bottom of the table — an editable "new entry" row, a totals row.
  They are drawn through the same columns, renderers and editors, stay in view
  while the body scrolls, and are never filtered, sorted, paged, counted, selected
  or exported. An edit of one says so, and the keyboard reaches them.
- 174f228: **Row reorder by drag.** `rowReorder={{ onReorder }}` leads each row with a drag
  handle; a drag shows where the row will land and scrolls near the edges, and Alt
  with an arrow key moves a row from the keyboard. `onReorder` gets the row and its
  new neighbours, and a returned promise shows the new order until it settles.
  Offered only while the table is unsorted; child rows stay with their parent; a
  long press starts a drag on a touch screen without ever blocking a scroll.
- 590c646: **More ways to select.** `selection={{ selectAll: "matching" }}` makes the
  header checkbox select every matching row on every page, asking `server.all`
  in server mode. `selection={{ dragSelect: true }}` selects the rows a press
  sweeps across. Shift with an arrow key extends a selection from the keyboard,
  and Escape clears it.

## 0.3.0

### Minor Changes

- 264efd5: A row of one line is now exactly `--tpz-row-height` — 28, 32 and 40px at
  compact, normal and relaxed — under `rowHeight: "fixed"` and `"auto"`, whatever
  the cells hold.
  
  **Badges, tags and buttons in a cell are one line tall.** Inside a cell
  `.tpz-badge` is 16px high with no vertical padding, at the cell's text size less
  a pixel (10, 10 and 11px), and `.tpz-btn` is 16px high at the cell's text size.
  Outside a cell both keep their interface sizes. The avatar of an `image` column
  keeps its size and no longer makes its line taller, and neither does a
  `boolean` column's icon.
  
  **The selection checkbox lines up with the first line of text** in an auto
  height row, instead of sitting at the very top of it.
  
  **Compact auto rows add up.** `--tpz-cell-padding-y` is 5px at compact (it was
  6px, which made a one-line auto row 29px). Normal and relaxed are unchanged.
  
  **`--tpz-cell-content-height`** is the height available inside a cell — the row
  height less the cell's 1px bottom border, and less its padding where it is
  padded. Use it to fill a cell; `height: var(--tpz-row-height)` is a pixel taller
  than the cell and grows the row. An exact `rowHeight` now uses it too, so
  content can no longer push a numbered row a pixel past its height.
  
  **A server-paged table no longer guesses `badge` from the rows on the page.**
  Six or fewer distinct values on one page says nothing about the next, so the
  same column switched between text and badges as the user paged or filtered. In
  server mode such a column is now `text`; a key that names a category
  (`status`) is still a badge, and `type: "badge"` still works. `inferType` and
  `inferColumns` take `{ partial: true }` for the same behaviour, and
  `resolveColumns` takes `server`.
  
  The docs and `llms.txt` have a new section, **Cell renderers**, on what a
  custom `render` should do to keep a row one line tall: inherit the font size,
  never scroll, nothing above the first line, one line unless the row is meant to
  grow — with the variables a renderer can use and their values at each density.

## 0.2.0

### Minor Changes

- d475acf: Sorting by several columns, and searching a column from its header.
  
  **Shift-click a second header and the table sorts by both.** Each sorted header
  shows its place in the order once there is more than one, a shift-click on a
  sorted header turns that level over where it is, and "Then sort ascending" and
  "Then sort descending" in every column's menu do the same without a shift key.
  While a sort is applied, a reset leads the toolbar's controls and puts the rows
  back; it is a link when the table's controls are links, so a server-rendered
  table can be reset before its script has loaded. `sortable` now takes options as
  well as a switch: `{ multiple: false }` for a backend that orders by one column,
  `{ reset: false }` to leave the control out, and `{ reset: [{ key, direction }] }`
  to name the order the table rests in.
  
  **`headerSearch` puts a search box in a column's header**, on request. A
  magnifier takes the place of the column's type icon while the header is hovered
  or focused, and turns the header itself into a text box — laid over the header,
  so no column changes width. What is typed is the column's `contains` filter, the
  same one its menu edits, so it shows as a chip, travels in the URL, reaches
  `onStateChange` and narrows an export. Switch it on for the table with
  `headerSearch`, or for one column with `{ key, headerSearch: true }`. It is off
  by default.
  
  **The text operators now match what a cell shows, for every type.** `contains`,
  `notContains`, `startsWith` and `endsWith` are answered from the stored value
  written out and from the text the column displays — the rule global search
  already followed. `contains "Aug"` finds a date, `contains "1,2"` finds
  $1,240.00, and a tag is found by its label as well as its key. On types that
  never offered these operators — numbers, dates, checkboxes — this changes what a
  hand-written `contains` filter matches, from the value's internal form to what
  is on the screen. Text comparison also ignores the kind of space, so "1 240,50 €"
  is found by typing ordinary spaces.
  
  Also:
  
  - In Vue, Svelte and plain JavaScript the header is no longer rebuilt on every
    change of state: its cells are kept and patched. Focus stays on a header that
    was just sorted, so Enter reverses the order.
  - The column menu's value filter in Vue, Svelte and plain JavaScript now asks
    for two values for "is between", takes a comma-separated list for "is any
    of", asks for nothing for "is empty", and offers "Clear" — as React's always
    did.
  - A toolbar with no controls of its own now appears for filter chips in Vue,
    Svelte and plain JavaScript, as it does in React.
  - Choosing "No" in a checkbox column's filter now shows the rows that say No.
    The filter's value is the word "false", and `Boolean("false")` is true; the
    boolean type now reads the word, in filters and in cells alike.
  - A `time` column's filter gets a time box rather than a number box, which could
    not hold a time of day. The rule is `filterInputType` in the core.
  - "Is between" with one end filled in is "at least" or "at most" rather than a
    range that matches nothing (`rangeFilter` in the core).
  - A shift-click on a header link goes to `onNavigate` with the address of the
    added level when there is one, and to the address itself when nothing at all
    is listening for state.
  - Dragging a column's edge to resize it applies the whole drag in Vue, Svelte
    and plain JavaScript; it used to stop at the first movement.
  - Cells are `box-sizing: border-box` in the stylesheet itself. On a page with
    no global reset, a column's width — a token, a `width` on the column, or the
    one a drag set — came out 17px wider than asked and rows a pixel taller than
    everywhere else; now the table measures the same on every page.
  - Equality filters are about twice as fast.
  - New in the core: `addSort`, `removeSort`, `resetSort`, `setColumnSearch`,
    `columnSearchText`, `resolveSorting`, `canResetSort`, `sortsEqual`,
    `sortPriority`, `resolveHeaderSearch`, `isTextOperator`, `createTextTest`, and
    `exportScenarios` in `@trapezium/core/testing` — every combination of sort,
    filter, arrangement, selection and scope an export can be asked for, with what
    each should contain.

## 0.1.1

### Patch Changes

- bf50f78: - A header that is a link (`buildHref`) no longer drags as a URL: dragging it moves the column, as it does for a header that is a button.
  - "Download CSV" exports the selected rows when there are any, as "Copy to clipboard" already did. `rowsToExport` in the core is the rule, for anyone building their own control.
  - Tests pin down that global search matches part of any element of an array (a `tags` column), by raw value and by label.

## 0.1.0

### Minor Changes

- 6fc1b51: Dynamic row height.
  
  `rowHeight="auto"` sizes every row to its tallest cell — wrapped prose, a stack
  of tags, or whatever a cell renderer returned. It needs no measuring pass: the
  table is a real `<table>` in normal flow, so the browser has already done it,
  and the server and the first client paint agree. `rowHeight={64}` sets an exact
  height, wrapping into it and ending what will not fit in an ellipsis. Only
  `"fixed"`, the default, truncates to a single line. Under `"auto"` the `--tpz-row-height` token
  becomes the minimum rather than the height, so density goes on meaning what it
  meant.
  
  Per column, `wrap` now takes a number as well as a boolean: `wrap: 3` wraps and
  stops after three lines, and `wrap: false` keeps a column on one line while the
  rest of the table wraps.
  
  Append pagination got the change that makes this affordable. `loadMore` and
  `infinite` keep every page loaded so far on screen, and reaching the end used to
  rebuild all of them to add one page. Now only the new rows are rendered: the
  rows already there keep their elements, their cell renderers are not re-run,
  the header is not replaced and the scroll position is not disturbed. Selecting a
  row updates that row rather than the table around it.
  
  The header now has a height of its own, `--tpz-header-height`, rather than
  reading the row's — a table of 64px rows was getting a 64px header, and a short
  one a header too small for its own controls. Density still moves both.
- b3a91f3: first public release
