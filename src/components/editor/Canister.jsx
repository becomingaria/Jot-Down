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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Drawer,
  Chip,
  Stack,
  CircularProgress,
} from "@mui/material"
import { Save, Visibility, Edit, History, Download, Close, CheckCircle, WifiOff, Wifi } from "@mui/icons-material"
import { processMarkdown, extractCSVBlocks } from "../../utils/markdown"
import { CsvTable } from "./CsvTable"
import { BlockEditor } from "./BlockEditor"
import { useFile } from "../../hooks/useFile"
import { useCollaboration } from "../../hooks/useCollaboration"
import { apiClient } from "../../services/api"
import { useAuth } from "../../contexts/AuthContext"

/* ─── Version helpers ─── */
const EDITS_PER_CHECKPOINT = 100

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

function computeSideBySideDiff(oldText = "", newText = "") {
  const unified = computeLineDiff(oldText, newText)
  const rows = []
  let i = 0
  while (i < unified.length) {
    if (unified[i].type === "equal") {
      rows.push({ left: unified[i].text, right: unified[i].text, type: "equal" })
      i++
    } else {
      const deletes = []
      const adds = []
      while (i < unified.length && (unified[i].type === "delete" || unified[i].type === "add")) {
        if (unified[i].type === "delete") deletes.push(unified[i].text)
        else adds.push(unified[i].text)
        i++
      }
      const maxLen = Math.max(deletes.length, adds.length)
      for (let j = 0; j < maxLen; j++) {
        rows.push({
          left: j < deletes.length ? deletes[j] : null,
          right: j < adds.length ? adds[j] : null,
          type: "changed",
        })
      }
    }
  }
  return rows
}

