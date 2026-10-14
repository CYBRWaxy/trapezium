/**
 * @trapezium/svelte
 *
 * ```svelte
 * <script>
 *   import { Table } from "@trapezium/svelte"
 *   import "@trapezium/svelte/styles.css"
 * </script>
 *
 * <Table data={users} search selection="multiple" />
 * ```
 */

export { default as Table } from "./Table.svelte"
export { trapezium } from "./action.js"
export { renderToString } from "@trapezium/vanilla"

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
  copyText,
  downloadText,
} from "@trapezium/core"

export type { TableInstance, TableOptions, VanillaColumn as SvelteColumn } from "@trapezium/vanilla"
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
  RowHeight,
  RowInfo,
  RowMove,
  RowReorderOptions,
  SelectOption,
  Sort,
  SortOptions,
  TableState,
  TypeDef,
  UrlOptions,
} from "@trapezium/core"
