import React, { useRef, useEffect, useCallback, useState } from "react"
import { BLOCK_TYPES, SLASH_COMMANDS } from "../../utils/blockTypes"
import { applyInlineMarkdown, markdownInlineToHtml } from "../../utils/inlineMarkdown"
import { CsvBlock } from "./CsvBlock"

/* ──────────── helpers ──────────── */

/**
 * Wrap the current text selection inside `el` with an HTML element of `tag`.
 * Returns true if a non-collapsed selection was wrapped, false otherwise.
 * Used for inline formatting shortcuts (Cmd+B, Cmd+I, etc.).
 */
function wrapSelectionWithTag(el, tag) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false
  const range = sel.getRangeAt(0)
  // Ensure the selection is actually inside this element
  if (!el.contains(range.commonAncestorContainer)) return false
  const selectedText = range.toString()
  if (!selectedText) return false
  range.deleteContents()
  const node = document.createElement(tag)
  node.textContent = selectedText
  range.insertNode(node)
  // Place caret just after the newly inserted element
  const newRange = document.createRange()
  newRange.setStartAfter(node)
  newRange.collapse(true)
  sel.removeAllRanges()
  sel.addRange(newRange)
  return true
}

/**
 * Serialize the innerHTML of a contentEditable element back to markdown inline syntax.
 * Inverse of markdownInlineToHtml. Used so that Cmd+B / applyInlineMarkdown
 * changes are persisted in the block's content string rather than stripped.
 */
function innerHtmlToMarkdown(el) {
  function nodeToMd(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      // Strip zero-width spaces inserted by applyInlineMarkdown
      return node.textContent.replace(/\u200B/g, "")
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ""
    const inner = Array.from(node.childNodes).map(nodeToMd).join("")
    switch (node.tagName.toUpperCase()) {
      case "STRONG": case "B": return `**${inner}**`
      case "EM": case "I": return `*${inner}*`
      case "S": return `~~${inner}~~`
      case "CODE": return `\`${inner}\``
      case "MARK": return `==${inner}==`
      case "U": return `<u>${inner}</u>`
      case "BR": return "\n"
      default: return inner
    }
  }
  return Array.from(el.childNodes).map(nodeToMd).join("").replace(/\u200B/g, "")
}

