import React, { useState, useRef, useCallback, useEffect } from "react"
import { Block } from "./Block"
import { SlashMenu } from "./SlashMenu"
import { PageLinkPicker } from "./PageLinkPicker"
import { markdownToBlocks, blocksToMarkdown } from "../../utils/markdownBlocks"
import { BLOCK_TYPES, SLASH_COMMANDS, createBlock } from "../../utils/blockTypes"
import "./blocks.css"

/* ─── Markdown shortcut detection ────────────────────────────────── */
const MD_SHORTCUTS = [
  { pattern: /^### $/, type: BLOCK_TYPES.HEADING_3 },
  { pattern: /^## $/, type: BLOCK_TYPES.HEADING_2 },
  { pattern: /^# $/, type: BLOCK_TYPES.HEADING_1 },
  { pattern: /^[-*] $/, type: BLOCK_TYPES.BULLET_LIST },
  { pattern: /^\d+\. $/, type: BLOCK_TYPES.NUMBERED_LIST },
  { pattern: /^> $/, type: BLOCK_TYPES.QUOTE },
  { pattern: /^```$/, type: BLOCK_TYPES.CODE },
  { pattern: /^---$/, type: BLOCK_TYPES.DIVIDER },
  { pattern: /^- \[ ?\] $/, type: BLOCK_TYPES.TODO },
]

function detectMarkdownShortcut(text) {
  for (const sc of MD_SHORTCUTS) {
    if (sc.pattern.test(text)) return sc.type
  }
  return null
}

/* ─── Undo/redo history (max 50 snapshots) ─── */
const MAX_HISTORY = 50

/* ─── Component ──────────────────────────────────────────────────── */

export function BlockEditor({ initialContent = "", onChange, wikiId, onFileSelect, fileId }) {
  const [blocks, setBlocks] = useState(() => markdownToBlocks(initialContent))
  const [activeBlockId, setActiveBlockId] = useState(blocks[0]?.id)
  const [slashMenu, setSlashMenu] = useState(null)
  const [caretTarget, setCaretTarget] = useState(null) // { blockId, offset }
  const [pageLinkOpen, setPageLinkOpen] = useState(false)
  const [pageLinkBlockId, setPageLinkBlockId] = useState(null)
  const [selectAllStage, setSelectAllStage] = useState(0) // 0=none, 1=block, 2=doc
  const selectAllTimer = useRef(null)

  const rootRef = useRef(null)
  const clipboardRef = useRef(null)

  // Undo/redo stacks
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const skipHistoryRef = useRef(false) // flag to skip push when restoring

  // Push current blocks onto undo stack before a change
  const pushUndo = useCallback((currentBlocks) => {
    if (skipHistoryRef.current) return
    undoStackRef.current.push(JSON.parse(JSON.stringify(currentBlocks)))
    if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift()
    redoStackRef.current = [] // clear redo on new action
  }, [])

  // Persist to parent
  const persist = useCallback(
    (newBlocks) => {
      // Always ensure there is a trailing editable paragraph so the user can
      // continue typing after a non-editable block (image, csv, divider, etc.)
      const NON_EDITABLE = [
        BLOCK_TYPES.IMAGE,
        BLOCK_TYPES.CSV,
        BLOCK_TYPES.DIVIDER,
        BLOCK_TYPES.SUBPAGE_LINK,
      ]
      const last = newBlocks[newBlocks.length - 1]
      const ensured =
        !last || NON_EDITABLE.includes(last.type)
          ? [...newBlocks, createBlock(BLOCK_TYPES.PARAGRAPH)]
          : newBlocks
      setBlocks(ensured)
      onChange?.(blocksToMarkdown(ensured))
    },
    [onChange],
  )

  // Ensure there is always at least one editable block at the end.
  // (Covers cases where blocks are set externally, e.g. initialContent or
  // refetches, and ends with a non-text block.)
  useEffect(() => {
    const last = blocks[blocks.length - 1]
    if (!last || last.type !== BLOCK_TYPES.PARAGRAPH) {
      setBlocks((prev) => {
        const tail = prev[prev.length - 1]
        if (tail && tail.type === BLOCK_TYPES.PARAGRAPH) return prev
        return [...prev, createBlock(BLOCK_TYPES.PARAGRAPH)]
      })
    }
  }, [blocks])

  /* ─── Undo / Redo handlers ─── */
  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return
    const prev = undoStackRef.current.pop()
    // Push current state to redo
    setBlocks((current) => {
      redoStackRef.current.push(JSON.parse(JSON.stringify(current)))
      return prev
    })
    skipHistoryRef.current = true
    onChange?.(blocksToMarkdown(prev))
    skipHistoryRef.current = false
    // Focus the first block
    if (prev.length > 0) {
      setActiveBlockId(prev[0].id)
      setCaretTarget({ blockId: prev[0].id, offset: prev[0].content.length })
    }
  }, [onChange])

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return
    const next = redoStackRef.current.pop()
    setBlocks((current) => {
      undoStackRef.current.push(JSON.parse(JSON.stringify(current)))
      return next
    })
    skipHistoryRef.current = true
    onChange?.(blocksToMarkdown(next))
    skipHistoryRef.current = false
    if (next.length > 0) {
      setActiveBlockId(next[0].id)
      setCaretTarget({ blockId: next[0].id, offset: next[0].content.length })
    }
  }, [onChange])

  // Global keyboard listener for undo/redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if (
        (e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey
      ) {
        e.preventDefault()
        handleRedo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleUndo, handleRedo])

  /* ─── Block content change (fires on every keystroke via onInput) ─── */
  const handleBlockChange = useCallback(
    (blockId, text) => {
      // --- Markdown shortcut auto-conversion ---
      const shortcutType = detectMarkdownShortcut(text)
      if (shortcutType) {
        pushUndo(blocks)
        const newBlocks = blocks.map((b) =>
          b.id === blockId ? { ...b, type: shortcutType, content: "" } : b,
        )
        persist(newBlocks)
        setCaretTarget({ blockId, offset: 0 })
        setActiveBlockId(blockId)
        setSlashMenu(null)
        return
      }

      // Update block content
      pushUndo(blocks)
      const newBlocks = blocks.map((b) =>
        b.id === blockId ? { ...b, content: text } : b,
      )
      persist(newBlocks)

      // --- Slash command detection ---
      const slashIndex = text.lastIndexOf("/")
      if (slashIndex !== -1) {
        const before = text.slice(0, slashIndex)
        if (before === "" || before.endsWith(" ")) {
          const query = text.slice(slashIndex + 1).toLowerCase()
          const el = document.querySelector(`[data-block-id="${blockId}"]`)
          if (el) {
            const rect = el.getBoundingClientRect()
            setSlashMenu({
              blockId,
              query,
              position: { x: rect.left, y: rect.bottom + 4 },
            })
          }
          return
        }
      }
      setSlashMenu(null)
    },
    [blocks, persist, pushUndo],
  )

  /* ─── Enter — split block ─── */
  const handleBlockEnter = useCallback(
    (blockId) => {
      const idx = blocks.findIndex((b) => b.id === blockId)
      if (idx === -1) return
      pushUndo(blocks)
      const block = blocks[idx]

      // Read caret position from the DOM
      const el = document.querySelector(`[data-block-id="${blockId}"] .block-editable`)
      let cursor = block.content.length
      if (el) {
        const sel = window.getSelection()
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0)
          const pre = range.cloneRange()
          pre.selectNodeContents(el)
          pre.setEnd(range.startContainer, range.startOffset)
          cursor = pre.toString().length
        }
      }

      const before = block.content.slice(0, cursor)
      const after = block.content.slice(cursor)

      // List blocks: empty item exits the list; non-empty item continues the list
      const isList = block.type === BLOCK_TYPES.BULLET_LIST || block.type === BLOCK_TYPES.NUMBERED_LIST
      if (isList) {
        if (block.content === "") {
          // Exit list — turn current empty item into a paragraph
          const newBlocks = blocks.map((b) =>
            b.id === blockId ? { ...b, type: BLOCK_TYPES.PARAGRAPH, indent: 0 } : b,
          )
          persist(newBlocks)
          setActiveBlockId(blockId)
          setCaretTarget({ blockId, offset: 0 })
          return
        }
        // Continue list with same type and same indent level
        const newBlock = { ...createBlock(block.type, after), indent: block.indent || 0 }
        const newBlocks = [
          ...blocks.slice(0, idx),
          { ...block, content: before },
          newBlock,
          ...blocks.slice(idx + 1),
        ]
        persist(newBlocks)
        setActiveBlockId(newBlock.id)
        setCaretTarget({ blockId: newBlock.id, offset: 0 })
        return
      }

      const newBlock = createBlock(BLOCK_TYPES.PARAGRAPH, after)

      const newBlocks = [
        ...blocks.slice(0, idx),
        { ...block, content: before },
        newBlock,
        ...blocks.slice(idx + 1),
      ]
      persist(newBlocks)
      setActiveBlockId(newBlock.id)
      setCaretTarget({ blockId: newBlock.id, offset: 0 })
    },
    [blocks, persist, pushUndo],
  )

  /* ─── Backspace at start — merge with previous ─── */
  const handleBlockBackspace = useCallback(
    (blockId) => {
      const idx = blocks.findIndex((b) => b.id === blockId)
      if (idx <= 0) return

      // Don't merge into a SUBPAGE_LINK block (they're protected)
      const prev = blocks[idx - 1]
      if (prev.type === BLOCK_TYPES.SUBPAGE_LINK) return
      // Don't allow backspacing a SUBPAGE_LINK block
      const curr = blocks[idx]
      if (curr.type === BLOCK_TYPES.SUBPAGE_LINK) return

      pushUndo(blocks)
      const joinOffset = prev.content.length
      const merged = prev.content + curr.content

      const newBlocks = [
        ...blocks.slice(0, idx - 1),
        { ...prev, content: merged },
        ...blocks.slice(idx + 1),
      ]
      persist(newBlocks)
      setActiveBlockId(prev.id)
      setCaretTarget({ blockId: prev.id, offset: joinOffset })
    },
    [blocks, persist, pushUndo],
  )

  /* ─── Arrow navigation between blocks ─── */
  const handleArrowUp = useCallback(
    (blockId) => {
      const idx = blocks.findIndex((b) => b.id === blockId)
      if (idx > 0) {
        const prev = blocks[idx - 1]
        setActiveBlockId(prev.id)
        setCaretTarget({ blockId: prev.id, offset: prev.content.length })
      }
    },
    [blocks],
  )

  const handleArrowDown = useCallback(
    (blockId) => {
      const idx = blocks.findIndex((b) => b.id === blockId)
      if (idx < blocks.length - 1) {
        const next = blocks[idx + 1]
        setActiveBlockId(next.id)
        setCaretTarget({ blockId: next.id, offset: 0 })
      }
    },
    [blocks],
  )

  /* ─── Focus ─── */
  const handleBlockFocus = useCallback((blockId) => {
    setActiveBlockId(blockId)
    // Clear caret target on manual focus so we don't override the user's click position
    setCaretTarget(null)
  }, [])

  /* ─── Todo toggle ─── */
  const handleToggleTodo = useCallback(
    (blockId) => {
      pushUndo(blocks)
      const newBlocks = blocks.map((b) =>
        b.id === blockId ? { ...b, checked: !b.checked } : b,
      )
      persist(newBlocks)
    },
    [blocks, persist, pushUndo],
  )

  /* ─── Slash command selection ─── */
  const handleSlashSelect = useCallback(
    (command) => {
      if (!slashMenu) return

      // Special: page-link opens a page picker instead of changing block type inline
      if (command.id === "page-link") {
        setPageLinkBlockId(slashMenu.blockId)
        setPageLinkOpen(true)
        setSlashMenu(null)
        return
      }

      const block = blocks.find((b) => b.id === slashMenu.blockId)
      if (!block) return

      pushUndo(blocks)

      const slashIndex = block.content.lastIndexOf("/")
      const before = block.content.slice(0, slashIndex).trimEnd()

      const loremText =
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."

      const newContent =
        command.id === "lorem" ? `${before} ${loremText}`.trim() : before

      const newBlocks = blocks.map((b) =>
        b.id === slashMenu.blockId
          ? { ...b, type: command.type, content: newContent }
          : b,
      )
      persist(newBlocks)
      setSlashMenu(null)
      setActiveBlockId(slashMenu.blockId)
      setCaretTarget({ blockId: slashMenu.blockId, offset: newContent.length })
    },
    [blocks, slashMenu, persist, pushUndo],
  )

  /* ─── Page link insertion (from picker) ─── */
  const handlePageLinkSelect = useCallback(
    (file) => {
      setPageLinkOpen(false)
      if (!pageLinkBlockId) return
      const idx = blocks.findIndex((b) => b.id === pageLinkBlockId)
      if (idx === -1) return
      pushUndo(blocks)
      const block = blocks[idx]
      // Strip "/link" text that triggered the command
      const slashIndex = block.content.lastIndexOf("/")
      const trimmedContent = slashIndex >= 0
        ? block.content.slice(0, slashIndex).trimEnd()
        : block.content
      const linkBlock = {
        ...createBlock(BLOCK_TYPES.SUBPAGE_LINK),
        linkedFileId: file.fileId,
        linkedFileName: file.name,
      }
      const newBlocks = [
        ...blocks.slice(0, idx),
        { ...block, content: trimmedContent },
        linkBlock,
        ...blocks.slice(idx + 1),
      ]
      persist(newBlocks)
      setPageLinkBlockId(null)
      setActiveBlockId(linkBlock.id)
    },
    [blocks, pageLinkBlockId, persist, pushUndo],
  )

  // Extract imageId from a presigned S3 URL (expected: /wikis/{wikiId}/images/{id}.webp)
  const extractImageIdFromUrl = (url) => {
    if (!url) return null
    try {
      const parsed = new URL(url)
      const pathParts = parsed.pathname.split("/").filter(Boolean)
      const last = pathParts[pathParts.length - 1]
      const match = last.match(/^(.+)\.webp$/)
      return match ? match[1] : null
    } catch {
      return null
    }
  }

  const deleteImageAsset = useCallback(
    async (block) => {
      if (!wikiId || block?.type !== BLOCK_TYPES.IMAGE) return
      const imageId = block.imageId || extractImageIdFromUrl(block.imageUrl)
      if (!imageId) return

      try {
        const { apiClient } = await import("../../services/api")
        await apiClient.deleteImage(wikiId, imageId)
      } catch (err) {
        console.warn("Failed to delete image asset", err)
      }
    },
    [wikiId],
  )

  /* ─── Delete an entire block (e.g. removing a page link) ─── */
  const handleDeleteBlock = useCallback(
    async (blockId) => {
      const block = blocks.find((b) => b.id === blockId)
      if (block?.type === BLOCK_TYPES.IMAGE) {
        // Cleanup in the background — do not block UI updates
        deleteImageAsset(block)
      }

      pushUndo(blocks)
      const newBlocks = blocks.filter((b) => b.id !== blockId)
      // Ensure there's always at least one block
      persist(newBlocks.length > 0 ? newBlocks : [createBlock(BLOCK_TYPES.PARAGRAPH)])
    },
    [blocks, persist, pushUndo, deleteImageAsset],
  )

  /* ─── Indent / outdent (Tab / Shift+Tab on list blocks) ─── */
  const handleIndent = useCallback(
    (blockId, delta) => {
      pushUndo(blocks)
      const newBlocks = blocks.map((b) => {
        if (b.id !== blockId) return b
        const next = Math.max(0, Math.min(4, (b.indent || 0) + delta))
        return { ...b, indent: next }
      })
      persist(newBlocks)
    },
    [blocks, persist, pushUndo],
  )

  /* ─── Change block type (from + menu) ─── */
  const handleChangeType = useCallback(
    (blockId, newType) => {
      const oldBlock = blocks.find((b) => b.id === blockId)
      if (oldBlock?.type === BLOCK_TYPES.IMAGE) {
        deleteImageAsset(oldBlock)
      }
      pushUndo(blocks)
      const newBlocks = blocks.map((b) =>
        b.id === blockId ? { ...b, type: newType } : b,
      )
      persist(newBlocks)
    },
    [blocks, persist, pushUndo, deleteImageAsset],
  )

  /* ─── Image upload handler ─── */
  const handleImageUpload = useCallback(
    async (blockId, file) => {
      if (!wikiId) return

      const currentBlock = blocks.find((b) => b.id === blockId)
      const oldImageId = currentBlock?.imageId || extractImageIdFromUrl(currentBlock?.imageUrl)

      try {
        const { apiClient } = await import("../../services/api")
        const result = await apiClient.uploadImage(wikiId, file)
        // result should contain the image URL + imageId
        const imageId = result.imageId || null
        const url = result.presignedUrl || result.url || result.imageUrl || ""

        pushUndo(blocks)
        const newBlocks = blocks.map((b) =>
          b.id === blockId ? { ...b, imageUrl: url, imageId } : b,
        )
        persist(newBlocks)

        // Clean up old upload (if it’s different)
        if (oldImageId && oldImageId !== imageId) {
          deleteImageAsset({ type: BLOCK_TYPES.IMAGE, imageId: oldImageId })
        }
      } catch (err) {
        console.error("Image upload failed:", err)
        alert("Failed to upload image: " + err.message)
      }
    },
    [blocks, persist, pushUndo, wikiId, deleteImageAsset],
  )

  /* ─── Image URL set handler ─── */
  const handleImageUrlSet = useCallback(
    (blockId, url) => {
      pushUndo(blocks)
      const imageId = extractImageIdFromUrl(url)
      const newBlocks = blocks.map((b) =>
        b.id === blockId ? { ...b, imageUrl: url, imageId } : b,
      )
      persist(newBlocks)
    },
    [blocks, persist, pushUndo],
  )

  /* ─── Compute numbering for numbered lists ─── */
  const getNumberIndex = (idx) => {
    let count = 0
    for (let i = 0; i < idx; i++) {
      if (blocks[i].type === BLOCK_TYPES.NUMBERED_LIST) count++
      else count = 0
    }
    return count
  }

  /* ─── Render ─── */
  const getSelectedBlockIds = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return []
    const range = sel.getRangeAt(0)
    const startNode = range.startContainer
    const endNode = range.endContainer

    const getBlockId = (node) => {
      let cur = node
      while (cur && cur !== rootRef.current) {
        if (cur.dataset && cur.dataset.blockId) return cur.dataset.blockId
        cur = cur.parentElement
      }
      return null
    }

    const startId = getBlockId(startNode)
    const endId = getBlockId(endNode)
    if (!startId || !endId) return []

    const startIdx = blocks.findIndex((b) => b.id === startId)
    const endIdx = blocks.findIndex((b) => b.id === endId)
    if (startIdx === -1 || endIdx === -1) return []

    const [from, to] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
    return blocks.slice(from, to + 1).map((b) => b.id)
  }

  const getCurrentBlockId = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const node = sel.anchorNode || sel.focusNode
    if (!node) return null

    let cur = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
    while (cur && cur !== rootRef.current) {
      if (cur.dataset && cur.dataset.blockId) return cur.dataset.blockId
      cur = cur.parentElement
    }
    return null
  }

  const selectCurrentBlock = () => {
    const blockId = getCurrentBlockId()
    if (!blockId) return

    const el = rootRef.current?.querySelector(`[data-block-id="${blockId}"] .block-editable`) ||
      rootRef.current?.querySelector(`[data-block-id="${blockId}"]`)
    if (!el) return

    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }

  const selectAllDocument = () => {
    const editable = rootRef.current?.querySelectorAll(".block-editable")
    if (!editable || editable.length === 0) return
    const first = editable[0]
    const last = editable[editable.length - 1]
    const range = document.createRange()
    range.setStart(first, 0)
    range.setEnd(last, last.childNodes.length)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }

  const resetSelectAllState = () => {
    setSelectAllStage(0)
    if (selectAllTimer.current) {
      clearTimeout(selectAllTimer.current)
      selectAllTimer.current = null
    }
  }

  return (
    <div
      className="block-editor-root"
      ref={rootRef}
      onKeyDown={(e) => {
        // Cmd/Ctrl + A: 1st press = select current block, 2nd press = select entire document
        if ((e.ctrlKey || e.metaKey) && e.key === "a") {
          e.preventDefault()
          if (selectAllStage === 1) {
            selectAllDocument()
            setSelectAllStage(2)
          } else {
            selectCurrentBlock()
            setSelectAllStage(1)
          }
          selectAllTimer.current = window.setTimeout(resetSelectAllState, 800)
          return
        }

        // Delete/Backspace when whole-document is selected should clear everything
        if (e.key === "Backspace" || e.key === "Delete") {
          const selectedIds = getSelectedBlockIds()
          const hasFullSelection =
            selectAllStage === 2 ||
            (selectedIds.length > 0 && selectedIds.length === blocks.length)

          if (hasFullSelection) {
            e.preventDefault()
            const newBlocks = [createBlock(BLOCK_TYPES.PARAGRAPH)]
            persist(newBlocks)
            setActiveBlockId(newBlocks[0].id)
            resetSelectAllState()
            return
          }

          // If the user used Cmd+A once (current block selection), delete that block
          if (selectAllStage === 1) {
            const currentBlockId = getCurrentBlockId()
            if (currentBlockId) {
              e.preventDefault()
              const remaining = blocks.filter((b) => b.id !== currentBlockId)
              const newBlocks = remaining.length ? remaining : [createBlock(BLOCK_TYPES.PARAGRAPH)]
              persist(newBlocks)
              setActiveBlockId(newBlocks[0].id)
              resetSelectAllState()
              return
            }
          }

          if (selectedIds.length > 1) {
            e.preventDefault()
            const remaining = blocks.filter((b) => !selectedIds.includes(b.id))
            const newBlocks = remaining.length ? remaining : [createBlock(BLOCK_TYPES.PARAGRAPH)]
            persist(newBlocks)
            setActiveBlockId(newBlocks[0].id)
            resetSelectAllState()
          }
        }
      }}
      onCopy={(e) => {
        const selectedIds = getSelectedBlockIds()
        const hasFullSelection =
          selectAllStage === 2 ||
          (selectedIds.length > 0 && selectedIds.length === blocks.length)
        if (!selectedIds.length && !hasFullSelection) return
        e.preventDefault()
        const toCopy = hasFullSelection ? blocks : blocks.filter((b) => selectedIds.includes(b.id))
        e.clipboardData.setData("text/plain", blocksToMarkdown(toCopy))
        resetSelectAllState()
      }}
      onCut={(e) => {
        const selectedIds = getSelectedBlockIds()
        const hasFullSelection =
          selectAllStage === 2 ||
          (selectedIds.length > 0 && selectedIds.length === blocks.length)
        if (!selectedIds.length && !hasFullSelection) return
        e.preventDefault()
        const toCut = hasFullSelection ? blocks : blocks.filter((b) => selectedIds.includes(b.id))
        e.clipboardData.setData("text/plain", blocksToMarkdown(toCut))
        const remaining = blocks.filter((b) => !toCut.includes(b))
        persist(remaining.length ? remaining : [createBlock(BLOCK_TYPES.PARAGRAPH)])
        resetSelectAllState()
      }}
      onPaste={(e) => {
        const target = e.target
        if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
          // Allow normal paste into form inputs (e.g. image URL field)
          return
        }

        e.preventDefault()
        const text = e.clipboardData.getData("text/plain")
        if (!text) return

        const pastedBlocks = markdownToBlocks(text)
        const selectedIds = getSelectedBlockIds()
        const hasFullSelection =
          selectAllStage === 2 ||
          (selectedIds.length > 0 && selectedIds.length === blocks.length)

        // If whole document is selected, replace it fully
        if (hasFullSelection) {
          persist(pastedBlocks)
          return
        }

        // If user has blocks selected, replace them with pasted content.
        if (selectedIds.length) {
          const startId = selectedIds[0]
          const endId = selectedIds[selectedIds.length - 1]
          const startIndex = blocks.findIndex((b) => b.id === startId)
          const endIndex = blocks.findIndex((b) => b.id === endId)
          if (startIndex >= 0 && endIndex >= 0) {
            const newBlocks = [
              ...blocks.slice(0, startIndex),
              ...pastedBlocks,
              ...blocks.slice(endIndex + 1),
            ]
            persist(newBlocks)
            return
          }
        }

        // Otherwise, insert after the active block (or at the end).
        const activeIndex = blocks.findIndex((b) => b.id === activeBlockId)
        if (activeIndex >= 0) {
          const newBlocks = [
            ...blocks.slice(0, activeIndex + 1),
            ...pastedBlocks,
            ...blocks.slice(activeIndex + 1),
          ]
          persist(newBlocks)
          return
        }

        // Fallback: replace whole document
        persist(pastedBlocks)
      }}
    >
      <textarea ref={clipboardRef} style={{ position: "fixed", left: -9999, top: -9999 }} />
      {blocks.map((block, idx) => (
        <Block
          key={block.id}
          block={block}
          isActive={activeBlockId === block.id}
          slashMenuOpen={!!slashMenu && slashMenu.blockId === block.id}
          caretTarget={
            caretTarget && caretTarget.blockId === block.id
              ? caretTarget.offset
              : null
          }
          blockIndex={
            block.type === BLOCK_TYPES.NUMBERED_LIST
              ? getNumberIndex(idx)
              : undefined
          }
          onChange={(text) => handleBlockChange(block.id, text)}
          onEnter={() => handleBlockEnter(block.id)}
          onBackspace={() => handleBlockBackspace(block.id)}
          onFocus={() => handleBlockFocus(block.id)}
          onArrowUp={() => handleArrowUp(block.id)}
          onArrowDown={() => handleArrowDown(block.id)}
          onToggleTodo={() => handleToggleTodo(block.id)}
          onChangeType={handleChangeType}
          onIndent={(delta) => handleIndent(block.id, delta)}
          onDeleteBlock={handleDeleteBlock}
          onImageUpload={handleImageUpload}
          onImageUrlSet={handleImageUrlSet}
          onFileSelect={onFileSelect}
          wikiId={wikiId}
          fileId={fileId}
          isOnlyBlock={blocks.length === 1}
        />
      ))}
      {slashMenu && !pageLinkOpen && (
        <SlashMenu
          query={slashMenu.query}
          position={slashMenu.position}
          onSelect={handleSlashSelect}
          onClose={() => setSlashMenu(null)}
        />
      )}
      <PageLinkPicker
        open={pageLinkOpen}
        wikiId={wikiId}
        onSelect={handlePageLinkSelect}
        onClose={() => { setPageLinkOpen(false); setPageLinkBlockId(null) }}
      />
    </div>
  )
}
