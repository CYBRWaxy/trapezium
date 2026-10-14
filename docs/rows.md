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

## Row clicks

`onRowClick(row, event)` fires on a click anywhere in a row that was not on a control inside it. A link, a button, an input, a select, a label, a `[role="menu…"]` element or anything marked `data-tpz-interactive` is left to itself, so a button rendered in a cell never also opens the row. `isInteractiveTarget(event.target, row)` and `INTERACTIVE_SELECTOR` are exported for anyone building the same rule into their own gestures.