function relativeTime(isoString) {
  const delta = (Date.now() - new Date(isoString).getTime()) / 1000
  if (delta < 60) return "Just now"
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`
  return `${Math.floor(delta / 86400)}d ago`
}

export function Canister({ wikiId, fileId, onFileSelect, onRename }) {
  const { file, updateFile, saveContent } = useFile(wikiId, fileId)
  const { idToken, accessToken, user } = useAuth()
  const [content, setContent] = useState("")
  const [isPreview, setIsPreview] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimeoutRef = useRef(null)
  // Debounced save-status label — only appears after 1.5 s of inactivity
  // so it doesn’t flash on every keystroke.
  const [saveStatus, setSaveStatus] = useState(null) // null | 'unsaved' | 'saving' | 'saved'
  const [statusMessage, setStatusMessage] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [remoteSyncMessage, setRemoteSyncMessage] = useState("")
  const statusTimerRef = useRef(null)
  const remoteSyncTimerRef = useRef(null)
  const wsBroadcastTimerRef = useRef(null)
  const sendContentRef = useRef(null)
  const [exportAnchor, setExportAnchor] = useState(null)

  const lastSyncedRevRef = useRef(null)
  const [externalLiveContent, setExternalLiveContent] = useState(null)
  // Tracks which fileId we've already done the initial content load for.
  // Prevents post-save refetches from clobbering in-flight edits.
  const fileLoadedRef = useRef(null)

  // Editable heading state
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState("")

  const getDraftKey = (wikiId, fileId) => `jd:draft:${wikiId}:${fileId}`

  // Version checkpoint state
  const editCountRef = useRef(0)
  const [versions, setVersions] = useState([])
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [editorKey, setEditorKey] = useState(0)

  // Draft localStorage state
  const [hasDraft, setHasDraft] = useState(false)
  const [draftContent, setDraftContent] = useState("")

  // Version diff UI state
  const [diffDialogOpen, setDiffDialogOpen] = useState(false)
  const [diffVersion, setDiffVersion] = useState(null)
  const [diffRows, setDiffRows] = useState([])

  const loadServerVersions = useCallback(async () => {
    if (!wikiId || !fileId) return
    try {
      const data = await apiClient.getVersions(wikiId, fileId)
      setVersions(data.versions || [])
    } catch (err) {
      console.warn("Failed to load server versions", err)
    }
  }, [wikiId, fileId])

  // Only load content when the file that arrived belongs to the current fileId.
  // Without this guard, a late-arriving refetch from the previous file's
  // updateFile call would overwrite the editor with stale content.
  useEffect(() => {
    if (file?.fileId === fileId && file?.content !== undefined && wikiId && fileId) {
      // Always keep content/ref in sync for save logic
      setContent(file.content)
      contentRef.current = file.content  // keep ref in sync so unmount-save is accurate
      setHasChanges(false)
      editCountRef.current = 0

      // Only push through externalLiveContent on the FIRST load for this fileId.
      // Post-save refetches must not reset the editor — the user may be mid-type.
      const isInitialLoad = fileLoadedRef.current !== fileId
      if (isInitialLoad) {
        fileLoadedRef.current = fileId
      }

      try {
        const draftKey = getDraftKey(wikiId, fileId)
        const saved = localStorage.getItem(draftKey)
        if (saved && saved !== file.content) {
          setHasDraft(true)
          setDraftContent(saved)
          setContent(saved)
          if (isInitialLoad) setExternalLiveContent(saved)
          contentRef.current = saved
          setHasChanges(true)
          setSaveStatus("unsaved")
          setStatusMessage("Unsaved draft restored from local storage.")
          // keep local draft so user can continue typing or save
          return
        }

        if (isInitialLoad) setExternalLiveContent(file.content)
        setHasDraft(false)
        setDraftContent("")
        localStorage.removeItem(draftKey)
      } catch (err) {
        console.warn("Failed to load local draft", err)
        if (isInitialLoad) setExternalLiveContent(file.content)
      }
    }
  }, [file, wikiId, fileId])

  useEffect(() => {
    if (!wikiId || !fileId) return

    // Reset initial-load guard so the new file's first fetch triggers BlockEditor update
    fileLoadedRef.current = null

    // Cleanup old localStorage version keys from previous local checkpoint implementation.
    try {
      localStorage.removeItem(`jd:versions:${wikiId}:${fileId}`)
    } catch (err) {
      console.warn("Failed to clean old version localStorage key", err)
    }

    loadServerVersions()
  }, [wikiId, fileId, loadServerVersions])

  // Polling fallback — runs at 1.5 s when VITE_WS_URL is not configured.
  // Even when WS IS configured, polling runs at 8 s as a safety net to catch
  // any updates the WebSocket might have missed (e.g. after reconnect).
  useEffect(() => {
    if (!wikiId || !fileId) return
    const hasWs = Boolean(import.meta.env.VITE_WS_URL)
    let isActive = true

    const liveSyncTick = async () => {
      if (!isActive) return
      // If local user is actively editing, skip to avoid overwriting mid-sentence
      if (saveTimeoutRef.current) return
      try {
        const latest = await apiClient.getFile(wikiId, fileId)
        if (!latest?.content) return

        if (latest.content !== contentRef.current) {
          setExternalLiveContent(latest.content)
          setContent(latest.content)
          contentRef.current = latest.content
          setHasChanges(false)
          setSaveStatus("saved")
          setStatusMessage("Live update received")
          setRemoteSyncMessage("☁ Updated by collaborator")

          if (remoteSyncTimerRef.current) clearTimeout(remoteSyncTimerRef.current)
          remoteSyncTimerRef.current = setTimeout(() => setRemoteSyncMessage(""), 3000)
        }
      } catch (err) {
        console.warn("Live sync failed", err)
      }
    }

    // Poll at 1.5 s without WS, 8 s as a safety-net when WS is active
    const intervalId = setInterval(liveSyncTick, hasWs ? 8000 : 1500)
    liveSyncTick()

    return () => {
      isActive = false
      clearInterval(intervalId)
    }
  }, [wikiId, fileId])

  // Refs to avoid stale closures in auto-save timer
  const contentRef = useRef(content)
  const savingRef = useRef(false)
  const fileContentRef = useRef(file?.content)  // tracks latest saved server content
  const updateFileRef = useRef(updateFile)       // stable ref to latest updateFile fn
  const saveContentRef = useRef(saveContent)     // stable ref to fire-and-forget save

  // ── Real-time collaboration via WebSocket ────────────────────────────────
  const { connectionStatus, remoteUpdate, clearRemoteUpdate, remoteContent, clearRemoteContent, sendContent, remoteCursors, sendCursor } = useCollaboration({
    wikiId,
    fileId,
    accessToken,
    userEmail: user?.email,
  })
  // Keep stable refs so callbacks can use them without stale closures
  sendContentRef.current = sendContent
  const sendCursorRef = useRef(null)
  sendCursorRef.current = sendCursor

  // Keystroke-level remote content — last-write-wins, applied via externalContent (no remount)
  useEffect(() => {
    if (!remoteContent) return
    clearRemoteContent()

    const { content: incoming, fromEmail } = remoteContent
    if (incoming === contentRef.current) return

    setExternalLiveContent(incoming)
    setContent(incoming)
    contentRef.current = incoming
    setRemoteSyncMessage(`⚡ ${fromEmail || "collaborator"} is typing…`)
    if (remoteSyncTimerRef.current) clearTimeout(remoteSyncTimerRef.current)
    remoteSyncTimerRef.current = setTimeout(() => setRemoteSyncMessage(""), 2500)
  }, [remoteContent]) // eslint-disable-line react-hooks/exhaustive-deps

  // Authoritative save notification — always apply (last-write-wins)
  useEffect(() => {
    if (!remoteUpdate) return
    clearRemoteUpdate()

    const incoming = remoteUpdate
    apiClient.getFile(wikiId, fileId).then((latest) => {
      if (!latest?.content) return
      setExternalLiveContent(latest.content)
      setContent(latest.content)
      contentRef.current = latest.content
      fileContentRef.current = latest.content
      lastSyncedRevRef.current = incoming.rev
      setHasChanges(false)
      setSaveStatus("saved")
      setStatusMessage("Live update received")
      setRemoteSyncMessage(`☁ Saved by ${incoming.updatedBy || "collaborator"}`)
      if (remoteSyncTimerRef.current) clearTimeout(remoteSyncTimerRef.current)
      remoteSyncTimerRef.current = setTimeout(() => setRemoteSyncMessage(""), 3500)
    }).catch((err) => console.warn("WS: failed to fetch updated content", err))
  }, [remoteUpdate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track local cursor position and broadcast to collaborators
  useEffect(() => {
    if (!wikiId || !fileId) return
    const handleSelChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      // Walk up from node to find [data-block-id]
      let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
      while (el && !el.dataset?.blockId) el = el.parentElement
      if (!el) return
      // Use block index (position) — stable across users; UUIDs differ per client
      const allBlocks = Array.from(document.querySelectorAll('[data-block-id]'))
      const blockIndex = allBlocks.indexOf(el)
      if (blockIndex === -1) return
      // Count characters before cursor in the .block-editable
      const editable = el.querySelector('.block-editable') || el
      const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT)
      let offset = 0, n = walker.nextNode()
      while (n) {
        if (n === range.startContainer) { offset += range.startOffset; break }
        offset += n.textContent.length
        n = walker.nextNode()
      }
      sendCursorRef.current?.(blockIndex, offset)
    }
    document.addEventListener('selectionchange', handleSelChange)
    return () => document.removeEventListener('selectionchange', handleSelChange)
  }, [wikiId, fileId])

  // Ensure API client has valid auth token for version endpoints
  useEffect(() => {
    if (idToken) apiClient.setIdToken(idToken)
  }, [idToken])

  useEffect(() => { contentRef.current = content }, [content])
  useEffect(() => { fileContentRef.current = file?.content }, [file?.content])
  useEffect(() => { updateFileRef.current = updateFile }, [updateFile])
  useEffect(() => { saveContentRef.current = saveContent }, [saveContent])

  // Track the rev that was current when this file was last loaded/synced
  useEffect(() => {
    if (file?.rev) lastSyncedRevRef.current = file.rev
  }, [file?.rev])

  const createServerVersion = useCallback(
    async (content, label = "Checkpoint") => {
      if (!wikiId || !fileId) return
      try {
        await apiClient.createVersion(wikiId, fileId, content, label)
        await loadServerVersions()
      } catch (err) {
        console.warn("Failed to create server version", err)
      }
    },
    [wikiId, fileId, loadServerVersions],
  )

  const doSave = useCallback(async (text) => {
    if (savingRef.current) return false
    if (text === file?.content) {
      setHasChanges(false)
      setSaveStatus(null)
      setStatusMessage("")
      return false
    }
    try {
      savingRef.current = true
      setSaving(true)
      setIsSaving(true)
      setSaveStatus('saving')
      setStatusMessage('Autosaving…')

      await updateFile({ content: text })
      setHasChanges(false)

      // clear local draft after successful save
      try {
        const draftKey = getDraftKey(wikiId, fileId)
        localStorage.removeItem(draftKey)
      } catch (err) {
        console.warn("Failed to clear local draft", err)
      }

      setHasDraft(false)
      setDraftContent("")
      setSaveStatus('saved')
      setStatusMessage('Saved ✓')
      statusTimerRef.current = setTimeout(() => {
        setSaveStatus(null)
        setStatusMessage("")
      }, 1200)
      return true
    } catch (err) {
      console.error("Auto-save failed:", err)
      setSaveStatus('unsaved')
      setStatusMessage('Auto-save failed')
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
      setIsSaving(false)
    }
  }, [file?.content, updateFile, wikiId, fileId])

  const handleContentChange = useCallback((newContent) => {
    setContent(newContent)
    contentRef.current = newContent
    setHasChanges(true)

    // Show that auto-save is active
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    setSaveStatus('saving')
    setStatusMessage('Autosaving…')

    // Auto-save after 2.5 seconds of inactivity (short enough to not lose
    // work on a refresh, long enough to not flood the API mid-sentence)
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    try {
      const draftKey = getDraftKey(wikiId, fileId)
      localStorage.setItem(draftKey, newContent)
      setHasDraft(true)
      setDraftContent(newContent)
    } catch (err) {
      console.warn("Failed to save draft", err)
    }

    // Broadcast keystroke content to other connected users via WebSocket
    if (wsBroadcastTimerRef.current) clearTimeout(wsBroadcastTimerRef.current)
    wsBroadcastTimerRef.current = setTimeout(() => {
      sendContentRef.current?.(newContent)
    }, 150)

    saveTimeoutRef.current = setTimeout(() => {
      doSave(contentRef.current)
    }, 800)
  }, [doSave, wikiId, fileId])

  const handleManualSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    const didSave = await doSave(contentRef.current)
    if (didSave) {
      try {
        await createServerVersion(contentRef.current, "Manual save")
      } catch (err) {
        console.error("Failed to create manual restore point", err)
      }
    }
  }, [doSave, createServerVersion])

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

  // When the fileId changes, reset editor momentarily and then load draft if available.
  useEffect(() => {
    if (!wikiId || !fileId) return

    // Reset before new file content arrives
    setContent("")
    contentRef.current = ""
    setHasChanges(false)
    setSaveStatus(null)
    setStatusMessage("")

    try {
      const draftKey = getDraftKey(wikiId, fileId)
      const saved = localStorage.getItem(draftKey)
      if (saved) {
        setContent(saved)
        contentRef.current = saved
        setHasChanges(true)
        setSaveStatus('saving')
        setStatusMessage('Recovered unsaved draft')
      }
    } catch (err) {
      console.warn('Failed to load draft on file change', err)
    }

    setEditingName(false)
  }, [wikiId, fileId]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const handleRestoreDraft = useCallback(() => {
    if (!wikiId || !fileId) return
    let draftToRestore = draftContent

    try {
      const draftKey = getDraftKey(wikiId, fileId)
      const stored = localStorage.getItem(draftKey)
      if (stored) draftToRestore = stored
    } catch (err) {
      console.warn("Failed to read draft key", err)
    }

    if (!draftToRestore) return

    setContent(draftToRestore)
    contentRef.current = draftToRestore
    setEditorKey((k) => k + 1)
    setHasChanges(true)
    setHasDraft(false)
    setDraftContent("")

    try {
      const draftKey = getDraftKey(wikiId, fileId)
      localStorage.removeItem(draftKey)
    } catch (err) {
      console.warn("Failed to remove draft key", err)
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    doSave(draftToRestore)
  }, [draftContent, doSave, wikiId, fileId])

  const handleRestoreVersion = async (version) => {
    setVersionsOpen(false)

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
    setEditorKey((k) => k + 1) // force BlockEditor to re-mount with restored content
    setHasChanges(true)
    // Trigger a save immediately so it persists
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    await doSave(contentToRestore)
    // Do not automatically create an extra restore point when restoring a version.
    // Use the Save button to explicitly create restore points.
  }

  const handleCompareVersion = async (version) => {
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
    const rows = computeSideBySideDiff(versionContent || "", current)
    setDiffVersion({ ...version, content: versionContent })
    setDiffRows(rows)
    setDiffDialogOpen(true)
  }

  const handleCloseDiffDialog = () => {
    setDiffDialogOpen(false)
    setDiffVersion(null)
    setDiffRows([])
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 220, gap: 1 }}>
          {isSaving && (
            <Box className="loader" sx={{ opacity: 0.85 }} />
          )}
          <Typography
            variant="body2"
            sx={{
              minWidth: 90,
              textAlign: 'center',
              opacity: isSaving || saveStatus ? 1 : 0.7,
              transition: 'opacity 150ms ease',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {remoteSyncMessage ||
              (saveStatus === 'saving'
                ? 'Autosaving\u2026'
                : saveStatus === 'saved'
                  ? 'Saved'
                  : saveStatus === 'unsaved'
                    ? 'Unsaved'
                    : '')}
          </Typography>
          {import.meta.env.VITE_WS_URL && (
            <Tooltip title={connectionStatus === 'open' ? 'Live collaboration active' : 'Reconnecting\u2026'}>
              {connectionStatus === 'open'
                ? <Wifi sx={{ fontSize: 16, color: 'success.main', opacity: 0.8 }} />
                : <WifiOff sx={{ fontSize: 16, color: 'text.disabled', opacity: 0.5 }} />}
            </Tooltip>
          )}
        </Box>
        <Tooltip title={versions.length === 0 ? "No versions yet — save to create one" : `${versions.length} saved version${versions.length !== 1 ? "s" : ""}`}>
          <span>
            <IconButton
              onClick={() => setVersionsOpen(true)}
              color="default"
            >
              <History />
            </IconButton>
          </span>
        </Tooltip>

        {/* Version History Drawer */}
        <Drawer
          anchor="right"
          open={versionsOpen}
          onClose={() => setVersionsOpen(false)}
          PaperProps={{ sx: { width: 300, mt: 10, height: 'calc(100vh - 8rem)' } }}
        >
          <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography variant="h6">Version History</Typography>
            <IconButton size="small" onClick={() => setVersionsOpen(false)}><Close /></IconButton>
          </Box>
          <Divider />
          <Box sx={{ overflow: "auto", flexGrow: 1 }}>
            {versions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                No versions yet. Versions are created each time you save (Ctrl+S).
              </Typography>
            ) : (
              versions.map((v) => (
                <Box key={v.versionId} sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                    <Chip
                      label={v.label || "Checkpoint"}
                      size="small"
                      color={v.label === "Manual save" ? "primary" : "default"}
                      variant="outlined"
                    />
                  </Box>
                  <Tooltip title={new Date(v.createdAt).toLocaleString()} placement="left">
                    <Typography variant="body2" color="text.secondary" sx={{ cursor: "default" }}>
                      {relativeTime(v.createdAt)}
                    </Typography>
                  </Tooltip>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button size="small" variant="outlined" onClick={() => handleCompareVersion(v)}>
                      View diff
                    </Button>
                    <Button size="small" variant="contained" onClick={() => handleRestoreVersion(v)}>
                      Restore
                    </Button>
                  </Stack>
                </Box>
              ))
            )}
          </Box>
          <Divider />
          <Box sx={{ p: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              Ctrl+S creates a new recovery point on every save.
            </Typography>
          </Box>
        </Drawer>

        {/* Side-by-side diff dialog */}
        <Dialog open={diffDialogOpen} onClose={handleCloseDiffDialog} maxWidth="lg" fullWidth>
          <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pb: 1 }}>
            <Box>
              <Typography variant="h6">
                {diffVersion?.label || "Version"} — {diffVersion ? relativeTime(diffVersion.createdAt) : ""}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {diffVersion ? new Date(diffVersion.createdAt).toLocaleString() : ""}
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="small"
              onClick={() => { handleRestoreVersion(diffVersion); handleCloseDiffDialog() }}
            >
              Restore this version
            </Button>
          </DialogTitle>
          <DialogContent dividers sx={{ p: 0 }}>
            {/* Column headers */}
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid", borderColor: "divider" }}>
              <Box sx={{ p: 1.5, borderRight: "1px solid", borderColor: "divider", bgcolor: "action.hover" }}>
                <Typography variant="caption" fontWeight={600} color="error.main">
                  {diffVersion ? relativeTime(diffVersion.createdAt) : "Older version"}
                </Typography>
              </Box>
              <Box sx={{ p: 1.5, bgcolor: "action.hover" }}>
                <Typography variant="caption" fontWeight={600} color="success.main">Current</Typography>
              </Box>
            </Box>
            {/* Diff rows */}
            <Box component="div" sx={{ fontFamily: "monospace", fontSize: "0.8rem", maxHeight: 500, overflow: "auto" }}>
              {diffRows.map((row, idx) => (
                <Box key={idx} sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "1.4em" }}>
                  <Box sx={{
                    px: 1.5, py: 0.15,
                    borderRight: "1px solid",
                    borderColor: "divider",
                    bgcolor: row.type === "changed" && row.left !== null ? "error.light" : "transparent",
                    color: row.type === "changed" && row.left !== null ? "error.dark" : "text.primary",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}>
                    {row.left !== null ? `${row.type === "changed" ? "−" : " "} ${row.left}` : ""}
                  </Box>
                  <Box sx={{
                    px: 1.5, py: 0.15,
                    bgcolor: row.type === "changed" && row.right !== null ? "success.light" : "transparent",
                    color: row.type === "changed" && row.right !== null ? "success.dark" : "text.primary",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}>
                    {row.right !== null ? `${row.type === "changed" ? "+" : " "} ${row.right}` : ""}
                  </Box>
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
          title="Hard save (create restore point)"
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
          <BlockEditor key={`${fileId}-${editorKey}`} initialContent={content || ""} externalContent={externalLiveContent} remoteCursors={remoteCursors} onChange={handleContentChange} wikiId={wikiId} onFileSelect={onFileSelect} fileId={fileId} />
        )}
      </Box>
    </Box>
  )
}
