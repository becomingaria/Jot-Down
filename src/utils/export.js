// Client-side export helpers

/**
 * Download content as a file from the browser.
 */
export function downloadFile(content, filename, mimeType = "text/plain") {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/**
 * Download a file from a URL (for API-served exports).
 * Attaches auth token to the request.
 */
export async function downloadFromApi(url, filename, authToken) {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` },
    })

    if (!res.ok) throw new Error("Download failed")

    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
}
