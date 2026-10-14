# Rows

Everything a table does to a row as a whole, rather than to a column: opening it to show more, clicking it, and what happens around it.

## Detail rows

A row can open to show anything below it — the lines of an order, a record's history, a form — in a row that spans the whole table.

```tsx
<Table
  data={orders}
  detail={{ render: ({ row }) => <OrderLines orderId={row.id} /> }}
/>
```

An expander column leads the table: a chevron in each row, and one in the header that opens or closes every row on the page. Any number of rows can be open at once.

```js
// Plain JavaScript, Svelte: a node or a string
createTable(host, { data: orders, detail: { render: ({ row }) => el("p", { text: row.notes }) } })
```

```vue
<!-- Vue: a VNode, so a detail is a real component -->
<script setup>
import { h } from "vue"
import { TrapeziumTable } from "@trapezium/vue"
import OrderLines from "./OrderLines.vue"

defineProps({ orders: Array })
const detail = { render: ({ row }) => h(OrderLines, { orderId: row.id }) }
</script>

<template>
  <TrapeziumTable :data="orders" :detail="detail" />
</template>
```

### Which rows are open is state

Open rows are `state.expanded`, an array of row ids, so a detail row is controlled, saved and restored like everything else:

```tsx
<Table data={orders} detail={detail} defaultState={{ expanded: ["ord_1042"] }} />

<Table data={orders} detail={detail} state={{ expanded }} onStateChange={(next) => setExpanded(next.expanded ?? [])} />
```

It is left out of the URL unless asked for, because a link that reopens somebody's rows is a choice the page should make:

```ts
const include = [...DEFAULT_URL_KEYS, "expanded"]
stateToQueryString(state, { include })     // …&open=ord_1042,ord_1077
stateFromUrl(query, { include })
```

A server render shows open rows already open, in every adapter — nothing flashes closed and then opens.

In code: `toggleExpanded(state, id)` · `setExpanded(state, ids, open)` · `collapseAll(state)` · `isExpanded(state, id)`.

### Options

```ts
detail={{
  render: (context) => node,       // required
  canExpand: (row) => boolean,     // rows with no detail: no expander, and never opened from the state
  keepMounted: false,              // keep a closed detail in the document, hidden
  toggleOnRowClick: false,         // a click anywhere on the row opens it too
}}
```

`render` is given `{ row, rowId, rowIndex, collapse }`. `collapse()` closes this row's detail — for a "Done" button inside it.

**`keepMounted`** is for a detail that loads its own data. Closed, it stays in the document, hidden, so opening it again shows what it already has instead of fetching again. It is mounted the first time the row is opened, not before, so a long table does not build a detail for every row up front. Off by default, which unmounts a closed detail.

**`toggleOnRowClick`** makes the whole row the expander. A click on a link, a button, an input, a label or a menu inside the row is left to that control — the same rule `onRowClick` follows.

### What a detail row is not

It is not a row of the data. It is never counted in the total, never takes a place on a page, is never sorted, selected or exported, and follows its row wherever the row goes — through a sort, onto another page, into a filtered view. A page of 25 rows is 25 rows however many of them are open.

### Height and width

A detail is as tall as what is in it. The table is a real `<table>` in normal flow, so the browser lays it out — there is no measuring pass and nothing to correct after the first paint.

Its content is held to the width of the table's frame, frozen to the left edge, rather than stretched across every column. On a table that scrolls sideways that keeps the detail in view. The width comes from the container the table already is (`100cqi`), so it needs no measuring either.

### With the rest of the table

- **Pagination.** Works with every mode. In the append modes the rows already on screen, and their open details, are left alone when a page is added.
- **Density** pads the detail like a cell.
- **`responsive="cards"`.** The detail opens under its card, as part of it, at the card's width.
- **Server mode.** Identical. The rows are a page; the detail is whatever you render for one of them.
- **Selection.** The header checkbox selects the rows on the page, never the details. The expander column sits after the selection column, and both are frozen.

### Styling

