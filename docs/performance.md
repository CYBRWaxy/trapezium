# Performance

Measured, not asserted. Everything below comes from `bench/`, which you can run yourself.

```sh
pnpm build
pnpm bench                  # the engine, in Node
node bench/scale.mjs        # a hundred thousand rows, interaction by interaction
pnpm bench:browser          # a real table in a real browser
```

## The engine

Milliseconds, median of seven runs, on an Apple M-series laptop. The dataset is deliberately heavy: **26 columns** covering every built-in type plus two custom ones, with roughly one value in eight missing.

| rows | sort (text) | sort (date) | sort (custom type) | sort (three levels) | filter ×1 | filter ×3 | header search (text) | header search (date) | search | everything at once |
|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 0.13 | 0.10 | 0.09 | 0.16 | 0.06 | 0.12 | 0.04 | 0.03 | 0.04 | 0.15 |
| 1,000 | 0.86 | 0.62 | 0.49 | 2.0 | 0.23 | 0.62 | 0.23 | 0.23 | 0.31 | 0.53 |
| 10,000 | 9.6 | 7.0 | 7.2 | 24 | 2.0 | 4.9 | 2.1 | 2.2 | 3.5 | 6.0 |
| 100,000 | 110 | 100 | 104 | 268 | 22 | 52 | 22 | 49 | 54 | 84 |
| 250,000 | 270 | 345 | 322 | 676 | 55 | 128 | 57 | 118 | 137 | 236 |

"Everything at once" is a filter, a search, a sort and a page, which is what a table actually does between one keystroke and the next. "Header search" is a search typed into one column's header — a `contains` filter answered from the text the cells show — on a text column and on a column of dates, once the dates have been formatted; the first keystroke in a column of dates also pays for the formatting, about 1.7 µs a row. "Search" is a keystroke in the toolbar's search across all twenty-six columns, once each row's search text has been built — see below for the first.

Roughly: **1 µs per row to sort by one column and 2.7 µs by three, 0.2 µs to filter, 0.2–0.5 µs to search one column from its header, 0.35–0.55 µs to search all twenty-six**. A table with the eight or ten columns most applications have is proportionally faster.

## A hundred thousand rows

What the whole pipeline (`getRows`) costs for each thing a person does to a table of 100,000 rows held in the browser — `node bench/scale.mjs`, milliseconds, Apple M-series laptop:

| | 26 columns | 10 columns |
|---|---|---|
| sort by a text column | 97 | 99 |
| set filter (two of four values) | 29 | 30 |
| search, first keystroke, nothing built yet | 1,235 | 703 |
| — building every row's search text, in idle time | 1,259 | 663 |
| search, first keystroke, after that | 33 | 32 |
| search, each later keystroke | 39 | 35 |
| sort + set filter + search, from cold | 692 | 417 |
| then turn the page | 0.01 | 0.01 |
| then tick a box, or move the keyboard to another cell | 0.01 | 0.01 |

And in a real browser (Chromium, the same 26 columns, 50 rows a page), from the interaction to the browser having laid out the result:

| | 10,000 rows | 100,000 rows |
|---|---|---|
| first paint | 19 ms | 17 ms |
| sort a column | 27–30 ms | 109–118 ms |
| sort by three columns | 50 ms | 296 ms |
| apply a set filter (and keep the sort) | 27 ms | 98 ms |
| search every column, first time | 75 ms | 518 ms |
| search every column, the next keystroke | 4 ms | 29 ms |
| search one column from its header | 21 ms | 51 ms |
| turn the page | 17 ms | 17 ms |
| DOM elements | 8,820 | 8,820 |

Three things keep a table this size interactive:

