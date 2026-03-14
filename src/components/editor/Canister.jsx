import { useState, useEffect, useRef, useCallback } from "react"
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Divider,
  TextField,
  Tooltip,
  Menu,
  MenuItem,
  ListItemText,
  ListItemIcon,
} from "@mui/material"
import { Save, Visibility, Edit, History, Download } from "@mui/icons-material"
import { processMarkdown, extractCSVBlocks } from "../../utils/markdown"
import { CsvTable } from "./CsvTable"
import { BlockEditor } from "./BlockEditor"
import { useFile } from "../../hooks/useFile"

/* ─── Version helpers ─── */
const VERSIONS_KEY = (wikiId, fileId) => `jd:versions:${wikiId}:${fileId}`
const MAX_VERSIONS = 5
const EDITS_PER_CHECKPOINT = 100

function loadVersions(wikiId, fileId) {
  try {
    return JSON.parse(localStorage.getItem(VERSIONS_KEY(wikiId, fileId)) || "[]")
  } catch { return [] }
}

function saveVersion(wikiId, fileId, content) {
  const versions = loadVersions(wikiId, fileId)
  versions.push({ content, timestamp: Date.now() })
  while (versions.length > MAX_VERSIONS) versions.shift()
  localStorage.setItem(VERSIONS_KEY(wikiId, fileId), JSON.stringify(versions))
  return versions
}

