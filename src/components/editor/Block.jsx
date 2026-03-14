import React, { useRef, useEffect, useCallback, useState } from "react"
import { BLOCK_TYPES, SLASH_COMMANDS } from "../../utils/blockTypes"
import { applyInlineMarkdown } from "../../utils/inlineMarkdown"
import { CsvBlock } from "./CsvBlock"

/* ──────────── helpers ──────────── */

/** Get the caret offset (number of characters from the start of the node). */
function getCaretOffset(el) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  const pre = range.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().length
}

/** Set the caret to a specific character offset inside a node. */
function setCaretOffset(el, offset) {
  const range = document.createRange()
  const sel = window.getSelection()
  // Walk text nodes to find the right one
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null)
  let charCount = 0
  let node = walker.nextNode()
  while (node) {
    const nextCount = charCount + node.textContent.length
    if (offset <= nextCount) {
      range.setStart(node, offset - charCount)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    charCount = nextCount
    node = walker.nextNode()
  }
  // If we fell through, place at end
  range.selectNodeContents(el)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** CSS class name for block type */
function blockTypeClass(type) {
  switch (type) {
    case BLOCK_TYPES.HEADING_1:
      return "block-heading-1"
    case BLOCK_TYPES.HEADING_2:
      return "block-heading-2"
    case BLOCK_TYPES.HEADING_3:
      return "block-heading-3"
    case BLOCK_TYPES.BULLET_LIST:
      return "block-bullet"
    case BLOCK_TYPES.NUMBERED_LIST:
      return "block-numbered"
    case BLOCK_TYPES.TODO:
      return "block-todo"
    case BLOCK_TYPES.QUOTE:
      return "block-quote"
    case BLOCK_TYPES.CODE:
      return "block-code"
    case BLOCK_TYPES.CALLOUT:
      return "block-callout"
    case BLOCK_TYPES.DIVIDER:
      return "block-divider"
    case BLOCK_TYPES.IMAGE:
      return "block-image"
    case BLOCK_TYPES.CSV:
      return "block-csv"
    case BLOCK_TYPES.SUBPAGE_LINK:
      return "block-subpage-link"
    default:
      return "block-paragraph"
  }
}

/* ──────────── component ──────────── */

export function Block({
  block,
  isActive,
  onChange,
  onEnter,
  onBackspace,
  onFocus,
  onArrowUp,
  onArrowDown,
  slashMenuOpen,
  caretTarget,    // number | null — where to place the caret after merge/split
  blockIndex,     // for numbered lists
  onToggleTodo,
  onChangeType,   // (blockId, newType) — from the hover + menu
  onIndent,       // (delta: +1|-1) — Tab / Shift+Tab indent for list blocks
  onDeleteBlock,  // (blockId) — remove entire block (e.g. page links)
  onImageUpload,  // (blockId, file) — handle image upload
  onImageUrlSet,  // (blockId, url) — set image url directly
  onFileSelect,   // (fileId) — navigate to a subpage
  wikiId,
}) {
  const ref = useRef(null)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [hovered, setHovered] = useState(false)
  const typeMenuRef = useRef(null)

  /* ---- Sync DOM text from React state (only when we gain focus or content
          is changed externally, e.g. after merge/split/slash-select) ---- */
  useEffect(() => {
    if (!ref.current) return
    // Only overwrite DOM when it differs from React state to avoid clobbering
    // an in-progress edit.
    if (ref.current.textContent !== block.content) {
      ref.current.textContent = block.content
    }
  }, [block.content, block.id])

  /* ---- Focus management ---- */
  useEffect(() => {
    if (!isActive || !ref.current) return
    // Don't steal focus if we already have it
    if (document.activeElement !== ref.current) {
      ref.current.focus()
    }
    // Place caret at target position (after merge/split) or end
    if (caretTarget != null) {
      setCaretOffset(ref.current, caretTarget)
    }
  }, [isActive, block.id, caretTarget])

  /* ---- Input handler — fires on every keystroke to support slash detection
     and inline markdown auto-formatting ---- */
  const handleInput = useCallback(() => {
    if (!ref.current) return

    // Try inline markdown conversion (e.g. **bold** → <strong>bold</strong>)
    // Skip for code blocks — they should stay plain text
    if (block.type !== BLOCK_TYPES.CODE) {
      const replaced = applyInlineMarkdown(ref.current)
      if (replaced) {
        // Content changed via innerHTML — report the plain-text version
        onChange(ref.current.textContent)
        return
      }
    }

    onChange(ref.current.textContent)
  }, [onChange, block.type])

  /* ---- Blur — final sync ---- */
  const handleBlur = useCallback(() => {
    if (ref.current) {
      onChange(ref.current.textContent)
    }
  }, [onChange])

  /* ---- Keyboard ---- */
  const handleKeyDown = useCallback(
    (e) => {
      // If slash menu is open, let the SlashMenu capture-phase listener handle
      // ArrowUp, ArrowDown, Enter, Escape — block default contentEditable behaviour.
      if (slashMenuOpen) {
        if (
          e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "Enter" ||
          e.key === "Escape"
        ) {
          e.preventDefault()
          return // SlashMenu handles it via capture phase
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        onEnter()
        return
      }

      // Tab / Shift+Tab — indent/outdent list items
      if (e.key === "Tab") {
        const isList = block.type === BLOCK_TYPES.BULLET_LIST || block.type === BLOCK_TYPES.NUMBERED_LIST
        if (isList) {
          e.preventDefault()
          onIndent?.(e.shiftKey ? -1 : +1)
          return
        }
      }

      if (e.key === "Backspace") {
        const offset = getCaretOffset(ref.current)
        if (offset === 0 && window.getSelection()?.isCollapsed) {
          e.preventDefault()
          onBackspace()
          return
        }
      }

      // Arrow key block navigation
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        const offset = getCaretOffset(ref.current)
        if (offset === 0 && window.getSelection()?.isCollapsed) {
          e.preventDefault()
          onArrowUp?.()
        }
      }

      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        const len = (ref.current?.textContent || "").length
        const offset = getCaretOffset(ref.current)
        if (offset >= len && window.getSelection()?.isCollapsed) {
          e.preventDefault()
          onArrowDown?.()
        }
      }
    },
    [slashMenuOpen, onEnter, onBackspace, onArrowUp, onArrowDown, onIndent, block.type],
  )

  /* ---- Close type menu on outside click ---- */
  useEffect(() => {
    if (!showTypeMenu) return
    const handleClick = (e) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target)) {
        setShowTypeMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [showTypeMenu])

  /* ---- Plus button for changing block type ---- */
  // Declared as a function (not const) so it is hoisted above all early-return
  // paths that call it — avoids the TDZ ReferenceError regardless of order.
  function renderPlusButton() {
    return (
      <div
        className="block-plus-wrapper"
        style={showTypeMenu ? { visibility: "visible", opacity: 1 } : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); if (!showTypeMenu) setShowTypeMenu(false) }}
      >
        <button
          className="block-plus-btn"
          contentEditable={false}
          tabIndex={-1}
          title="Change block type"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setShowTypeMenu((prev) => !prev)
          }}
        >+</button>
        {showTypeMenu && (
          <div className="block-type-menu" ref={typeMenuRef}>
            {SLASH_COMMANDS.map((cmd) => (
              <button
                key={cmd.id}
                className={`block-type-menu-item ${block.type === cmd.type ? "active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setShowTypeMenu(false)
                  if (onChangeType) onChangeType(block.id, cmd.type)
                }}
              >
                <span className="block-type-menu-icon">{cmd.icon}</span>
                <span className="block-type-menu-label">{cmd.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  /* ---- Subpage link blocks are non-editable ---- */
  if (block.type === BLOCK_TYPES.SUBPAGE_LINK) {
    return (
      <div
        className="block-container block-subpage-link"
        data-block-id={block.id}
        tabIndex={0}
        onClick={() => {
          if (block.linkedFileId && onFileSelect) {
            onFileSelect(block.linkedFileId)
          }
        }}
        onFocus={onFocus}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span className="block-subpage-icon" contentEditable={false}>📄</span>
        <span className="block-subpage-name">{block.linkedFileName || block.content}</span>
        <button
          className="block-subpage-delete"
          title="Remove link"
          onClick={(e) => {
            e.stopPropagation()
            onDeleteBlock?.(block.id)
          }}
        >
          ×
        </button>
      </div>
    )
  }

  /* ---- Divider blocks are non-editable ---- */
  if (block.type === BLOCK_TYPES.DIVIDER) {
    return (
      <div
        className="block-container block-divider"
        data-block-id={block.id}
        tabIndex={0}
        onClick={onFocus}
        onFocus={onFocus}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {renderPlusButton()}
        <hr />
      </div>
    )
  }

  /* ---- Image blocks ---- */
  if (block.type === BLOCK_TYPES.IMAGE) {
    return (
      <div
        className="block-container block-image"
        data-block-id={block.id}
        tabIndex={0}
        onClick={onFocus}
        onFocus={onFocus}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {renderPlusButton()}
        {block.imageUrl ? (
          <div className="block-image-wrapper">
            <img src={block.imageUrl} alt={block.imageCaption || ""} className="block-image-img" />
            <div
              className="block-image-caption block-editable"
              ref={ref}
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Add a caption…"
              onInput={() => {
                if (ref.current) onChange(ref.current.textContent)
              }}
              onBlur={() => {
                if (ref.current) onChange(ref.current.textContent)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnter() }
                if (e.key === "Backspace" && ref.current?.textContent === "" && !block.imageUrl) { e.preventDefault(); onBackspace() }
              }}
            />
          </div>
        ) : (
          <div className="block-image-placeholder">
            <label className="block-image-upload-label">
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file && onImageUpload) onImageUpload(block.id, file)
                }}
              />
              <span className="block-image-upload-btn">Upload Image</span>
            </label>
            <span className="block-image-or">or</span>
            <input
              type="text"
              className="block-image-url-input"
              placeholder="Paste image URL…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  if (onImageUrlSet && e.target.value) onImageUrlSet(block.id, e.target.value)
                }
              }}
            />
          </div>
        )}
      </div>
    )
  }

  /* ---- CSV blocks ---- */
  if (block.type === BLOCK_TYPES.CSV) {
    return (
      <div
        className="block-container block-csv"
        data-block-id={block.id}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {renderPlusButton()}
        <CsvBlock block={block} onChange={onChange} onFocus={onFocus} />
      </div>
    )
  }

  /* ---- Render ---- */
  const typeClass = blockTypeClass(block.type)
  const indentStyle = (block.type === BLOCK_TYPES.BULLET_LIST || block.type === BLOCK_TYPES.NUMBERED_LIST)
    ? { paddingLeft: `${(block.indent || 0) * 24}px` }
    : undefined

  return (
    <div
      className={`block-container ${typeClass}`}
      data-block-id={block.id}
      style={indentStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={(e) => {
        // Only hide if the mouse isn't moving into the plus wrapper
        const relTarget = e.relatedTarget
        if (relTarget && e.currentTarget.contains(relTarget)) return
        setHovered(false)
        setShowTypeMenu(false)
      }}
    >
      {renderPlusButton()}
      {/* Bullet / number / todo prefix */}
      {block.type === BLOCK_TYPES.BULLET_LIST && (
        <span className="block-prefix" contentEditable={false}>•</span>
      )}
      {block.type === BLOCK_TYPES.NUMBERED_LIST && (
        <span className="block-prefix" contentEditable={false}>{(blockIndex ?? 0) + 1}.</span>
      )}
      {block.type === BLOCK_TYPES.TODO && (
        <span className="block-prefix" contentEditable={false}>
          <input
            type="checkbox"
            checked={!!block.checked}
            onChange={() => onToggleTodo?.()}
            tabIndex={-1}
          />
        </span>
      )}
      {block.type === BLOCK_TYPES.CALLOUT && (
        <span className="block-prefix callout-icon" contentEditable={false}>💡</span>
      )}

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        className="block-editable"
        data-placeholder={placeholderFor(block.type)}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={onFocus}
        role="textbox"
        aria-label={`${block.type} block`}
      />
    </div>
  )
}

function placeholderFor(type) {
  switch (type) {
    case BLOCK_TYPES.HEADING_1:
      return "Heading 1"
    case BLOCK_TYPES.HEADING_2:
      return "Heading 2"
    case BLOCK_TYPES.HEADING_3:
      return "Heading 3"
    case BLOCK_TYPES.BULLET_LIST:
    case BLOCK_TYPES.NUMBERED_LIST:
      return "List"
    case BLOCK_TYPES.TODO:
      return "To-do"
    case BLOCK_TYPES.QUOTE:
      return "Quote"
    case BLOCK_TYPES.CODE:
      return "Code"
    case BLOCK_TYPES.CALLOUT:
      return "Type something…"
    case BLOCK_TYPES.IMAGE:
      return "Image caption"
    case BLOCK_TYPES.CSV:
      return "Paste CSV data"
    case BLOCK_TYPES.SUBPAGE_LINK:
      return ""
    default:
      return "Type '/' for commands…"
  }
}
