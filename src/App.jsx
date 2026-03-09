import React, { useState, useEffect, useRef, useCallback } from 'react'

// Helper function to process markdown content for display
const processLineMarkdown = (content) => {
  if (!content) return ''

  let processed = content

  // Bold **text**
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

  // Italic *text*
  processed = processed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')

  // Underline <u>text</u> (HTML)
  processed = processed.replace(/<u>(.*?)<\/u>/g, '<u>$1</u>')

  // Strikethrough ~~text~~
  processed = processed.replace(/~~(.*?)~~/g, '<del>$1</del>')

  // Highlight ==text==
  processed = processed.replace(/==(.*?)==/g, '<mark>$1</mark>')

  // Inline code `text`
  processed = processed.replace(/`(.*?)`/g, '<code>$1</code>')

  // Headers (# ## ### etc.)
  processed = processed.replace(/^(#{1,6})\s+(.*)$/g, (match, hashes, text) => {
    const level = hashes.length
    return `<h${level}>${text}</h${level}>`
  })

  // Blockquote > text
  processed = processed.replace(/^>\s+(.*)$/g, '<blockquote>$1</blockquote>')

  // List items - text
  processed = processed.replace(/^-\s+(.*)$/g, '<ul><li>$1</li></ul>')

  // Links [text](url)
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')

  // Horizontal rule ---
  processed = processed.replace(/^---$/g, '<hr>')

  // Center div (already HTML)
  // No processing needed as it's already HTML

  return processed
}

