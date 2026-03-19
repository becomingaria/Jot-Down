import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useWikis } from "../../hooks/useWiki"
import { apiClient } from "../../services/api"
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  AppBar,
  Toolbar,
  Drawer,
  Menu,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Select,
  CircularProgress,
  Autocomplete,
} from "@mui/material"
import { Add, Delete, Logout, Download, Share, AdminPanelSettings } from "@mui/icons-material"
import { zipSync } from "fflate/browser"
import logo from "../../assets/wikijot_transparent.png"
import { useAuth } from "../../contexts/AuthContext"
import { AdminPanel } from "../admin/AdminPanel"

export function WikiList() {
  const { wikis, loading, error, createWiki, deleteWiki, updateWiki } = useWikis()
  const { user, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [adminOpen, setAdminOpen] = useState(false)

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newWikiName, setNewWikiName] = useState("")
  const [createError, setCreateError] = useState("")

  // Export state
  const [exporting, setExporting] = useState({}) // { [wikiId]: boolean }

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState("")
  const filteredWikis = (wikis || [])
    .filter((w) => w.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Share state
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState(null) // { wikiId, name }
  const [shares, setShares] = useState([])
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState(null)
  const [newShareEmail, setNewShareEmail] = useState("")
  const [emailOptions, setEmailOptions] = useState([])
  const [emailInputValue, setEmailInputValue] = useState("")
  const [newShareAccess, setNewShareAccess] = useState("view")

  // Rename state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null) // { wikiId, name }
  const [renameName, setRenameName] = useState("")

  // Context menu state
  const [contextMenu, setContextMenu] = useState(null) // { mouseX, mouseY, wikiId, name }

  const handleCreateWiki = async () => {
    if (!newWikiName.trim()) return

    try {
      setCreateError("")
      const result = await createWiki(newWikiName)
      setCreateDialogOpen(false)
      setNewWikiName("")
      navigate(`/wikis/${result.wikiId}`)
    } catch (err) {
      setCreateError(err.message)
    }
  }

  const handleDeleteWiki = async (wikiId, e) => {
    e.stopPropagation()
    if (!confirm("Are you sure you want to delete this wiki?")) return

    try {
      await deleteWiki(wikiId)
    } catch (err) {
      alert(`Failed to delete wiki: ${err.message}`)
    }
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
    // Ensure the filename portion ends in .md
    const parts = path.split("/")
    const last = parts.pop()
    const fixedLast = last && last.toLowerCase().endsWith(".md") ? last : `${last}.md`
    return [...parts, fixedLast].join("/")
  }

  const openShareDialog = async (wiki) => {
    setShareTarget(wiki)
    setShareDialogOpen(true)
    setShareError(null)
    setShares([])

    setShareLoading(true)
    try {
      const data = await apiClient.getShares(wiki.wikiId)
      setShares(data.shares || [])
      // Preload some user suggestions
      const users = await apiClient.searchUsers(wiki.wikiId, "")
      setEmailOptions(users.users || [])
    } catch (err) {
      setShareError(err.message || "Failed to load share list")
    } finally {
      setShareLoading(false)
    }
  }

  const closeShareDialog = () => {
    setShareDialogOpen(false)
    setShareTarget(null)
    setShareError(null)
    setShares([])
    setNewShareEmail("")
    setNewShareAccess("view")
  }

  const handleAddShare = async () => {
    if (!shareTarget || !newShareEmail.trim()) return
    setShareError(null)
    setShareLoading(true)

    try {
      await apiClient.createShare(shareTarget.wikiId, newShareEmail.trim(), newShareAccess)
      const data = await apiClient.getShares(shareTarget.wikiId)
      setShares(data.shares || [])
      setNewShareEmail("")
      setNewShareAccess("view")
    } catch (err) {
      setShareError(err.message || "Failed to add share")
    } finally {
      setShareLoading(false)
    }
  }

  // Fetch user suggestions for autocomplete
  useEffect(() => {
    if (!shareDialogOpen || !shareTarget) return

    const timer = setTimeout(async () => {
      try {
        const data = await apiClient.searchUsers(shareTarget.wikiId, emailInputValue)
        setEmailOptions(data.users || [])
      } catch (err) {
        // ignore; we still want the dialog
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [emailInputValue, shareDialogOpen, shareTarget])

  const handleRemoveShare = async (userId) => {
    if (!shareTarget) return
    setShareError(null)
    setShareLoading(true)
    try {
      await apiClient.deleteShare(shareTarget.wikiId, userId)
      const data = await apiClient.getShares(shareTarget.wikiId)
      setShares(data.shares || [])
    } catch (err) {
      setShareError(err.message || "Failed to remove share")
    } finally {
      setShareLoading(false)
    }
  }

  const handleExportWiki = async (wiki) => {
    setExporting((prev) => ({ ...prev, [wiki.wikiId]: true }))
    try {
      const data = await apiClient.exportWiki(wiki.wikiId)
      const files = data.files || []

      const encoder = new TextEncoder()
      const zipEntries = {}
      for (const file of files) {
        const entryPath = ensureMdPath(file.path || file.name)
        zipEntries[entryPath] = encoder.encode(file.content || "")
      }
      const zipped = zipSync(zipEntries)
      const filename = `${wiki.name.replace(/\s+/g, "_")}.zip`
      downloadBlob(new Blob([zipped], { type: "application/zip" }), filename)
    } catch (err) {
      console.error("Export failed", err)
      alert(`Export failed: ${err.message}`)
    } finally {
      setExporting((prev) => {
        const next = { ...prev }
        delete next[wiki.wikiId]
        return next
      })
    }
  }

  const handleContextMenu = (e, wikiId, name) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, wikiId, name })
  }

  const handleContextMenuClose = () => {
    setContextMenu(null)
  }

  const handleRenameFromContext = () => {
    setRenameTarget({ wikiId: contextMenu.wikiId, name: contextMenu.name })
    setRenameName(contextMenu.name)
    setRenameDialogOpen(true)
    handleContextMenuClose()
  }

  const handleDeleteFromContext = () => {
    const { wikiId, name } = contextMenu
    handleContextMenuClose()
    if (!confirm(`Delete wiki "${name}"?`)) return
    deleteWiki(wikiId)
  }

  const handleRename = async () => {
    if (!renameName.trim() || !renameTarget) return
    try {
      await updateWiki(renameTarget.wikiId, renameName.trim())
      setRenameDialogOpen(false)
      setRenameTarget(null)
      setRenameName("")
    } catch (err) {
      alert(`Failed to rename wiki: ${err.message}`)
    }
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Box sx={{ display: "flex", alignItems: "center", flexGrow: 1 }}>
            <Box
              component="img"
              src={logo}
              alt="WikiJot"
              sx={{ height: 32, mr: 2 }}
            />
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Jot-Down Wikis
            </Typography>
          </Box>
          {isAdmin && (
            <IconButton
              color="inherit"
              onClick={() => setAdminOpen((open) => !open)}
              title="Admin Panel"
              sx={{ mr: 1 }}
            >
              <AdminPanelSettings />
            </IconButton>
          )}
          <Typography variant="body2" sx={{ mr: 2 }}>
            {user?.email}
          </Typography>
          <IconButton color="inherit" onClick={signOut}>
            <Logout />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        {isAdmin && (
          <Drawer
            anchor="right"
            open={adminOpen}
            onClose={() => setAdminOpen(false)}
            sx={{
              "& .MuiDrawer-paper": {
                width: 340,
                boxSizing: "border-box",
                mt: 8,
              },
            }}
          >
            <AdminPanel />
          </Drawer>
        )}
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2, flexWrap: "wrap", gap: 2 }}>
          <Typography variant="h4" sx={{ flexGrow: 1 }}>
            Your Wikis
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateDialogOpen(true)}
          >
            New Wiki
          </Button>
        </Box>
        <Box sx={{ mb: 3, maxWidth: 480 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search wikis…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Typography>Loading...</Typography>
        ) : wikis.length === 0 ? (
          <Card>
            <CardContent>
              <Typography color="text.secondary" textAlign="center">
                No wikis yet. Create your first wiki to get started!
              </Typography>
            </CardContent>
          </Card>
        ) : filteredWikis.length === 0 ? (
          <Card>
            <CardContent>
              <Typography color="text.secondary" textAlign="center">
                No wikis match your search.
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <Box
            sx={{
              display: "grid",
              gap: 3,
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                md: "1fr 1fr 1fr",
              },
            }}
          >
            {filteredWikis.map((wiki) => (
              <Box key={wiki.wikiId}>
                <Card
                  sx={{ cursor: "pointer", "&:hover": { boxShadow: 4 } }}
                  onClick={() => navigate(`/wikis/${wiki.wikiId}`)}
                  onContextMenu={(e) => handleContextMenu(e, wiki.wikiId, wiki.name)}
                >
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {wiki.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {wiki.isOwner ? "Owner" : "Shared with you"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Created: {new Date(wiki.createdAt).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                  <CardActions>
                    {(wiki.ownerId === user?.userId || wiki.accessLevel === "owner") && (
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={(e) => {
                          e.stopPropagation()
                          openShareDialog(wiki)
                        }}
                        title="Manage shares"
                      >
                        <Share />
                      </IconButton>
                    )}
                    <IconButton
                      size="small"
                      color="primary"
                      disabled={Boolean(exporting[wiki.wikiId])}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleExportWiki(wiki)
                      }}
                      title={
                        exporting[wiki.wikiId]
                          ? "Exporting..."
                          : "Download wiki as ZIP"
                      }
                    >
                      <Download />
                    </IconButton>

                    {wiki.isOwner && (
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => handleDeleteWiki(wiki.wikiId, e)}
                      >
                        <Delete />
                      </IconButton>
                    )}
                  </CardActions>
                </Card>
              </Box>
            ))}
          </Box>
        )}
      </Container>

      {/* Create Wiki Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>Create New Wiki</DialogTitle>
        <DialogContent>
          {createError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createError}
            </Alert>
          )}
          <TextField
            autoFocus
            margin="dense"
            label="Wiki Name"
            fullWidth
            value={newWikiName}
            onChange={(e) => setNewWikiName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleCreateWiki()
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateWiki} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined
        }
      >
        <MenuItem onClick={handleRenameFromContext}>Rename</MenuItem>
        <MenuItem onClick={handleDeleteFromContext} sx={{ color: "error.main" }}>
          Delete
        </MenuItem>
      </Menu>

      {/* Rename Wiki Dialog */}
      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
        <DialogTitle>Rename Wiki</DialogTitle>
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

      {/* Share Wiki Dialog */}
      <Dialog open={shareDialogOpen} onClose={closeShareDialog} fullWidth maxWidth="sm">
        <DialogTitle>Share "{shareTarget?.name || "Wiki"}"</DialogTitle>
        <DialogContent>
          {shareError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {shareError}
            </Alert>
          )}

          {shareLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Shared with:
              </Typography>
              <List dense>
                {shares.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
                    No users have access yet.
                  </Typography>
                ) : (
                  shares.map((share) => (
                    <ListItem key={share.userId} disableGutters>
                      <ListItemText
                        primary={share.userEmail}
                        secondary={`Access: ${share.accessLevel}`}
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleRemoveShare(share.userId)}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))
                )}
              </List>

              <Typography variant="subtitle2" sx={{ mt: 2 }}>Add someone</Typography>
              <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                <Autocomplete
                  freeSolo
                  options={emailOptions.map((u) => u.email).filter(Boolean)}
                  inputValue={newShareEmail}
                  onInputChange={(event, value) => setNewShareEmail(value)}
                  onChange={(event, value) => setNewShareEmail(value || "")}
                  filterOptions={(opts) => opts}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Email"
                      size="small"
                      sx={{ flex: 1, minWidth: 220 }}
                    />
                  )}
                />
                <Select
                  value={newShareAccess}
                  onChange={(e) => setNewShareAccess(e.target.value)}
                  size="small"
                  sx={{ minWidth: 120 }}
                >
                  <MenuItem value="view">View</MenuItem>
                  <MenuItem value="edit">Edit</MenuItem>
                </Select>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleAddShare}
                  disabled={!newShareEmail.trim()}
                >
                  Add
                </Button>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeShareDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
