import React, { useState, useRef, useEffect, useCallback, useMemo } from "react"
import DataGrid, { textEditor } from "react-data-grid"
import Papa from "papaparse"
import "react-data-grid/lib/styles.css"

/* ── helpers ─────────────────────────────────────────────────────── */

function parseContent(content) {
  if (!content?.trim()) {
    return { headers: ["Column 1", "Column 2"], dataRows: [{ __id: 0, c0: "", c1: "" }] }
  }
  const result = Papa.parse(content.trim(), { skipEmptyLines: true })
  const data = result.data || []
  if (!data.length) {
    return { headers: ["Column 1"], dataRows: [{ __id: 0, c0: "" }] }
  }
  const headers = data[0].map((h, i) => (h?.trim() || `Column ${i + 1}`))
  const raw = data.slice(1)
  const dataRows = raw.length
    ? raw.map((row, ri) => {
      const obj = { __id: ri }
      headers.forEach((_, ci) => { obj[`c${ci}`] = row[ci]?.trim() ?? "" })
      return obj
    })
    : [Object.fromEntries([["__id", 0], ...headers.map((_, ci) => [`c${ci}`, ""])])]
  return { headers, dataRows }
}

function serializeGrid(headers, rows) {
  const data = [
    headers,
    ...rows.map(row => headers.map((_, ci) => row[`c${ci}`] ?? "")),
  ]
  return Papa.unparse(data)
}

/* ── Component ───────────────────────────────────────────────────── */

export function CsvBlock({ block, onChange, onFocus }) {
  const contentRef = useRef(block.content)

  const [headers, setHeaders] = useState(() => parseContent(block.content).headers)
  const [rows, setRows] = useState(() => parseContent(block.content).dataRows)
  const [editingHeader, setEditingHeader] = useState(null) // column index | null
  const headerInputRef = useRef(null)

  // Sync when content changes externally (undo/redo, initial load)
  useEffect(() => {
    if (block.content !== contentRef.current) {
      contentRef.current = block.content
      const parsed = parseContent(block.content)
      setHeaders(parsed.headers)
      setRows(parsed.dataRows)
    }
  }, [block.content])

  // Auto-focus header input when entering edit mode
  useEffect(() => {
    if (editingHeader !== null && headerInputRef.current) {
      headerInputRef.current.focus()
      headerInputRef.current.select()
    }
  }, [editingHeader])

  const commit = useCallback((newHeaders, newRows) => {
    const csv = serializeGrid(newHeaders, newRows)
    contentRef.current = csv
    onChange(csv)
  }, [onChange])

  /* ── Row / column operations ─────────────────────────────────── */

  const handleRowsChange = useCallback((newRows) => {
    setRows(newRows)
    commit(headers, newRows)
  }, [headers, commit])

  const addRow = () => {
    const newRow = { __id: rows.length, ...Object.fromEntries(headers.map((_, ci) => [`c${ci}`, ""])) }
    const newRows = [...rows, newRow]
    setRows(newRows)
    commit(headers, newRows)
  }

  const addColumn = () => {
    const ci = headers.length
    const newHeaders = [...headers, `Column ${ci + 1}`]
    const newRows = rows.map(row => ({ ...row, [`c${ci}`]: "" }))
    setHeaders(newHeaders)
    setRows(newRows)
    commit(newHeaders, newRows)
  }

  const deleteRow = useCallback((rowIdx) => {
    const newRows = rows
      .filter((_, i) => i !== rowIdx)
      .map((row, i) => ({ ...row, __id: i }))
    const safe = newRows.length
      ? newRows
      : [Object.fromEntries([["__id", 0], ...headers.map((_, ci) => [`c${ci}`, ""])])]
    setRows(safe)
    commit(headers, safe)
  }, [rows, headers, commit])

  const deleteColumn = useCallback((ci) => {
    if (headers.length <= 1) return
    const newHeaders = headers.filter((_, i) => i !== ci)
    const newRows = rows.map(row => {
      const newRow = { __id: row.__id }
      let ni = 0
      headers.forEach((_, oi) => {
        if (oi !== ci) newRow[`c${ni++}`] = row[`c${oi}`] ?? ""
      })
      return newRow
    })
    setHeaders(newHeaders)
    setRows(newRows)
    commit(newHeaders, newRows)
  }, [headers, rows, commit])

  const commitHeaderEdit = (ci, value) => {
    const newHeaders = [...headers]
    newHeaders[ci] = value || `Column ${ci + 1}`
    setHeaders(newHeaders)
    setEditingHeader(null)
    commit(newHeaders, rows)
  }

  /* ── Column definitions ───────────────────────────────────────── */

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => [
    ...headers.map((name, ci) => ({
      key: `c${ci}`,
      name,
      editable: true,
      renderEditCell: textEditor,
      minWidth: 90,
      renderHeaderCell: () =>
        editingHeader === ci ? (
          <input
            ref={headerInputRef}
            className="csv-header-input"
            defaultValue={name}
            onBlur={(e) => commitHeaderEdit(ci, e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === "Enter" || e.key === "Escape") {
                commitHeaderEdit(ci, e.target.value)
              }
            }}
          />
        ) : (
          <div className="csv-header-cell">
            <span
              className="csv-header-name"
              onDoubleClick={() => setEditingHeader(ci)}
              title="Double-click to rename"
            >
              {name}
            </span>
            {headers.length > 1 && (
              <button
                className="csv-col-delete-btn"
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); deleteColumn(ci) }}
                title="Delete column"
              >
                ×
              </button>
            )}
          </div>
        ),
    })),
    // Row delete action column
    {
      key: "__del",
      name: "",
      width: 30,
      resizable: false,
      renderHeaderCell: () => (
        <button className="csv-add-col-btn" onClick={addColumn} title="Add column">+</button>
      ),
      renderCell: ({ rowIdx }) => (
        <button
          className="csv-row-delete-btn"
          onMouseDown={(e) => { e.preventDefault(); deleteRow(rowIdx) }}
          title="Delete row"
        >
          ×
        </button>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [headers, editingHeader, handleRowsChange, deleteColumn, addColumn, deleteRow])

  return (
    <div className="block-csv-wrapper" onClick={onFocus}>
      <DataGrid
        columns={columns}
        rows={rows}
        onRowsChange={handleRowsChange}
        rowKeyGetter={(row) => row.__id}
        className="rdg-light block-csv-rdg"
        style={{
          // Calculate exact height so all rows appear without virtual scrolling
          // 36px header + 34px per row + 2px for borders
          blockSize: `${36 + rows.length * 34 + 2}px`,
        }}
      />
      <button className="csv-add-row-btn" onClick={addRow}>
        + Add row
      </button>
    </div>
  )
}
