import { nanoid } from "nanoid"

export const BLOCK_TYPES = {
    PARAGRAPH: "paragraph",
    HEADING_1: "heading_1",
    HEADING_2: "heading_2",
    HEADING_3: "heading_3",
    BULLET_LIST: "bulleted_list_item",
    NUMBERED_LIST: "numbered_list_item",
    TODO: "to_do",
    QUOTE: "quote",
    CODE: "code",
    CALLOUT: "callout",
    DIVIDER: "divider",
    IMAGE: "image",
    CSV: "csv",
    SUBPAGE_LINK: "subpage_link",
}

export const SLASH_COMMANDS = [
    {
        id: "text",
        type: BLOCK_TYPES.PARAGRAPH,
        label: "Text",
        description: "Plain text",
        icon: "T",
        keywords: ["text", "paragraph", "plain", "normal"],
    },
    {
        id: "page-link",
        type: BLOCK_TYPES.SUBPAGE_LINK, // intercepted specially by BlockEditor
        label: "Link to Page",
        description: "Insert a link to another wiki page",
        icon: "🔗",
        keywords: ["link", "page", "reference", "connect", "wiki"],
    },
    {
        id: "h1",
        type: BLOCK_TYPES.HEADING_1,
        label: "Heading 1",
        description: "Big section heading",
        icon: "H1",
        keywords: ["heading", "h1", "title"],
    },
    {
        id: "h2",
        type: BLOCK_TYPES.HEADING_2,
        label: "Heading 2",
        description: "Medium section heading",
        icon: "H2",
        keywords: ["heading", "h2", "subtitle"],
    },
    {
        id: "h3",
        type: BLOCK_TYPES.HEADING_3,
        label: "Heading 3",
        description: "Small section heading",
        icon: "H3",
        keywords: ["heading", "h3"],
    },
    {
        id: "bullet",
        type: BLOCK_TYPES.BULLET_LIST,
        label: "Bulleted List",
        description: "Create a simple list",
        icon: "•",
        keywords: ["bullet", "list", "ul"],
    },
    {
        id: "numbered",
        type: BLOCK_TYPES.NUMBERED_LIST,
        label: "Numbered List",
        description: "Create an ordered list",
        icon: "1.",
        keywords: ["numbered", "list", "ol", "ordered"],
    },
    {
        id: "todo",
        type: BLOCK_TYPES.TODO,
        label: "To-do List",
        description: "Track tasks with checkboxes",
        icon: "☐",
        keywords: ["todo", "checkbox", "task"],
    },
    {
        id: "quote",
        type: BLOCK_TYPES.QUOTE,
        label: "Quote",
        description: "Capture a quote",
        icon: '"',
        keywords: ["quote", "blockquote"],
    },
    {
        id: "code",
        type: BLOCK_TYPES.CODE,
        label: "Code",
        description: "Code snippet with syntax highlighting",
        icon: "</>",
        keywords: ["code", "snippet", "pre"],
    },
    {
        id: "callout",
        type: BLOCK_TYPES.CALLOUT,
        label: "Callout",
        description: "Make your text stand out",
        icon: "💡",
        keywords: ["callout", "note", "alert"],
    },
    {
        id: "divider",
        type: BLOCK_TYPES.DIVIDER,
        label: "Divider",
        description: "Visually divide blocks",
        icon: "—",
        keywords: ["divider", "separator", "hr"],
    },
    {
        id: "image",
        type: BLOCK_TYPES.IMAGE,
        label: "Image",
        description: "Upload or embed an image",
        icon: "🖼️",
        keywords: ["image", "picture", "photo", "img"],
    },
    {
        id: "csv",
        type: BLOCK_TYPES.CSV,
        label: "CSV Table",
        description: "Embed a CSV table",
        icon: "📊",
        keywords: ["csv", "table", "spreadsheet", "data"],
    },
]

