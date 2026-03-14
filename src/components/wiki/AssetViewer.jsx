import { Box, Paper, Typography } from "@mui/material"
import { TableChart, Image as ImageIcon } from "@mui/icons-material"
import { useFile } from "../../hooks/useFile"

export function AssetViewer({ wikiId, fileId, fileType }) {
  const { file, loading } = useFile(wikiId, fileId)

  if (loading || !file) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">Loading…</Typography>
      </Box>
    )
  }

  /* ── Image asset ─── */
  if (fileType === "image") {
    return (
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Paper sx={{ p: 1.5, borderRadius: 0, display: "flex", alignItems: "center", gap: 1 }}>
          <ImageIcon color="info" />
          <Typography variant="h6" noWrap>
            {file.name}
          </Typography>
        </Paper>
        <Box
          sx={{
            flexGrow: 1,
            p: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            overflow: "auto",
            bgcolor: "#f7f6f3",
          }}
        >
          <img
            src={file.content}
            alt={file.name}
            style={{
              maxWidth: "100%",
              maxHeight: "75vh",
              borderRadius: 8,
              boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
            {file.name}
          </Typography>
        </Box>
      </Box>
    )
  }

  /* ── CSV asset ─── */
  if (fileType === "csv") {
    const rows = (file.content || "")
      .split("\n")
      .filter(Boolean)
      .map((r) => r.split(","))
    const headers = rows[0] || []
    const dataRows = rows.slice(1)

    return (
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Paper sx={{ p: 1.5, borderRadius: 0, display: "flex", alignItems: "center", gap: 1 }}>
          <TableChart color="success" />
          <Typography variant="h6" noWrap>
            {file.name}
          </Typography>
        </Paper>
        <Box sx={{ flexGrow: 1, p: 3, overflow: "auto" }}>
          {rows.length > 0 ? (
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                fontSize: 14,
              }}
            >
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      style={{
                        border: "1px solid rgba(55,53,47,0.12)",
                        padding: "8px 12px",
                        background: "#f7f6f3",
                        fontWeight: 600,
                        textAlign: "left",
                      }}
                    >
                      {h.trim()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          border: "1px solid rgba(55,53,47,0.12)",
                          padding: "6px 12px",
                        }}
                      >
                        {cell.trim()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Typography color="text.secondary">No data</Typography>
          )}
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography color="text.secondary">Unsupported asset type</Typography>
    </Box>
  )
}