- **The table remembers.** The filtered, searched and sorted rows are kept between runs, each stage until something it reads changes. Turning a page, ticking a box, moving the active cell, opening a detail row or folding child rows used to run the whole pipeline again — a tenth of a second or more at this size — and now costs nothing; a new sort reuses the filtered and searched rows.
- **Each row is searched as one string.** The first time a search reaches a row, its searchable cells — stored values and shown text, folded — are joined into one string and remembered against the row, so a keystroke is one `includes` a row instead of a fold and a comparison for every cell. Seven times faster at twenty-six columns.
- **That string is built before anyone searches.** A table with a search box over two thousand rows or more builds every row's search text in idle time after it first renders, in slices of a few milliseconds, so the first keystroke costs what every later one does. Type before it has finished and the first keystroke pays for the rest — it is the formatting of every date and amount, not the search, that takes the time.

The search text costs memory: about the length of the row's text again, for the rows searched. It is held against the row objects, so dropping the data drops it.

## Appending pages to a long list

"Load more" and infinite scrolling keep every page loaded so far on screen, and render only the new rows when a page is added — the DOM is bounded by what has been loaded, never by the data. But what has been loaded can grow large, and past a few thousand rows the browser's own work grows with it. `bench/browser/append.html`, 100,000 rows, 100 a page, 26 columns:

| rows on screen | elements in the document | adding the next page |
|---|---|---|
| 1,000 | 40,613 | 41 ms |
| 5,000 | 202,085 | 104 ms |
| 10,000 | 404,194 | 140 ms |
| 20,000 | 808,177 | 268 ms |

The table's own work for an appended page is constant; the growth is the browser handling a very large document (a `table-layout: fixed` table measures the same). A sort or filter goes back to the first page, so it rebuilds one page, not twenty thousand rows.

**What we propose if this becomes the bottleneck** — and it would only be for lists people scroll thousands of rows into — is *windowed appending*, consistent with a real table and with nothing measured before it is drawn:

- pages already appended stay rows of the same `<table>`, but once a page is several screens above or below the viewport its rows are taken out and replaced by one spacer row of exactly the height they had — read from the layout they already have, at the moment they leave, not estimated;
- scrolling back puts the page's rows back in place of the spacer, rebuilt from the same row objects, so their content, selection and active cell come from the state as always;
- a row that is the active cell, being edited, or holding an open detail is never taken out;
- browser find-in-page and "select all" only reach the pages in the document, which is the one honest cost and would be documented.

It keeps the document to a few pages whatever has been loaded, needs no row heights in advance (so `rowHeight="auto"` keeps working), and renders identically on a server, which only ever renders the first page. Until it is asked for, `pagination: { mode: "pages" }` is the right answer for a list this long: it holds the document at one page and turns pages in 17 ms whatever is behind them.

## In a browser

Time from the interaction to the browser having laid out the result, with 26 columns and 50 rows on a page:

| | 1,000 rows | 10,000 rows | 50,000 rows |
|---|---|---|---|
| first render | 15 ms | 17 ms | 17 ms |
| sort a column | 16 ms | 25–28 ms | 63–70 ms |
| sort by three columns | 20 ms | 45 ms | 148 ms |
| apply a filter | 18 ms | 26 ms | 55 ms |
| search one column from its header, a keystroke | 19 ms | 22 ms | 33 ms |
| …in a column of dates, the first keystroke | 20 ms | 27 ms | 65–98 ms |
| …and the next | 20 ms | 25 ms | 44 ms |
| search every column, first time | 27 ms | 79 ms | 310 ms |
| search every column, again | 6 ms | 27 ms | 125 ms |
| turn the page | 18 ms | 18 ms | 16 ms |
| DOM nodes | 8,821 | 8,820 | 8,820 |

Three things to notice. **The DOM does not grow with the data** — only the page is rendered, so the browser's own costs are flat no matter how many rows are behind it. **Searching twice is much cheaper than searching once**, because the text each cell displays is remembered against the row the first time it is needed. And **searching one column costs a fraction of searching all of them** — a keystroke in a column header stays inside a frame or two at fifty thousand rows, where the toolbar's search across twenty-six columns does not.

## What this means for your table

