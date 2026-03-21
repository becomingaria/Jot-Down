import { useMemo } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { ThemeProvider, createTheme, responsiveFontSizes, CssBaseline, useMediaQuery } from "@mui/material"
import { AuthProvider } from "./contexts/AuthContext"
import { LoginPage } from "./components/auth/LoginPage"
import { PrivateRoute } from "./components/auth/PrivateRoute"
import { WikiList } from "./components/wiki/WikiList"
import { WikiView } from "./components/wiki/WikiView"

// ── Design tokens — mirrors CSS variables in index.css ───────────────────────
const T = {
  light: {
    accent: "#E5484D",
    accentHover: "#CC3237",
    bg: "#FFFFFF",
    surface: "#F7F7F8",
    surface2: "#EEEEEF",
    border: "#E5E5E7",
    text: "#111111",
    text2: "#6B6B6B",
    hover: "rgba(0,0,0,0.03)",
    hover2: "rgba(0,0,0,0.06)",
  },
  dark: {
    accent: "#FF5A5F",
    accentHover: "#E54549",
    bg: "#191919",
    surface: "#242424",
    surface2: "#2D2D2D",
    border: "#333333",
    text: "#F5F5F5",
    text2: "#A1A1A1",
    hover: "rgba(255,255,255,0.04)",
    hover2: "rgba(255,255,255,0.07)",
  },
}

