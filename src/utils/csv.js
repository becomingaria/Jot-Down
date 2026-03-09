// CSV parsing and rendering utility
import Papa from "papaparse"

/**
 * Detect and extract CSV fenced blocks from markdown content lines.
 * Returns the parsed CSV blocks and their line ranges.
 *
 * A CSV block is defined as:
 * ```csv
 * Header1,Header2,Header3
 * val1,val2,val3
 * ```
 */
export function detectCsvBlocks(lines) {
    const blocks = []
    let inBlock = false
    let blockStartLine = -1
    let csvLines = []

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()

        if (line === "```csv" && !inBlock) {
            inBlock = true
            blockStartLine = i
            csvLines = []
        } else if (line === "```" && inBlock) {
            // End of CSV block
            blocks.push({
                startLine: blockStartLine,
                endLine: i,
                csvContent: csvLines.join("\n"),
            })
            inBlock = false
            csvLines = []
        } else if (inBlock) {
            csvLines.push(lines[i])
        }
    }

    return blocks
}

/**
 * Parse CSV string into structured data.
 * Uses papaparse for robust CSV handling (quoted strings, commas in values, etc.)
 */
export function parseCsv(csvString) {
    const result = Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false, // Keep everything as strings for display
    })

    return {
        headers: result.meta.fields || [],
        rows: result.data,
        errors: result.errors,
    }
}

/**
 * Render parsed CSV data as an HTML table string.
 */
export function csvToHtml(csvString) {
    const { headers, rows } = parseCsv(csvString)

    if (headers.length === 0) return ""

    let html = '<table class="csv-table">'

    // Header row
    html += "<thead><tr>"
    for (const header of headers) {
        html += `<th>${escapeHtml(header)}</th>`
    }
    html += "</tr></thead>"

    // Data rows
    html += "<tbody>"
    for (const row of rows) {
        html += "<tr>"
        for (const header of headers) {
            html += `<td>${escapeHtml(row[header] || "")}</td>`
        }
        html += "</tr>"
    }
    html += "</tbody>"

    html += "</table>"
    return html
}

/**
 * Convert structured data back to CSV string.
 */
export function dataToCsv(headers, rows) {
    return Papa.unparse({
        fields: headers,
        data: rows.map((row) => headers.map((h) => row[h] || "")),
    })
}

/**
 * Process a multi-line markdown string and replace CSV fenced blocks with HTML tables.
 * Used for display rendering.
 */
export function processCsvBlocksInMarkdown(content) {
    const lines = content.split("\n")
    const blocks = detectCsvBlocks(lines)

    if (blocks.length === 0) return content

    // Replace blocks from bottom to top to preserve line indices
    let result = [...lines]
    for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i]
        const tableHtml = csvToHtml(block.csvContent)
        // Replace the entire block (including fences) with the table
        result.splice(
            block.startLine,
            block.endLine - block.startLine + 1,
            tableHtml,
        )
    }

    return result.join("\n")
}

function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
}