export function Canister({ wikiId, fileId, onFileSelect, onRename }) {
  const { file, updateFile, saveContent } = useFile(wikiId, fileId)
  const [content, setContent] = useState("")
  const [isPreview, setIsPreview] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimeoutRef = useRef(null)
  // Debounced save-status label — only appears after 1.5 s of inactivity
  // so it doesn't flash on every keystroke.
  const [saveStatus, setSaveStatus] = useState(null) // null | 'unsaved' | 'saving' | 'saved'
  const statusTimerRef = useRef(null)
  const [exportAnchor, setExportAnchor] = useState(null)

  // Editable heading state
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState("")

  // Version checkpoint state
  const editCountRef = useRef(0)
  const [versions, setVersions] = useState([])
  const [versionsAnchor, setVersionsAnchor] = useState(null)

  // Only load content when the file that arrived belongs to the current fileId.
  // Without this guard, a late-arriving refetch from the previous file's
  // updateFile call would overwrite the editor with stale content.
  useEffect(() => {
    if (file?.fileId === fileId && file?.content !== undefined) {
      setContent(file.content)
      contentRef.current = file.content  // keep ref in sync so unmount-save is accurate
      setHasChanges(false)
      editCountRef.current = 0
    }
  }, [file])

  useEffect(() => {
    if (wikiId && fileId) {
      setVersions(loadVersions(wikiId, fileId))
    }
  }, [wikiId, fileId])

  // Refs to avoid stale closures in auto-save timer
  const contentRef = useRef(content)
  const savingRef = useRef(false)
  const fileContentRef = useRef(file?.content)  // tracks latest saved server content
  const updateFileRef = useRef(updateFile)       // stable ref to latest updateFile fn
  const saveContentRef = useRef(saveContent)     // stable ref to fire-and-forget save

  useEffect(() => { contentRef.current = content }, [content])
  useEffect(() => { fileContentRef.current = file?.content }, [file?.content])
  useEffect(() => { updateFileRef.current = updateFile }, [updateFile])
  useEffect(() => { saveContentRef.current = saveContent }, [saveContent])

  const doSave = useCallback(async (text) => {
    if (savingRef.current) return
    if (text === file?.content) {
      setHasChanges(false)
      setSaveStatus(null)
      return
    }
    try {
      savingRef.current = true
      setSaving(true)
      // Cancel the stale-save warning timer before the request starts
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
      statusTimerRef.current = null
      setSaveStatus('saving')
      await updateFile({ content: text })
      setHasChanges(false)
      // Cancel the stale-save warning timer and clear any error indicator
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
      statusTimerRef.current = null
      setSaveStatus('saved')
      // Hide the 'Saved ✓' label after 2 s
      statusTimerRef.current = setTimeout(() => setSaveStatus(null), 2000)
    } catch (err) {
      console.error("Auto-save failed:", err)
      setSaveStatus('unsaved')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [file?.content, updateFile])

  const handleContentChange = useCallback((newContent) => {
    setContent(newContent)
    contentRef.current = newContent
    setHasChanges(true)

    // Clear any previous status
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    setSaveStatus(null)

    // Show "Unsaved changes" only if content hasn't been saved within 30 s
    // (indicates a system failure — normal saves complete in < 3 s)
    statusTimerRef.current = setTimeout(() => setSaveStatus('unsaved'), 30000)

    // Track edits for versioning
    editCountRef.current += 1
    if (editCountRef.current >= EDITS_PER_CHECKPOINT) {
      editCountRef.current = 0
      const v = saveVersion(wikiId, fileId, newContent)
      setVersions(v)
    }

    // Auto-save after 2.5 seconds of inactivity (short enough to not lose
    // work on a refresh, long enough to not flood the API mid-sentence)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(() => {
      doSave(contentRef.current)
    }, 2500)
  }, [doSave, wikiId, fileId])

  const handleManualSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    doSave(contentRef.current)
  }, [doSave])

  // Keyboard shortcut for save (Ctrl+S or Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        handleManualSave()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleManualSave])

  // Flush unsaved content when switching files OR on unmount.
  // Uses saveContent (fire-and-forget PUT, no refetch) so that the response
  // can never call setFile and overwrite state for the newly-loaded file.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      const latest = contentRef.current
      const saved = fileContentRef.current
      if (latest !== undefined && latest !== saved && !savingRef.current) {
        saveContentRef.current?.(latest).catch(() => { })
      }
    }
  }, [fileId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset editor state immediately when fileId changes so we never show
  // the previous file's content while the new file is fetching.
  useEffect(() => {
    setContent("")
    contentRef.current = ""
    setHasChanges(false)
    setSaveStatus(null)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    setEditingName(false)
  }, [fileId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before hard-refresh / tab close if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (contentRef.current !== file?.content) {
        e.preventDefault()
        e.returnValue = '' // triggers the browser's built-in "Leave site?" dialog
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [file?.content])

  /* ─── Editable heading ─── */
  const handleNameClick = () => {
    setNameValue(file?.name || "")
    setEditingName(true)
  }

  const handleNameSave = async () => {
    setEditingName(false)
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === file?.name) return
    try {
      await updateFile({ name: trimmed })
      onRename?.()
    } catch (err) {
      console.error("Failed to rename:", err)
    }
  }

  /* ─── Version restore ─── */
  const handleRestoreVersion = (version) => {
    setVersionsAnchor(null)
    setContent(version.content)
    contentRef.current = version.content
    setHasChanges(true)
    // Trigger a save immediately so it persists
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    doSave(version.content)
  }

  /* ─── Export/Download helpers ─── */
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportMd = () => {
    setExportAnchor(null)
    const blob = new Blob([content], { type: "text/markdown" })
    downloadBlob(blob, file?.name || "document.md")
  }

  const handleExportDocx = async () => {
    setExportAnchor(null)
    try {
      const { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType, BorderStyle } = await import("docx")

      const lines = content.split("\n")
      const children = []

      for (const line of lines) {
        if (!line.trim()) {
          children.push(new Paragraph({}))
          continue
        }
        if (line.startsWith("### ")) {
          children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(line.slice(4))] }))
        } else if (line.startsWith("## ")) {
          children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(line.slice(3))] }))
        } else if (line.startsWith("# ")) {
          children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(line.slice(2))] }))
        } else if (line.startsWith("- [x] ") || line.startsWith("- [ ] ")) {
          const checked = line.startsWith("- [x] ")
          const text = line.replace(/^- \[(x| )\] /, "")
          children.push(new Paragraph({ children: [new TextRun({ text: `${checked ? "☑" : "☐"} ${text}` })] }))
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(line.slice(2))] }))
        } else if (line.match(/^\d+\. /)) {
          children.push(new Paragraph({ numbering: { reference: "default-numbering", level: 0 }, children: [new TextRun(line.replace(/^\d+\. /, ""))] }))
        } else if (line.startsWith("> ")) {
          children.push(new Paragraph({
            indent: { left: 720 },
            children: [new TextRun({ text: line.slice(2), italics: true })],
          }))
        } else if (line.startsWith("---") || line.startsWith("***") || line.startsWith("___")) {
          children.push(new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 1, space: 1 } },
            children: [],
          }))
        } else {
          // Parse inline bold/italic
          const runs = []
          let remaining = line
          const inlineRegex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
          let match
          let lastIdx = 0
          while ((match = inlineRegex.exec(remaining)) !== null) {
            if (match.index > lastIdx) {
              runs.push(new TextRun(remaining.slice(lastIdx, match.index)))
            }
            if (match[2]) {
              runs.push(new TextRun({ text: match[2], bold: true }))
            } else if (match[3]) {
              runs.push(new TextRun({ text: match[3], italics: true }))
            } else if (match[4]) {
              runs.push(new TextRun({ text: match[4], font: "Courier New" }))
            }
            lastIdx = match.index + match[0].length
          }
          if (lastIdx < remaining.length) {
            runs.push(new TextRun(remaining.slice(lastIdx)))
          }
          children.push(new Paragraph({ children: runs.length > 0 ? runs : [new TextRun(line)] }))
        }
      }

      const doc = new Document({
        numbering: {
          config: [{
            reference: "default-numbering",
            levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }],
          }],
        },
        sections: [{ children }],
      })

      const blob = await Packer.toBlob(doc)
      downloadBlob(blob, (file?.name || "document").replace(/\.md$/, "") + ".docx")
    } catch (err) {
      console.error("DOCX export failed:", err)
      // Fallback: export as plain text docx-like
      const blob = new Blob([content], { type: "application/octet-stream" })
      downloadBlob(blob, (file?.name || "document").replace(/\.md$/, "") + ".txt")
    }
  }

  const renderPreview = () => {
    const csvBlocks = extractCSVBlocks(content)
    const lines = content.split("\n")

    let result = []
    let lastIndex = 0

    csvBlocks.forEach((block, i) => {
      // Add markdown before CSV block
      const beforeLines = lines.slice(lastIndex, block.startLine)
      if (beforeLines.length > 0) {
        const markdownHtml = processMarkdown(beforeLines.join("\n"))
        result.push(
          <div
            key={`md-${i}`}
            dangerouslySetInnerHTML={{ __html: markdownHtml }}
          />,
        )
      }

      // Add CSV table
      result.push(<CsvTable key={`csv-${i}`} csvText={block.content} />)

      lastIndex = block.endLine + 1
    })

    // Add remaining markdown
    if (lastIndex < lines.length) {
      const remainingLines = lines.slice(lastIndex)
      const markdownHtml = processMarkdown(remainingLines.join("\n"))
      result.push(
        <div key="md-final" dangerouslySetInnerHTML={{ __html: markdownHtml }} />,
      )
    }

    // If no CSV blocks, just render all as markdown
    if (csvBlocks.length === 0) {
      const markdownHtml = processMarkdown(content)
      result = [<div key="md-all" dangerouslySetInnerHTML={{ __html: markdownHtml }} />]
    }

    return result
  }

  if (!file) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <Paper
        sx={{
          p: 1,
          display: "flex",
          alignItems: "center",
          gap: 2,
          borderRadius: 0,
        }}
      >
        {editingName ? (
          <TextField
            autoFocus
            size="small"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNameSave()
              if (e.key === "Escape") setEditingName(false)
            }}
            sx={{ flexGrow: 1 }}
            inputProps={{ style: { fontSize: "1.25rem", fontWeight: 500 } }}
          />
        ) : (
          <Typography
            variant="h6"
            sx={{
              flexGrow: 1,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover", borderRadius: 1 },
              px: 1,
              py: 0.5,
            }}
            onClick={handleNameClick}
            title="Click to rename"
          >
            {file.name}
          </Typography>
        )}
        {saveStatus && (
          <Typography
            variant="caption"
            color={saveStatus === 'saved' ? 'success.main' : saveStatus === 'saving' ? 'text.secondary' : 'warning.main'}
          >
            {saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'saving' ? 'Saving…' : 'Unsaved changes'}
          </Typography>
        )}
        <Tooltip title={`${versions.length} version${versions.length !== 1 ? "s" : ""}`}>
          <span>
            <IconButton
              onClick={(e) => setVersionsAnchor(e.currentTarget)}
              disabled={versions.length === 0}
              color="default"
            >
              <History />
            </IconButton>
          </span>
        </Tooltip>
        <Menu
          anchorEl={versionsAnchor}
          open={Boolean(versionsAnchor)}
          onClose={() => setVersionsAnchor(null)}
        >
          {versions.length === 0 ? (
            <MenuItem disabled>No versions yet</MenuItem>
          ) : (
            versions.map((v, i) => (
              <MenuItem key={i} onClick={() => handleRestoreVersion(v)}>
                <ListItemText
                  primary={`Version ${i + 1}`}
                  secondary={new Date(v.timestamp).toLocaleString()}
                />
              </MenuItem>
            ))
          )}
        </Menu>
        <IconButton
          onClick={handleManualSave}
          disabled={!hasChanges || saving}
          color="primary"
          title="Save (Ctrl+S)"
        >
          <Save />
        </IconButton>
        <Tooltip title="Export / Download">
          <IconButton onClick={(e) => setExportAnchor(e.currentTarget)}>
            <Download />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={exportAnchor}
          open={Boolean(exportAnchor)}
          onClose={() => setExportAnchor(null)}
        >
          <MenuItem onClick={handleExportMd}>
            <ListItemText primary="Download .md" secondary="Markdown file" />
          </MenuItem>
          <MenuItem onClick={handleExportDocx}>
            <ListItemText primary="Download .docx" secondary="Word document" />
          </MenuItem>
        </Menu>
        <Divider orientation="vertical" flexItem />
        <IconButton
          onClick={() => setIsPreview(!isPreview)}
          color={isPreview ? "primary" : "default"}
          title={isPreview ? "Edit" : "Preview"}
        >
          {isPreview ? <Edit /> : <Visibility />}
        </IconButton>
      </Paper>

      {/* Editor/Preview */}
      <Box sx={{ flexGrow: 1, overflow: "auto" }}>
        {isPreview ? (
          <Paper sx={{ p: 3, minHeight: "100%" }}>
            <div className="markdown-preview">{renderPreview()}</div>
          </Paper>
        ) : (
          <BlockEditor initialContent={file.content || ""} onChange={handleContentChange} wikiId={wikiId} onFileSelect={onFileSelect} />
        )}
      </Box>
    </Box>
  )
}