// Individual Canister Component
function Canister({
  canister,
  isEditing,
  isSelected,
  isDragSelecting,
  isSelecting,
  isDragging,
  dragOverPosition,
  onEdit,
  onSave,
  onCreateNew,
  onDelete,
  onStopEditing,
  onNavigateToPrevious,
  onNavigateToNext,
  onMouseDown,
  onMouseEnter,
  onDoubleClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onMergeWithPrevious,
  onMergeNextIntoCurrent,
  focusCaret,
  totalCanisters
}) {
  const [editContent, setEditContent] = useState(canister.content)
  const canisterRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setEditContent(canister.content)
  }, [canister.content])

  // Auto-resize the textarea to fit its content
  const autoResize = useCallback(() => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }, [])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      if (focusCaret !== null && focusCaret !== undefined) {
        inputRef.current.setSelectionRange(focusCaret, focusCaret)
      } else {
        inputRef.current.setSelectionRange(editContent.length, editContent.length)
      }
      autoResize()
    }
  }, [isEditing, focusCaret, autoResize])

  const handleClick = (e) => {
    // Don't handle click if this is part of a drag selection or if modifier keys are pressed
    // Also check if we just finished a drag operation
    if (isSelecting || isDragging || e.shiftKey || e.metaKey || e.ctrlKey) {
      return
    }

    // Normal click to edit
    onEdit(canister.id)
  }

  const handleDoubleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    // Don't allow double-click during drag operations
    if (!isDragging) {
      onDoubleClick(canister.id)
    }
  }

  const handleMouseDown = (e) => {
    // Only handle mouse down if not in the middle of a drag operation
    if (!isDragging) {
      onMouseDown(canister.id, e)
    }
  }

  const handleMouseEnter = (e) => {
    onMouseEnter(canister.id, e)
  }

  // Helper function to apply markdown formatting to selected text
  const applyMarkdownFormatting = (wrapper, isBlock = false, prefix = '', suffix = '') => {
    const input = inputRef.current
    if (!input) return

    const start = input.selectionStart
    const end = input.selectionEnd
    const selectedText = editContent.substring(start, end)

    let newContent
    let newCursorPos

    if (isBlock) {
      // For block elements like center div
      if (selectedText) {
        newContent = editContent.substring(0, start) + prefix + selectedText + suffix + editContent.substring(end)
        newCursorPos = start + prefix.length + selectedText.length + suffix.length
      } else {
        const placeholderText = 'text'
        newContent = editContent.substring(0, start) + prefix + placeholderText + suffix + editContent.substring(end)
        newCursorPos = start + prefix.length + placeholderText.length
      }
    } else {
      // For inline elements like bold, italic, etc.
      if (selectedText) {
        newContent = editContent.substring(0, start) + wrapper + selectedText + wrapper + editContent.substring(end)
        newCursorPos = start + wrapper.length + selectedText.length + wrapper.length
      } else {
        newContent = editContent.substring(0, start) + wrapper + wrapper + editContent.substring(end)
        newCursorPos = start + wrapper.length
      }
    }

    setEditContent(newContent)

    setTimeout(() => {
      input.focus()
      if (selectedText || isBlock) {
        input.setSelectionRange(newCursorPos, newCursorPos)
      } else {
        input.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }

  const handleKeyDown = (e) => {
    const cursorPosition = e.target.selectionStart
    const textLength = editContent.length

    // Handle Cmd+A for text selection within the input
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      const input = inputRef.current
      if (input) {
        const currentSelection = input.selectionEnd - input.selectionStart
        const isAllTextSelected = currentSelection === editContent.length

        if (isAllTextSelected && editContent.length > 0) {
          // If all text is already selected, prevent default and let parent handle container selection
          e.preventDefault()
          e.stopPropagation()
          // Signal to parent that we want to select all containers
          onSave(canister.id, editContent)
          // Trigger container selection by dispatching a custom event
          window.dispatchEvent(new CustomEvent('selectAllContainers'))
          return
        } else {
          // Normal text selection behavior - select all text in this input
          e.preventDefault()
          input.setSelectionRange(0, editContent.length)
          return
        }
      }
    }

    // Handle markdown formatting hotkeys
    if (e.metaKey || e.ctrlKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault()
          applyMarkdownFormatting('**')
          return
        case 'i':
          e.preventDefault()
          applyMarkdownFormatting('*')
          return
        case 'u':
          e.preventDefault()
          applyMarkdownFormatting('<u>', false, '<u>', '</u>')
          return
        case '`':
        case 'e': // Alternative for backtick
          e.preventDefault()
          applyMarkdownFormatting('`')
          return
        case 'h':
          e.preventDefault()
          applyMarkdownFormatting('==')
          return
        case 'k':
          e.preventDefault()
          // Link formatting
          const input = inputRef.current
          const start = input.selectionStart
          const end = input.selectionEnd
          const selectedText = editContent.substring(start, end)

          if (selectedText) {
            const newContent = editContent.substring(0, start) + `[${selectedText}](url)` + editContent.substring(end)
            setEditContent(newContent)
            setTimeout(() => {
              input.focus()
              const urlStart = start + selectedText.length + 3
              const urlEnd = urlStart + 3
              input.setSelectionRange(urlStart, urlEnd)
            }, 0)
          } else {
            const newContent = editContent.substring(0, start) + '[text](url)' + editContent.substring(end)
            setEditContent(newContent)
            setTimeout(() => {
              input.focus()
              input.setSelectionRange(start + 1, start + 5) // Select 'text'
            }, 0)
          }
          return
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
          e.preventDefault()
          const level = e.key
          const hashes = '#'.repeat(parseInt(level))
          const input1 = inputRef.current
          const start1 = input1.selectionStart
          const end1 = input1.selectionEnd
          const selectedText1 = editContent.substring(start1, end1)

          if (selectedText1) {
            const newContent = editContent.substring(0, start1) + `${hashes} ${selectedText1}` + editContent.substring(end1)
            setEditContent(newContent)
            setTimeout(() => {
              input1.focus()
              input1.setSelectionRange(start1 + hashes.length + 1 + selectedText1.length, start1 + hashes.length + 1 + selectedText1.length)
            }, 0)
          } else {
            const newContent = editContent.substring(0, start1) + `${hashes} ` + editContent.substring(end1)
            setEditContent(newContent)
            setTimeout(() => {
              input1.focus()
              input1.setSelectionRange(start1 + hashes.length + 1, start1 + hashes.length + 1)
            }, 0)
          }
          return
        case 'l':
          e.preventDefault()
          // List item
          const input2 = inputRef.current
          const start2 = input2.selectionStart
          const end2 = input2.selectionEnd
          const selectedText2 = editContent.substring(start2, end2)

          if (selectedText2) {
            const newContent = editContent.substring(0, start2) + `- ${selectedText2}` + editContent.substring(end2)
            setEditContent(newContent)
            setTimeout(() => {
              input2.focus()
              input2.setSelectionRange(start2 + 2 + selectedText2.length, start2 + 2 + selectedText2.length)
            }, 0)
          } else {
            const newContent = editContent.substring(0, start2) + '- ' + editContent.substring(end2)
            setEditContent(newContent)
            setTimeout(() => {
              input2.focus()
              input2.setSelectionRange(start2 + 2, start2 + 2)
            }, 0)
          }
          return
        case 'q':
          e.preventDefault()
          // Blockquote
          const input3 = inputRef.current
          const start3 = input3.selectionStart
          const end3 = input3.selectionEnd
          const selectedText3 = editContent.substring(start3, end3)

          if (selectedText3) {
            const newContent = editContent.substring(0, start3) + `> ${selectedText3}` + editContent.substring(end3)
            setEditContent(newContent)
            setTimeout(() => {
              input3.focus()
              input3.setSelectionRange(start3 + 2 + selectedText3.length, start3 + 2 + selectedText3.length)
            }, 0)
          } else {
            const newContent = editContent.substring(0, start3) + '> ' + editContent.substring(end3)
            setEditContent(newContent)
            setTimeout(() => {
              input3.focus()
              input3.setSelectionRange(start3 + 2, start3 + 2)
            }, 0)
          }
          return
        case 'm':
          e.preventDefault()
          // Center text with HTML
          applyMarkdownFormatting('', true, '<div align="center">', '</div>')
          return
        case 'd':
          e.preventDefault()
          // Strikethrough
          applyMarkdownFormatting('~~')
          return
        case 'r':
          e.preventDefault()
          // Horizontal rule
          const input4 = inputRef.current
          const start4 = input4.selectionStart
          const newContent4 = editContent.substring(0, start4) + '---' + editContent.substring(start4)
          setEditContent(newContent4)
          setTimeout(() => {
            input4.focus()
            input4.setSelectionRange(start4 + 3, start4 + 3)
          }, 0)
          return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      // Split block at cursor position (Notion-style)
      e.preventDefault()
      const cursor = e.target.selectionStart
      const before = editContent.substring(0, cursor)
      const after = editContent.substring(cursor)
      onSave(canister.id, before)
      onCreateNew(canister.id, after)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onStopEditing()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const tabStart = e.target.selectionStart
      const tabEnd = e.target.selectionEnd
      const newContent = editContent.substring(0, tabStart) + '    ' + editContent.substring(tabEnd)
      setEditContent(newContent)
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = tabStart + 4
        autoResize()
      }, 0)
    } else if (e.key === 'Backspace' && e.target.selectionStart === 0 && e.target.selectionEnd === 0) {
      e.preventDefault()
      if (editContent === '') {
        // Empty block — delete and go to previous
        onDelete(canister.id, 'navigateToPrevious')
      } else {
        // Has content — merge into previous block (Notion-style)
        onMergeWithPrevious(canister.id, editContent)
      }
    } else if (e.key === 'Delete' && e.target.selectionStart === editContent.length && e.target.selectionEnd === editContent.length) {
      // At end of block: pull next block up
      e.preventDefault()
      onMergeNextIntoCurrent(canister.id, editContent)
    } else if (e.key === 'ArrowUp') {
      // Navigate to previous canister when at the beginning or if moving up
      e.preventDefault()
      onSave(canister.id, editContent)
      onNavigateToPrevious(canister.id)
    } else if (e.key === 'ArrowDown') {
      // Navigate to next canister when at the end or if moving down
      e.preventDefault()
      onSave(canister.id, editContent)
      onNavigateToNext(canister.id)
    } else if (e.key === 'ArrowLeft' && cursorPosition === 0) {
      e.preventDefault()
      onSave(canister.id, editContent)
      onNavigateToPrevious(canister.id, 'end')
    } else if (e.key === 'ArrowRight' && cursorPosition === textLength) {
      e.preventDefault()
      onSave(canister.id, editContent)
      onNavigateToNext(canister.id, 'start')
    }
  }

  const handleBlur = () => {
    onSave(canister.id, editContent)
  }

  const handleChange = (e) => {
    setEditContent(e.target.value)
    autoResize()
  }

  if (isEditing) {
    return (
      <div className="canister editing" ref={canisterRef}>
        <textarea
          ref={inputRef}
          value={editContent}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="canister-input"
          placeholder="Type here…"
          rows={1}
        />
      </div>
    )
  }

  return (
    <div
      ref={canisterRef}
      className={`canister display ${isSelected ? 'selected' : ''} ${isDragSelecting ? 'selecting' : ''} ${isDragging ? 'dragging' : ''} ${dragOverPosition ? `drag-over-${dragOverPosition}` : ''}`}
      data-canister-id={canister.id}
      draggable={!isEditing && !isSelecting && !isDragSelecting}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {canister.content === '' && totalCanisters === 1 ? (
        <span style={{ color: '#999', fontStyle: 'italic' }}>
          Type your markdown here...
        </span>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: processLineMarkdown(canister.content) }} />
      )}
    </div>
  )
}

