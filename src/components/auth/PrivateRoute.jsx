import { Navigate } from "react-router-dom"
import { useAuth } from "../../contexts/AuthContext"
import { Box, CircularProgress } from "@mui/material"

export function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    )
  }

  return isAuthenticated ? children : <Navigate to="/login" />
}
