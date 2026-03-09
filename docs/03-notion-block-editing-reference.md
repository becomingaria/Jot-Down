# Notion Block-Based Editing — Reference & Implementation Guide

## How Notion Handles Block-Based Editing

### Core Mental Model

Notion treats every paragraph, heading, list item, image, etc. as an independent **block**. The entire document is an ordered list of blocks. There is no "document body" — only blocks.

```
Document
├── Block (heading1): "My Title"
├── Block (paragraph): "Some text here."
├── Block (bullet_list_item): "First point"
├── Block (bullet_list_item): "Second point"
└── Block (paragraph): ""    ← always has a trailing empty block
```

Each block:

- Has a unique ID
- Has a type (`paragraph`, `heading_1`–`heading_3`, `bulleted_list_item`, `to_do`, `quote`, `code`, etc.)
- Contains **rich text** (an array of text spans with inline formatting)
- May have child blocks (nested content)

---

## Key Editing Behaviors

### 1. Enter — Split the Block

When `Enter` is pressed:

- The block is **split at the cursor position** into two blocks of the same type
- Text before the cursor stays in the current block
- Text after the cursor moves to a new block directly below
- The new block receives focus, cursor at position 0
- **Exception**: inside a code block, `Enter` inserts a newline within the same block (no split)

```
Before Enter (cursor at |):
  Block: "Hello| World"

After Enter:
  Block 1: "Hello"
  Block 2: "World"  ← focus here, cursor at 0
```

### 2. Backspace at Start — Merge With Previous

When `Backspace` is pressed with **cursor at position 0**:

- If the block is **empty**: the block is deleted; cursor moves to the end of the previous block
- If the block has **content**: the block's content is **appended to the end of the previous block**; the current block is removed; cursor lands at the join point

```
Before Backspace (cursor at | start of block 2):
  Block 1: "Hello"
  Block 2: "| World"

After Backspace:
  Block 1: "Hello World"   ← cursor at position 5 (the join point)
```

### 3. Delete at End — Merge With Next

When `Delete` is pressed with **cursor at the end of a block**:

- The **next block's content is pulled up** into the current block
- The next block is removed
- Cursor stays at the original end position (which is now the join point)

### 4. Tab — Indent / Promote to Child

- `Tab` makes the current block a **child** of the block above it (indentation increases)
- `Shift+Tab` promotes (de-nests) the block back to the parent level

### 5. Slash Command (`/`)

- Typing `/` at the beginning of an empty block (or anywhere) opens a **command palette**
- Allows changing block type, inserting media, tables, etc.
- Not implemented in Jot-Down currently but a future enhancement

### 6. Arrow Keys — Navigating Blocks

- `ArrowUp` / `ArrowDown` move caret **vertically across blocks** naturally (if at top line of current block and pressing up → move to previous block; if at bottom line pressing down → move to next block)
- `ArrowLeft` at position 0 → jump to **end** of previous block
- `ArrowRight` at end → jump to **start** of next block

### 7. Single Click to Edit — No Double-Click Required

In Notion, clicking anywhere on a block activates inline editing immediately. There is no separate "view" vs "edit" mode switch. The block content is always in a `contentEditable` div; it just receives focus on click.

### 8. Visual Consistency Across Edit/Display Modes

Because Notion uses `contentEditable` (not a separate `<textarea>`), there is **zero visual shift** between read and edit modes. The rendered layout never reflowing.

In our implementation, we achieve this by:

1. Using an **auto-sizing `<textarea>`** that grows to match its content
2. Matching the textarea's `font-size`, `line-height`, `padding`, and `font-family` exactly to the display div
3. The textarea height = scrollHeight (auto-grow on each keystroke)
4. The display div has `min-height` matching the textarea so there's no collapse

---

## Implementation Rules for Jot-Down

### Block (Canister) Rules

| Action                              | Behavior                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `Enter` (non-Shift)                 | Split block at cursor; new block gets text after cursor; focus new block at pos 0 |
| `Backspace` at pos 0 — empty block  | Delete block; focus previous block at end                                         |
| `Backspace` at pos 0 — with content | Merge content into previous block; delete current; focus join point               |
| `Delete` at end                     | Pull next block content up; delete next block; cursor stays at join               |
| `ArrowUp`                           | If caret at first line → focus previous block at end                              |
| `ArrowDown`                         | If caret at last line → focus next block at start                                 |
| `ArrowLeft` at 0                    | Focus previous block at end                                                       |
| `ArrowRight` at end                 | Focus next block at start                                                         |
| `Tab`                               | Insert 4 spaces (future: indent block)                                            |
| Single click                        | Immediately enter edit mode, no double-click needed                               |
| `Escape`                            | Blur current block (exit edit mode)                                               |

### Auto-Sizing Textarea

```jsx
// On every change:
textarea.style.height = "auto"
textarea.style.height = textarea.scrollHeight + "px"
```

The textarea must have:

- `overflow: hidden` — no visible scrollbar
- `resize: none` — no resize handle
- Same `font-size`, `line-height`, `padding` as the display div
- `min-height` of one line (e.g. 24px)

### Cursor Positioning After Operations

When merging blocks, we need to pass the exact cursor position to the newly-focused block:

- **Merge**: cursor = `previousBlock.content.length` (before appending)
- **Split**: new block cursor = 0
- **Delete empty**: cursor = `previousBlock.content.length`
- **Delete at end**: cursor = `currentBlock.content.length` (unchanged visually)

This is achieved via a `focusCaret` prop that the parent passes to the target canister after a merge/split operation.

---

## What Makes This Seamless

1. **No mode toggle**: the textarea is always rendered; `isEditing` just controls whether it has focus
2. **Pixel-perfect heights**: auto-resize keeps the textarea the same height as its content
3. **Instant focus**: all block focus operations use `requestAnimationFrame` or `setTimeout(0)` to place the cursor after the DOM updates
4. **Smooth merge/split**: after state updates, a `caretTarget` state guides cursor placement in the new focused block

---

## Future Enhancements (Not Yet Implemented)

- **Slash command** `/` palette for block type switching
- **Block type**: a `type` field per canister (`paragraph`, `h1`–`h3`, `bullet`, `quote`, `code`)
- **Nested blocks**: child canister arrays for indented content
- **Drag handle on hover**: show `⠿` drag icon on left side when hovering
- **Block context menu**: right-click for color, duplicate, delete, turn into
- **Inline image blocks**: a canister type that renders an uploaded image
