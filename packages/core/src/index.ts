/**
 * @trapezium/core
 *
 * The engine behind every Trapezium table: the column model, the type registry,
 * and pure functions for filtering, searching, sorting, paginating, selecting
 * and serialising state.
 *
 * Nothing here touches a framework or a DOM, so it runs identically on a
 * server, in a browser, in a test, and inside whichever adapter is rendering.
 * Use it directly to bind your own renderer; use `@trapezium/react`,
 * `@trapezium/vue`, `@trapezium/svelte` or `@trapezium/vanilla` to get one.
 */

export type {
  Align,
  AnyRow,
  CellContext,
  CellEdit,
  CellFocus,
  ColumnDef,
  ColumnFilter,
  ColumnKey,
  Density,
  DetailContext,
  DetailOptions,
  EditorContext,
  FilterKind,
  FilterOperator,
  FilterOption,
  FilterOptionsProvider,
  FilterValue,
  FormatContext,
  FormatOptions,
  GetRowId,
  HeaderContext,
  HeaderSearchInput,
  HeaderSearchOptions,
  PaginationOptions,
  PartialTableState,
  PinnedRows,
  Pin,
  ResolvedColumn,
  ResolvedHeaderSearch,
  ResolvedSelection,
  ResolvedSorting,
  RowContextMenuInfo,
  RowHeight,
  RowInfo,
  SelectOption,
  SelectionInput,
  SelectionOptions,
  ServerSource,
  Sort,
  SortDirection,
  SortInput,
  SortOptions,
  TableRows,
  TableState,
} from "./types.js"

export {
  DEFAULT_FORMAT,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatTime,
  isDateOnly,
  minorUnitScale,
  optionLabel,
  resolveFormat,
  toBoolean,
  toDate,
  toNumber,
  toText,
} from "./format.js"

export {
  BUILT_IN_TYPES,
  TYPE_ALIASES,
  compareWithType,
  createTypeRegistry,
  defaultTypeRegistry,
  defineType,
  formatWithType,
} from "./registry.js"
export type { Comparable, TypeDef, TypeRegistry } from "./registry.js"

export { distinctValues, inferColumns, inferType } from "./infer.js"
export type { InferColumnsOptions, InferTypeOptions } from "./infer.js"

export {
  moveColumn,
  pruneState,
  reorderColumn,
  reorderColumnTo,
  COLUMN_SAMPLE_SIZE,
  resolveColumns,
} from "./columns.js"
export type { ColumnInput, ResolveColumnsOptions, ResolvedColumns } from "./columns.js"

export {
  LIST_OPERATORS,
  OPERATOR_LABELS,
  RANGE_OPERATORS,
  TEXT_OPERATORS,
  VALUELESS_OPERATORS,
  filterInputType,
  filterRows,
  isFilterUsable,
  isListOperator,
  isTextOperator,
  matchesFilter,
  needsValue,
  normaliseFilter,
  rangeFilter,
  withFilter,
  withoutFilter,
} from "./filter.js"

export {
  getRows,
  pageCount,
  resolveRowId,
  rowsLackIds,
  searchRows,
  sortRows,
  warmSearch,
} from "./pipeline.js"
export type { PipelineOptions } from "./pipeline.js"
export { createPipelineCache } from "./pipeline-cache.js"
export { WARM_SEARCH_FROM, warmSearchWhenIdle } from "./idle.js"
export type { PipelineCache } from "./pipeline-cache.js"

export {
  DEFAULT_STATE,
  addFilter,
  addSort,
  clearFilters,
  clearFocus,
  clearSelection,
  clearSort,
  clearWidth,
  collapseAll,
  columnSearchText,
  createState,
  focusCell,
  hideColumn,
  isCollapsed,
  isExpanded,
  isFiltering,
  removeFilter,
  removeFilterAt,
  removeSort,
  resetSort,
  resetView,
  selectRange,
  setColumnSearch,
  setCollapsed,
  setDensity,
  setExpanded,
  setFilter,
  setMatch,
  setOrder,
  setPage,
  setPageSize,
  setPin,
  setSearch,
  setSelected,
  setSort,
  setWidth,
  showColumn,
  toggleColumn,
  toggleCollapsed,
  toggleExpanded,
  togglePin,
  toggleSelection,
  toggleSort,
} from "./state.js"

export { rangeSelection, resolveSelection, selectableIds } from "./selection.js"
export { INTERACTIVE_SELECTOR, isInteractiveTarget } from "./interaction.js"
export { expandableIds, isDetailOpen } from "./detail.js"
export { getRowsWithChildren, parentIdsWithChildren } from "./children.js"
export { pinnedOffset, pinnedRowId } from "./pinned.js"
export { cellDisplayText } from "./display.js"
export { applyRowMove, canReorderRows, moveRowTo, stepRow } from "./reorder.js"
export type { RowMove, RowReorderOptions } from "./reorder.js"
export { createEdgeScroller, startRowDrag } from "./drag.js"
export { startDragSelect } from "./drag-select.js"
export type { DragSelectOptions } from "./drag-select.js"
export type { RowDragOptions } from "./drag.js"
export type { PinnedSide } from "./pinned.js"
export { entryCell, isNavigationKey, nextCell } from "./navigation.js"
export {
  editValuesEqual,
  editorKind,
  editorOptions,
  editorStep,
  fromEditorText,
  hasEditableColumns,
  isCellEditable,
  placePopup,
  toEditorText,
  typedCharacter,
  validateEdit,
} from "./editing.js"
export type { EditorKind, PopupRect } from "./editing.js"
export type { NavigationGrid, NavigationKey, NextCellOptions } from "./navigation.js"
export { canResetSort, resolveSorting, sortLevels, sortPriority, sortsEqual } from "./sorting.js"
export { HEADER_SEARCH_DEBOUNCE, resolveHeaderSearch } from "./header-search.js"
export { SLOT_CLASSES, createClasses, cx } from "./classes.js"
export type { ClassResolver, TableSlots } from "./classes.js"

export { createStore, createTableStore } from "./store.js"
export type { Store, TableStore } from "./store.js"

export {
  DEFAULT_URL_KEYS,
  URL_KEYS,
  applyStateToUrl,
  decodeFilters,
  encodeFilters,
  pickUrlState,
  stateFromSearchParams,
  stateFromUrl,
  stateToQueryString,
  stateToSearchParams,
} from "./url.js"
export type { UrlOptions, UrlStateKey } from "./url.js"

export { copyText, downloadText, exportCell, rowsToExport, toCsv, toDelimitedText } from "./csv.js"
export { poof } from "./effects.js"
export type { PoofOptions } from "./effects.js"
export type { ExportOptions } from "./csv.js"

export { ICONS, iconPath } from "./icons.js"
export type { IconName } from "./icons.js"

export {
  clamp,
  compareUnknown,
  createTextMatcher,
  foldText,
  createTextTest,
  getPath,
  humanise,
  isEmpty,
  isPlainLinkClick,
  shallowEqual,
  textEndsWith,
  textEquals,
  textIncludes,
  textStartsWith,
  toSelectOptions,
} from "./util.js"
