---
"@trapezium/core": minor
"@trapezium/react": minor
"@trapezium/vue": minor
"@trapezium/svelte": minor
"@trapezium/vanilla": minor
---

A row of one line is now exactly `--tpz-row-height` — 28, 32 and 40px at
compact, normal and relaxed — under `rowHeight: "fixed"` and `"auto"`, whatever
the cells hold.

**Badges, tags and buttons in a cell are one line tall.** Inside a cell
`.tpz-badge` is 16px high with no vertical padding, at the cell's text size less
a pixel (10, 10 and 11px), and `.tpz-btn` is 16px high at the cell's text size.
Outside a cell both keep their interface sizes. The avatar of an `image` column
keeps its size and no longer makes its line taller, and neither does a
`boolean` column's icon.

**The selection checkbox lines up with the first line of text** in an auto
height row, instead of sitting at the very top of it.

**Compact auto rows add up.** `--tpz-cell-padding-y` is 5px at compact (it was
6px, which made a one-line auto row 29px). Normal and relaxed are unchanged.

**`--tpz-cell-content-height`** is the height available inside a cell — the row
height less the cell's 1px bottom border, and less its padding where it is
padded. Use it to fill a cell; `height: var(--tpz-row-height)` is a pixel taller
than the cell and grows the row. An exact `rowHeight` now uses it too, so
content can no longer push a numbered row a pixel past its height.

**A server-paged table no longer guesses `badge` from the rows on the page.**
Six or fewer distinct values on one page says nothing about the next, so the
same column switched between text and badges as the user paged or filtered. In
server mode such a column is now `text`; a key that names a category
(`status`) is still a badge, and `type: "badge"` still works. `inferType` and
`inferColumns` take `{ partial: true }` for the same behaviour, and
`resolveColumns` takes `server`.

The docs and `llms.txt` have a new section, **Cell renderers**, on what a
custom `render` should do to keep a row one line tall: inherit the font size,
never scroll, nothing above the first line, one line unless the row is meant to
grow — with the variables a renderer can use and their values at each density.
