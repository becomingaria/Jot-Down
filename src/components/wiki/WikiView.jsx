import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  Button,
} from "@mui/material"
import { ArrowBack, Menu as MenuIcon, Logout, AdminPanelSettings } from "@mui/icons-material"
import { FolderTree } from "../folder/FolderTree"
import { Canister } from "../editor/Canister"
import { AdminPanel } from "../admin/AdminPanel"
import { AssetViewer } from "./AssetViewer"
import { useWiki } from "../../hooks/useWiki"
import { useFiles } from "../../hooks/useFile"
import { useFolders } from "../../hooks/useFolder"
import { useAuth } from "../../contexts/AuthContext"
import { buildFileUrl, fileIdFromSplat } from "../../utils/filePath"

const DRAWER_WIDTH = 280
const ADMIN_DRAWER_WIDTH = 340

export function WikiView() {
  const { wikiId, '*': splat } = useParams()
  const selectedFileId = fileIdFromSplat(splat)
  const navigate = useNavigate()
  const { wiki } = useWiki(wikiId)
  const { signOut, user, isAdmin } = useAuth()
  const { files, refetch: refetchFiles } = useFiles(wikiId)
  const { folders } = useFolders(wikiId)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [adminOpen, setAdminOpen] = useState(false)
  const [fileTreeRefresh, setFileTreeRefresh] = useState(0)

  // Navigate to a file — updates the URL (back button, bookmarks, deep links all work)
  const navigateToFile = (id) => {
    if (id) navigate(buildFileUrl(wikiId, id, files, folders))
    else navigate(`/wikis/${wikiId}`)
  }

  // Called by Canister after a file is renamed — refreshes both lists and re-navigates
  const handleRename = async () => {
    const freshFiles = await refetchFiles()
    setFileTreeRefresh((n) => n + 1)
    if (selectedFileId && freshFiles)
      navigate(buildFileUrl(wikiId, selectedFileId, freshFiles, folders), { replace: true })
  }

  // Determine if the selected file is a non-page asset
  const selectedFile = files.find((f) => f.fileId === selectedFileId)
  const selectedFileType = selectedFile?.fileType || "page"

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      {/* App Bar */}
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton
            color="inherit"
            onClick={() => navigate("/wikis")}
            edge="start"
            sx={{ mr: 2 }}
          >
            <ArrowBack />
          </IconButton>
          <IconButton
            color="inherit"
            onClick={() => setDrawerOpen(!drawerOpen)}
            edge="start"
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {wiki?.name || "Loading..."}
          </Typography>
          {isAdmin && (
            <IconButton
              color="inherit"
              onClick={() => setAdminOpen(!adminOpen)}
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

      {/* Sidebar */}
      <Drawer
        variant="persistent"
        open={drawerOpen}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            mt: 8,
          },
        }}
      >
        <FolderTree
          wikiId={wikiId}
          onFileSelect={navigateToFile}
          selectedFileId={selectedFileId}
          refreshTrigger={fileTreeRefresh}
        />
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          mt: 8,
          ml: drawerOpen ? 0 : `-${DRAWER_WIDTH}px`,
          transition: (theme) =>
            theme.transitions.create("margin", {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
        }}
      >
        {selectedFileId ? (
          selectedFileType === "image" || selectedFileType === "csv" ? (
            <AssetViewer wikiId={wikiId} fileId={selectedFileId} fileType={selectedFileType} />
          ) : (
            <Canister wikiId={wikiId} fileId={selectedFileId} onFileSelect={navigateToFile} onRename={handleRename} />
          )
        ) : (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <Typography variant="h6" color="text.secondary">
              Select a file to edit or create a new one
            </Typography>
          </Box>
        )}
      </Box>

      {/* Admin Drawer (right side) */}
      {isAdmin && (
        <Drawer
          variant="persistent"
          anchor="right"
          open={adminOpen}
          sx={{
            width: ADMIN_DRAWER_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: ADMIN_DRAWER_WIDTH,
              boxSizing: "border-box",
              mt: 8,
            },
          }}
        >
          <AdminPanel />
        </Drawer>
      )}
    </Box>
  )
}
