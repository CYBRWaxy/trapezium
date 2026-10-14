---
"@trapezium/core": minor
"@trapezium/react": minor
"@trapezium/vue": minor
"@trapezium/svelte": minor
"@trapezium/vanilla": minor
---

**Child rows, one level.** `getParentId(row)` draws each row under the row it
belongs to, with a toggle on the parent that folds its children away
(`state.collapsed`). Children stay with their parent through sorting, filtering
and paging — a parent is shown for the sake of a matching child, and pages and
totals count parents, so a family is never split across two pages. Children are
selected, edited and exported like any other row, under their parent.
