import Papa from "papaparse"

export function parseCSV(csvText) {
    const result = Papa.parse(csvText, {
        header: false,
        skipEmptyLines: true,
    })
    return result.data
}

export function renderCSVTable(csvText) {
    const rows = parseCSV(csvText)
    if (rows.length === 0) return null

    return {
        headers: rows[0],
        data: rows.slice(1),
    }
}
