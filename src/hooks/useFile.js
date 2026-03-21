import { useState, useEffect, useRef, useCallback } from "react"
import { apiClient } from "../services/api"
import { useAuth } from "../contexts/AuthContext"

const FILES_CACHE_KEY = (wikiId, folderId) =>
    `jd:files:${wikiId}:${folderId || "root"}`

function getCachedFiles(wikiId, folderId) {
    try {
        const cached = sessionStorage.getItem(FILES_CACHE_KEY(wikiId, folderId))
        return cached ? JSON.parse(cached) : []
    } catch {
        return []
    }
}

export function useFiles(wikiId, folderId = null) {
    const [files, setFiles] = useState(() => getCachedFiles(wikiId, folderId))
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const { idToken } = useAuth()

    useEffect(() => {
        if (idToken) {
            apiClient.setIdToken(idToken)
        }
    }, [idToken])

    const fetchFiles = async () => {
        if (!wikiId) return

        try {
            setLoading(true)
            setError(null)
            const data = await apiClient.getFiles(wikiId, folderId)
            const result = data.files || []
            setFiles(result)
            try {
                sessionStorage.setItem(
                    FILES_CACHE_KEY(wikiId, folderId),
                    JSON.stringify(result),
                )
            } catch {}
            return result
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (idToken && wikiId) {
            fetchFiles()
        }
    }, [idToken, wikiId, folderId])

    const createFile = async (
        name,
        content = "",
        targetFolderId = null,
        parentFileId = null,
    ) => {
        try {
            const result = await apiClient.createFile(
                wikiId,
                name,
                content,
                targetFolderId || folderId,
                parentFileId,
            )
            await fetchFiles()
            return result
        } catch (err) {
            setError(err.message)
            throw err
        }
    }

    const deleteFile = async (fileId) => {
        try {
            await apiClient.deleteFile(wikiId, fileId)
            await fetchFiles()
        } catch (err) {
            setError(err.message)
            throw err
        }
    }

    const updateFile = async (fileId, data) => {
        try {
            await apiClient.updateFile(wikiId, fileId, data)
            await fetchFiles()
        } catch (err) {
            setError(err.message)
            throw err
        }
    }

    return {
        files,
        loading,
        error,
        createFile,
        deleteFile,
        updateFile,
        refetch: fetchFiles,
    }
}

export function useFile(wikiId, fileId) {
    const [file, setFile] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const { idToken } = useAuth()
    // Tracks the currently-requested fileId so stale async responses
    // (e.g. from a previous file's updateFile refetch) don't overwrite state.
    const latestFileIdRef = useRef(fileId)

    useEffect(() => {
        if (idToken) {
            apiClient.setIdToken(idToken)
        }
    }, [idToken])

    // Reset file to null immediately when fileId changes so Canister
    // never loads stale content from a previous file.
    useEffect(() => {
        latestFileIdRef.current = fileId
        setFile(null)
    }, [fileId])

    const fetchFile = useCallback(async () => {
        if (!wikiId || !fileId) return
        const requestedFileId = fileId

        try {
            setLoading(true)
            setError(null)
            const data = await apiClient.getFile(wikiId, requestedFileId)
            // Discard the response if the user has already switched to another file
            if (latestFileIdRef.current !== requestedFileId) return
            setFile(data)
        } catch (err) {
            if (latestFileIdRef.current === requestedFileId)
                setError(err.message)
        } finally {
            if (latestFileIdRef.current === requestedFileId) setLoading(false)
        }
    }, [wikiId, fileId])

    useEffect(() => {
        if (idToken && wikiId && fileId) {
            fetchFile()
        }
    }, [idToken, wikiId, fileId, fetchFile])

    // Full update — saves content and refreshes file state.
    const updateFile = useCallback(
        async (data) => {
            try {
                await apiClient.updateFile(wikiId, fileId, data)
                await fetchFile()
            } catch (err) {
                setError(err.message)
                throw err
            }
        },
        [wikiId, fileId, fetchFile],
    )

    // Fire-and-forget save — only PUTs content, no refetch.
    // Used by flush-on-switch so that a late-arriving response can't
    // overwrite `file` state after the user has moved to a different file.
    const saveContent = async (content) => {
        try {
            await apiClient.updateFile(wikiId, fileId, { content })
        } catch (err) {
            console.error("Silent save failed:", err)
        }
    }

    return {
        file,
        loading,
        error,
        updateFile,
        saveContent,
        refetch: fetchFile,
    }
}
