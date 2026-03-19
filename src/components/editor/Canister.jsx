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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material"
import { Save, Visibility, Edit, History, Download, Bookmark, CompareArrows } from "@mui/icons-material"
import { processMarkdown, extractCSVBlocks } from "../../utils/markdown"
import { CsvTable } from "./CsvTable"
import { BlockEditor } from "./BlockEditor"
import { useFile } from "../../hooks/useFile"
import { apiClient } from "../../services/api"
import { useAuth } from "../../contexts/AuthContext"

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

function computeLineDiff(oldText = "", newText = "") {
  const oldLines = oldText.split("\n")
  const newLines = newText.split("\n")
  const n = oldLines.length
  const m = newLines.length
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))

  for (let i = n - 1; i >= 0; --i) {
    for (let j = m - 1; j >= 0; --j) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const diff = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      diff.push({ type: "equal", text: oldLines[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      diff.push({ type: "delete", text: oldLines[i] })
      i += 1
    } else {
      diff.push({ type: "add", text: newLines[j] })
      j += 1
    }
  }

  while (i < n) {
    diff.push({ type: "delete", text: oldLines[i] })
    i += 1
  }
  while (j < m) {
    diff.push({ type: "add", text: newLines[j] })
    j += 1
  }

  return diff
}

export function Canister({ wikiId, fileId, onFileSelect, onRename }) {
  const { file, updateFile, saveContent } = useFile(wikiId, fileId)
  const { idToken } = useAuth()
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
  const [serverVersions, setServerVersions] = useState([])
  const [versionsAnchor, setVersionsAnchor] = useState(null)

  // Version diff UI state
  const [diffDialogOpen, setDiffDialogOpen] = useState(false)
  const [diffVersion, setDiffVersion] = useState(null)
  const [diffLines, setDiffLines] = useState([])

  const loadServerVersions = useCallback(async () => {
    if (!wikiId || !fileId) return
    try {
      const data = await apiClient.getVersions(wikiId, fileId)
      setServerVersions(data.versions || [])
    } catch (err) {
      console.warn("Failed to load server versions", err)
    }
  }, [wikiId, fileId])

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
      loadServerVersions()
    }
  }, [wikiId, fileId, loadServerVersions])

  // Refs to avoid stale closures in auto-save timer
  const contentRef = useRef(content)
  const savingRef = useRef(false)
  const fileContentRef = useRef(file?.content)  // tracks latest saved server content
  const updateFileRef = useRef(updateFile)       // stable ref to latest updateFile fn
  const saveContentRef = useRef(saveContent)     // stable ref to fire-and-forget save

  // Ensure API client has valid auth token for version endpoints
  useEffect(() => {
    if (idToken) apiClient.setIdToken(idToken)
  }, [idToken])

  useEffect(() => { contentRef.current = content }, [content])
  useEffect(() => { fileContentRef.current = file?.content }, [file?.content])
  useEffect(() => { updateFileRef.current = updateFile }, [updateFile])
  useEffect(() => { saveContentRef.current = saveContent }, [saveContent])

  const createServerVersion = useCallback(
    async (content) => {
      if (!wikiId || !fileId) return
      try {
        await apiClient.createVersion(wikiId, fileId, content)
        await loadServerVersions()
      } catch (err) {
        console.warn("Failed to create server version", err)
      }
    },
    [wikiId, fileId, loadServerVersions],
  )

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
      // Mirror checkpoint to server (best-effort)
      createServerVersion(newContent)
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

  const handleSavePoint = useCallback(async () => {
    const current = contentRef.current
    if (!wikiId || !fileId || current === undefined) return

    // Local snapshot
    const v = saveVersion(wikiId, fileId, current)
    setVersions(v)

    // Server checkpoint (best-effort)
    await createServerVersion(current)
  }, [createServerVersion, fileId, saveVersion, wikiId])

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
  const handleRestoreVersion = async (version) => {
    setVersionsAnchor(null)

    let contentToRestore = version.content
    if (!contentToRestore && version.versionId) {
      try {
        const response = await apiClient.getVersion(wikiId, fileId, version.versionId)
        contentToRestore = response.content
      } catch (err) {
        console.error("Failed to fetch version content", err)
        return
      }
    }

    if (!contentToRestore) return

    setContent(contentToRestore)
    contentRef.current = contentToRestore
    setHasChanges(true)
    // Trigger a save immediately so it persists
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    doSave(contentToRestore)
  }

  const handleCompareVersion = async (version) => {
    setVersionsAnchor(null)

    let versionContent = version.content
    if (!versionContent && version.versionId) {
      try {
        const response = await apiClient.getVersion(wikiId, fileId, version.versionId)
        versionContent = response.content
      } catch (err) {
        console.error("Failed to fetch version content", err)
        return
      }
    }

    const current = contentRef.current ?? file?.content ?? ""
    const diff = computeLineDiff(versionContent || "", current)
    setDiffVersion({ ...version, content: versionContent })
    setDiffLines(diff)
    setDiffDialogOpen(true)
  }

  const handleCloseDiffDialog = () => {
    setDiffDialogOpen(false)
    setDiffVersion(null)
    setDiffLines([])
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
    <Box sx={{ height: "100%", minHeight: "200vh", display: "flex", flexDirection: "column" }}>
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
        <Tooltip title="Save point">
          <span>
            <IconButton
              onClick={handleSavePoint}
              disabled={!content || saving}
              color="default"
            >
              <Bookmark />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={`${versions.length + serverVersions.length} version${versions.length + serverVersions.length !== 1 ? "s" : ""}`}>
          <span>
            <IconButton
              onClick={(e) => setVersionsAnchor(e.currentTarget)}
              disabled={versions.length + serverVersions.length === 0}
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
          {versions.length === 0 && serverVersions.length === 0 && (
            <MenuItem disabled>No versions yet</MenuItem>
          )}

          {versions.length > 0 && (
            <>
              <MenuItem disabled>Local versions</MenuItem>
              {versions.map((v, i) => (
                <MenuItem
                  key={`local-${i}`}
                  onClick={() => handleRestoreVersion(v)}
                  sx={{ justifyContent: "space-between" }}
                >
                  <ListItemText
                    primary={`Version ${i + 1}`}
                    secondary={new Date(v.timestamp).toLocaleString()}
                  />
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCompareVersion(v)
                    }}
                  >
                    <CompareArrows fontSize="small" />
                  </IconButton>
                </MenuItem>
              ))}
            </>
          )}

          {serverVersions.length > 0 && (
            <>
              <Divider />
              <MenuItem disabled>Server versions</MenuItem>
              {serverVersions.map((v) => (
                <MenuItem
                  key={`server-${v.versionId}`}
                  onClick={() => handleRestoreVersion(v)}
                  sx={{ justifyContent: "space-between" }}
                >
                  <ListItemText
                    primary={new Date(v.createdAt).toLocaleString()}
                    secondary={`Version ${v.versionId}`}
                  />
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCompareVersion(v)
                    }}
                  >
                    <CompareArrows fontSize="small" />
                  </IconButton>
                </MenuItem>
              ))}
            </>
          )}
        </Menu>
        <Dialog open={diffDialogOpen} onClose={handleCloseDiffDialog} maxWidth="md" fullWidth>
          <DialogTitle>Compare to version</DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Comparing current document with {diffVersion ? `version ${diffVersion.versionId ?? ''} (${diffVersion.createdAt ? new Date(diffVersion.createdAt).toLocaleString() : 'unknown'})` : 'selected version'}.
            </Typography>
            <Box
              component="pre"
              sx={{
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 360,
                overflow: "auto",
                bgcolor: "background.paper",
                p: 1,
                borderRadius: 1,
              }}
            >
              {diffLines.map((line, idx) => (
                <Box
                  key={idx}
                  component="div"
                  sx={{
                    bgcolor:
                      line.type === "add"
                        ? "success.light"
                        : line.type === "delete"
                          ? "error.light"
                          : "transparent",
                    color:
                      line.type === "add"
                        ? "success.dark"
                        : line.type === "delete"
                          ? "error.dark"
                          : "text.primary",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {line.type === "add" ? "+" : line.type === "delete" ? "-" : " "}
                  {line.text}
                </Box>
              ))}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDiffDialog}>Close</Button>
          </DialogActions>
        </Dialog>
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
