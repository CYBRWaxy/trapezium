/**
 * @trapezium/vue
 *
 * ```vue
 * <script setup>
 * import { TrapeziumTable } from "@trapezium/vue"
 * import "@trapezium/vue/styles.css"
 * </script>
 *
 * <template>
 *   <TrapeziumTable :data="users" search selection />
 * </template>
 * ```
 */

export { Table, Table as TrapeziumTable } from "./table.js"
export { renderToString } from "@trapezium/vanilla"
export type { VueColumn } from "./table.js"

export {
  DEFAULT_FORMAT,
  DEFAULT_STATE,
  addSort,
  applyStateToUrl,
  clearSort,
  columnSearchText,
  createState,
  createTypeRegistry,
  defineType,
  distinctValues,
  inferColumns,
  inferType,
  pickUrlState,
  removeSort,
  resetSort,
  setColumnSearch,
  stateFromSearchParams,
  stateFromUrl,
  stateToQueryString,
  stateToSearchParams,
  toCsv,
  toggleSort,
  collapseAll,
  isExpanded,
  setExpanded,
  toggleExpanded,
  clearFocus,
  focusCell,
  isCollapsed,
  parentIdsWithChildren,
  setCollapsed,
  toggleCollapsed,
  applyRowMove,
  rangeSelection,
  cellDisplayText,
  exportCell,
  toDelimitedText,
  copyText,
  downloadText,
} from "@trapezium/core"

export type {
  Align,
  AnyRow,
  CellContext,
  CellEdit,
  CellFocus,
  ColumnDef,
  ColumnFilter,
  Density,
  DetailContext,
  DetailOptions,
  EditorContext,
  FilterKind,
  FilterOperator,
  FormatContext,
  HeaderSearchOptions,
  PaginationOptions,
  PartialTableState,
  PinnedRows,
  RowContextMenuInfo,
  RowHeight,
  RowInfo,
  RowMove,
  RowReorderOptions,
  SelectionInput,
  SelectionOptions,
  SelectOption,
  Sort,
  SortOptions,
  TableSlots,
  TableState,
  TypeDef,
  UrlOptions,
} from "@trapezium/core"