Class slots `expandCell`, `detailRow` and `detailCell` take extra classes like every other slot. `--tpz-detail-bg` is the detail's background. The open row carries `data-expanded="true"`; the detail row carries `data-detail-for` with its row's id.

### Accessibility

Each expander is a button named "Show details for row 3" / "Hide details for row 3", with `aria-expanded`, and `aria-controls` pointing at the detail row while it is open. Give the table an `id` when a page has more than one table with detail rows, so those ids stay unique; React falls back to `useId`, the other adapters to `"tpz"`.

## Child rows

One level of rows that belong under another — the lines of an order, the sessions of a booking, the subtasks of a task. A row names its parent:

```tsx
<Table data={lines} getParentId={(row) => row.order_id} />
```

Every row whose parent is in `data` is drawn directly under it, indented, and the parent's leading cell gets a toggle that folds its children away. Rows are given flat, as a query returns them; the table does the grouping.

### What goes where

- **Sorting** orders the parents, and each parent's children among themselves, by the same columns. A child never leaves its parent.
- **Filtering and search** look at every row on its own. A parent is shown when it matches, or when any of its children does — then as *context*, quieter (`data-context="true"`), so a matching child is never left floating without the row it belongs to. A parent that matches with no child that does is shown alone. A child is shown when it matches.
- **Paging** counts parents. A page of 25 is 25 families, each with all of its matching children, so a parent and its children are never split across two pages. The total — "40 rows", and the pagination's "1–25 of 40" — counts families too.
- **Folding** a parent is `state.collapsed`, an array of parent ids, so it is controlled, saved and — with `include: [...DEFAULT_URL_KEYS, "collapsed"]` — carried in the URL as `fold=`. Children are shown until their parent is folded. Folding is presentation: folded children still match and are still exported.

### Children are rows

They are selected (the header checkbox selects the children on screen as well as the parents), edited, detailed and exported like any other row. An export keeps each child under its parent. Selecting a parent does not select its children.

### The edges

- A row whose parent is not in `data` is shown as a row of its own. In server mode that is a child whose parent is on another page — send each page as whole families.
- One level only. A row whose parent is itself a child goes under the top of that chain, at the same depth as its parent; a chain that loops back on itself is shown as rows of their own.
- Rows need ids of their own (`getRowId`, or an `id` field): a parent is found by its id.

### Server mode

The table groups the page it is given — children under their parents, in the order given — and folds what the state says. It filters, sorts and pages nothing; `total` is yours, and counts whatever your pages count.

### Styling and the renderer hook

A child row has `data-depth="1"`, a parent with children `data-parent="true"`, a context parent `data-context="true"`. The leading cell starts with `.tpz-tree` — the toggle, `.tpz-tree-toggle`, on a parent; an indent with a connector on a child. `rowClassName(row, index, info)` gets the row's place as its third argument, `{ depth, parentId, childCount, context }`, for anything the attributes do not cover.

### Accessibility

The toggle is a button named "Hide 2 child rows of row 3" / "Show …", with `aria-expanded`. With `cellNavigation` the table is a `role="treegrid"`, each row carries `aria-level`, and a parent `aria-expanded`.

In code: `toggleCollapsed(state, parentId)` · `setCollapsed(state, parentIds, collapsed)` · `isCollapsed(state, parentId)` · `parentIdsWithChildren(rows, getParentId, getRowId?)` — "collapse all" is `setCollapsed(state, parentIdsWithChildren(rows, getParentId), true)`.

### Not grouping

Child rows are rows the data already relates — not rows the table invents by grouping on a column, with no totals and no levels below the first. Grouping and aggregation are a different feature, and multi-level trees are out of scope.

## Pinned rows

Rows held at the top or bottom of the table, outside the data: an editable "new entry" row above everything, a totals row below it.

```tsx
const totals = { id: "totals", reference: "Total", amount: rows.reduce((sum, row) => sum + row.amount, 0) }

<Table
  data={rows}
  maxHeight={480}
  pinnedRows={{ top: [{ id: "new", reference: "", amount: null }], bottom: [totals] }}
  columns={[{ key: "reference", editable: true }, { key: "amount", type: "currency", editable: true }]}
  onCellEdit={(edit) => (edit.pinned === "top" ? addRow({ [edit.key]: edit.value }) : updateRow(edit))}
/>
```

