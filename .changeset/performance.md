---
"@trapezium/core": minor
"@trapezium/react": minor
"@trapezium/vue": minor
"@trapezium/svelte": minor
"@trapezium/vanilla": minor
---

**Faster at 100,000 rows.** The pipeline remembers each stage until something it
reads changes, so a page turn, a selection or a moved cursor no longer filters,
searches and sorts everything again. Search matches each row as one remembered
string — about seven times faster per keystroke — built in idle time when the
table has a search box. `createPipelineCache`, `warmSearch` and
`warmSearchWhenIdle` are exported for headless use.
