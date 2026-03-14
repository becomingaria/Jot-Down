import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useWikis } from "../../hooks/useWiki"
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
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
  Menu,
  MenuItem,
} from "@mui/material"
import { Add, Delete, Logout } from "@mui/icons-material"
import { useAuth } from "../../contexts/AuthContext"

export function WikiList() {
  const { wikis, loading, error, createWiki, deleteWiki, updateWiki } = useWikis()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newWikiName, setNewWikiName] = useState("")
  const [createError, setCreateError] = useState("")

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
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Jot-Down Wikis
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
            {user?.email}
          </Typography>
          <IconButton color="inherit" onClick={signOut}>
            <Logout />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
          <Typography variant="h4">Your Wikis</Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateDialogOpen(true)}
          >
            New Wiki
          </Button>
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
        ) : (
          <Grid container spacing={3}>
            {wikis.map((wiki) => (
              <Grid item xs={12} sm={6} md={4} key={wiki.wikiId}>
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
                  {wiki.isOwner && (
                    <CardActions>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => handleDeleteWiki(wiki.wikiId, e)}
                      >
                        <Delete />
                      </IconButton>
                    </CardActions>
                  )}
                </Card>
              </Grid>
            ))}
          </Grid>
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
    </Box>
  )
}
