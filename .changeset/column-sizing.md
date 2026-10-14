---
"@trapezium/core": minor
"@trapezium/react": minor
"@trapezium/vue": minor
"@trapezium/svelte": minor
"@trapezium/vanilla": minor
---

**Column sizing.** A column's `width` is now held exactly and `maxWidth` caps
its cells as well as its header. `grow` gives a column the table's spare width
while the rest keep to their content. `pin: { side, below }` freezes a column
only under (or `above`) a width of the table, by a container query, so a server
render freezes the same columns. Hovered and selected frozen cells keep an
opaque background again.
