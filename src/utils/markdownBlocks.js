import { BLOCK_TYPES, createBlock } from "./blockTypes"

// --- Markdown to Blocks ---
export function markdownToBlocks(markdown) {
    if (!markdown || !markdown.trim()) {
        return [createBlock(BLOCK_TYPES.PARAGRAPH, "")]
    }

    const lines = markdown.split(/\r?\n/)
    const blocks = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i]

        // Skip empty lines
        if (!line.trim()) {
            i++
            continue
        }

        // Heading 3 (check before h2/h1 so ### isn't matched by ##)
        if (line.startsWith("### ")) {
            blocks.push(createBlock(BLOCK_TYPES.HEADING_3, line.slice(4)))
            i++
        }
        // Heading 2
        else if (line.startsWith("## ")) {
            blocks.push(createBlock(BLOCK_TYPES.HEADING_2, line.slice(3)))
            i++
        }
        // Heading 1
        else if (line.startsWith("# ")) {
            blocks.push(createBlock(BLOCK_TYPES.HEADING_1, line.slice(2)))
            i++
        }
        // Todo
        else if (line.match(/^- \[(x| )\] /)) {
            const checked = line.includes("[x]")
            const content = line.replace(/^- \[(x| )\] /, "")
            const block = createBlock(BLOCK_TYPES.TODO, content)
            block.checked = checked
            blocks.push(block)
            i++
        }
        // Bullet list
        else if (line.startsWith("- ") || line.startsWith("* ")) {
            blocks.push(createBlock(BLOCK_TYPES.BULLET_LIST, line.slice(2)))
            i++
        }
        // Numbered list
        else if (line.match(/^\d+\. /)) {
            blocks.push(
                createBlock(
                    BLOCK_TYPES.NUMBERED_LIST,
                    line.replace(/^\d+\. /, ""),
                ),
            )
            i++
        }
        // Blockquote
        else if (line.startsWith("> ")) {
            blocks.push(createBlock(BLOCK_TYPES.QUOTE, line.slice(2)))
            i++
        }
        // Code block
        else if (line.startsWith("```")) {
            const langTag = line.slice(3).trim()
            i++
            const codeLines = []
            while (i < lines.length && !lines[i].startsWith("```")) {
                codeLines.push(lines[i])
                i++
            }
            if (langTag === "csv") {
                const block = createBlock(BLOCK_TYPES.CSV, codeLines.join("\n"))
                blocks.push(block)
            } else {
                const block = createBlock(
                    BLOCK_TYPES.CODE,
                    codeLines.join("\n"),
                )
                block.language = langTag || "javascript"
                blocks.push(block)
            }
            i++ // skip closing ```
        }
        // Callout
        else if (line.startsWith(":::")) {
            const calloutType = line.slice(3).trim()
            i++
            const calloutLines = []
            while (i < lines.length && !lines[i].startsWith(":::")) {
                calloutLines.push(lines[i])
                i++
            }
            const block = createBlock(
                BLOCK_TYPES.CALLOUT,
                calloutLines.join("\n"),
            )
            block.calloutType = calloutType || "info"
            blocks.push(block)
            i++ // skip closing :::
        }
        // Divider
        else if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
            blocks.push(createBlock(BLOCK_TYPES.DIVIDER, ""))
            i++
        }
        // Image: ![caption](url)
        else if (line.match(/^!\[.*\]\(.*\)$/)) {
            const imgMatch = line.match(/^!\[(.*)\]\((.*)\)$/)
            const block = createBlock(BLOCK_TYPES.IMAGE, imgMatch?.[1] || "")
            block.imageCaption = imgMatch?.[1] || ""
            block.imageUrl = imgMatch?.[2] || ""
            blocks.push(block)
            i++
        }
        // Subpage link: [📄 Name](subpage:fileId)
        else if (line.match(/^\[📄 .*\]\(subpage:.*\)$/)) {
            const spMatch = line.match(/^\[📄 (.*)\]\(subpage:(.*)\)$/)
            const block = createBlock(
                BLOCK_TYPES.SUBPAGE_LINK,
                spMatch?.[1] || "",
            )
            block.linkedFileName = spMatch?.[1] || ""
            block.linkedFileId = spMatch?.[2] || ""
            blocks.push(block)
            i++
        }
        // Paragraph
        else {
            blocks.push(createBlock(BLOCK_TYPES.PARAGRAPH, line))
            i++
        }

        // Move forward
    }

    if (blocks.length === 0) {
        blocks.push(createBlock(BLOCK_TYPES.PARAGRAPH, ""))
    }

    return blocks
}

// --- Blocks to Markdown ---
export function blocksToMarkdown(blocks) {
    return blocks.map((block) => serializeBlockToMarkdown(block)).join("\n")
}

// --- Serialize block to markdown ---
function serializeBlockToMarkdown(block) {
    const content = block.content || ""
    switch (block.type) {
        case BLOCK_TYPES.HEADING_1:
            return `# ${content}`
        case BLOCK_TYPES.HEADING_2:
            return `## ${content}`
        case BLOCK_TYPES.HEADING_3:
            return `### ${content}`
        case BLOCK_TYPES.BULLET_LIST:
            return `- ${content}`
        case BLOCK_TYPES.NUMBERED_LIST:
            return `1. ${content}`
        case BLOCK_TYPES.TODO:
            return `- [${block.checked ? "x" : " "}] ${content}`
        case BLOCK_TYPES.QUOTE:
            return `> ${content}`
        case BLOCK_TYPES.CODE:
            return `\`\`\`${block.language || ""}\n${content}\n\`\`\``
        case BLOCK_TYPES.CALLOUT:
            return `:::${block.calloutType || "info"}\n${content}\n:::`
        case BLOCK_TYPES.DIVIDER:
            return "---"
        case BLOCK_TYPES.IMAGE:
            return `![${block.imageCaption || block.content || ""}](${block.imageUrl || ""})`
        case BLOCK_TYPES.CSV:
            return `\`\`\`csv\n${content}\n\`\`\``
        case BLOCK_TYPES.SUBPAGE_LINK:
            return `[📄 ${block.linkedFileName || content}](subpage:${block.linkedFileId})`
        default:
            return content
    }
}
