// Extracted markdown processing utility
import { processCsvBlocksInMarkdown } from "./csv"

/**
 * Process inline markdown formatting for a single line of content.
 * This is the same logic from the original App.jsx processLineMarkdown.
 */
export function processLineMarkdown(content) {
    if (!content) return ""

    let processed = content

    // Bold **text**
    processed = processed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")

    // Italic *text*
    processed = processed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")

    // Underline <u>text</u> (HTML passthrough)
    processed = processed.replace(/<u>(.*?)<\/u>/g, "<u>$1</u>")

    // Strikethrough ~~text~~
    processed = processed.replace(/~~(.*?)~~/g, "<del>$1</del>")

    // Highlight ==text==
    processed = processed.replace(/==(.*?)==/g, "<mark>$1</mark>")

    // Inline code `text`
    processed = processed.replace(/`(.*?)`/g, "<code>$1</code>")

    // Headers (# ## ### etc.)
    processed = processed.replace(
        /^(#{1,6})\s+(.*)$/g,
        (match, hashes, text) => {
            const level = hashes.length
            return `<h${level}>${text}</h${level}>`
        },
    )

    // Blockquote > text
    processed = processed.replace(/^>\s+(.*)$/g, "<blockquote>$1</blockquote>")

    // List items - text
    processed = processed.replace(/^-\s+(.*)$/g, "<ul><li>$1</li></ul>")

    // Links [text](url)
    processed = processed.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank">$1</a>',
    )

    // Images ![alt](url)
    processed = processed.replace(
        /!\[([^\]]*)\]\(([^)]+)\)/g,
        '<img src="$2" alt="$1" style="max-width:100%">',
    )

    // Horizontal rule ---
    processed = processed.replace(/^---$/g, "<hr>")

    return processed
}

/**
 * Process full markdown content (multi-line) with CSV block support.
 * This is used for full-document rendering.
 */
export function processFullMarkdown(content) {
    // First, handle CSV blocks
    const withCsvTables = processCsvBlocksInMarkdown(content)

    // Then process each line for inline markdown
    return withCsvTables
        .split("\n")
        .map((line) => processLineMarkdown(line))
        .join("\n")
}
