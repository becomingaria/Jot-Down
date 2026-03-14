import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material"
import { AuthProvider } from "./contexts/AuthContext"
import { LoginPage } from "./components/auth/LoginPage"
import { PrivateRoute } from "./components/auth/PrivateRoute"
import { WikiList } from "./components/wiki/WikiList"
import { WikiView } from "./components/wiki/WikiView"

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1976d2",
    },
    secondary: {
      main: "#dc004e",
    },
  },
})

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/wikis"
              element={
                <PrivateRoute>
                  <WikiList />
                </PrivateRoute>
              }
            />
            <Route
              path="/wikis/:wikiId/*"
              element={
                <PrivateRoute>
                  <WikiView />
                </PrivateRoute>
              }
            />
            <Route path="/" element={<Navigate to="/wikis" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