const INLINE_FORMAT_KEYS = {
  b: "strong",
  i: "em",
  u: "u",
  e: "code",
}

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
  fileId,
  isOnlyBlock,
  remoteCursors,  // array of { blockId, offset, color, email } for this block
}) {
  const ref = useRef(null)
  const imageCaptionRef = useRef(null)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [imageSize, setImageSize] = useState(null)
  const typeMenuRef = useRef(null)
  const plusBtnRef = useRef(null)
  const [menuAnchor, setMenuAnchor] = useState(null) // { top, left } for fixed-position menu

  useEffect(() => {
    if (block.type !== BLOCK_TYPES.IMAGE) {
      setImageSize(null)
      return
    }

    if (!fileId || !block.imageUrl) {
      setImageSize(null)
      return
    }

    try {
      const saved = localStorage.getItem(`jd:image-size:${wikiId}:${fileId}:${block.imageUrl}`)
      setImageSize(saved ? JSON.parse(saved) : null)
    } catch {
      setImageSize(null)
    }
  }, [block.type, block.imageUrl, fileId, wikiId])

  /* ---- Render remote cursors as fixed-position overlays on document.body ---- */
  useEffect(() => {
    const blockId = block.id
    const cleanup = () =>
      document.querySelectorAll(`.collab-cursor[data-block="${blockId}"]`).forEach(el => el.remove())
    cleanup()

    if (!remoteCursors?.length || !ref.current) return cleanup

    for (const cursor of remoteCursors) {
      const editable = ref.current
      const range = document.createRange()
      const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT)
      let count = 0, placed = false, node = walker.nextNode()
      while (node) {
        const len = node.textContent.length
        if (count + len >= cursor.offset) {
          range.setStart(node, cursor.offset - count)
          range.collapse(true)
          placed = true
          break
        }
        count += len
        node = walker.nextNode()
      }
      if (!placed) { range.selectNodeContents(editable); range.collapse(false) }

      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue

      const caret = document.createElement('div')
      caret.className = 'collab-cursor'
      caret.setAttribute('data-block', blockId)
      caret.style.cssText = [
        'position:fixed',
        `left:${rect.left}px`,
        `top:${rect.top}px`,
        'width:2px',
        `height:${Math.max(rect.height, 18)}px`,
        `background:${cursor.color}`,
        'pointer-events:none',
        'z-index:9999',
        'border-radius:1px',
      ].join(';')

      const label = document.createElement('span')
      label.style.cssText = [
        'position:absolute',
        'top:-18px',
        'left:0',
        `background:${cursor.color}`,
        'color:#fff',
        'font-size:10px',
        'font-family:sans-serif',
        'padding:1px 4px',
        'border-radius:3px 3px 3px 0',
        'white-space:nowrap',
      ].join(';')
      label.textContent = cursor.email?.split('@')[0] || 'user'
      caret.appendChild(label)
      document.body.appendChild(caret)
    }

    return cleanup
  }, [remoteCursors, block.id, block.content])

  /* ---- Sync DOM text from React state (only when content changes externally,
          e.g. after merge/split/slash-select) ---- */
  useEffect(() => {
    if (!ref.current) return
    if (block.type === BLOCK_TYPES.CODE) {
      // Code blocks stay as plain text — no inline HTML
      if (ref.current.textContent !== block.content) {
        ref.current.textContent = block.content
      }
    } else {
      const expectedHtml = markdownInlineToHtml(block.content)
      if (ref.current.innerHTML !== expectedHtml) {
        // Only update the DOM if the content genuinely differs.
        // During normal typing markdownInlineToHtml(block.content) === ref.current.innerHTML
        // (they are inverses of each other), so this is a no-op on every keystroke.
        // After a slash command the content is cleared (e.g. "/" → "") while the DOM
        // still shows "/" — the mismatch triggers the update and clears it correctly.
        ref.current.innerHTML = expectedHtml
      }
    }
  }, [block.content, block.id, block.type])

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

    // Code blocks: always plain text, no inline formatting
    if (block.type === BLOCK_TYPES.CODE) {
      onChange(ref.current.textContent)
      return
    }

    // Try inline markdown conversion (e.g. **bold** → <strong>bold</strong>)
    applyInlineMarkdown(ref.current)
    // Serialize innerHTML back to markdown so formatting is preserved in block.content
    onChange(innerHtmlToMarkdown(ref.current))
  }, [onChange, block.type])

  /* ---- Blur — final sync ---- */
  const handleBlur = useCallback(() => {
    if (ref.current) {
      onChange(block.type === BLOCK_TYPES.CODE
        ? ref.current.textContent
        : innerHtmlToMarkdown(ref.current))
    }
  }, [onChange, block.type])

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

      // Inline formatting shortcuts: Cmd/Ctrl + B/I/U/E
      // Skip for code blocks \u2014 they stay plain text
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && block.type !== BLOCK_TYPES.CODE) {
        const tag = INLINE_FORMAT_KEYS[e.key.toLowerCase()]
        if (tag && ref.current) {
          e.preventDefault()
          wrapSelectionWithTag(ref.current, tag)
          onChange(innerHtmlToMarkdown(ref.current))
          return
        }
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
        setMenuAnchor(null)
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
          ref={plusBtnRef}
          contentEditable={false}
          tabIndex={-1}
          title="Change block type"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!showTypeMenu && plusBtnRef.current) {
              const rect = plusBtnRef.current.getBoundingClientRect()
              const estimatedMenuH = 290
              const spaceBelow = window.innerHeight - rect.bottom - 8
              const top = spaceBelow >= estimatedMenuH
                ? rect.bottom + 4
                : Math.max(8, rect.top - estimatedMenuH)
              setMenuAnchor({ top, left: rect.left })
            } else {
              setMenuAnchor(null)
            }
            setShowTypeMenu((prev) => !prev)
          }}
        >+</button>
        {showTypeMenu && menuAnchor && (
          <div
            className="block-type-menu"
            ref={typeMenuRef}
            style={{ position: "fixed", top: menuAnchor.top, left: menuAnchor.left }}
          >
            {SLASH_COMMANDS.map((cmd) => (
              <button
                key={cmd.id}
                className={`block-type-menu-item ${block.type === cmd.type ? "active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setShowTypeMenu(false)
                  setMenuAnchor(null)
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
    const saveImageSize = (size) => {
      if (!fileId || !block.imageUrl) return
      try {
        localStorage.setItem(
          `jd:image-size:${wikiId}:${fileId}:${block.imageUrl}`,
          JSON.stringify(size),
        )
      } catch { }
    }

    const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

    const resizeImage = (delta) => {
      const current = imageSize || { width: null, height: null }
      const base = current.width || 0
      const newSize = clamp(base + delta, 64, 2000)
      const ratio = current.width && current.height ? current.height / current.width : 1
      const updated = { width: newSize, height: Math.round(newSize * ratio) }
      setImageSize(updated)
      saveImageSize(updated)
    }

    const resetSize = () => {
      setImageSize(null)
      if (fileId && block.imageUrl) {
        try { localStorage.removeItem(`jd:image-size:${wikiId}:${fileId}:${block.imageUrl}`) } catch { }
      }
    }

    return (
      <div
        className="block-container block-image"
        data-block-id={block.id}
        tabIndex={0}
        onClick={onFocus}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (e.key === "Backspace" || e.key === "Delete") {
            // Only delete when the caption isn't focused (to allow editing it)
            if (document.activeElement !== imageCaptionRef.current) {
              e.preventDefault()
              onDeleteBlock?.(block.id)
            }
          }
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {renderPlusButton()}
        {block.imageUrl ? (
          <div className="block-image-wrapper">
            <div className="block-image-toolbar">
              <button
                className="block-image-tool"
                title="Smaller"
                onClick={(e) => { e.stopPropagation(); resizeImage(-20) }}
              >
                −
              </button>
              <button
                className="block-image-tool"
                title="Larger"
                onClick={(e) => { e.stopPropagation(); resizeImage(20) }}
              >
                +
              </button>
              <button
                className="block-image-tool"
                title="Reset size"
                onClick={(e) => { e.stopPropagation(); resetSize() }}
              >
                ⟳
              </button>
            </div>
            <img
              src={block.imageUrl}
              alt={block.imageCaption || ""}
              className="block-image-img"
              style={{
                width: imageSize?.width ? `${imageSize.width}px` : "auto",
                height: imageSize?.height ? `${imageSize.height}px` : "auto",
                maxWidth: "100%",
                minWidth: 64,
                minHeight: 64,
              }}
            />
            <div
              className="block-image-caption block-editable"
              ref={(el) => { ref.current = el; imageCaptionRef.current = el }}
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
        data-placeholder={
          // Show the slash command hint only when:
          // 1) this is the only block in the page, OR
          // 2) the user hovers over an empty block
          block.type === BLOCK_TYPES.PARAGRAPH &&
            (!block.content || block.content.trim() === "") &&
            (isOnlyBlock || hovered)
            ? "Type '/' for commands…"
            : placeholderFor(block.type)
        }
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
      return " "
  }
}
