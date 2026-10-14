import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  Table,
  applyRowMove,
  createState,
  focusCell,
  type Column,
  type Density,
  type PaginationOptions,
  type RowHeight,
  type TableState,
} from "@trapezium/react"
import "@trapezium/react/styles.css"

import { Controls, Segmented, Switch } from "./controls.js"
import { makeInvoices, STATUS_OPTIONS, type Invoice } from "./data.js"
import "./playground.css"

const invoices = makeInvoices()

/**
 * The playground.
 *
 * Every table below is the same component with different props, and the
 * switches above the big one change those props live — which is the fastest way
 * to find out what a prop actually does.
 */
function Playground() {
  const [selected, setSelected] = useState<string[]>([])
  const [theme, setTheme] = useState<"light" | "dark" | undefined>(undefined)

  // The page follows the toggle too, so the tables are not the only thing that
  // changes when it is pressed.
  document.documentElement.dataset["theme"] = theme ?? ""

  /* What the switches control. */
  const [mode, setMode] = useState<NonNullable<PaginationOptions["mode"]> | "none">("pages")
  const [pageSize, setPageSize] = useState(25)
  const [setFilters, setSetFilters] = useState(false)
  const [selection, setSelection] = useState(true)
  const [density, setDensity] = useState<Density>("normal")
  const [cards, setCards] = useState(false)
  const [sticky, setSticky] = useState(true)
  const [rowHeight, setRowHeight] = useState<RowHeight>("fixed")
  const [headerSearch, setHeaderSearch] = useState(true)
  const [multiSort, setMultiSort] = useState(true)

  const columns: Column<Invoice>[] = [
    { key: "reference", header: "Invoice", pin: "start", type: "id" },
    { key: "customer.name", header: "Customer", filter: setFilters ? "set" : true },
    { key: "customer.email", header: "Email" },
    { key: "amount", type: "currency", filter: setFilters ? "set" : "range" },
    {
      key: "status",
      type: "badge",
      formatOptions: { options: STATUS_OPTIONS },
      filter: setFilters ? "set" : true,
    },
    { key: "tags", type: "tags" },
    { key: "issued_at", header: "Issued", type: "datetime" },
    { key: "due_date", header: "Due", type: "date" },
    { key: "paid", type: "boolean" },
    { key: "owner", filter: setFilters ? "set" : true },
    { key: "notes", type: "longText", wrap: true, width: 280 },
    {
      key: "actions",
      header: "",
      sortable: false,
      filter: false,
      exportable: false,
      width: 90,
      render: ({ row }) => (
        <button type="button" className="row-action" onClick={() => alert(row.reference)}>
          Open
        </button>
      ),
    },
  ]

  return (
    <main>
      <header className="page-header">
        <div>
          <h1>Trapezium</h1>
          <p>A data table that looks right before you configure anything.</p>
        </div>
        <div className="themes">
          {(["light", "dark", undefined] as const).map((option) => (
            <button
              key={option ?? "system"}
              type="button"
              data-active={theme === option}
              onClick={() => setTheme(option)}
            >
              {option ?? "system"}
            </button>
          ))}
        </div>
      </header>

      <section>
        <h2>Nothing configured</h2>
        <p className="note">
          <code>{`<Table data={invoices} />`}</code> — columns, types, formatting, sorting and
          pagination all come from the data.
        </p>
        <Table theme={theme} data={invoices.slice(0, 8)} pagination={false} />
      </section>

      <section>
        <h2>Everything switched on</h2>
        <p className="note">
          Drag a column header sideways to move it, or out of the table to remove it. Shift-click a
          second header to sort by both, and hover a header for the magnifier that searches that
          column alone. The switches change the props live.
        </p>

        <Controls>
          <Segmented
            label="Pagination"
            value={mode}
            onChange={setMode}
            options={[
              { value: "pages", label: "Pages" },
              { value: "simple", label: "Prev / next" },
              { value: "loadMore", label: "Load more" },
              { value: "infinite", label: "Infinite" },
              { value: "none", label: "All rows" },
            ]}
          />
          <Segmented
            label="Per page"
            value={String(pageSize)}
            onChange={(next) => setPageSize(Number(next))}
            options={[
              { value: "10", label: "10" },
              { value: "25", label: "25" },
              { value: "50", label: "50" },
            ]}
          />
          <Segmented
            label="Density"
            value={density}
            onChange={setDensity}
            options={[
              { value: "compact", label: "Compact" },
              { value: "normal", label: "Normal" },
              { value: "relaxed", label: "Relaxed" },
            ]}
          />
          <Segmented
            label="Row height"
            value={String(rowHeight)}
            onChange={(next) => setRowHeight(next === "fixed" || next === "auto" ? next : Number(next))}
            options={[
              { value: "fixed", label: "Fixed" },
              { value: "auto", label: "Auto" },
              { value: "28", label: "28px" },
              { value: "64", label: "64px" },
            ]}
          />
          <Switch label="Set filters" checked={setFilters} onChange={setSetFilters} />
          <Switch label="Selection" checked={selection} onChange={setSelection} />
          <Switch label="Card layout" checked={cards} onChange={setCards} />
          <Switch label="Sticky header" checked={sticky} onChange={setSticky} />
          <Switch label="Header search" checked={headerSearch} onChange={setHeaderSearch} />
          <Switch label="Multi-column sort" checked={multiSort} onChange={setMultiSort} />
        </Controls>

        <Table
          theme={theme}
          data={invoices}
          getRowId={(invoice) => invoice.id}
          search={{ placeholder: "Search invoices" }}
          // Paid invoices have nothing left to do to them, so they cannot be
          // picked for a bulk action: their box is disabled and "select all"
          // skips them.
          selection={selection ? { isSelectable: (invoice) => !invoice.paid } : false}
          onSelectionChange={setSelected}
          export
          // A magnifier in each header, on hover, that turns the header into a
          // search box for that column alone.
          headerSearch={headerSearch}
          sortable={{ multiple: multiSort }}
          densityControl
          density={density}
          responsive={cards ? "cards" : "scroll"}
          stickyHeader={sticky}
          rowHeight={rowHeight}
          maxHeight={420}
          pagination={mode === "none" ? false : { mode, pageSize, pageSizeOptions: [10, 25, 50, 100] }}
          format={{ currency: "AUD", locale: "en-AU", timeZone: "Australia/Sydney" }}
          columns={columns}
        />
        <p className="note">
          {selected.length} selected · filters are {setFilters ? "set filters" : "whatever each type deserves"}
        </p>
      </section>

      <EditingSection theme={theme} />

      <section>
        <h2>Rows that size themselves</h2>
        <p className="note">
          <code>rowHeight="auto"</code> — every row is as tall as its tallest cell, and the cell
          renderer in the last column decides that for itself. No measuring pass: the browser
          already knows how tall a table row is.
        </p>
        <Table
          theme={theme}
          data={invoices.slice(0, 6)}
          rowHeight="auto"
          pagination={false}
          columns={[
            { key: "reference", header: "Invoice", wrap: false },
            { key: "notes", type: "longText", width: 320 },
            { key: "tags", type: "tags", width: 200 },
            {
              key: "summary",
              header: "Rendered",
              sortable: false,
              filter: false,
              width: 260,
              render: ({ row }) => (
                <div className="stacked">
                  <strong>{row.customer.name}</strong>
                  <span>{row.customer.email}</span>
                  <span>{row.status}</span>
                </div>
              ),
            },
          ]}
        />
      </section>

      <section>
        <h2>Narrow: the same table as cards</h2>
        <p className="note">
          <code>responsive="cards"</code> — a container query, so it depends on the room the table
          has rather than the size of the window.
        </p>
        <div className="narrow">
          <Table
            theme={theme}
            data={invoices.slice(0, 4)}
            responsive="cards"
            pagination={false}
            columns={["reference", "customer.name", "amount", "status", "due_date"]}
          />
        </div>
      </section>

      <section>
        <h2>Empty, loading, and error</h2>
        <div className="grid">
          <Table theme={theme} data={[] as Invoice[]} columns={["reference", "amount"]} />
          <Table theme={theme} data={[] as Invoice[]} columns={["reference", "amount"]} loading />
          <Table
            theme={theme}
            data={[] as Invoice[]}
            columns={["reference", "amount"]}
            error="Could not reach the server"
          />
        </div>
      </section>
    </main>
  )
}

