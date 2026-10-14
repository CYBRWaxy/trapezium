---
"@trapezium/core": minor
"@trapezium/react": minor
"@trapezium/vue": minor
"@trapezium/svelte": minor
"@trapezium/vanilla": minor
---

**Pinned rows.** `pinnedRows={{ top, bottom }}` holds rows outside the data at
the top and bottom of the table — an editable "new entry" row, a totals row.
They are drawn through the same columns, renderers and editors, stay in view
while the body scrolls, and are never filtered, sorted, paged, counted, selected
or exported. An edit of one says so, and the keyboard reaches them.
