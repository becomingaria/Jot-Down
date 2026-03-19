import { useState, useEffect, useCallback } from "react"
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Collapse,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material"
import {
  Delete,
  LockReset,
  PersonAdd,
  ExpandMore,
  ExpandLess,
  ContentCopy,
} from "@mui/icons-material"
import { apiClient } from "../../services/api"

export function AdminPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Create user form
  const [showCreate, setShowCreate] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newGroup, setNewGroup] = useState("")
  const [creating, setCreating] = useState(false)

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Reset password dialog
  const [resetTarget, setResetTarget] = useState(null)
  const [resetting, setResetting] = useState(false)
  const [resetResult, setResetResult] = useState(null) // { email, password }

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiClient.listUsers()
      setUsers(data.users || [])
    } catch (err) {
      setError(err.message || "Failed to load users")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const clearMessages = () => {
    setTimeout(() => {
      setSuccess(null)
      setError(null)
    }, 5000)
  }

  const handleCreateUser = async () => {
    if (!newEmail.trim()) return
    setCreating(true)
    setError(null)
    try {
      const result = await apiClient.createUser(
        newEmail.trim(),
        newPassword || undefined,
        newGroup || undefined,
      )
      setResetResult({ email: result.email, password: result.temporaryPassword })
      setNewEmail("")
      setNewPassword("")
      setNewGroup("")
      setShowCreate(false)
      fetchUsers()
      clearMessages()
    } catch (err) {
      setError(err.message || "Failed to create user")
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    try {
      await apiClient.deleteUser(deleteTarget.username)
      setSuccess(`User ${deleteTarget.email || deleteTarget.username} deleted`)
      setDeleteTarget(null)
      fetchUsers()
      clearMessages()
    } catch (err) {
      setError(err.message || "Failed to delete user")
    } finally {
      setDeleting(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget) return
    setResetting(true)
    setError(null)
    try {
      const result = await apiClient.resetPassword(resetTarget.username)
      setResetTarget(null)
      setResetResult({ email: resetTarget.email || resetTarget.username, password: result.temporaryPassword })
    } catch (err) {
      setError(err.message || "Failed to reset password")
    } finally {
      setResetting(false)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  const statusColor = (status) => {
    switch (status) {
      case "CONFIRMED":
        return "success"
      case "FORCE_CHANGE_PASSWORD":
        return "warning"
      case "UNCONFIRMED":
        return "info"
      default:
        return "default"
    }
  }

  return (
    <Box sx={{ p: 2, height: "100%", overflow: "auto" }}>
      <Typography variant="h6" gutterBottom>
        User Management
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 1 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Add User Section */}
      <Button
        startIcon={showCreate ? <ExpandLess /> : <PersonAdd />}
        onClick={() => setShowCreate(!showCreate)}
        variant={showCreate ? "text" : "outlined"}
        size="small"
        fullWidth
        sx={{ mb: 1 }}
      >
        {showCreate ? "Cancel" : "Add User"}
      </Button>

      <Collapse in={showCreate}>
        <Box
          sx={{
            p: 1.5,
            mb: 1,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
          }}
        >
          <TextField
            label="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            size="small"
            fullWidth
            sx={{ mb: 1 }}
            type="email"
            autoComplete="off"
          />
          <TextField
            label="Temporary Password (optional)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            size="small"
            fullWidth
            sx={{ mb: 1 }}
            placeholder="TempPass1!"
            autoComplete="off"
          />
          <FormControl fullWidth size="small" sx={{ mb: 1 }}>
            <InputLabel>Group (optional)</InputLabel>
            <Select
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              label="Group (optional)"
            >
              <MenuItem value="">
                <em>None</em>
              </MenuItem>
              <MenuItem value="admins">admins</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="contained"
            size="small"
            onClick={handleCreateUser}
            disabled={creating || !newEmail.trim()}
            startIcon={
              creating ? (
                <CircularProgress size={16} />
              ) : (
                <PersonAdd />
              )
            }
            fullWidth
          >
            Create User
          </Button>
        </Box>
      </Collapse>

      <Divider sx={{ my: 1 }} />

      {/* User List */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : users.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
          No users found
        </Typography>
      ) : (
        <List dense disablePadding>
          {users.map((u) => (
            <ListItem
              key={u.username}
              sx={{
                borderBottom: "1px solid",
                borderColor: "divider",
                flexDirection: "column",
                alignItems: "flex-start",
                py: 1,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    variant="body2"
                    noWrap
                    title={u.email}
                    sx={{ fontWeight: 500 }}
                  >
                    {u.email || u.username}
                  </Typography>
                  <Chip
                    label={u.status}
                    size="small"
                    color={statusColor(u.status)}
                    sx={{ mt: 0.5, height: 20, fontSize: "0.7rem" }}
                  />
                </Box>
                <Box sx={{ display: "flex", gap: 0.5, ml: 1 }}>
                  <IconButton
                    size="small"
                    title="Reset password"
                    onClick={() => setResetTarget(u)}
                  >
                    <LockReset fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    title="Delete user"
                    color="error"
                    onClick={() => setDeleteTarget(u)}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            </ListItem>
          ))}
        </List>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete{" "}
            <strong>
              {deleteTarget?.email || deleteTarget?.username}
            </strong>
            ? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            onClick={handleDeleteUser}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={
              deleting ? <CircularProgress size={16} /> : <Delete />
            }
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Password Confirm Dialog */}
      <Dialog open={!!resetTarget} onClose={() => setResetTarget(null)}>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Generate a new temporary password for{" "}
            <strong>{resetTarget?.email || resetTarget?.username}</strong>?
            They will be required to change it on next sign-in.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetTarget(null)}>Cancel</Button>
          <Button
            onClick={handleResetPassword}
            variant="contained"
            disabled={resetting}
            startIcon={resetting ? <CircularProgress size={16} /> : <LockReset />}
          >
            Reset
          </Button>
        </DialogActions>
      </Dialog>

      {/* Password Result Dialog */}
      <Dialog open={!!resetResult} onClose={() => setResetResult(null)}>
        <DialogTitle>Temporary Password</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Password reset for <strong>{resetResult?.email}</strong>. Share this with them — they must change it on first sign-in.
          </DialogContentText>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              p: 1.5,
              bgcolor: "action.hover",
              borderRadius: 1,
              fontFamily: "monospace",
              fontSize: "1.1rem",
              letterSpacing: 1,
            }}
          >
            <Typography sx={{ flex: 1, fontFamily: "monospace", fontSize: "1.1rem", letterSpacing: 1 }}>
              {resetResult?.password}
            </Typography>
            <IconButton
              size="small"
              onClick={() => copyToClipboard(resetResult?.password)}
              title="Copy password"
            >
              <ContentCopy fontSize="small" />
            </IconButton>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetResult(null)} variant="contained">Done</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
