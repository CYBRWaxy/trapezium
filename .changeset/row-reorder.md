---
"@trapezium/core": minor
"@trapezium/react": minor
"@trapezium/vue": minor
"@trapezium/svelte": minor
"@trapezium/vanilla": minor
---

**Row reorder by drag.** `rowReorder={{ onReorder }}` leads each row with a drag
handle; a drag shows where the row will land and scrolls near the edges, and Alt
with an arrow key moves a row from the keyboard. `onReorder` gets the row and its
new neighbours, and a returned promise shows the new order until it settles.
Offered only while the table is unsorted; child rows stay with their parent; a
long press starts a drag on a touch screen without ever blocking a scroll.
