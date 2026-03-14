/**
 * Build a human-readable breadcrumb path for a file.
 *
 * Returns an array of display-name segments in order from outermost → file name.
 * Example: ["Engineering", "Q1 Planning", "Budget Notes"]
 *
 * @param {string} fileId
 * @param {Array}  files   — full files list from useFiles
 * @param {Array}  folders — full folders list from useFolders
 * @returns {string[]}
 */
export function buildFilePathSegments(fileId, files, folders) {
    const file = files.find((f) => f.fileId === fileId)
    if (!file) return []

    const segments = []

    // 1. Walk the parent-file chain (sub-pages)
    let cursor = file
    const visited = new Set()
    while (cursor.parentFileId && !visited.has(cursor.parentFileId)) {
        visited.add(cursor.parentFileId)
        const parent = files.find((f) => f.fileId === cursor.parentFileId)
        if (!parent) break
        segments.unshift(parent.name)
        cursor = parent
    }

    // 2. Walk the folder chain (from the deepest file / top of sub-page chain)
    const folderId = cursor.folderId
    if (folderId) {
        const folderChain = []
        const folderMap = Object.fromEntries(
            folders.map((f) => [f.folderId, f]),
        )
        let currFolder = folderMap[folderId]
        const visitedFolders = new Set()
        while (currFolder && !visitedFolders.has(currFolder.folderId)) {
            visitedFolders.add(currFolder.folderId)
            folderChain.unshift(currFolder.name)
            currFolder = currFolder.parentFolderId
                ? folderMap[currFolder.parentFolderId]
                : null
        }
        segments.unshift(...folderChain)
    }

    // 3. Append the file's own name
    segments.push(file.name)

    return segments
}

/**
 * Build the full URL path for navigating to a file.
 * Last segment is always the raw fileId so links are unambiguous even when
 * two files share the same name.
 *
 * e.g. /wikis/abc/Engineering/Q1%20Planning/Budget%20Notes/some-uuid
 */
export function buildFileUrl(wikiId, fileId, files, folders) {
    const segments = buildFilePathSegments(fileId, files, folders)
    const readable = segments.map((s) => encodeURIComponent(s)).join("/")
    return `/wikis/${wikiId}/${readable}/${fileId}`
}

/**
 * Extract the fileId from a splat param produced by a `/wikis/:wikiId/*` route.
 * The fileId is always the last segment.
 */
export function fileIdFromSplat(splat) {
    if (!splat) return null
    const parts = splat.split("/").filter(Boolean)
    return parts[parts.length - 1] || null
}
