import { useState, useMemo } from "react"
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  InputAdornment,
} from "@mui/material"
import { InsertDriveFile, Search } from "@mui/icons-material"
import { useFiles } from "../../hooks/useFile"

export function PageLinkPicker({ open, wikiId, onSelect, onClose }) {
  const { files } = useFiles(wikiId)
  const [query, setQuery] = useState("")

  const pageFiles = useMemo(
    () =>
      files
        .filter((f) => {
          if (!f) return false
          const name = typeof f.name === "string" ? f.name : ""
          const matchQuery = typeof query === "string" ? query : ""
          return (
            (!f.fileType || f.fileType === "page") &&
            name.toLowerCase().includes(matchQuery.toLowerCase())
          )
        })
        .slice(0, 40),
    [files, query],
  )

  const handleSelect = (file) => {
    onSelect(file)
    setQuery("")
    onClose()
  }

  const handleClose = () => {
    setQuery("")
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Link to Page</DialogTitle>
      <DialogContent sx={{ pt: "8px !important" }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Search pages…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ mb: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <List dense disablePadding sx={{ maxHeight: 360, overflow: "auto" }}>
          {pageFiles.length === 0 ? (
            <ListItem>
              <Typography color="text.secondary" variant="body2">
                No pages found
              </Typography>
            </ListItem>
          ) : (
            pageFiles.map((file) => (
              <ListItem key={file.fileId} disablePadding>
                <ListItemButton onClick={() => handleSelect(file)}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <InsertDriveFile fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={file.name}
                    secondary={file.folderId ? "In folder" : "Root"}
                  />
                </ListItemButton>
              </ListItem>
            ))
          )}
        </List>
      </DialogContent>
    </Dialog>
  )
}
