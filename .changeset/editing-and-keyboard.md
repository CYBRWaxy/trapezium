---
"@trapezium/core": minor
"@trapezium/react": minor
"@trapezium/vue": minor
"@trapezium/svelte": minor
"@trapezium/vanilla": minor
---

**Inline cell editing.** `editable` on a column and `onCellEdit` on the table.
A cell opens on double-click, Enter, F2 or typing, into an editor that suits its
type — a text box, a number box, a filterable list of its options, or the
browser's date and time pickers — or your own `renderEditor`. Enter, Tab and
leaving the cell commit; Escape cancels. `parse` and `validate` per column. The
table never changes the data: it reports each edit, and a returned promise shows
the cell as saving and then as failed if it rejects.

**Keyboard cell navigation.** `cellNavigation` — on by itself when a column is
editable — makes the table a grid the arrow keys, Home, End and the Page keys
move through, with one stop in the tab order. The active cell is `state.focus`,
so setting it from outside (`focusCell`) brings that row onto its page, scrolls
to it, highlights it and puts the keyboard there.
