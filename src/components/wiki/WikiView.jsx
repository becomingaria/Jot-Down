import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  Box,
  Paper,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  SwipeableDrawer,
  Button,
  useTheme,
  useMediaQuery,
} from "@mui/material"
import logo from "../../assets/wikijot_transparent.png"
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
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("md"))
  const iOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent)

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

  // Debug layout overlays (set to false to disable)
  const debugLayout = false

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
    <Box sx={{ display: isMobile ? "block" : "flex", width: isMobile ? "calc(100vw - 10px)" : "100vw", minWidth: 0, minHeight: "200vh", overflow: "auto", px: isMobile ? 0.5 : 0 }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          ...(debugLayout ? { outline: "2px solid rgba(33, 150, 243, 0.8)" } : {}),
        }}
      >
        <Toolbar sx={{ flexDirection: "column", alignItems: "stretch", py: 1 }}>
          {/* Top row: logo + wiki name */}
          <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
            <Box
              component="img"
              src={logo}
              alt="WikiJot"
              onClick={() => navigate("/wikis")}
              sx={{ height: 32, mr: 2, cursor: "pointer" }}
            />
            <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
              WikiJot {wiki?.name ? `• ${wiki.name}` : "Loading..."}
            </Typography>
            {!isMobile && isAdmin && (
              <IconButton
                color="inherit"
                onClick={() => setAdminOpen(!adminOpen)}
                title="Admin Panel"
                sx={{ mr: 1 }}
              >
                <AdminPanelSettings />
              </IconButton>
            )}
            {!isMobile && (
              <Typography variant="body2" sx={{ mr: 2 }}>
                {user?.email}
              </Typography>
            )}
            <IconButton color="inherit" onClick={signOut}>
              <Logout />
            </IconButton>
          </Box>

          {/* Second row: back + menu */}
          <Box sx={{ display: "flex", alignItems: "center", width: "100%", mt: 1 }}>
            <IconButton
              color="inherit"
              onClick={() => navigate("/wikis")}
              edge="start"
              sx={{ mr: 1 }}
            >
              <ArrowBack />
            </IconButton>
            <IconButton
              color="inherit"
              onClick={() => setDrawerOpen(!drawerOpen)}
              edge="start"
            >
              <MenuIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <SwipeableDrawer
        variant={isMobile ? "temporary" : "persistent"}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpen={() => setDrawerOpen(true)}
        disableBackdropTransition={!iOS}
        disableDiscovery={iOS}
        sx={{
          display: isMobile && !drawerOpen ? "none" : "block",
          width: isMobile ? 0 : DRAWER_WIDTH,
          flexShrink: 0,
          ...(
            debugLayout
              ? {
                outline: "2px dashed rgba(76, 175, 80, 0.8)",
                backgroundColor: "rgba(76, 175, 80, 0.08)",
              }
              : {}
          ),
          "& .MuiDrawer-paper": {
            width: isMobile ? "100vw" : DRAWER_WIDTH,
            maxWidth: isMobile ? "100vw" : DRAWER_WIDTH,
            boxSizing: "border-box",
            mt: 14,
            borderRadius: isMobile ? 0 : undefined,
            bgcolor: "background.paper",
            boxShadow: (theme) => theme.shadows[8],
          },
        }}
      >
        <FolderTree
          wikiId={wikiId}
          isMobile={isMobile}
          onFileSelect={(id) => {
            navigateToFile(id)
            if (isMobile) setDrawerOpen(false)
          }}
          selectedFileId={selectedFileId}
          refreshTrigger={fileTreeRefresh}
        />
      </SwipeableDrawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          mt: 14,
          ml: isMobile ? 0 : drawerOpen ? 0 : `-${DRAWER_WIDTH}px`,
          transition: (theme) =>
            theme.transitions.create("margin", {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
          overflow: "hidden",
          bgcolor: "background.default",
          ...(
            debugLayout
              ? {
                outline: "2px dashed rgba(255, 152, 0, 0.8)",
                backgroundColor: "rgba(255, 152, 0, 0.06)",
              }
              : {}
          ),
        }}
      >
        {selectedFileId ? (
          selectedFileType === "image" || selectedFileType === "csv" ? (
            <AssetViewer wikiId={wikiId} fileId={selectedFileId} fileType={selectedFileType} />
          ) : (
            <Canister wikiId={wikiId} fileId={selectedFileId} onFileSelect={navigateToFile} onRename={handleRename} />
          )
        ) : (
          <Box sx={{ flexGrow: 1, overflow: "auto", width: "100%" }}>
            <Paper sx={{ p: 3, minHeight: "100%", width: "100%" }}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  textAlign: "center",
                  width: "100%",
                }}
              >
                <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 520 }}>
                  Select a file to edit or create a new one
                </Typography>
              </Box>
            </Paper>
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
            ...(
              debugLayout
                ? {
                  outline: "2px dashed rgba(156, 39, 176, 0.8)",
                  backgroundColor: "rgba(156, 39, 176, 0.06)",
                }
                : {}
            ),
            "& .MuiDrawer-paper": {
              width: ADMIN_DRAWER_WIDTH,
              boxSizing: "border-box",
              mt: 14,
            },
          }}
        >
          <AdminPanel />
        </Drawer>
      )}
    </Box>
  )
}
