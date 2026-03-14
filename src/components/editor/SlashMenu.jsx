import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Box, Paper, List, ListItem, ListItemButton, ListItemText, Typography } from "@mui/material"
import { SLASH_COMMANDS } from "../../utils/blockTypes"

export function SlashMenu({ query = "", position, onSelect, onClose }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef(null)

  // Memoize filtered commands so the reference only changes when the query changes
  const filteredCommands = useMemo(
    () =>
      SLASH_COMMANDS.filter((cmd) => {
        const searchText = query.toLowerCase()
        return (
          cmd.label.toLowerCase().includes(searchText) ||
          cmd.keywords.some((k) => k.includes(searchText))
        )
      }),
    [query],
  )

  // Keep latest values in refs so the keyboard handler never goes stale
  const filteredRef = useRef(filteredCommands)
  const selectedRef = useRef(selectedIndex)
  const onSelectRef = useRef(onSelect)
  const onCloseRef = useRef(onClose)

  useEffect(() => { filteredRef.current = filteredCommands }, [filteredCommands])
  useEffect(() => { selectedRef.current = selectedIndex }, [selectedIndex])
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Register keyboard listener ONCE (stable — reads from refs)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        e.stopImmediatePropagation()
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filteredRef.current.length - 1),
        )
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        e.stopImmediatePropagation()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        e.stopImmediatePropagation()
        const cmd = filteredRef.current[selectedRef.current]
        if (cmd) onSelectRef.current(cmd)
      } else if (e.key === "Escape") {
        e.preventDefault()
        e.stopImmediatePropagation()
        onCloseRef.current()
      } else if (e.key === "Backspace") {
        // Let the character delete through to the contentEditable, so typing
        // and backspacing naturally filter / closes the menu when "/" is removed.
        // Do NOT prevent default — let the keydown propagate normally.
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, []) // ← empty deps: added once, removed on unmount

  // Scroll selected item into view
  useEffect(() => {
    if (menuRef.current) {
      const selectedItem = menuRef.current.children[selectedIndex]
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: "nearest" })
      }
    }
  }, [selectedIndex])

  if (filteredCommands.length === 0) {
    return null
  }

  return (
    <Paper
      elevation={8}
      className="slash-menu"
      sx={{
        position: "fixed",
        left: position?.x || 0,
        top: position?.y || 0,
        zIndex: 9999,
        minWidth: 300,
        maxWidth: 400,
        maxHeight: 400,
        overflow: "auto",
        borderRadius: 2,
      }}
    >
      <List ref={menuRef} dense sx={{ py: 0.5 }}>
        {filteredCommands.map((cmd, index) => (
          <ListItem key={cmd.id} disablePadding>
            <ListItemButton
              selected={index === selectedIndex}
              onClick={() => onSelect(cmd)}
              sx={{
                px: 2,
                py: 1,
                "&.Mui-selected": {
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  "&:hover": {
                    bgcolor: "primary.dark",
                  },
                },
              }}
            >
              <Box sx={{ mr: 2, fontSize: "1.5rem", minWidth: 32 }}>
                {cmd.icon}
              </Box>
              <ListItemText
                primary={
                  <Typography variant="body1" fontWeight={500}>
                    {cmd.label}
                  </Typography>
                }
                secondary={
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>
                    {cmd.description}
                  </Typography>
                }
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Paper>
  )
}
