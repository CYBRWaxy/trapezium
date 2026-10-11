# @trapezium/react

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

### Patch Changes

- Updated dependencies [d475acf]
  - @trapezium/core@0.2.0

## 0.1.1

### Patch Changes

- bf50f78: - A header that is a link (`buildHref`) no longer drags as a URL: dragging it moves the column, as it does for a header that is a button.
  - "Download CSV" exports the selected rows when there are any, as "Copy to clipboard" already did. `rowsToExport` in the core is the rule, for anyone building their own control.
  - Tests pin down that global search matches part of any element of an array (a `tags` column), by raw value and by label.
- Updated dependencies [bf50f78]
  - @trapezium/core@0.1.1

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

### Patch Changes

- Updated dependencies [6fc1b51]
- Updated dependencies [b3a91f3]
  - @trapezium/core@0.1.0
