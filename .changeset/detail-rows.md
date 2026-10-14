---
"@trapezium/core": minor
"@trapezium/react": minor
"@trapezium/vue": minor
"@trapezium/svelte": minor
"@trapezium/vanilla": minor
---

**Detail rows.** `detail={{ render }}` opens content below a row, spanning the
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
