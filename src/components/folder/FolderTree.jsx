import { useState, useEffect, useRef } from "react"
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Button,
  Menu,
  MenuItem,
  Typography,
  Tooltip,
  Snackbar,
  Alert,
} from "@mui/material"
import {
  Folder as FolderIcon,
  FolderOpen,
  InsertDriveFile,
  ExpandMore,
  ChevronRight,
  Add,
  Delete,
  Description,
  DragIndicator,
  Image as ImageIcon,
  TableChart,
  NoteAdd,
  CreateNewFolder,
  PostAdd,
  ArrowUpward,
  ArrowDownward,
  MoreVert,
  Close,
  Edit,
} from "@mui/icons-material"
import { zipSync } from "fflate/browser"
import { apiClient } from "../../services/api"
import { useFolders } from "../../hooks/useFolder"
import { useFiles } from "../../hooks/useFile"

export function FolderTree({ wikiId, onFileSelect, selectedFileId, refreshTrigger, isMobile }) {
  const { folders, createFolder, deleteFolder, updateFolder } = useFolders(wikiId)
  const { files, createFile, deleteFile, updateFile, refetch: refetchFiles } = useFiles(wikiId)
  const [expandedFolders, setExpandedFolders] = useState({})
  const [expandedFiles, setExpandedFiles] = useState({})
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createType, setCreateType] = useState("file") // 'file', 'folder', or 'subpage'
  const [createName, setCreateName] = useState("")
  const [parentFolderId, setParentFolderId] = useState(null)
  const [parentFileId, setParentFileId] = useState(null)

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null) // { type: 'file'|'folder', id, name }
  const [renameName, setRenameName] = useState("")

  // Mobile move menu state
  const [mobileMoveAnchor, setMobileMoveAnchor] = useState(null)
  const [mobileMoveTarget, setMobileMoveTarget] = useState(null) // { type, id, parentKey }

  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState(null) // { type: 'file'|'folder', id, name }

  // Export folder state
  const [exportingFolderId, setExportingFolderId] = useState(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState(null) // { mouseX, mouseY, type, id, name, folderId }

  // Folder + dropdown (New File / New Sub-folder)
  const [addMenuAnchor, setAddMenuAnchor] = useState(null)
  const [addMenuFolderId, setAddMenuFolderId] = useState(null)

  // Drag-and-drop
  // dragState holds the in-progress drag (one or many items)
  const [dragState, setDragState] = useState(null)
  // dropTarget: { id, position: 'before'|'after'|'into', parentKey } | null
  const [dropTarget, setDropTarget] = useState(null)
  // Multi-select: Set<"type:id">
  const [selectedItems, setSelectedItems] = useState(new Set())
  // Flash highlight id after a successful move
  const [lastMovedId, setLastMovedId] = useState(null)
  // Undo history (max 10 operations)
  const [undoStack, setUndoStack] = useState([])
  // Scroll container ref for auto-scroll during drag
  const scrollRef = useRef(null)
  // Synchronous drag state ref — used to read drag info consistently even if state is delayed
  const dragStateRef = useRef(null)
  // Hover-to-expand collapsed folder timer
  const hoverExpandTimerRef = useRef(null)
  // Auto-scroll animation frame handle
  const dragScrollRafRef = useRef(null)
  // Cursor Y for auto-scroll
  const dragCursorYRef = useRef(0)
  // Stable ref to undo handler (avoids stale closures in document listeners)
  const handleUndoRef = useRef(null)

  // Persistent ordering — stored in localStorage per wiki
  const [localOrder, setLocalOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`jd:order:${wikiId}`) || "{}") }
    catch { return {} }
  })
  const saveOrder = (order) => {
    setLocalOrder(order)
    try { localStorage.setItem(`jd:order:${wikiId}`, JSON.stringify(order)) } catch { }
  }

  // Refresh file list when parent signals a rename happened
  useEffect(() => {
    if (refreshTrigger > 0) refetchFiles()
  }, [refreshTrigger])

  // Auto-expand ancestor folders/pages when the selected file changes
  useEffect(() => {
    if (!selectedFileId || !files.length) return

    const fileMap = Object.fromEntries(files.map((f) => [f.fileId, f]))
    const folderMap = Object.fromEntries(folders.map((f) => [f.folderId, f]))

    const newExpandedFiles = {}
    const newExpandedFolders = {}

    // Walk up the parentFileId chain, expanding each ancestor page
    let cursor = fileMap[selectedFileId]
    const visitedFiles = new Set()
    while (cursor?.parentFileId && !visitedFiles.has(cursor.parentFileId)) {
      visitedFiles.add(cursor.parentFileId)
      newExpandedFiles[cursor.parentFileId] = true
      cursor = fileMap[cursor.parentFileId]
    }

    // cursor is now the root of the sub-page chain — walk its folder ancestry
    const rootFolderId = cursor?.folderId
    if (rootFolderId) {
      let currFolder = folderMap[rootFolderId]
      const visitedFolders = new Set()
      while (currFolder && !visitedFolders.has(currFolder.folderId)) {
        visitedFolders.add(currFolder.folderId)
        newExpandedFolders[currFolder.folderId] = true
        currFolder = currFolder.parentFolderId ? folderMap[currFolder.parentFolderId] : null
      }
    }

    if (Object.keys(newExpandedFiles).length)
      setExpandedFiles((prev) => ({ ...prev, ...newExpandedFiles }))
    if (Object.keys(newExpandedFolders).length)
      setExpandedFolders((prev) => ({ ...prev, ...newExpandedFolders }))
  }, [selectedFileId, files, folders])

  const toggleFolder = (folderId) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }))
  }

  const toggleFileExpand = (fileId) => {
    setExpandedFiles((prev) => ({
      ...prev,
      [fileId]: !prev[fileId],
    }))
  }

  /* ── DnD ─────────────────────────────────────────────────────────── */

  // Returns true if sourceFolderId is an ancestor of targetFolderId (circular drop prevention)
  const isFolderDescendant = (sourceFolderId, targetFolderId) => {
    if (!sourceFolderId || !targetFolderId) return false
    if (sourceFolderId === targetFolderId) return true
    let cursor = folderMap[targetFolderId]
    const visited = new Set()
    while (cursor && !visited.has(cursor.folderId)) {
      visited.add(cursor.folderId)
      if (cursor.parentFolderId === sourceFolderId) return true
      cursor = cursor.parentFolderId ? folderMap[cursor.parentFolderId] : null
    }
    return false
  }

  const isFileDescendant = (sourceFileId, targetFileId) => {
    if (!sourceFileId || !targetFileId) return false
    if (sourceFileId === targetFileId) return true
    const fileMap = Object.fromEntries(files.map((f) => [f.fileId, f]))
    let cursor = fileMap[targetFileId]
    const visited = new Set()
    while (cursor && !visited.has(cursor.fileId)) {
      visited.add(cursor.fileId)
      if (cursor.parentFileId === sourceFileId) return true
      cursor = cursor.parentFileId ? fileMap[cursor.parentFileId] : null
    }
    return false
  }

  const startDragScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const step = () => {
      const rect = el.getBoundingClientRect()
      const y = dragCursorYRef.current
      const zone = 60
      if (y < rect.top + zone) el.scrollTop -= Math.ceil((zone - (y - rect.top)) / 4)
      else if (y > rect.bottom - zone) el.scrollTop += Math.ceil((zone - (rect.bottom - y)) / 4)
      dragScrollRafRef.current = requestAnimationFrame(step)
    }
    dragScrollRafRef.current = requestAnimationFrame(step)
  }
  const stopDragScroll = () => {
    if (dragScrollRafRef.current) { cancelAnimationFrame(dragScrollRafRef.current); dragScrollRafRef.current = null }
  }

  // Always up-to-date — document keydown listener calls this via the ref
  handleUndoRef.current = async () => {
    if (!undoStack.length) return
    const last = undoStack[undoStack.length - 1]
    console.log("%c[DnD] undo triggered", "color:#ff5722;font-weight:bold", last)
    try {
      for (const { id, type, fromFolderId, fromParentFileId } of last.items) {
        console.log("[DnD] undo item:", { id, type, fromFolderId, fromParentFileId })
        if (type === "file") await updateFile(id, { folderId: fromFolderId, parentFileId: fromParentFileId })
        else await updateFolder(id, { parentFolderId: fromFolderId })
      }
      setUndoStack(prev => prev.slice(0, -1))
      await refetchFiles()
    } catch (err) { console.error("[DnD] Undo failed:", err) }
  }

  useEffect(() => {
    const reset = (source) => {
      dragStateRef.current = null
      setDragState(null)
      setDropTarget(null)
      stopDragScroll()
      if (hoverExpandTimerRef.current) { clearTimeout(hoverExpandTimerRef.current); hoverExpandTimerRef.current = null }
      console.log(`%c[DnD] reset via "${source}"`, "color:#9e9e9e")
    }
    const resetDragend = () => reset("dragend")
    const resetDrop = () => reset("drop")
    const resetMouseup = () => reset("mouseup")
    const trackY = (e) => { dragCursorYRef.current = e.clientY }
    const handleKeyDown = (e) => {
      if (e.key === "Escape") reset()
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        handleUndoRef.current?.()
      }
    }
    document.addEventListener("dragend", resetDragend)
    document.addEventListener("drop", resetDrop)
    document.addEventListener("mouseup", resetMouseup)
    document.addEventListener("mousemove", trackY)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("dragend", resetDragend)
      document.removeEventListener("drop", resetDrop)
      document.removeEventListener("mouseup", resetMouseup)
      document.removeEventListener("mousemove", trackY)
      document.removeEventListener("keydown", handleKeyDown)
      stopDragScroll()
    }
  }, [])

  const handleDragStart = (e, type, id) => {
    e.stopPropagation()
    const key = `${type}:${id}`
    const allSelected = selectedItems.has(key) && selectedItems.size > 1
    const itemsBeingDragged = allSelected
      ? [...selectedItems].map(k => { const [t, ...rest] = k.split(":"); return { type: t, id: rest.join(":") } })
      : [{ type, id }]

    const newDragState = { items: itemsBeingDragged, primary: { type, id } }
    dragStateRef.current = newDragState
    console.log(`%c[DnD] dragStart`, "color:#2196f3;font-weight:bold", { type, id, multiSelect: allSelected, itemsBeingDragged })

    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", `${type}:${id}`)

    const ghost = document.createElement("div")
    ghost.style.cssText = "position:fixed;top:-9999px;left:-9999px;background:#1976d2;color:#fff;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:600;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.25)"
    ghost.textContent = itemsBeingDragged.length > 1
      ? `✦  ${itemsBeingDragged.length} items`
      : `✦  ${(type === "folder" ? folders.find(f => f.folderId === id) : files.find(f => f.fileId === id))?.name ?? "item"}`
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 16, 16)
    setTimeout(() => document.body.removeChild(ghost), 0)

    startDragScroll()

    // Defer React state update — prevents re-render from canceling the drag.
    requestAnimationFrame(() => {
      setDragState(newDragState)
      setDropTarget(null)
    })
  }

  const handleDragEnd = () => {
    console.log("%c[DnD] dragEnd (synthetic)", "color:#9e9e9e;font-weight:bold")
    dragStateRef.current = null
    setDragState(null)
    setDropTarget(null)
    stopDragScroll()
    if (hoverExpandTimerRef.current) { clearTimeout(hoverExpandTimerRef.current); hoverExpandTimerRef.current = null }
  }

  // Track last logged dropTarget to avoid spamming on every mousemove
  const lastLoggedDropRef = useRef(null)

  const handleItemDragOver = (e, type, id, parentKey) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const relY = (e.clientY - rect.top) / rect.height
    let position
    if (type === "folder") {
      if (relY < 0.25) position = "before"
      else if (relY > 0.75) position = "after"
      else position = "into"
    } else {
      if (relY < 0.25) position = "before"
      else if (relY > 0.75) position = "after"
      else position = "into"
    }

    const targetParentKey = position === "into" ? `file:${id}` : parentKey
    const logKey = `${id}:${position}:${targetParentKey}`
    if (lastLoggedDropRef.current !== logKey) {
      lastLoggedDropRef.current = logKey
      console.log(`%c[DnD] dragOver`, "color:#ff9800;font-weight:bold", { type, id, position, parentKey: targetParentKey, relY: relY.toFixed(2) })
    }
    setDropTarget({ id, position, parentKey: targetParentKey })
    // Hover-to-expand: auto-expand a collapsed folder or file after 600 ms
    const isHoverExpandTarget = (type === "folder" || type === "file") && position === "into"
    const isExpandedMap = type === "folder" ? expandedFolders : expandedFiles
    const setExpandedMap = type === "folder" ? setExpandedFolders : setExpandedFiles
    if (isHoverExpandTarget && !isExpandedMap[id]) {
      if (!hoverExpandTimerRef.current)
        hoverExpandTimerRef.current = setTimeout(() => {
          setExpandedMap(prev => ({ ...prev, [id]: true }))
          hoverExpandTimerRef.current = null
        }, 600)
    } else {
      if (hoverExpandTimerRef.current) { clearTimeout(hoverExpandTimerRef.current); hoverExpandTimerRef.current = null }
    }
  }

  const handleItemDrop = async (e, type, id, parentKey) => {
    e.preventDefault()
    e.stopPropagation()
    // Prefer the ref (always current), but fall back to state if needed
    const currentDrag = dragStateRef.current || dragState
    const items = currentDrag?.items || []
    const rawDt = dropTarget
    const targetParentKey = rawDt?.parentKey ?? parentKey
    console.log("%c[DnD] drop fired", "color:#4caf50;font-weight:bold", { targetType: type, targetId: id, parentKey: targetParentKey, rawDt, items })
    dragStateRef.current = null
    setDragState(null)
    setDropTarget(null)
    stopDragScroll()
    if (!items.length || !rawDt) {
      console.warn("[DnD] drop aborted — no items or no dropTarget", { items, rawDt })
      return
    }
    const activeItems = items.filter(item => item.id !== id)
    if (!activeItems.length) {
      console.warn("[DnD] drop aborted — dropped on self")
      return
    }

    try {
      const dt = rawDt.position === "out-of" ? { ...rawDt, position: "after" } : rawDt

      // Block circular folder drops
      if (dt.position === "into" && type === "folder") {
        for (const item of activeItems) {
          if (item.type === "folder" && isFolderDescendant(item.id, id)) {
            console.warn("[DnD] drop blocked — circular folder drop", { draggedFolder: item.id, targetFolder: id })
            return
          }
        }
      }

      // Block circular file drops (subpage recursion)
      if (dt.position === "into" && type === "file") {
        for (const item of activeItems) {
          if (item.type === "file" && isFileDescendant(item.id, id)) {
            console.warn("[DnD] drop blocked — circular file drop", { draggedFile: item.id, targetFile: id })
            return
          }
        }
      }

      // Snapshot undo record BEFORE any mutation
      const undoRecord = {
        items: activeItems.map(item => {
          const f = item.type === "file" ? files.find(f => f.fileId === item.id) : null
          const fo = item.type === "folder" ? folders.find(f => f.folderId === item.id) : null
          return { id: item.id, type: item.type, fromFolderId: f?.folderId ?? fo?.parentFolderId ?? null, fromParentFileId: f?.parentFileId ?? null }
        })
      }

      if (dt.position === "into" && type === "folder") {
        console.log(`%c[DnD] → moving INTO folder`, "color:#9c27b0;font-weight:bold", { targetFolderId: id, items: activeItems })
        for (const item of activeItems) {
          if (item.type === "file") await updateFile(item.id, { folderId: id, parentFileId: null })
          else await updateFolder(item.id, { parentFolderId: id })
        }
        setUndoStack(prev => [...prev.slice(-9), undoRecord])
        setLastMovedId(id)
        setTimeout(() => setLastMovedId(null), 800)
        await refetchFiles()
        return
      }

      // Snapshot sibling IDs at target parent BEFORE any await
      const snapshotIds = [
        ...((targetParentKey === "root" ? getRootFiles() :
          targetParentKey.startsWith("folder:") ? getFilesForFolder(targetParentKey.slice(7)) :
            getSubPages(targetParentKey.slice(5))).map(f => f.fileId)),
        ...((targetParentKey === "root" ? rootFolders :
          targetParentKey.startsWith("folder:") ? (folderMap[targetParentKey.slice(7)]?.children || []) :
            []).map(f => f.folderId)),
      ]

      let didReparent = false
      for (const item of activeItems) {
        const draggedFile = item.type === "file" ? files.find(f => f.fileId === item.id) : null
        const draggedFolder = item.type === "folder" ? folders.find(f => f.folderId === item.id) : null
        const currentParentKey = item.type === "folder"
          ? (draggedFolder?.parentFolderId ? `folder:${draggedFolder.parentFolderId}` : "root")
          : (draggedFile?.parentFileId ? `file:${draggedFile.parentFileId}`
            : (draggedFile?.folderId ? `folder:${draggedFile.folderId}` : "root"))
        if (currentParentKey !== targetParentKey) {
          const newFolderId = targetParentKey.startsWith("folder:") ? targetParentKey.slice(7) : null
          const newParentFileId = targetParentKey.startsWith("file:") ? targetParentKey.slice(5) : null
          console.log(`%c[DnD] → reparenting`, "color:#e91e63;font-weight:bold", {
            item, currentParentKey, newParentKey: targetParentKey, newFolderId, newParentFileId
          })
          if (item.type === "file") {
            const parentFile = newParentFileId ? files.find(f => f.fileId === newParentFileId) : null
            await updateFile(item.id, {
              folderId: newParentFileId ? (parentFile?.folderId || null) : newFolderId,
              parentFileId: newParentFileId,
            })
          } else {
            await updateFolder(item.id, { parentFolderId: newFolderId })
          }
          didReparent = true
        }
      }

      if (didReparent) {
        console.log("%c[DnD] reparent complete — refetching", "color:#e91e63;font-weight:bold")
        setUndoStack(prev => [...prev.slice(-9), undoRecord])
        setLastMovedId(activeItems[0].id)
        setTimeout(() => setLastMovedId(null), 800)
        await refetchFiles()
      }

      console.log("%c[DnD] → reordering", "color:#00bcd4;font-weight:bold", { parentKey: targetParentKey, insertIdx: dt.position === "after" ? "after " + id : "before " + id, newOrder: [] })
      const primaryItem = activeItems[0]
      const base = localOrder[targetParentKey]?.length ? localOrder[targetParentKey] : snapshotIds
      const existingSet = new Set(base)
      const merged = [...base, ...snapshotIds.filter(i => !existingSet.has(i)), primaryItem.id]
        .filter((v, i, a) => a.indexOf(v) === i)
      const without = merged.filter(i => i !== primaryItem.id)
      const targetIdx = without.indexOf(id)
      const insertIdx = dt.position === "after" ? targetIdx + 1 : Math.max(0, targetIdx)
      const newOrder = [...without.slice(0, insertIdx), primaryItem.id, ...without.slice(insertIdx)]
      saveOrder({ ...localOrder, [targetParentKey]: newOrder })
    } catch (err) {
      console.error("[DnD] drop failed with error:", err)
    }
  }

  const fileIcon = (file) => {
    switch (file.fileType) {
      case "image": return <ImageIcon fontSize="small" color="info" />
      case "csv": return <TableChart fontSize="small" color="success" />
      default: return <InsertDriveFile fontSize="small" />
    }
  }

  // VS Code Explorer-style drop indicator: a horizontal line with a small
  // circle on the left, indented to match the row's nesting level.
  // Optional `label` renders a pill on the right side of the line for clarity.
  const renderDropLine = (id, parentKey, position, level = 0, label = null) => {
    if (dropTarget?.id === id && dropTarget?.parentKey === parentKey && dropTarget?.position === position) {
      const indent = level * 16 // match pl: level * 2 (MUI spacing unit = 8px)
      return (
        <Box sx={{ position: "relative", height: 0, mx: 0, overflow: "visible", zIndex: 10 }}>
          <Box sx={{
            position: "absolute",
            left: indent,
            right: 0,
            top: -1,
            height: 2,
            bgcolor: "primary.main",
            borderRadius: 1,
            "&::before": {
              content: '""',
              position: "absolute",
              left: -4,
              top: -3,
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "primary.main",
            },
          }}>
            {label && (
              <Box sx={{
                position: "absolute",
                right: 4,
                top: -9,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                borderRadius: "4px",
                px: 0.75,
                lineHeight: "18px",
                fontSize: 10,
                fontWeight: 700,
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}>
                {label}
              </Box>
            )}
          </Box>
        </Box>
      )
    }
    return null
  }

  const buildTree = () => {
    const folderMap = {}
    const rootFolders = []

    folders.forEach((folder) => {
      folderMap[folder.folderId] = { ...folder, children: [] }
    })

    folders.forEach((folder) => {
      if (folder.parentFolderId && folderMap[folder.parentFolderId]) {
        folderMap[folder.parentFolderId].children.push(folderMap[folder.folderId])
      } else if (!folder.parentFolderId) {
        rootFolders.push(folderMap[folder.folderId])
      }
    })

    return { rootFolders, folderMap }
  }

  const { rootFolders, folderMap } = buildTree()

  const getParentFolderId = (parentKey) =>
    parentKey.startsWith("folder:") ? parentKey.slice(7) : null

  const getParentFolderName = (parentKey) => {
    const parentId = getParentFolderId(parentKey)
    return parentId ? folderMap[parentId]?.name : "root"
  }

  const getSiblingFolders = (parentKey) => {
    if (parentKey === "root") return rootFolders
    const pid = getParentFolderId(parentKey)
    return pid ? folderMap[pid]?.children || [] : []
  }

  const getChildFolders = (parentKey) => {
    if (parentKey === "root") return rootFolders
    const fid = getParentFolderId(parentKey)
    return fid ? folderMap[fid]?.children || [] : []
  }

  const handleMobileMove = async ({ folderId = null, parentFileId = null } = {}) => {
    if (!mobileMoveTarget) return
    const { type, id } = mobileMoveTarget
    const undoRecord = {
      items: [{
        id,
        type,
        fromFolderId:
          type === "file"
            ? files.find((f) => f.fileId === id)?.folderId || null
            : folders.find((f) => f.folderId === id)?.parentFolderId || null,
        fromParentFileId:
          type === "file" ? files.find((f) => f.fileId === id)?.parentFileId || null : null,
      }],
    }

    try {
      if (type === "file") {
        const file = files.find((f) => f.fileId === id)
        await updateFile(id, {
          folderId: folderId !== null ? folderId : file?.folderId || null,
          parentFileId,
        })
      } else {
        await updateFolder(id, { parentFolderId: folderId })
      }
      setUndoStack((prev) => [...prev.slice(-9), undoRecord])
      await refetchFiles()
    } catch (err) {
      console.error("Mobile move failed:", err)
    } finally {
      setMobileMoveAnchor(null)
      setMobileMoveTarget(null)
    }
  }

  // Set of valid fileIds — used to detect orphans whose parent was deleted
  const fileIdSet = new Set(files.map((f) => f.fileId))
  const hasValidParent = (f) => f.parentFileId && fileIdSet.has(f.parentFileId)

  const getFilesForFolder = (folderId) => {
    return files.filter((f) => f.folderId === folderId && !hasValidParent(f))
  }

  const getRootFiles = () => {
    return files.filter((f) => !f.folderId && !hasValidParent(f))
  }

  const getSubPages = (fileId) => {
    return files.filter((f) => f.parentFileId === fileId)
  }

  // Returns merged, order-sorted list of { type, id, item } for a given parent context
  const getOrderedChildren = (parentKey) => {
    let fileItems = [], folderItems = []
    if (parentKey === "root") {
      fileItems = getRootFiles().map(f => ({ type: "file", id: f.fileId, item: f }))
      folderItems = rootFolders.map(f => ({ type: "folder", id: f.folderId, item: f }))
    } else if (parentKey.startsWith("folder:")) {
      const fid = parentKey.slice(7)
      fileItems = getFilesForFolder(fid).map(f => ({ type: "file", id: f.fileId, item: f }))
      folderItems = (folderMap[fid]?.children || []).map(f => ({ type: "folder", id: f.folderId, item: f }))
    } else if (parentKey.startsWith("file:")) {
      fileItems = getSubPages(parentKey.slice(5)).map(f => ({ type: "file", id: f.fileId, item: f }))
    }
    const all = [...fileItems, ...folderItems]
    const stored = localOrder[parentKey]
    if (!stored?.length) return all
    const pos = Object.fromEntries(stored.map((id, i) => [id, i]))
    return [...all].sort((a, b) => (pos[a.id] ?? 9999) - (pos[b.id] ?? 9999))
  }

  // Mobile reordering helper (up/down buttons)
  const moveItemInParent = (parentKey, id, direction) => {
    const current = getOrderedChildren(parentKey).map((it) => it.id)
    const idx = current.indexOf(id)
    if (idx === -1) return
    const target = direction === "up" ? idx - 1 : idx + 1
    if (target < 0 || target >= current.length) return
    const next = [...current]
      ;[next[idx], next[target]] = [next[target], next[idx]]
    saveOrder({ ...localOrder, [parentKey]: next })
  }

  /* ─── Context menu handlers ─── */
  const handleContextMenu = (e, type, id, name, folderId = null) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, type, id, name, folderId })
  }

  const handleContextMenuClose = () => {
    setContextMenu(null)
  }

  const handleRenameFromContext = () => {
    setRenameTarget({ type: contextMenu.type, id: contextMenu.id, name: contextMenu.name })
    setRenameName(contextMenu.name)
    setRenameDialogOpen(true)
    handleContextMenuClose()
  }

  const handleDeleteFromContext = () => {
    setDeleteTarget({ type: contextMenu.type, id: contextMenu.id, name: contextMenu.name })
    handleContextMenuClose()
  }

  const cleanupStorageForFile = (fileId) => {
    // Clean localStorage version history
    try {
      const versionKey = `jd:versions:${wikiId}:${fileId}`
      localStorage.removeItem(versionKey)
    } catch { }
    // If deleted file was selected, deselect it
    if (selectedFileId === fileId) {
      onFileSelect(null)
    }
  }

  const cleanupStorageForFolder = (folderId) => {
    // Clean files belonging to this folder from version history
    const folderFiles = files.filter((f) => f.folderId === folderId)
    folderFiles.forEach((f) => cleanupStorageForFile(f.fileId))
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.type === "folder") {
        cleanupStorageForFolder(deleteTarget.id)
        await deleteFolder(deleteTarget.id)
        // Refetch files so children that were moved up appear immediately
        await refetchFiles()
      } else {
        cleanupStorageForFile(deleteTarget.id)
        await deleteFile(deleteTarget.id)
        // Refetch files so re-parented children surface immediately
        await refetchFiles()
      }
    } catch (err) {
      console.error("Failed to delete:", err)
    }
    setDeleteTarget(null)
  }

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const ensureMdPath = (path) => {
    if (!path) return "untitled.md"
    const parts = path.split("/")
    const last = parts.pop()
    const fixedLast = last && last.toLowerCase().endsWith(".md") ? last : `${last}.md`
    return [...parts, fixedLast].join("/")
  }

  const handleExportFolderFromContext = async () => {
    if (contextMenu?.type !== "folder" || !contextMenu?.id) return

    const folderId = contextMenu.id
    setExportingFolderId(folderId)
    try {
      const data = await apiClient.exportFolder(wikiId, folderId)
      const files = data.files || []
      const encoder = new TextEncoder()
      const zipEntries = {}
      for (const file of files) {
        const entryPath = ensureMdPath(file.path || file.name)
        zipEntries[entryPath] = encoder.encode(file.content || "")
      }
      const zipped = zipSync(zipEntries)
      const folderName = data.folderName || "export"
      const filename = `${folderName.replace(/\s+/g, "_")}.zip`
      downloadBlob(new Blob([zipped], { type: "application/zip" }), filename)
    } catch (err) {
      console.error("Folder export failed", err)
    } finally {
      setExportingFolderId(null)
      handleContextMenuClose()
    }
  }

  const handleAddSubPageFromContext = () => {
    setParentFileId(contextMenu.id)
    setParentFolderId(contextMenu.folderId || null)
    setCreateType("subpage")
    setCreateDialogOpen(true)
    handleContextMenuClose()
  }

  const handleRename = async () => {
    if (!renameName.trim() || !renameTarget) return
    try {
      if (renameTarget.type === "folder") {
        await updateFolder(renameTarget.id, { name: renameName.trim() })
      } else {
        await updateFile(renameTarget.id, { name: renameName.trim() })
      }
      setRenameDialogOpen(false)
      setRenameTarget(null)
      setRenameName("")
    } catch (err) {
      alert(`Failed to rename: ${err.message}`)
    }
  }

  /* ─── Render helpers ─── */
  const renderFolder = (folder, level = 0, parentKey = "root") => {
    const isExpanded = expandedFolders[folder.folderId]
    const currentDrag = dragStateRef.current || dragState
    const isDraggingThis = currentDrag?.primary?.id === folder.folderId
    const isDropInto = dropTarget?.id === folder.folderId && dropTarget?.position === "into"
    const isDropOutOf = dropTarget?.id === folder.folderId && dropTarget?.position === "out-of"
    const isInvalidDrop = isDropInto && currentDrag?.primary?.type === "folder" && isFolderDescendant(currentDrag.primary.id, folder.folderId)
    const isSelected = selectedItems.has(`folder:${folder.folderId}`)
    const isLastMoved = lastMovedId === folder.folderId

    const listItemPadding = isMobile ? level * 1.5 : level * 2
    const iconSize = isMobile ? "small" : "small"

    const openMobileMoveMenu = (e) => {
      e.stopPropagation()
      setMobileMoveAnchor(e.currentTarget)
      setMobileMoveTarget({ type: "folder", id: folder.folderId, parentKey })
    }

    return (
      <Box
        key={folder.folderId}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null) }}
        onDrop={(e) => handleItemDrop(e, "folder", folder.folderId, parentKey)}
        sx={{ opacity: isDraggingThis ? 0.4 : 1 }}
      >
        {renderDropLine(folder.folderId, parentKey, "before", level)}
        <ListItem
          disablePadding
          onDragOver={(e) => handleItemDragOver(e, "folder", folder.folderId, parentKey)}
          sx={{
            pl: listItemPadding,
            position: "relative",
            bgcolor: isInvalidDrop ? "error.50" : isDropInto ? "primary.50" : isLastMoved ? "success.50" : isSelected ? "action.hover" : "transparent",
            borderLeft: (isDropInto || isInvalidDrop) ? "3px solid" : "3px solid transparent",
            borderColor: isInvalidDrop ? "error.main" : isDropInto ? "primary.main" : "transparent",
            transition: "background-color 0.15s, border-color 0.15s",
            outline: isLastMoved ? "1px solid" : "none",
            outlineColor: "success.main",
          }}
          onContextMenu={(e) => handleContextMenu(e, "folder", folder.folderId, folder.name)}
        >
          {(isDropInto || isInvalidDrop) && (
            <Box sx={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              bgcolor: isInvalidDrop ? "error.main" : "primary.main",
              color: "white",
              borderRadius: "4px",
              px: 0.75,
              py: 0.1,
              fontSize: 10,
              fontWeight: 700,
              lineHeight: "18px",
              pointerEvents: "none",
              zIndex: 10,
              whiteSpace: "nowrap",
            }}>
              {isInvalidDrop ? "⊘ Can't drop here" : `Move into ${folder.name}`}
            </Box>
          )}
          <ListItemButton
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) {
                e.preventDefault()
                const key = `folder:${folder.folderId}`
                setSelectedItems(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
              } else {
                setSelectedItems(new Set())
                toggleFolder(folder.folderId)
              }
            }}
            sx={{ pr: 0 }}
          >
            {isMobile && (
              <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    moveItemInParent(parentKey, folder.folderId, "up")
                  }}
                >
                  <ArrowUpward fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    moveItemInParent(parentKey, folder.folderId, "down")
                  }}
                >
                  <ArrowDownward fontSize="small" />
                </IconButton>
              </Box>
            )}
            {isMobile ? (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  openMobileMoveMenu(e)
                }}
              >
                <MoreVert fontSize="small" />
              </IconButton>
            ) : (
              <ListItemIcon
                draggable
                onDragStart={(e) => handleDragStart(e, "folder", folder.folderId)}
                onDragEnd={handleDragEnd}
                sx={{ minWidth: 24, color: "text.disabled", cursor: "grab" }}
              >
                <DragIndicator fontSize="small" />
              </ListItemIcon>
            )}
            <ListItemIcon sx={{ minWidth: 24 }}>
              {isExpanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
            </ListItemIcon>
            <ListItemIcon sx={{ minWidth: 28 }}>
              {isExpanded
                ? <FolderOpen fontSize="small" sx={{ color: "warning.main" }} />
                : <FolderIcon fontSize="small" sx={{ color: "warning.main" }} />}
            </ListItemIcon>
            <ListItemText primary={folder.name} primaryTypographyProps={{ noWrap: true, fontSize: 14 }} />
            <Tooltip title="Add…">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  setAddMenuAnchor(e.currentTarget)
                  setAddMenuFolderId(folder.folderId)
                }}
              >
                <Add fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                setDeleteTarget({ type: "folder", id: folder.folderId, name: folder.name })
              }}
            >
              <Delete fontSize="small" />
            </IconButton>
          </ListItemButton>
        </ListItem>

        {renderDropLine(folder.folderId, parentKey, "after", level, "After folder")}
        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {getOrderedChildren(`folder:${folder.folderId}`).map(({ type, id, item }) =>
              type === "folder"
                ? renderFolder(item, level + 1, `folder:${folder.folderId}`)
                : renderFile(item, level + 1, `folder:${folder.folderId}`)
            )}
          </List>
          {(dragStateRef.current || dragState) && (
            <Box
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setDropTarget({ id: folder.folderId, position: "out-of", parentKey })
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null)
              }}
              onDrop={(e) => handleItemDrop(e, "folder", folder.folderId, parentKey)}
              sx={{
                minHeight: 28,
                mx: 1,
                my: 0.5,
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px dashed",
                borderColor: isDropOutOf ? "warning.main" : "transparent",
                bgcolor: isDropOutOf ? "warning.50" : "transparent",
                transition: "background-color 0.1s, border-color 0.1s",
              }}
            >
              {isDropOutOf && (
                <Typography variant="caption" sx={{
                  color: "warning.main",
                  fontWeight: 700,
                  fontSize: 11,
                  pointerEvents: "none",
                }}>
                  Move out of {folder.name}
                </Typography>
              )}
            </Box>
          )}
        </Collapse>
      </Box>
    )
  }

  const renderFile = (file, level = 0, parentKey = "root") => {
    const folderId = parentKey.startsWith("folder:") ? parentKey.slice(7) : (file.folderId || null)
    const subPages = getSubPages(file.fileId)
    const hasSubPages = subPages.length > 0
    const isExpanded = expandedFiles[file.fileId]
    const currentDrag = dragStateRef.current || dragState
    const isDraggingThis = currentDrag?.primary?.id === file.fileId
    const isDropInto = dropTarget?.id === file.fileId && dropTarget?.position === "into"
    const isInvalidDrop = isDropInto && currentDrag?.primary?.type === "file" && isFileDescendant(currentDrag.primary.id, file.fileId)
    const listItemPadding = isMobile ? level * 1.5 : level * 2

    return (
      <Box
        key={file.fileId}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null) }}
        onDrop={(e) => handleItemDrop(e, "file", file.fileId, parentKey)}
        sx={{ opacity: isDraggingThis ? 0.4 : 1 }}
      >
        {renderDropLine(file.fileId, parentKey, "before", level)}
        <ListItem
          disablePadding
          onDragOver={(e) => handleItemDragOver(e, "file", file.fileId, parentKey)}
          sx={{
            pl: listItemPadding,
            position: "relative",
            bgcolor: isInvalidDrop ? "error.50" : isDropInto ? "primary.50" : selectedFileId === file.fileId ? "action.selected" : selectedItems.has(`file:${file.fileId}`) ? "action.hover" : lastMovedId === file.fileId ? "success.50" : "transparent",
            borderLeft: (isDropInto || isInvalidDrop) ? "3px solid" : "3px solid transparent",
            borderColor: isInvalidDrop ? "error.main" : isDropInto ? "primary.main" : "transparent",
            transition: "background-color 0.15s, border-color 0.15s",
            outline: lastMovedId === file.fileId ? "1px solid" : "none",
            outlineColor: "success.main",
          }}
          onContextMenu={(e) => handleContextMenu(e, "file", file.fileId, file.name, folderId)}
        >
          {(isDropInto || isInvalidDrop) && (
            <Box sx={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              bgcolor: isInvalidDrop ? "error.main" : "primary.main",
              color: "white",
              borderRadius: "4px",
              px: 0.75,
              py: 0.1,
              fontSize: 10,
              fontWeight: 700,
              lineHeight: "18px",
              pointerEvents: "none",
              zIndex: 10,
              whiteSpace: "nowrap",
            }}>
              {isInvalidDrop ? "⊘ Can't drop here" : `Move into ${file.name}`}
            </Box>
          )}
          <ListItemButton
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) {
                e.preventDefault()
                const key = `file:${file.fileId}`
                setSelectedItems(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
              } else {
                setSelectedItems(new Set())
                onFileSelect(file.fileId)
              }
            }}
            sx={{ pr: 0 }}
          >
            {isMobile && (
              <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    moveItemInParent(parentKey, file.fileId, "up")
                  }}
                >
                  <ArrowUpward fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    moveItemInParent(parentKey, file.fileId, "down")
                  }}
                >
                  <ArrowDownward fontSize="small" />
                </IconButton>
              </Box>
            )}
            {isMobile ? (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  setMobileMoveAnchor(e.currentTarget)
                  setMobileMoveTarget({ type: "file", id: file.fileId, parentKey })
                }}
              >
                <MoreVert fontSize="small" />
              </IconButton>
            ) : (
              <ListItemIcon
                draggable
                onDragStart={(e) => handleDragStart(e, "file", file.fileId)}
                onDragEnd={handleDragEnd}
                sx={{ minWidth: 24, color: "text.disabled", cursor: "grab" }}
              >
                <DragIndicator fontSize="small" />
              </ListItemIcon>
            )}
            {hasSubPages ? (
              <ListItemIcon
                sx={{ minWidth: 24, cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFileExpand(file.fileId)
                }}
              >
                {isExpanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
              </ListItemIcon>
            ) : (
              <ListItemIcon sx={{ minWidth: 24 }}>
                <Box sx={{ width: 20 }} />
              </ListItemIcon>
            )}
            <ListItemIcon sx={{ minWidth: 28 }}>
              {hasSubPages ? <Description fontSize="small" /> : fileIcon(file)}
            </ListItemIcon>
            <ListItemText primary={file.name} primaryTypographyProps={{ noWrap: true, fontSize: 14 }} />
            {hasSubPages && (
              <Tooltip title="Open file">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    onFileSelect(file.fileId)
                  }}
                >
                  <Edit fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="New Sub-page">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation()
                  setParentFileId(file.fileId)
                  setParentFolderId(folderId)
                  setCreateType("subpage")
                  setCreateDialogOpen(true)
                }}
              >
                <PostAdd fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                setDeleteTarget({ type: "file", id: file.fileId, name: file.name })
              }}
            >
              <Delete fontSize="small" />
            </IconButton>
          </ListItemButton>
        </ListItem>

        {renderDropLine(file.fileId, parentKey, "after", level)}
        {hasSubPages && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {getOrderedChildren(`file:${file.fileId}`).map(({ type, id, item }) =>
                renderFile(item, level + 1, `file:${file.fileId}`)
              )}
            </List>
          </Collapse>
        )}
      </Box>
    )
  }

  const handleCreate = async () => {
    if (!createName.trim()) return

    try {
      if (createType === "folder") {
        await createFolder(createName, parentFolderId)
        // Expand the parent folder so the new sub-folder is visible
        if (parentFolderId) {
          setExpandedFolders((prev) => ({ ...prev, [parentFolderId]: true }))
        }
      } else if (createType === "subpage") {
        const result = await createFile(createName, "", parentFolderId, parentFileId)
        // Expand the parent page and navigate to the new sub-page
        if (parentFileId) {
          setExpandedFiles((prev) => ({ ...prev, [parentFileId]: true }))
        }
        if (result?.fileId) onFileSelect(result.fileId)
      } else {
        const result = await createFile(createName, "", parentFolderId)
        // Expand the containing folder and navigate to the new file
        if (parentFolderId) {
          setExpandedFolders((prev) => ({ ...prev, [parentFolderId]: true }))
        }
        if (result?.fileId) onFileSelect(result.fileId)
      }
      setCreateDialogOpen(false)
      setCreateName("")
      setParentFolderId(null)
      setParentFileId(null)
    } catch (err) {
      alert(`Failed to create ${createType}: ${err.message}`)
    }
  }

  return (
    <Box ref={scrollRef} sx={{ height: "100%", overflow: "auto" }}>
      <Box sx={{ p: isMobile ? 1 : 2, display: "flex", gap: isMobile ? 0.5 : 1, alignItems: "center" }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Add />}
          onClick={() => {
            setCreateType("file")
            setParentFolderId(null)
            setParentFileId(null)
            setCreateDialogOpen(true)
          }}
          sx={{ flex: isMobile ? 1 : "none" }}
        >
          File
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Add />}
          onClick={() => {
            setCreateType("folder")
            setParentFolderId(null)
            setParentFileId(null)
            setCreateDialogOpen(true)
          }}
          sx={{ flex: isMobile ? 1 : "none" }}
        >
          Folder
        </Button>
      </Box>

      <List component="nav" dense={isMobile} sx={{ py: isMobile ? 0.5 : 1 }}>
        {getOrderedChildren("root").map(({ type, id, item }) =>
          type === "folder"
            ? renderFolder(item, 0, "root")
            : renderFile(item, 0, "root")
        )}
      </List>

      {/* Root-level drop zone — move any item out of all folders to root */}
      {(dragStateRef.current || dragState) && (
        <Box
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ id: "__root__", position: "root", parentKey: "root" }) }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null) }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation()
            const current = dragStateRef.current || dragState
            const items = current?.items || []
            dragStateRef.current = null
            setDragState(null)
            setDropTarget(null)
            stopDragScroll()
            if (!items.length) return
            const undoRecord = {
              items: items.map(item => {
                const f = item.type === "file" ? files.find(f => f.fileId === item.id) : null
                const fo = item.type === "folder" ? folders.find(f => f.folderId === item.id) : null
                return { id: item.id, type: item.type, fromFolderId: f?.folderId ?? fo?.parentFolderId ?? null, fromParentFileId: f?.parentFileId ?? null }
              })
            }
            Promise.all(items.map(item =>
              item.type === "file"
                ? updateFile(item.id, { folderId: null, parentFileId: null })
                : updateFolder(item.id, { parentFolderId: null })
            )).then(() => {
              setUndoStack(prev => [...prev.slice(-9), undoRecord])
              return refetchFiles()
            }).catch(err => console.error("Move to root failed:", err))
          }}
          sx={{
            minHeight: 40, m: isMobile ? 0.5 : 1, borderRadius: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px dashed",
            borderColor: dropTarget?.id === "__root__" ? "primary.main" : "divider",
            bgcolor: dropTarget?.id === "__root__" ? "primary.50" : "transparent",
            transition: "all 0.1s",
          }}
        >
          <Typography variant="caption" sx={{
            color: dropTarget?.id === "__root__" ? "primary.main" : "text.disabled",
            fontWeight: dropTarget?.id === "__root__" ? 700 : 400,
            fontSize: 11, pointerEvents: "none",
          }}>
            {dropTarget?.id === "__root__" ? "Move to root level" : "↑ Drop here to move to root"}
          </Typography>
        </Box>
      )}

      {/* ── Folder + dropdown menu ─────────────────────────────────── */}
      <Menu
        anchorEl={addMenuAnchor}
        open={Boolean(addMenuAnchor)}
        onClose={() => { setAddMenuAnchor(null); setAddMenuFolderId(null) }}
        PaperProps={{ sx: { maxHeight: "70vh", overflow: "auto" } }}
      >
        <MenuItem
          onClick={() => {
            setParentFolderId(addMenuFolderId)
            setParentFileId(null)
            setCreateType("file")
            setCreateDialogOpen(true)
            setAddMenuAnchor(null)
            setAddMenuFolderId(null)
          }}
        >
          <ListItemIcon><NoteAdd fontSize="small" /></ListItemIcon>
          New File
        </MenuItem>
        <MenuItem
          onClick={() => {
            setParentFolderId(addMenuFolderId)
            setParentFileId(null)
            setCreateType("folder")
            setCreateDialogOpen(true)
            setAddMenuAnchor(null)
            setAddMenuFolderId(null)
          }}
        >
          <ListItemIcon><CreateNewFolder fontSize="small" /></ListItemIcon>
          New Sub-folder
        </MenuItem>
      </Menu>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined
        }
        PaperProps={{ sx: { maxHeight: "70vh", overflow: "auto" } }}
      >
        <MenuItem onClick={handleRenameFromContext}>Rename</MenuItem>
        {contextMenu?.type === "folder" && (
          <MenuItem
            onClick={handleExportFolderFromContext}
            disabled={Boolean(exportingFolderId)}
          >
            {exportingFolderId === contextMenu.id ? "Exporting…" : "Export folder"}
          </MenuItem>
        )}
        {contextMenu?.type === "file" && (
          <MenuItem onClick={handleAddSubPageFromContext}>Add Sub-page</MenuItem>
        )}
        <MenuItem onClick={handleDeleteFromContext} sx={{ color: "error.main" }}>
          Delete
        </MenuItem>
      </Menu>

      {/* Mobile move menu (replaces drag handle on small screens) */}
      <Menu
        anchorEl={mobileMoveAnchor}
        open={Boolean(mobileMoveAnchor)}
        onClose={() => {
          setMobileMoveAnchor(null)
          setMobileMoveTarget(null)
        }}
        anchorOrigin={isMobile ? { vertical: "center", horizontal: "center" } : undefined}
        transformOrigin={isMobile ? { vertical: "center", horizontal: "center" } : undefined}
        PaperProps={isMobile ? {
          sx: {
            width: "92vw",
            maxWidth: "92vw",
            maxHeight: "80vh",
            borderRadius: 2,
            p: 0,
            overflow: "hidden",
          },
        } : { sx: { maxHeight: "70vh", overflow: "auto" } }}
      >
        {mobileMoveTarget ? (() => {
          const { type, id } = mobileMoveTarget
          const isFolderItem = type === "folder"
          const item = isFolderItem
            ? folders.find((f) => f.folderId === id)
            : files.find((f) => f.fileId === id)
          if (!item) return null

          if (isFolderItem) {
            // Only allow moving the folder up one level (into its parent’s parent) or into a direct sub-folder
            const parentFolderId = item.parentFolderId ?? null
            const grandparentFolderId = parentFolderId
              ? folderMap[parentFolderId]?.parentFolderId ?? null
              : null
            const childFolders = folderMap[id]?.children || []

            return (
              <Box sx={{ position: "relative", pt: 1, pb: 1 }}>
                <IconButton
                  size="small"
                  onClick={() => {
                    setMobileMoveAnchor(null)
                    setMobileMoveTarget(null)
                  }}
                  sx={{ position: "absolute", top: 8, right: 8 }}
                >
                  <Close fontSize="small" />
                </IconButton>
                {parentFolderId !== null && (
                  <MenuItem onClick={() => handleMobileMove({ folderId: grandparentFolderId })}>
                    Move up to {grandparentFolderId ? folderMap[grandparentFolderId]?.name || "…" : "root"}
                  </MenuItem>
                )}

                {childFolders.length > 0 ? (
                  <>
                    <MenuItem disabled>Move into…</MenuItem>
                    {childFolders.map((f) => (
                      <MenuItem
                        key={f.folderId}
                        onClick={() => handleMobileMove({ folderId: f.folderId })}
                      >
                        {f.name}
                      </MenuItem>
                    ))}
                  </>
                ) : (
                  <MenuItem disabled>No direct sub-folders</MenuItem>
                )}
              </Box>
            )
          }

          // File move menu: only allow moving up (out of a parent page or folder) or into direct sub-pages
          const parentFileId = item.parentFileId ?? null
          const folderId = item.folderId ?? null
          const subPages = getSubPages(item.fileId)

          return (
            <>
              {parentFileId ? (
                <MenuItem onClick={() => handleMobileMove({ parentFileId: null })}>
                  Move out of {files.find((f) => f.fileId === parentFileId)?.name || "parent page"}
                </MenuItem>
              ) : folderId ? (
                <MenuItem onClick={() => handleMobileMove({ folderId: null, parentFileId: null })}>
                  Move to root
                </MenuItem>
              ) : null}

              {subPages.length > 0 ? (
                <>
                  <MenuItem disabled>Move into…</MenuItem>
                  {subPages.map((sub) => (
                    <MenuItem
                      key={sub.fileId}
                      onClick={() => handleMobileMove({ parentFileId: sub.fileId })}
                    >
                      {sub.name}
                    </MenuItem>
                  ))}
                </>
              ) : (
                <MenuItem disabled>No direct sub-pages</MenuItem>
              )}
            </>
          )
        })() : null}
      </Menu>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
        <DialogTitle>
          Rename {renameTarget?.type === "file" ? "File" : "Folder"}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="New Name"
            fullWidth
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") handleRename()
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRename} variant="contained">
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>
          Create New{" "}
          {createType === "folder" ? "Folder" : createType === "subpage" ? "Sub-page" : "File"}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={
              createType === "folder"
                ? "Folder Name"
                : createType === "subpage"
                  ? "Sub-page Name"
                  : "File Name"
            }
            fullWidth
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleCreate()
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Undo snackbar — shows after any move, Cmd+Z reverses it */}
      <Snackbar
        open={undoStack.length > 0}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        sx={{ bottom: 16 }}
      >
        <Alert
          severity="info"
          sx={{ fontSize: 12, py: 0.5 }}
          action={
            <Button
              size="small"
              color="inherit"
              sx={{ fontSize: 11, fontWeight: 700 }}
              onClick={() => handleUndoRef.current?.()}
            >
              Undo (⌘Z)
            </Button>
          }
        >
          Item moved
        </Alert>
      </Snackbar>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>
          Delete {deleteTarget?.type === "folder" ? "Folder" : "File"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
            {deleteTarget?.type === "folder" && (
              <> Files inside will be moved to the parent directory.</>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
