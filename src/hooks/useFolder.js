import { useState, useEffect } from "react"
import { apiClient } from "../services/api"
import { useAuth } from "../contexts/AuthContext"

const CACHE_KEY = (wikiId) => `jd:folders:${wikiId}`

function getCachedFolders(wikiId) {
    try {
        const cached = sessionStorage.getItem(CACHE_KEY(wikiId))
        return cached ? JSON.parse(cached) : []
    } catch {
        return []
    }
}

export function useFolders(wikiId) {
    const [folders, setFolders] = useState(() => getCachedFolders(wikiId))
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const { idToken } = useAuth()

    useEffect(() => {
        if (idToken) {
            apiClient.setIdToken(idToken)
        }
    }, [idToken])

    const fetchFolders = async () => {
        if (!wikiId) return

        try {
            setLoading(true)
            setError(null)
            const data = await apiClient.getFolders(wikiId)
            const result = data.folders || []
            setFolders(result)
            try {
                sessionStorage.setItem(
                    CACHE_KEY(wikiId),
                    JSON.stringify(result),
                )
            } catch {}
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (idToken && wikiId) {
            fetchFolders()
        }
    }, [idToken, wikiId])

    const createFolder = async (name, parentFolderId = null) => {
        try {
            const result = await apiClient.createFolder(
                wikiId,
                name,
                parentFolderId,
            )
            await fetchFolders()
            return result
        } catch (err) {
            setError(err.message)
            throw err
        }
    }

    const deleteFolder = async (folderId) => {
        try {
            await apiClient.deleteFolder(wikiId, folderId)
            await fetchFolders()
        } catch (err) {
            setError(err.message)
            throw err
        }
    }

    const updateFolder = async (folderId, data) => {
        try {
            await apiClient.updateFolder(wikiId, folderId, data)
            await fetchFolders()
        } catch (err) {
            setError(err.message)
            throw err
        }
    }

    return {
        folders,
        loading,
        error,
        createFolder,
        deleteFolder,
        updateFolder,
        refetch: fetchFolders,
    }
}
