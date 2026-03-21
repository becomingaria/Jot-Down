/**
 * Inline-markdown → rich-text auto-formatter.
 *
 * Supported markdown tags (applied the instant the closing delimiter is typed):
 *
 *  | Markdown          | HTML tag     | Renders as        |
 *  |-------------------|------------- |-------------------|
 *  | **text**          | <strong>     | Bold              |
 *  | __text__          | <strong>     | Bold              |
 *  | *text*            | <em>         | Italic            |
 *  | _text_            | <em>         | Italic            |
 *  | ~~text~~          | <s>          | Strikethrough     |
 *  | `text`            | <code>       | Inline code       |
 *  | ==text==          | <mark>       | Highlight         |
 *
 * How it works:
 *   1. Called from the Block `onInput` handler after every keystroke.
 *   2. Reads the element's `innerHTML`.
 *   3. Runs each pattern **once** per call (first match wins) so we
 *      don't over-convert partially typed syntax.
 *   4. On match: rewrites `innerHTML`, places the caret directly after
 *      the newly inserted element, and returns `true`.
 *   5. If nothing matched, returns `false` (no DOM mutation).
 */

// Each rule:  [regex on innerHTML, replacement template, caret-placement tag name]
// The regex intentionally avoids matching across existing HTML tags.
const RULES = [
    // **bold** or __bold__  — must come before single * / _
    {
        // Match **…** where the inner part has no nested **
        pattern: /\*\*([^*<>]+)\*\*/,
        replace: "<strong>$1</strong>",
        tag: "STRONG",
    },
    {
        pattern: /__([^_<>]+)__/,
        replace: "<strong>$1</strong>",
        tag: "STRONG",
    },
    // ~~strikethrough~~
    {
        pattern: /~~([^~<>]+)~~/,
        replace: "<s>$1</s>",
        tag: "S",
    },
    // ==highlight==
    {
        pattern: /==([^=<>]+)==/,
        replace: "<mark>$1</mark>",
        tag: "MARK",
    },
    // `inline code`
    {
        pattern: /`([^`<>]+)`/,
        replace: "<code>$1</code>",
        tag: "CODE",
    },
    // *italic* (single asterisk — checked after ** is ruled out)
    {
        pattern: /(?<!\*)\*([^*<>]+)\*(?!\*)/,
        replace: "<em>$1</em>",
        tag: "EM",
    },
    // _italic_ (single underscore — checked after __ is ruled out)
    {
        pattern: /(?<!_)_([^_<>]+)_(?!_)/,
        replace: "<em>$1</em>",
        tag: "EM",
    },
]

/**
 * Scan the contentEditable element for a completed inline-markdown pattern,
 * replace it with an HTML tag, and place the caret right after the new element.
 *
 * @param {HTMLElement} el  The contentEditable div
 * @returns {boolean}       `true` if a replacement was made
 */
export function applyInlineMarkdown(el) {
    const html = el.innerHTML
    if (!html) return false

    for (const rule of RULES) {
        const match = html.match(rule.pattern)
        if (!match) continue

        // Build the new HTML
        const newHtml = html.replace(rule.pattern, rule.replace)

        // Apply — this blows away the current selection
        el.innerHTML = newHtml

        // Place the caret right after the inserted element.
        // We look for the *last* occurrence of that tag (most likely the one we
        // just created) and set the caret right after it.
        const tags = el.querySelectorAll(rule.tag.toLowerCase())
        if (tags.length > 0) {
            const target = tags[tags.length - 1]
            const range = document.createRange()
            const sel = window.getSelection()

            // Set range to immediately after the closing tag
            range.setStartAfter(target)
            range.collapse(true)

            // Insert a zero-width space so the caret escapes the formatted element
            // and subsequent typing is unformatted.
            const zws = document.createTextNode("\u200B")
            range.insertNode(zws)
            range.setStartAfter(zws)
            range.collapse(true)

            sel.removeAllRanges()
            sel.addRange(range)
        }

        return true
    }

    return false
}

/**
 * Convert a string of markdown inline syntax to an HTML string.
 * Used to hydrate a contentEditable element from stored block content.
 *
 * XSS-safe: HTML special characters are escaped first so that only the
 * known inline-markdown constructs produce actual HTML tags.
 *
 * @param {string} text  e.g. "**hello** *world*"
 * @returns {string}     e.g. "<strong>hello</strong> <em>world</em>"
 */
export function markdownInlineToHtml(text) {
    if (!text) return ""
    // Escape HTML to prevent XSS, with placeholder-swap for <u>...</u>
    // (underline has no standard markdown syntax so we store it as HTML).
    const T = "\x00"
    let s = text
        .replace(/<u>/gi, `${T}u${T}`)
        .replace(/<\/u>/gi, `${T}/u${T}`)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(new RegExp(`${T}u${T}`, "g"), "<u>")
        .replace(new RegExp(`${T}/u${T}`, "g"), "</u>")
    // Apply inline markdown → HTML (order matters: ** before *)
    return s
        .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
        .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
        .replace(/==([^=\n]+)==/g, "<mark>$1</mark>")
        .replace(/`([^`\n]+)`/g, "<code>$1</code>")
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
        .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>")
}