- **Up to about 10,000 rows, keep the data in the browser** without a second thought: every interaction lands well inside the 100 ms that feels instant.
- **Up to about 100,000 rows the browser still works**, with numbered pages: a sort or a filter takes about a tenth of a second, a search keystroke a few hundredths once the search text is built, and everything else nothing. Give it a search box early, so the search text is built in idle time before anyone types, and debounce the search (`search={{ debounce: 200 }}`).
- **Beyond that, use [server mode](server-data.md).** Not because the engine falls over, but because sending that many rows to a browser is rarely the right thing to do regardless of what happens next.
- **Columns cost as much as rows.** Search and filtering are linear in both. Twenty-six columns is an unusual table; if yours has that many, consider whether every one of them needs to be searchable — `{ key: "internal_ref", searchable: false }` takes it out of the loop entirely.
- **Debounce the search box** if your data is large. It defaults to 150 ms; `search={{ debounce: 300 }}` is sensible past ten thousand rows.

## What makes it fast

Nothing exotic — mostly not doing avoidable work:

- **Each stage of the pipeline is remembered** until something it reads changes — the rows (by identity: replace the array to change the data), the columns, the types, the formatting, or its own part of the state. Pass one `createPipelineCache()` per table to `getRows` to get the same in your own renderer.
- **Each row is searched as one string**, built once and remembered against the row, and built in idle time when the table has a search box (`warmSearch`, `warmSearchWhenIdle`).
- **A currency's minor unit is looked up once**, not for every amount formatted — it was a third of the cost of formatting a column of cents.
- **Sort keys are worked out once per row**, not inside the comparator. A comparison sort asks about pairs `n log n` times; the naive version normalised 151,234 values to order 10,000 rows. Ordering by date got 4.5× faster, and by a custom type 8×.
- **The text a cell displays is remembered against the row object.** `Intl` formatting is about a microsecond a cell, and search has to compare against what is on the screen. Cached, the second search costs a third of the first. Keyed by the row, so replacing your data invalidates it and dropping your data collects it.
- **Nothing that does not depend on the row is computed per row.** Filter contexts, type lookups and the folded search query are all prepared once — for a search in a column header as much as for the toolbar's, which is why typing into one costs a comparison a row and nothing else.
- **A column header and the toolbar share what they remember.** Both search the text a cell shows, so both read the same cache: a table searched from its toolbar has already formatted every date a header search will look at, and the other way round.
- **Accent folding takes a fast path for text that has no accents**, which is nearly all of it — and for ASCII, folding *is* lower-casing, so the cheap answer is the same answer. An equality filter folds four strings a row, so this alone halved it.
- **The header is not rebuilt when the rows are.** In the DOM renderer — which is Vue's and Svelte's too — a sort, a filter or a search replaces the body and patches the header: an arrow, a number, a tint, a link's address. The cells themselves stay, which costs less and, more to the point, leaves the keyboard's focus on the header just pressed and the search box under the person typing into it.
- **Filters short-circuit.** "Match all" stops at the first refusal, "match any" at the first acceptance.
- **An appended page costs the size of the page, not the size of the list.** `loadMore` and `infinite` keep every page loaded so far on screen, so by the tenth page the table holds ten pages of rows. Reaching the sentinel renders the new rows and leaves every row already on screen alone — the DOM elements are not rebuilt, the cell renderers are not re-run, the header is not replaced, and the scroll position is not disturbed. Rows are recognised by identity, so this holds as long as the rows already shown are the same objects. This is what makes [`rowHeight="auto"`](styling.md#row-height) usable with an infinite list: rows of differing heights are the case a virtualised grid has to render, measure and place one at a time.
- **Selecting a row changes that row.** Not the table around it: the attribute and the checkbox are updated in place, so a click in a list of five thousand rows costs one row's work.

## Bundle size

| | minified | gzipped |
|---|---|---|
| `@trapezium/core` | 41 kB | 14 kB |
| `@trapezium/react` (excluding the core) | 41 kB | 14 kB |
| `@trapezium/vanilla` (core included) | 81 kB | 28 kB |
| the stylesheet | 24 kB | 5 kB |

Each entry point bundled into one file and minified with esbuild, then gzipped. No runtime dependencies, so that is the whole of it.
