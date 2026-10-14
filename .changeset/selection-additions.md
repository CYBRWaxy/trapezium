---
"@trapezium/core": minor
"@trapezium/react": minor
"@trapezium/vue": minor
"@trapezium/svelte": minor
"@trapezium/vanilla": minor
---

**More ways to select.** `selection={{ selectAll: "matching" }}` makes the
header checkbox select every matching row on every page, asking `server.all`
in server mode. `selection={{ dragSelect: true }}` selects the rows a press
sweeps across. Shift with an arrow key extends a selection from the keyboard,
and Escape clears it.
