import { marked } from "marked"

// Process a single line of markdown
export function processLineMarkdown(line) {
    if (!line) return ""

    // Handle headers
    if (line.startsWith("# ")) {
        return line.replace(/^# /, "").trim()
    }
    if (line.startsWith("## ")) {
        return line.replace(/^## /, "").trim()
    }
    if (line.startsWith("### ")) {
        return line.replace(/^### /, "").trim()
    }

    // Handle bold
    line = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    line = line.replace(/__(.+?)__/g, "<strong>$1</strong>")

    // Handle italic
    line = line.replace(/\*(.+?)\*/g, "<em>$1</em>")
    line = line.replace(/_(.+?)_/g, "<em>$1</em>")

    // Handle code
    line = line.replace(/`(.+?)`/g, "<code>$1</code>")

    // Handle links
    line = line.replace(
        /\[(.+?)\]\((.+?)\)/g,
        '<a href="$2" target="_blank">$1</a>',
    )

    // Handle images
    line = line.replace(/!\[(.+?)\]\((.+?)\)/g, '<img src="$2" alt="$1" />')

    return line
}

// Process full markdown to HTML
export function processMarkdown(markdown) {
    return marked(markdown)
}

// Extract CSV blocks from markdown
export function extractCSVBlocks(markdown) {
    const csvBlocks = []
    const lines = markdown.split("\n")
    let inCsvBlock = false
    let csvContent = []
    let startIndex = 0

    lines.forEach((line, index) => {
        if (line.trim() === "```csv") {
            inCsvBlock = true
            csvContent = []
            startIndex = index
        } else if (line.trim() === "```" && inCsvBlock) {
            csvBlocks.push({
                content: csvContent.join("\n"),
                startLine: startIndex,
                endLine: index,
            })
            inCsvBlock = false
        } else if (inCsvBlock) {
            csvContent.push(line)
        }
    })

    return csvBlocks
}