function buildTheme(isDark) {
  const t = T[isDark ? "dark" : "light"]
  return responsiveFontSizes(
    createTheme({
      palette: {
        mode: isDark ? "dark" : "light",
        primary: { main: t.accent, contrastText: "#ffffff" },
        secondary: { main: t.surface2, contrastText: t.text },
        background: { default: t.bg, paper: t.surface },
        text: { primary: t.text, secondary: t.text2 },
        divider: t.border,
        action: {
          hover: t.hover2,
          selected: `${t.accent}18`,
          focus: `${t.accent}22`,
        },
      },
      typography: {
        fontFamily: ["Inter", "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "system-ui", "sans-serif"].join(","),
        h1: { fontSize: "2rem", fontWeight: 600, lineHeight: 1.25 },
        h2: { fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.3 },
        h3: { fontSize: "1.25rem", fontWeight: 500, lineHeight: 1.4 },
        h4: { fontSize: "1.125rem", fontWeight: 500, lineHeight: 1.4 },
        h5: { fontSize: "1rem", fontWeight: 500 },
        h6: { fontSize: "0.875rem", fontWeight: 500 },
        body1: { fontSize: "0.9375rem", lineHeight: 1.6 },
        body2: { fontSize: "0.875rem", lineHeight: 1.6 },
        caption: { fontSize: "0.8125rem", lineHeight: 1.5 },
        overline: { fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" },
        button: { fontSize: "0.875rem", fontWeight: 500, textTransform: "none", letterSpacing: 0 },
      },
      shape: { borderRadius: 8 },
      shadows: [
        "none",
        "0 1px 2px rgba(0,0,0,0.06)",
        "0 1px 4px rgba(0,0,0,0.08)",
        "0 2px 8px rgba(0,0,0,0.08)",
        "0 4px 12px rgba(0,0,0,0.09)",
        "0 4px 16px rgba(0,0,0,0.10)",
        ...Array(19).fill("0 4px 24px rgba(0,0,0,0.12)"),
      ],
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            body: { WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale" },
          },
        },
        // ── Buttons ──────────────────────────────────────────────────────────
        MuiButton: {
          defaultProps: { disableElevation: true },
          styleOverrides: {
            root: {
              borderRadius: 7,
              padding: "7px 16px",
              fontWeight: 500,
              transition: "background-color 150ms ease, border-color 150ms ease",
            },
            containedPrimary: { "&:hover": { backgroundColor: t.accentHover } },
            outlined: {
              borderColor: t.border,
              color: t.text,
              "&:hover": { borderColor: t.text2, backgroundColor: t.hover },
            },
            text: { color: t.text2, "&:hover": { backgroundColor: t.hover2 } },
            sizeSmall: { padding: "4px 10px", fontSize: "0.8125rem" },
            sizeLarge: { padding: "10px 22px", fontSize: "0.9375rem" },
          },
        },
        MuiIconButton: {
          styleOverrides: {
            root: {
              borderRadius: 6,
              transition: "background-color 150ms ease, color 150ms ease",
              "&:hover": { backgroundColor: t.hover2 },
            },
          },
        },
        // ── Inputs ───────────────────────────────────────────────────────────
        MuiOutlinedInput: {
          styleOverrides: {
            root: {
              backgroundColor: t.surface,
              borderRadius: 7,
              fontSize: "0.9375rem",
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: t.border,
                transition: "border-color 150ms ease, box-shadow 150ms ease",
              },
              "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: t.text2 },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: t.accent,
                borderWidth: "1px",
                boxShadow: `0 0 0 3px ${t.accent}22`,
              },
            },
            input: { padding: "10px 14px" },
          },
        },
        MuiInputLabel: {
          styleOverrides: {
            root: { fontSize: "0.875rem", "&.Mui-focused": { color: t.accent } },
          },
        },
        // ── Cards & Panels ───────────────────────────────────────────────────
        MuiPaper: {
          defaultProps: { elevation: 0 },
          styleOverrides: {
            root: { backgroundImage: "none" },
            outlined: { borderColor: t.border },
          },
        },
        MuiCard: {
          defaultProps: { elevation: 0, variant: "outlined" },
          styleOverrides: {
            root: {
              borderColor: t.border,
              borderRadius: 10,
              transition: "box-shadow 150ms ease, border-color 150ms ease",
              "&:hover": { borderColor: t.text2, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" },
            },
          },
        },
        MuiCardContent: {
          styleOverrides: { root: { "&:last-child": { paddingBottom: 16 } } },
        },
        // ── AppBar ───────────────────────────────────────────────────────────
        MuiAppBar: {
          defaultProps: { elevation: 0 },
          styleOverrides: {
            root: {
              backgroundColor: isDark ? t.surface : t.bg,
              color: t.text,
              borderBottom: `1px solid ${t.border}`,
            },
          },
        },
        MuiToolbar: {
          styleOverrides: {
            root: { paddingLeft: "16px !important", paddingRight: "16px !important" },
          },
        },
        MuiDrawer: {
          styleOverrides: {
            paper: { backgroundColor: isDark ? t.surface : "#FAFAFA", borderColor: t.border },
          },
        },
        MuiDivider: {
          styleOverrides: { root: { borderColor: t.border } },
        },
        // ── List ─────────────────────────────────────────────────────────────
        MuiListItemButton: {
          styleOverrides: {
            root: {
              borderRadius: 6,
              "&:hover": { backgroundColor: t.hover2 },
              "&.Mui-selected": {
                backgroundColor: `${t.accent}16`,
                color: t.accent,
                "&:hover": { backgroundColor: `${t.accent}24` },
              },
            },
          },
        },
        // ── Dialogs ──────────────────────────────────────────────────────────
        MuiDialog: {
          styleOverrides: {
            paper: { borderRadius: 12, border: `1px solid ${t.border}` },
          },
        },
        MuiDialogTitle: {
          styleOverrides: {
            root: { fontSize: "1rem", fontWeight: 600, padding: "20px 24px 12px" },
          },
        },
        MuiDialogContent: {
          styleOverrides: { root: { padding: "8px 24px" } },
        },
        MuiDialogActions: {
          styleOverrides: { root: { padding: "16px 24px" } },
        },
        // ── Menus ────────────────────────────────────────────────────────────
        MuiMenu: {
          styleOverrides: {
            paper: {
              borderRadius: 8,
              boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
              border: `1px solid ${t.border}`,
              backgroundImage: "none",
            },
          },
        },
        MuiMenuItem: {
          styleOverrides: {
            root: {
              borderRadius: 4,
              margin: "2px 4px",
              fontSize: "0.875rem",
              "&:hover": { backgroundColor: t.hover2 },
              "&.Mui-selected": {
                backgroundColor: `${t.accent}16`,
                "&:hover": { backgroundColor: `${t.accent}24` },
              },
            },
          },
        },
        MuiTooltip: {
          styleOverrides: {
            tooltip: {
              backgroundColor: isDark ? "#3a3a3a" : "#1a1a1a",
              color: isDark ? "#f0f0f0" : "#ffffff",
              fontSize: "0.75rem",
              borderRadius: 5,
              padding: "4px 8px",
            },
          },
        },
        MuiAlert: { styleOverrides: { root: { borderRadius: 8 } } },
        MuiChip: { styleOverrides: { root: { borderRadius: 6, fontSize: "0.8125rem" } } },
        MuiSelect: { styleOverrides: { select: { fontSize: "0.875rem" } } },
        MuiAutocomplete: {
          styleOverrides: {
            paper: {
              borderRadius: 8,
              border: `1px solid ${t.border}`,
              boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
            },
            option: {
              fontSize: "0.875rem",
              "&[aria-selected='true']": { backgroundColor: `${t.accent}16 !important` },
            },
          },
        },
        MuiCircularProgress: { defaultProps: { size: 20, thickness: 4 } },
      },
    }),
  )
}

function App() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)")
  const theme = useMemo(() => buildTheme(prefersDark), [prefersDark])

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