export function createBlock(type = BLOCK_TYPES.PARAGRAPH, content = "") {
    return {
        id: nanoid(),
        type,
        content,
        checked: type === BLOCK_TYPES.TODO ? false : undefined,
        language: type === BLOCK_TYPES.CODE ? "javascript" : undefined,
        calloutType: type === BLOCK_TYPES.CALLOUT ? "info" : undefined,
        imageUrl: type === BLOCK_TYPES.IMAGE ? "" : undefined,
        imageCaption: type === BLOCK_TYPES.IMAGE ? "" : undefined,
        linkedFileId: type === BLOCK_TYPES.SUBPAGE_LINK ? "" : undefined,
        linkedFileName: type === BLOCK_TYPES.SUBPAGE_LINK ? "" : undefined,
    }
}

export function blockToMarkdown(block) {
    switch (block.type) {
        case BLOCK_TYPES.HEADING_1:
            return `# ${block.content}`
        case BLOCK_TYPES.HEADING_2:
            return `## ${block.content}`
        case BLOCK_TYPES.HEADING_3:
            return `### ${block.content}`
        case BLOCK_TYPES.BULLET_LIST:
            return `- ${block.content}`
        case BLOCK_TYPES.NUMBERED_LIST:
            return `1. ${block.content}`
        case BLOCK_TYPES.TODO:
            return `- [${block.checked ? "x" : " "}] ${block.content}`
        case BLOCK_TYPES.QUOTE:
            return `> ${block.content}`
        case BLOCK_TYPES.CODE:
            return `\`\`\`${block.language || ""}\n${block.content}\n\`\`\``
        case BLOCK_TYPES.CALLOUT:
            return `:::${block.calloutType || "info"}\n${block.content}\n:::`
        case BLOCK_TYPES.DIVIDER:
            return "---"
        case BLOCK_TYPES.IMAGE:
            return `![${block.imageCaption || block.content || ""}](${block.imageUrl || ""})`
        case BLOCK_TYPES.CSV:
            return `\`\`\`csv\n${block.content}\n\`\`\``
        case BLOCK_TYPES.SUBPAGE_LINK:
            return `[📄 ${block.linkedFileName || block.content}](subpage:${block.linkedFileId})`
        default:
            return block.content
    }
}

export function blocksToMarkdown(blocks) {
    return blocks.map(blockToMarkdown).join("\n\n")
}

export function markdownToBlocks(markdown) {
    if (!markdown) return [createBlock()]

    const lines = markdown.split("\n")
    const blocks = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i]

        // Skip empty lines
        if (!line.trim()) {
            i++
            continue
        }

        // Heading 1
        if (line.startsWith("# ")) {
            blocks.push(createBlock(BLOCK_TYPES.HEADING_1, line.slice(2)))
            i++
        }
        // Heading 2
        else if (line.startsWith("## ")) {
            blocks.push(createBlock(BLOCK_TYPES.HEADING_2, line.slice(3)))
            i++
        }
        // Heading 3
        else if (line.startsWith("### ")) {
            blocks.push(createBlock(BLOCK_TYPES.HEADING_3, line.slice(4)))
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
        else if (line.startsWith("- ")) {
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
        // Quote
        else if (line.startsWith("> ")) {
            blocks.push(createBlock(BLOCK_TYPES.QUOTE, line.slice(2)))
            i++
        }
        // Code block
        else if (line.startsWith("```")) {
            const language = line.slice(3).trim()
            i++
            let codeContent = []
            while (i < lines.length && !lines[i].startsWith("```")) {
                codeContent.push(lines[i])
                i++
            }
            const block = createBlock(BLOCK_TYPES.CODE, codeContent.join("\n"))
            block.language = language
            blocks.push(block)
            i++ // skip closing ```
        }
        // Callout
        else if (line.startsWith(":::")) {
            const calloutType = line.slice(3).trim()
            i++
            let calloutContent = []
            while (i < lines.length && !lines[i].startsWith(":::")) {
                calloutContent.push(lines[i])
                i++
            }
            const block = createBlock(
                BLOCK_TYPES.CALLOUT,
                calloutContent.join("\n"),
            )
            block.calloutType = calloutType
            blocks.push(block)
            i++ // skip closing :::
        }
        // Divider
        else if (line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
            blocks.push(createBlock(BLOCK_TYPES.DIVIDER, ""))
            i++
        }
        // Paragraph
        else {
            blocks.push(createBlock(BLOCK_TYPES.PARAGRAPH, line))
            i++
        }
    }

    // Always have at least one block
    if (blocks.length === 0) {
        blocks.push(createBlock())
    }

    return blocks
}
