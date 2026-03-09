import { useState, useCallback } from "react"
import { fileApi, folderApi } from "../services/api"

export function useFile(wikiId) {
    const [files, setFiles] = useState([])
    const [folders, setFolders] = useState([])
    const [currentFile, setCurrentFile] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    // --- Folders ---

    const loadFolders = useCallback(async () => {
        if (!wikiId) return
        try {
            const data = await folderApi.list(wikiId)
            setFolders(data.folders || [])
        } catch (err) {
            setError(err.message)
        }
    }, [wikiId])

    const createFolder = useCallback(
        async (name, parentFolderId = null) => {
            const data = await folderApi.create(wikiId, name, parentFolderId)
            await loadFolders()
            return data
        },
        [wikiId, loadFolders],
    )

    const updateFolder = useCallback(
        async (folderId, data) => {
            await folderApi.update(wikiId, folderId, data)
            await loadFolders()
        },
        [wikiId, loadFolders],
    )

    const deleteFolder = useCallback(
        async (folderId) => {
            await folderApi.delete(wikiId, folderId)
            await loadFolders()
            await loadFiles() // Refresh files too since folder deletion cascades
        },
        [wikiId, loadFolders],
    )

    // --- Files ---

    const loadFiles = useCallback(
        async (folderId = null) => {
            if (!wikiId) return
            setLoading(true)
            try {
                const data = await fileApi.list(wikiId, folderId)
                setFiles(data.files || [])
            } catch (err) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        },
        [wikiId],
    )

    const loadFile = useCallback(
        async (fileId) => {
            if (!wikiId) return
            setLoading(true)
            try {
                const data = await fileApi.get(wikiId, fileId)
                setCurrentFile(data)
                return data
            } catch (err) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        },
        [wikiId],
    )

    const createFile = useCallback(
        async (name, content = "", folderId = null) => {
            const data = await fileApi.create(wikiId, name, content, folderId)
            await loadFiles(folderId)
            return data
        },
        [wikiId, loadFiles],
    )

    const updateFile = useCallback(
        async (fileId, data) => {
            await fileApi.update(wikiId, fileId, data)
            if (currentFile && currentFile.fileId === fileId) {
                setCurrentFile((prev) => ({ ...prev, ...data }))
            }
        },
        [wikiId, currentFile],
    )

    const deleteFile = useCallback(
        async (fileId) => {
            await fileApi.delete(wikiId, fileId)
            if (currentFile && currentFile.fileId === fileId) {
                setCurrentFile(null)
            }
            await loadFiles()
        },
        [wikiId, currentFile, loadFiles],
    )

    const importFile = useCallback(
        async (name, content, folderId = null) => {
            const data = await fileApi.import(wikiId, name, content, folderId)
            await loadFiles(folderId)
            return data
        },
        [wikiId, loadFiles],
    )

    return {
        files,
        folders,
        currentFile,
        loading,
        error,
        loadFolders,
        createFolder,
        updateFolder,
        deleteFolder,
        loadFiles,
        loadFile,
        createFile,
        updateFile,
        deleteFile,
        importFile,
        setCurrentFile,
    }
}