They are drawn through the same columns, renderers, formatting and editors as the data, in bodies of their own (`<tbody data-pinned="top">` and `"bottom"`), and stay in view while the body scrolls — under the sticky header at the top, at the bottom of the scroll area at the bottom. They are never filtered, searched, sorted, paged, counted, selected or exported: they are not data.

- **Editing.** A pinned row's cells edit like any other, and the edit says `pinned: "top"` or `"bottom"`. A "new entry" row is a pinned row whose edits your handler turns into a new row of data.
- **The keyboard.** With cell navigation the pinned rows are rows of the grid: the up arrow from the first row of the body lands on the last pinned row above it, and Control+End reaches the totals.
- **Ids.** Give pinned rows ids of their own (`id`, or what `getRowId` returns) when they are edited. A pinned row with none is `"top-0"`, `"bottom-0"` and so on, so it never collides with the data.
- **Empty cells** in a pinned row are blank rather than showing the empty dash.
- **Height.** Each row stacks at its distance from the edge: a row height apiece in the server's markup, and the measured height once the table is in a browser, so a pinned row that wraps does not overlap the next.

Styling: `--tpz-pinned-bg` is their background; `tbody[data-pinned] .tpz-tr` selects them.

## Moving rows

```tsx
import { Table, applyRowMove } from "@trapezium/react"

<Table
  data={tasks}
  rowReorder={{
    onReorder: (move) => setTasks((current) => applyRowMove(current, current.map((task) => task.id), move)),
  }}
/>
```

A drag handle leads each row. Drag a row by it, and a line shows where it will land; near the top or bottom of the scroll area — or of the window, when the table grows with the page — the table scrolls to take it further. From the keyboard, Alt with the up or down arrow moves the focused row one place, and the keyboard stays on it; with cell navigation that works from any of the row's cells. Escape abandons a drag.

`onReorder` receives `{ rowId, row, afterId, beforeId, parentId? }`: the row, the row it now comes straight after (`null` when it is first) and the row it now comes straight before (`null` when it is last). That is what an ordered list in a database needs to place a row between two others, and `applyRowMove(rows, ids, move)` does the same to an array. The neighbours are counted among every row the filters leave, not only the page on screen, so a row dropped at the top of page two comes after the last row of page one; in server mode the page is all the table has.

The table never reorders `data`. It shows the order the data then has — or, when `onReorder` returns a promise, the new order until it settles, going back if it rejects. Every move is announced to a screen reader: "Moved to position 3 of 12".

- **Only while unsorted.** Under a sort the rows are in the sort's order: a row put anywhere else would not stay there, and its neighbours would describe a place in the sort, not in the data. The handles are there but disabled, and say why.
- **`canDrag(row)`** keeps some rows where they are: they have no handle.
- **Child rows** move among the children of their parent only, and the move carries `parentId`. A parent takes its children with it; dragged over a child, it lands beside that child's parent.
- **Pinned rows** do not move.
- **Touch.** A long press on the handle picks the row up. Until then a finger scrolls the page as it always does — nothing stops a swipe that starts on a handle.

Styling: the class slot `dragCell`, the handle `.tpz-drag-handle`, the row being dragged `data-dragging="true"`, the row it would land beside `data-drop="before"` or `"after"`.

In code: `moveRowTo(ids, rowId, targetId, position)` · `stepRow(ids, rowId, delta)` · `applyRowMove(rows, ids, move)` · `canReorderRows(sort)` · `startRowDrag(options)` — the drag itself, for your own renderer.

## Row clicks

`onRowClick(row, event)` fires on a click anywhere in a row that was not on a control inside it. A link, a button, an input, a select, a label, a `[role="menu…"]` element or anything marked `data-tpz-interactive` is left to itself, so a button rendered in a cell never also opens the row. `isInteractiveTarget(event.target, row)` and `INTERACTIVE_SELECTOR` are exported for anyone building the same rule into their own gestures.
