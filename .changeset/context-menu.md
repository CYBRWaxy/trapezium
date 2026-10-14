---
"@trapezium/core": minor
"@trapezium/react": minor
"@trapezium/vue": minor
"@trapezium/svelte": minor
"@trapezium/vanilla": minor
---

**A context-menu hook.** `onRowContextMenu(row, event, info)` hands over the row
and the cell under the pointer — its column, the text it shows, and the row as
the table's own copy writes it — so a "Copy cell" or "Copy row" menu matches the
table without searching the DOM. `cellDisplayText` gives the text any cell shows.