// Multi-Line Editor Component for editing multiple selected canisters
function MultiLineEditor({
  canisters,
  selectedIds,
  onSave,
  onCancel,
  onDelete
}) {
  const selectedCanisters = canisters.filter(c => selectedIds.has(c.id))
  const combinedContent = selectedCanisters.map(c => c.content).join('\n')
  const [editContent, setEditContent] = useState(combinedContent)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 })
  const textareaRef = useRef(null)
  const editorRef = useRef(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(editContent.length, editContent.length)
    }
  }, [])

  // Calculate position based on selected canisters
  useEffect(() => {
    const calculatePosition = () => {
      const selectedCanisterElements = Array.from(selectedIds).map(id =>
        document.querySelector(`[data-canister-id="${id}"]`)
      ).filter(Boolean)

      if (selectedCanisterElements.length > 0) {
        const firstElement = selectedCanisterElements[0]
        const lastElement = selectedCanisterElements[selectedCanisterElements.length - 1]

        const firstRect = firstElement.getBoundingClientRect()
        const lastRect = lastElement.getBoundingClientRect()

        const containerRect = document.querySelector('.canisters-container').getBoundingClientRect()

        setPosition({
          top: firstRect.top - containerRect.top + window.scrollY,
          left: firstRect.left - containerRect.left,
          width: Math.max(firstRect.width, 600), // Minimum width of 600px
          height: Math.max(200, (lastRect.bottom - firstRect.top) + 100) // Dynamic height based on selection
        })
      }
    }

    calculatePosition()

    // Recalculate on window resize
    window.addEventListener('resize', calculatePosition)
    window.addEventListener('scroll', calculatePosition)

    return () => {
      window.removeEventListener('resize', calculatePosition)
      window.removeEventListener('scroll', calculatePosition)
    }
  }, [selectedIds])

  // Helper function to apply markdown formatting to selected text in textarea
  const applyMarkdownFormattingMultiLine = (wrapper, isBlock = false, prefix = '', suffix = '') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = editContent.substring(start, end)

    let newContent
    let newCursorPos

    if (isBlock) {
      // For block elements like center div
      if (selectedText) {
        newContent = editContent.substring(0, start) + prefix + selectedText + suffix + editContent.substring(end)
        newCursorPos = start + prefix.length + selectedText.length + suffix.length
      } else {
        const placeholderText = 'text'
        newContent = editContent.substring(0, start) + prefix + placeholderText + suffix + editContent.substring(end)
        newCursorPos = start + prefix.length + placeholderText.length
      }
    } else {
      // For inline elements like bold, italic, etc.
      if (selectedText) {
        newContent = editContent.substring(0, start) + wrapper + selectedText + wrapper + editContent.substring(end)
        newCursorPos = start + wrapper.length + selectedText.length + wrapper.length
      } else {
        newContent = editContent.substring(0, start) + wrapper + wrapper + editContent.substring(end)
        newCursorPos = start + wrapper.length
      }
    }

    setEditContent(newContent)

    setTimeout(() => {
      textarea.focus()
      if (selectedText || isBlock) {
        textarea.setSelectionRange(newCursorPos, newCursorPos)
      } else {
        textarea.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }

  const handleKeyDownMultiLine = (e) => {
    // Handle markdown formatting hotkeys
    if (e.metaKey || e.ctrlKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault()
          applyMarkdownFormattingMultiLine('**')
          return
        case 'i':
          e.preventDefault()
          applyMarkdownFormattingMultiLine('*')
          return
        case 'u':
          e.preventDefault()
          applyMarkdownFormattingMultiLine('<u>', false, '<u>', '</u>')
          return
        case '`':
        case 'e': // Alternative for backtick
          e.preventDefault()
          applyMarkdownFormattingMultiLine('`')
          return
        case 'h':
          e.preventDefault()
          applyMarkdownFormattingMultiLine('==')
          return
        case 'd':
          e.preventDefault()
          applyMarkdownFormattingMultiLine('~~')
          return
        case 'm':
          e.preventDefault()
          applyMarkdownFormattingMultiLine('', true, '<div align="center">', '</div>')
          return
        case 'delete':
        case 'backspace':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            handleDelete()
            return
          }
          break
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  const handleSave = () => {
    const newLines = editContent.split('\n')
    onSave(selectedCanisters, newLines)
  }

  const handleDelete = () => {
    onDelete(selectedCanisters)
  }

  // Handle click outside to save
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (editorRef.current && !editorRef.current.contains(event.target)) {
        handleSave()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [editContent]) // Include editContent in dependencies to capture current state

  return (
    <div
      ref={editorRef}
      className="multi-line-editor"
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        width: position.width,
        height: position.height,
        zIndex: 1000,
        backgroundColor: 'white',
        border: '2px solid #007acc',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}
    >
      <div style={{ marginBottom: '8px', fontSize: '14px', color: '#666' }}>
        Editing {selectedCanisters.length} lines
      </div>
      <textarea
        ref={textareaRef}
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        onKeyDown={handleKeyDownMultiLine}
        style={{
          width: '100%',
          height: 'calc(100% - 60px)',
          border: '1px solid #ddd',
          borderRadius: '4px',
          padding: '8px',
          fontSize: '14px',
          fontFamily: 'inherit',
          resize: 'none',
          outline: 'none',
          cursor: 'text'
        }}
        placeholder="Edit multiple lines..."
      />
      <div style={{ marginTop: '8px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSave}
          style={{
            padding: '6px 12px',
            backgroundColor: '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Save (Cmd+Enter)
        </button>
        <button
          onClick={handleDelete}
          style={{
            padding: '6px 12px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Delete
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '6px 12px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Cancel (Esc)
        </button>
      </div>
    </div>
  )
}

// Canister Editor – the block-based markdown editor.
// Accepts content from parent (AppShell file) and calls onSave when content changes.
function CanisterEditor({ initialContent = '', onSave: onSaveExternal }) {
  const { showConfirm } = useModal()
  const [canisters, setCanisters] = useState([])
  const [editingCanisterIds, setEditingCanisterIds] = useState(new Set())
  const [selectedCanisterIds, setSelectedCanisterIds] = useState(new Set())
  const [caretTarget, setCaretTarget] = useState(null) // { id, pos }
  const [isMultiLineEditing, setIsMultiLineEditing] = useState(false)
  const [showSaveBtn, setShowSaveBtn] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSelecting, setIsSelecting] = useState(false)
  const [dragSelectionIds, setDragSelectionIds] = useState(new Set())
  const [selectionStart, setSelectionStart] = useState(null)
  const [draggedCanisterId, setDraggedCanisterId] = useState(null)
  const [dragOverCanisterId, setDragOverCanisterId] = useState(null)
  const [dragOverPosition, setDragOverPosition] = useState(null) // 'top' or 'bottom'
  const [showTooltips, setShowTooltips] = useState(false)
  const containerRef = useRef(null)
  const lastScrollY = useRef(0)
  const undoStack = useRef([])
  const redoStack = useRef([])
  const lastLoadedContent = useRef(initialContent)

  // Load content from prop (API-backed file) or fall back to localStorage for offline
  useEffect(() => {
    const contentToLoad = initialContent || localStorage.getItem('jot-down-content') || ''
    lastLoadedContent.current = contentToLoad

    if (contentToLoad.trim() !== '') {
      const lines = contentToLoad.split('\n')
      const initialCanisters = lines.map((line, index) => ({
        id: `canister-${Date.now()}-${index}`,
        content: line,
        isEditing: false
      }))
      setCanisters(initialCanisters)
    } else {
      setCanisters([{
        id: `canister-${Date.now()}`,
        content: '',
        isEditing: false
      }])
    }
    setEditingCanisterIds(new Set())
    setSelectedCanisterIds(new Set())
    setIsMultiLineEditing(false)
  }, [initialContent])

  // Auto-save: sync to localStorage and notify parent via onSave
  useEffect(() => {
    if (canisters.length > 0) {
      const content = canisters.map(canister => canister.content).join('\n')
      localStorage.setItem('jot-down-content', content)

      // Only push to external save when content actually changed from what we loaded
      if (onSaveExternal && content !== lastLoadedContent.current) {
        lastLoadedContent.current = content
        onSaveExternal(content)
      }
      setHasUnsavedChanges(false)
    }
  }, [canisters, onSaveExternal])

  // Handle scroll to show/hide save button
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      if (currentScrollY > lastScrollY.current && currentScrollY > 40) {
        setShowSaveBtn(true)
      } else if (currentScrollY < lastScrollY.current || currentScrollY <= 40) {
        setShowSaveBtn(false)
      }
      lastScrollY.current = currentScrollY
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Add to undo stack
  const addToUndoStack = useCallback((canistersState) => {
    undoStack.current.push(JSON.parse(JSON.stringify(canistersState)))
    if (undoStack.current.length > 50) {
      undoStack.current.shift()
    }
    redoStack.current = []
  }, [])

  // Handle mouse selection for multi-select - document level
  const handleDocumentMouseDown = useCallback((e) => {
    // Allow drag selection to start from anywhere in the document
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey && !isMultiLineEditing && !draggedCanisterId) {
      // Don't start selection if clicking on buttons, inputs, or other interactive elements
      // Also don't start selection if clicking on a draggable element or if we're already dragging
      if (!e.target.closest('button') &&
        !e.target.closest('input') &&
        !e.target.closest('textarea') &&
        !e.target.closest('.multi-line-editor') &&
        !e.target.closest('[draggable="true"]') &&
        !e.target.closest('.canister')) {  // Don't start selection if clicking on a canister

        // Don't clear editing if there's only one canister and it's currently being edited
        // This allows continuous typing in the last/only container
        const isOnlyCanisterEditing = canisters.length === 1 && editingCanisterIds.size === 1

        setIsSelecting(true)
        setDragSelectionIds(new Set())
        if (!isOnlyCanisterEditing) {
          setEditingCanisterIds(new Set()) // Clear current editing
        }
        setSelectedCanisterIds(new Set()) // Clear current selection
      }
    }
  }, [isMultiLineEditing, draggedCanisterId, canisters.length, editingCanisterIds.size])

  // Handle mouse selection for multi-select - container level (keep for backwards compatibility)
  const handleContainerMouseDown = (e) => {
    // This is now handled by the document-level handler
    // Keep this function to avoid breaking existing props
  }

  // Handle mouse selection when clicking on canisters
  const handleCanisterMouseDown = (canisterId, e) => {
    // Don't handle selection if this is a potential drag operation
    // Check if target is draggable and no modifier keys are pressed
    if (e.target.closest('[draggable="true"]') && !e.shiftKey && !e.metaKey && !e.ctrlKey && !isMultiLineEditing) {
      // This is likely a drag operation, don't interfere with selection
      e.stopPropagation() // Prevent document handler from starting selection
      // Clear any existing selection states to avoid conflicts
      setIsSelecting(false)
      setDragSelectionIds(new Set())
      return
    }

    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault()
      e.stopPropagation()

      if (e.metaKey || e.ctrlKey) {
        // Toggle single canister in selection
        const newSelectedIds = new Set(selectedCanisterIds)
        if (newSelectedIds.has(canisterId)) {
          newSelectedIds.delete(canisterId)
        } else {
          newSelectedIds.add(canisterId)
        }
        setSelectedCanisterIds(newSelectedIds)
        setEditingCanisterIds(new Set()) // Clear editing when selecting

        // If multiple canisters are now selected, open multi-line editor
        if (newSelectedIds.size > 1) {
          setTimeout(() => {
            setIsMultiLineEditing(true)
          }, 50)
        }
      } else if (e.shiftKey && selectedCanisterIds.size > 0) {
        // Select range
        const firstSelectedId = Array.from(selectedCanisterIds)[0]
        const startIndex = canisters.findIndex(c => c.id === firstSelectedId)
        const endIndex = canisters.findIndex(c => c.id === canisterId)
        const rangeStart = Math.min(startIndex, endIndex)
        const rangeEnd = Math.max(startIndex, endIndex)

        const newSelectedIds = new Set()
        for (let i = rangeStart; i <= rangeEnd; i++) {
          newSelectedIds.add(canisters[i].id)
        }
        setSelectedCanisterIds(newSelectedIds)
        setEditingCanisterIds(new Set()) // Clear editing when selecting

        // If multiple canisters are selected, open multi-line editor
        if (newSelectedIds.size > 1) {
          setTimeout(() => {
            setIsMultiLineEditing(true)
          }, 50)
        }
      }
    }
    // For normal clicks without modifier keys, let the document handler manage the drag selection
    // The click handler will still work for single clicks to edit
  }

  const handleCanisterMouseEnter = (canisterId, e) => {
    if (isSelecting) {
      if (selectionStart) {
        // Drag selection from a specific canister
        const startIndex = canisters.findIndex(c => c.id === selectionStart)
        const currentIndex = canisters.findIndex(c => c.id === canisterId)
        const rangeStart = Math.min(startIndex, currentIndex)
        const rangeEnd = Math.max(startIndex, currentIndex)

        const newSelectionIds = new Set()
        for (let i = rangeStart; i <= rangeEnd; i++) {
          newSelectionIds.add(canisters[i].id)
        }
        setDragSelectionIds(newSelectionIds)
      } else {
        // Free-form drag selection - add this canister to selection
        setDragSelectionIds(prev => new Set([...prev, canisterId]))
      }
    }
  }

  // Handle mouse up to end selection
  useEffect(() => {
    const handleMouseUp = () => {
      if (isSelecting && dragSelectionIds.size > 0) {
        // Commit the drag selection to selected (not editing)
        setSelectedCanisterIds(new Set(dragSelectionIds))
        setEditingCanisterIds(new Set()) // Clear editing

        // If multiple canisters are selected, automatically open multi-line editor
        if (dragSelectionIds.size > 1) {
          setTimeout(() => {
            setIsMultiLineEditing(true)
          }, 50) // Small delay to ensure state is updated
        }
      }
      setIsSelecting(false)
      setSelectionStart(null)
      setDragSelectionIds(new Set())
    }

    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [isSelecting, dragSelectionIds])

  // Add document-level mouse down listener for drag selection
  useEffect(() => {
    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [handleDocumentMouseDown])

  // Update body class when selecting
  useEffect(() => {
    if (isSelecting) {
      document.body.classList.add('selecting')
    } else {
      document.body.classList.remove('selecting')
    }

    // Cleanup on unmount
    return () => document.body.classList.remove('selecting')
  }, [isSelecting])

  // Handle canister operations
  const editCanister = (canisterId, cursorPosition = 'end') => {
    addToUndoStack(canisters)
    setEditingCanisterIds(new Set([canisterId]))
    setSelectedCanisterIds(new Set()) // Clear selection when editing
    setCaretTarget(null) // clear any pending merge caret target
    setHasUnsavedChanges(true)

    // Set cursor position after component updates
    setTimeout(() => {
      const input = document.querySelector('.canister.editing input')
      if (input) {
        if (cursorPosition === 'start') {
          input.setSelectionRange(0, 0)
        } else if (cursorPosition === 'end') {
          input.setSelectionRange(input.value.length, input.value.length)
        }
      }
    }, 0)
  }

  const saveCanister = (canisterId, newContent) => {
    setCanisters(prev => prev.map(canister =>
      canister.id === canisterId
        ? { ...canister, content: newContent }
        : canister
    ))
    setEditingCanisterIds(new Set())
    setSelectedCanisterIds(new Set())
    setHasUnsavedChanges(false)
  }

  const stopEditingCanister = () => {
    setEditingCanisterIds(new Set())
    setSelectedCanisterIds(new Set())
  }

  const createNewCanister = (afterCanisterId, initialContent = '') => {
    const afterIndex = canisters.findIndex(c => c.id === afterCanisterId)
    const newCanister = {
      id: `canister-${Date.now()}`,
      content: initialContent,
      isEditing: false
    }

    addToUndoStack(canisters)
    setCanisters(prev => {
      const next = [...prev]
      next.splice(afterIndex + 1, 0, newCanister)
      return next
    })

    // Focus new block at position 0 (text after cursor landed here)
    setTimeout(() => {
      setEditingCanisterIds(new Set([newCanister.id]))
      setSelectedCanisterIds(new Set())
      setCaretTarget({ id: newCanister.id, pos: 0 })
    }, 0)
  }

  const deleteCanister = (canisterId, navigationHint = null) => {
    if (canisters.length <= 1) return // Don't delete the last canister

    addToUndoStack(canisters)

    // Find the previous canister before deletion if we need to navigate to it
    const currentIndex = canisters.findIndex(c => c.id === canisterId)
    const previousCanister = currentIndex > 0 ? canisters[currentIndex - 1] : null

    setCanisters(prev => prev.filter(canister => canister.id !== canisterId))

    // Navigate to previous canister if hint is provided
    if (navigationHint === 'navigateToPrevious' && previousCanister) {
      setTimeout(() => {
        setEditingCanisterIds(new Set([previousCanister.id]))
        setSelectedCanisterIds(new Set())
      }, 0)
    } else {
      setEditingCanisterIds(new Set())
      setSelectedCanisterIds(new Set())
    }
  }

  const navigateToPrevious = (currentCanisterId, cursorPosition = 'end') => {
    const currentIndex = canisters.findIndex(c => c.id === currentCanisterId)
    if (currentIndex > 0) {
      const previousCanister = canisters[currentIndex - 1]
      editCanister(previousCanister.id, cursorPosition)
    }
  }

  const navigateToNext = (currentCanisterId, cursorPosition = 'start') => {
    const currentIndex = canisters.findIndex(c => c.id === currentCanisterId)
    if (currentIndex < canisters.length - 1) {
      const nextCanister = canisters[currentIndex + 1]
      editCanister(nextCanister.id, cursorPosition)
    }
  }

  // Merge current block into the previous one (Backspace at pos 0 with content)
  const mergeWithPrevious = (canisterId, tailContent) => {
    const currentIndex = canisters.findIndex(c => c.id === canisterId)
    if (currentIndex <= 0) return

    addToUndoStack(canisters)
    const prevCanister = canisters[currentIndex - 1]
    const joinPos = prevCanister.content.length
    const mergedContent = prevCanister.content + tailContent

    setCanisters(prev => {
      const next = [...prev]
      next[currentIndex - 1] = { ...prevCanister, content: mergedContent }
      next.splice(currentIndex, 1)
      return next
    })

    setTimeout(() => {
      setEditingCanisterIds(new Set([prevCanister.id]))
      setSelectedCanisterIds(new Set())
      setCaretTarget({ id: prevCanister.id, pos: joinPos })
    }, 0)
  }

  // Pull next block up into current one (Delete at end of block)
  const mergeNextIntoCurrent = (canisterId, currentContent) => {
    const currentIndex = canisters.findIndex(c => c.id === canisterId)
    if (currentIndex >= canisters.length - 1) return

    addToUndoStack(canisters)
    const nextCanister = canisters[currentIndex + 1]
    const joinPos = currentContent.length
    const mergedContent = currentContent + nextCanister.content

    setCanisters(prev => {
      const next = [...prev]
      next[currentIndex] = { ...prev[currentIndex], content: mergedContent }
      next.splice(currentIndex + 1, 1)
      return next
    })

    setTimeout(() => {
      setEditingCanisterIds(new Set([canisterId]))
      setSelectedCanisterIds(new Set())
      setCaretTarget({ id: canisterId, pos: joinPos })
    }, 0)
  }

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't handle shortcuts if multi-line editor is open
      if (isMultiLineEditing) return

      // Enter to edit selected canisters
      if (e.key === 'Enter' && selectedCanisterIds.size > 0) {
        e.preventDefault()
        if (selectedCanisterIds.size === 1) {
          // Single selection - normal edit
          const firstSelectedId = Array.from(selectedCanisterIds)[0]
          editCanister(firstSelectedId)
        } else {
          // Multi-selection - open multi-line editor
          setIsMultiLineEditing(true)
        }
        return
      }

      // Cmd+A to select all canisters (only if no editing is happening)
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        // If no canisters are currently being edited, handle global select all
        if (editingCanisterIds.size === 0) {
          e.preventDefault()
          const allCanisterIds = new Set(canisters.map(c => c.id))
          setSelectedCanisterIds(allCanisterIds)
          setEditingCanisterIds(new Set()) // Clear editing when selecting all

          // Automatically open multi-line editor for select all
          if (allCanisterIds.size > 1) {
            setTimeout(() => {
              setIsMultiLineEditing(true)
            }, 50)
          }
          return
        }
        // If editing is happening, let the individual canister handle it first
      }

      // Cmd+S to save as markdown file (works globally)
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSaveAsMarkdown()
        return
      }

      // Undo/Redo (works globally)
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          if (undoStack.current.length > 0) {
            redoStack.current.push(JSON.parse(JSON.stringify(canisters)))
            const previousState = undoStack.current.pop()
            setCanisters(previousState)
            setEditingCanisterIds(new Set())
            setSelectedCanisterIds(new Set())
            setHasUnsavedChanges(true)
          }
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault()
          if (redoStack.current.length > 0) {
            undoStack.current.push(JSON.parse(JSON.stringify(canisters)))
            const nextState = redoStack.current.pop()
            setCanisters(nextState)
            setEditingCanisterIds(new Set())
            setSelectedCanisterIds(new Set())
            setHasUnsavedChanges(true)
          }
        }
      }
    }

    // Handle custom event for selecting all containers from within an input
    const handleSelectAllContainers = () => {
      const allCanisterIds = new Set(canisters.map(c => c.id))
      setSelectedCanisterIds(allCanisterIds)
      setEditingCanisterIds(new Set()) // Clear editing when selecting all

      // Automatically open multi-line editor for select all
      if (allCanisterIds.size > 1) {
        setTimeout(() => {
          setIsMultiLineEditing(true)
        }, 50)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('selectAllContainers', handleSelectAllContainers)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('selectAllContainers', handleSelectAllContainers)
    }
  }, [canisters, isMultiLineEditing, selectedCanisterIds, editingCanisterIds])

  // Handle multi-line editing
  const handleMultiLineSave = (selectedCanisters, newLines) => {
    addToUndoStack(canisters)

    // Create new canisters array with updated content
    const updatedCanisters = [...canisters]
    const firstSelectedIndex = canisters.findIndex(c => c.id === selectedCanisters[0].id)

    // Remove the old selected canisters
    selectedCanisters.forEach(canister => {
      const index = updatedCanisters.findIndex(c => c.id === canister.id)
      if (index !== -1) {
        updatedCanisters.splice(index, 1)
      }
    })

    // Insert new canisters at the position of the first selected canister
    const newCanisters = newLines.map((line, index) => ({
      id: `canister-${Date.now()}-${index}`,
      content: line,
      isEditing: false
    }))

    updatedCanisters.splice(firstSelectedIndex, 0, ...newCanisters)

    setCanisters(updatedCanisters)
    setIsMultiLineEditing(false)
    setSelectedCanisterIds(new Set())
    setEditingCanisterIds(new Set())
    setHasUnsavedChanges(true)
  }

  const handleMultiLineCancel = () => {
    setIsMultiLineEditing(false)
  }

  const handleMultiLineDelete = (selectedCanisters) => {
    addToUndoStack(canisters)

    // Remove the selected canisters
    const selectedIds = new Set(selectedCanisters.map(c => c.id))
    const updatedCanisters = canisters.filter(c => !selectedIds.has(c.id))

    // If all canisters would be deleted, create one empty canister
    if (updatedCanisters.length === 0) {
      const emptyCanister = {
        id: `canister-${Date.now()}`,
        content: '',
        isEditing: false
      }
      setCanisters([emptyCanister])
    } else {
      setCanisters(updatedCanisters)
    }

    setIsMultiLineEditing(false)
    setSelectedCanisterIds(new Set())
    setEditingCanisterIds(new Set())
    setHasUnsavedChanges(true)
  }

  // Handle double-click on canisters
  const handleCanisterDoubleClick = (canisterId) => {
    if (selectedCanisterIds.size > 1 && selectedCanisterIds.has(canisterId)) {
      // If this canister is part of a multi-selection, open multi-line editor
      setIsMultiLineEditing(true)
    } else {
      // Normal single edit
      editCanister(canisterId)
    }
  }

  // Handle drag and drop for reordering canisters
  const handleDragStart = (e, canisterId) => {
    setDraggedCanisterId(canisterId)

    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', e.target.outerHTML)
    e.target.style.opacity = '0.6'

    // Clear any selection states when starting a drag to prevent interference
    setIsSelecting(false)
    setDragSelectionIds(new Set())
    // Don't clear selected containers if we're dragging a selected item
    if (!selectedCanisterIds.has(canisterId)) {
      setSelectedCanisterIds(new Set())
    }
    setEditingCanisterIds(new Set())

    // Prevent any other event handlers from interfering
    e.stopPropagation()
  }

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1'
    setDraggedCanisterId(null)
    setDragOverCanisterId(null)
    setDragOverPosition(null)
  }

  const handleDragOver = (e, canisterId) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'

    if (draggedCanisterId && draggedCanisterId !== canisterId) {
      const rect = e.currentTarget.getBoundingClientRect()
      const midpoint = rect.top + rect.height / 2
      const position = e.clientY < midpoint ? 'top' : 'bottom'

      // Only update if position has actually changed to reduce unnecessary re-renders
      if (dragOverCanisterId !== canisterId || dragOverPosition !== position) {
        setDragOverCanisterId(canisterId)
        setDragOverPosition(position)
      }
    }
  }

  const handleDragEnter = (e, canisterId) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedCanisterId && draggedCanisterId !== canisterId) {
      setDragOverCanisterId(canisterId)
    }
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    // Only clear if we're actually leaving the element and not entering a child
    const rect = e.currentTarget.getBoundingClientRect()
    const isLeavingElement = (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    )

    if (isLeavingElement && !e.relatedTarget?.closest(`[data-canister-id="${dragOverCanisterId}"]`)) {
      setDragOverCanisterId(null)
      setDragOverPosition(null)
    }
  }

  const handleDrop = (e, canisterId) => {
    e.preventDefault()
    e.stopPropagation()

    if (draggedCanisterId && draggedCanisterId !== canisterId) {
      addToUndoStack(canisters)

      const draggedIndex = canisters.findIndex(c => c.id === draggedCanisterId)
      const targetIndex = canisters.findIndex(c => c.id === canisterId)

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const newCanisters = [...canisters]
        const [draggedCanister] = newCanisters.splice(draggedIndex, 1)

        // Determine insertion position
        let insertIndex = targetIndex
        if (dragOverPosition === 'bottom') {
          insertIndex = targetIndex + 1
        }

        // Adjust if dragged item was before target
        if (draggedIndex < targetIndex && dragOverPosition === 'bottom') {
          insertIndex = targetIndex
        } else if (draggedIndex < targetIndex && dragOverPosition === 'top') {
          insertIndex = targetIndex - 1
        }

        newCanisters.splice(insertIndex, 0, draggedCanister)
        setCanisters(newCanisters)
        setHasUnsavedChanges(true)
      }
    }

    setDragOverCanisterId(null)
    setDragOverPosition(null)
  }

  // Handle file operations
  const handleSaveAsMarkdown = () => {
    const content = canisters.map(canister => canister.content).join('\n')
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'notes.md'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    // Also save to localStorage
    localStorage.setItem('jot-down-content', content)
    setHasUnsavedChanges(false)
  }

  const handleOpenFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,text/markdown'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file && file.name.endsWith('.md')) {
        const reader = new FileReader()
        reader.onload = (evt) => {
          addToUndoStack(canisters)
          const content = evt.target.result
          const lines = content.split('\n')
          const newCanisters = lines.map((line, index) => ({
            id: `canister-${Date.now()}-${index}`,
            content: line,
            isEditing: false
          }))
          setCanisters(newCanisters)
          setEditingCanisterIds(new Set())
          setSelectedCanisterIds(new Set())
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  const handleNewFile = async () => {
    if (hasUnsavedChanges) {
      const confirmed = await showConfirm('New File', 'You have unsaved changes. Create a new file anyway?')
      if (!confirmed) return
    }
    addToUndoStack(canisters)
    setCanisters([{
      id: `canister-${Date.now()}`,
      content: '',
      isEditing: false
    }])
    setEditingCanisterIds(new Set())
    setSelectedCanisterIds(new Set())
    setHasUnsavedChanges(false)
  }

  const handleSave = () => {
    setEditingCanisterIds(new Set())
    setSelectedCanisterIds(new Set())
    const content = canisters.map(canister => canister.content).join('\n')
    localStorage.setItem('jot-down-content', content)
    setHasUnsavedChanges(false)
  }

  return (
    <div className="app">
      {/* Inline help toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 8px' }}>
        <button
          onClick={() => setShowTooltips(!showTooltips)}
          title="Show Markdown Help"
          className={showTooltips ? 'active' : ''}
          style={{ fontSize: '12px', padding: '2px 8px', border: '1px solid #ddd', borderRadius: 4, background: showTooltips ? '#e0f0ff' : '#fff', cursor: 'pointer' }}
        >
          ❓ Help
        </button>
      </div>

      {/* Tooltips Panel */}
      {showTooltips && (
        <div className="tooltips-panel">
          <div className="tooltips-header">
            <h3>📝 Markdown Syntax Guide</h3>
            <button onClick={() => setShowTooltips(false)} className="close-btn">✕</button>
          </div>
          <div className="tooltips-content">
            <div className="tooltip-section">
              <h4>🎯 Basic Formatting Hotkeys</h4>
              <div className="tooltip-item">
                <kbd>Cmd+B</kbd> → <code>**bold text**</code> → <strong>bold text</strong>
              </div>
              <div className="tooltip-item">
                <kbd>Cmd+I</kbd> → <code>*italic text*</code> → <em>italic text</em>
              </div>
              <div className="tooltip-item">
                <kbd>Cmd+U</kbd> → <code>&lt;u&gt;underlined&lt;/u&gt;</code> → <u>underlined</u>
              </div>
              <div className="tooltip-item">
                <kbd>Cmd+D</kbd> → <code>~~strikethrough~~</code> → <del>strikethrough</del>
              </div>
              <div className="tooltip-item">
                <kbd>Cmd+E</kbd> → <code>`inline code`</code> → <code>inline code</code>
              </div>
              <div className="tooltip-item">
                <kbd>Cmd+H</kbd> → <code>==highlighted==</code> → <mark>highlighted</mark>
              </div>
              <div className="tooltip-item">
                <kbd>Cmd+K</kbd> → <code>[link text](url)</code> → Link formatting
              </div>
            </div>

            <div className="tooltip-section">
              <h4>📋 Headers & Structure</h4>
              <div className="tooltip-item">
                <kbd>Cmd+1</kbd> → <code># Heading 1</code> → Large header
              </div>
              <div className="tooltip-item">
                <kbd>Cmd+2</kbd> → <code>## Heading 2</code> → Medium header
              </div>
              <div className="tooltip-item">
                <kbd>Cmd+3-6</kbd> → <code>### Smaller headers</code>
              </div>
              <div className="tooltip-item">
                <kbd>Cmd+L</kbd> → <code>- List item</code> → • Bullet point
              </div>
              <div className="tooltip-item">
                <kbd>Cmd+Q</kbd> → <code>&gt; Blockquote</code> → Quote block
              </div>
              <div className="tooltip-item">
                <kbd>Cmd+R</kbd> → <code>---</code> → Horizontal rule
              </div>
            </div>

            <div className="tooltip-section">
              <h4>🎨 HTML Formatting</h4>
              <div className="tooltip-item">
                <kbd>Cmd+M</kbd> → <code>&lt;div align="center"&gt;text&lt;/div&gt;</code> → Centered text
              </div>
            </div>

            <div className="tooltip-section">
              <h4>⚡ Quick Actions</h4>
              <div className="tooltip-item">
                <kbd>Enter</kbd> → Create new line below
              </div>
              <div className="tooltip-item">
                <kbd>↑↓←→</kbd> → Navigate between lines
              </div>
              <div className="tooltip-item">
                <kbd>Cmd+A</kbd> → Select all lines
              </div>
              <div className="tooltip-item">
                <kbd>Cmd+Click</kbd> → Multi-select lines
              </div>
              <div className="tooltip-item">
                <strong>Drag containers</strong> → Reorder lines
              </div>
              <div className="tooltip-item">
                <kbd>Tab</kbd> → Add 4 spaces (indent)
              </div>
              <div className="tooltip-item">
                <kbd>Esc</kbd> → Cancel editing
              </div>
            </div>

            <div className="tooltip-section">
              <h4>💡 Pro Tips</h4>
              <div className="tooltip-item">
                • Select text before using hotkeys to wrap existing text
              </div>
              <div className="tooltip-item">
                • Use hotkeys without selection to insert formatting at cursor
              </div>
              <div className="tooltip-item">
                • All standard markdown syntax works manually too
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Canisters */}
      <div
        className={`canisters-container ${isSelecting ? 'selecting' : ''}`}
        onMouseDown={handleContainerMouseDown}
        style={{ position: 'relative' }} // Make container relative for absolute positioning of editor
      >
        {canisters.map((canister) => (
          <Canister
            key={canister.id}
            canister={canister}
            isEditing={editingCanisterIds.has(canister.id)}
            isSelected={selectedCanisterIds.has(canister.id)}
            isDragSelecting={dragSelectionIds.has(canister.id)}
            isSelecting={isSelecting}
            isDragging={draggedCanisterId === canister.id}
            dragOverPosition={dragOverCanisterId === canister.id ? dragOverPosition : null}
            onEdit={editCanister}
            onSave={saveCanister}
            onCreateNew={createNewCanister}
            onDelete={deleteCanister}
            onStopEditing={stopEditingCanister}
            onNavigateToPrevious={navigateToPrevious}
            onNavigateToNext={navigateToNext}
            onMergeWithPrevious={mergeWithPrevious}
            onMergeNextIntoCurrent={mergeNextIntoCurrent}
            focusCaret={caretTarget?.id === canister.id ? caretTarget.pos : null}
            onMouseDown={handleCanisterMouseDown}
            onMouseEnter={handleCanisterMouseEnter}
            onDoubleClick={handleCanisterDoubleClick}
            onDragStart={(e) => handleDragStart(e, canister.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, canister.id)}
            onDragEnter={(e) => handleDragEnter(e, canister.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, canister.id)}
            totalCanisters={canisters.length}
          />
        ))}

        {/* Multi-line editor positioned inline */}
        {isMultiLineEditing && (
          <MultiLineEditor
            canisters={canisters}
            selectedIds={selectedCanisterIds}
            onSave={handleMultiLineSave}
            onCancel={handleMultiLineCancel}
            onDelete={handleMultiLineDelete}
          />
        )}
      </div>

      {/* Save button */}
      <div className="save-btn-wrapper">
        <button
          className={`save-btn ${showSaveBtn ? 'visible' : 'hidden'}`}
          onClick={handleSave}
        >
          Hard Save & Format
        </button>
      </div>
    </div>
  )
}

// =============================================
// App – the root component with auth gating
// =============================================
import { useAuth } from './hooks/useAuth.jsx'
import { useModal } from './components/ui/ModalProvider.jsx'
import LoginPage from './components/auth/LoginPage'
import AppShell from './components/layout/AppShell'

function App() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Loading…</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <AppShell>
      {({ content, onSave }) => (
        <CanisterEditor initialContent={content} onSave={onSave} />
      )}
    </AppShell>
  )
}

export default App
