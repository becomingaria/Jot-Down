import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { ThemeProvider, createTheme, responsiveFontSizes, CssBaseline } from "@mui/material"
import { AuthProvider } from "./contexts/AuthContext"
import { LoginPage } from "./components/auth/LoginPage"
import { PrivateRoute } from "./components/auth/PrivateRoute"
import { WikiList } from "./components/wiki/WikiList"
import { WikiView } from "./components/wiki/WikiView"

let theme = createTheme({
  palette: {
    mode: "light",
    background: {
      default: "#F7F9F7",
      paper: "#FFFFFF",
    },
    primary: {
      main: "#9FD8C6",
      light: "#CFEDE3",
      dark: "#5FAF9A",
      contrastText: "#4E3A2E",
    },
    secondary: {
      main: "#C7A78B",
      contrastText: "#4E3A2E",
    },
    text: {
      primary: "#4E3A2E",
      secondary: "#8B6A52",
    },
    divider: "#AEB8B2",
  },
})

// Responsive typography for mobile readability
theme = responsiveFontSizes(theme)

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