/**
 * Editing, detail rows and the keyboard, on rows the page keeps itself — the
 * table never changes them, it reports each edit and shows what comes back.
 */
function EditingSection({ theme }: { theme: "light" | "dark" | undefined }) {
  const [rows, setRows] = useState(() => invoices.slice(0, 60))
  const [state, setState] = useState<TableState>(() => createState({ pageSize: 20 }))
  const [log, setLog] = useState<string[]>([])

  const target = rows[41]

  // A "new entry" row above the data and a totals row below it, outside the data itself.
  const draft = {
    ...rows[0]!,
    id: "draft",
    reference: "New",
    customer: { name: "", email: "" },
    amount: 0,
    status: "draft",
    due_date: "",
    notes: null,
  }
  const totals = {
    ...draft,
    id: "totals",
    reference: "Total",
    amount: rows.reduce((sum, invoice) => sum + invoice.amount, 0),
    status: "",
    paid: null as unknown as boolean,
  }

  return (
    <section id="editing">
      <h2>Editing, detail rows and the keyboard</h2>
      <p className="note">
        Double-click a cell, press Enter on it, or just start typing. Tab moves to the next editable
        cell, Escape cancels. Arrow keys move between cells. Amounts over 10,000 are refused, and a
        status change takes a second to save. The chevron opens a row's detail.
      </p>
      <div className="toolbar-row">
        <button
          type="button"
          className="jump"
          onClick={() => target && setState((current) => focusCell(current, target.id, "amount", "center"))}
        >
          Show {target?.reference}
        </button>
        <span className="note" aria-live="polite">{log[0] ?? "No edits yet"}</span>
      </div>
      <Table
        theme={theme}
        aria-label="Editable invoices"
        data={rows}
        getRowId={(invoice) => invoice.id}
        state={state}
        onStateChange={setState}
        selection
        maxHeight={380}
        pinnedRows={{ top: [draft], bottom: [totals] }}
        pagination={{ pageSize: 20 }}
        rowReorder={{
          canDrag: (invoice) => !invoice.paid,
          onReorder: (move) => {
            setLog((current) => [`moved ${move.rowId} after ${String(move.afterId)}`, ...current])
            setRows((current) => applyRowMove(current, current.map((invoice) => invoice.id), move))
          },
        }}
        format={{ currency: "AUD", locale: "en-AU", timeZone: "Australia/Sydney" }}
        detail={{
          render: ({ row, collapse }) => (
            <div className="detail">
              <p>
                <strong>{row.customer.name}</strong> · {row.customer.email}
              </p>
              <p>{row.notes ?? "No notes."}</p>
              <button type="button" className="row-action" onClick={collapse}>
                Done
              </button>
            </div>
          ),
          canExpand: (invoice) => invoice.notes !== null,
        }}
        columns={[
          // Frozen only while the table is narrow, where the rest of the row scrolls under it.
          { key: "reference", header: "Invoice", type: "id", pin: { side: "start", below: 640 } },
          { key: "customer.name", header: "Customer", editable: true, grow: 1 },
          {
            key: "amount",
            type: "currency",
            editable: (invoice) => !invoice.paid,
            validate: (value) => (typeof value === "number" && value <= 10_000) || "At most 10,000",
          },
          { key: "status", type: "badge", formatOptions: { options: STATUS_OPTIONS }, editable: true },
          { key: "due_date", header: "Due", type: "date", editable: true },
          { key: "paid", type: "boolean", editable: true, width: 80 },
        ]}
        onCellEdit={(edit) => {
          setLog((current) => [`${edit.key} of ${edit.rowId}: ${String(edit.previousValue)} → ${String(edit.value)}`, ...current])
          // An edit of the "new entry" row adds an invoice with that one field filled in.
          if (edit.pinned === "top") {
            const id = `inv_new_${String(rows.length + 1)}`
            setRows((current) => [setPath({ ...draft, id, reference: `INV-NEW-${String(current.length + 1)}` }, edit.key, edit.value), ...current])
            return
          }
          const apply = () =>
            setRows((current) =>
              current.map((invoice) =>
                invoice.id === edit.rowId ? setPath(invoice, edit.key, edit.value) : invoice,
              ),
            )
          if (edit.key !== "status") {
            apply()
            return
          }
          return new Promise<void>((resolve) => setTimeout(() => {
            apply()
            resolve()
          }, 1000))
        }}
      />
    </section>
  )
}

/** A copy of an invoice with one field changed, following a dotted key. */
function setPath(invoice: Invoice, key: string, value: unknown): Invoice {
  if (key === "customer.name") return { ...invoice, customer: { ...invoice.customer, name: String(value) } }
  return { ...invoice, [key]: value }
}

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
)
