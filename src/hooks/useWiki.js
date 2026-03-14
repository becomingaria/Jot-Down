import { useState, useEffect } from "react"
import { apiClient } from "../services/api"
import { useAuth } from "../contexts/AuthContext"

export function useWikis() {
    const [wikis, setWikis] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const { idToken } = useAuth()

    useEffect(() => {
        if (idToken) {
            apiClient.setIdToken(idToken)
        }
    }, [idToken])

    const fetchWikis = async () => {
        try {
            setLoading(true)
            setError(null)
            const data = await apiClient.getWikis()
            setWikis(data.wikis || [])
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (idToken) {
            fetchWikis()
        }
    }, [idToken])

    const createWiki = async (name) => {
        try {
            const result = await apiClient.createWiki(name)
            await fetchWikis()
            return result
        } catch (err) {
            setError(err.message)
            throw err
        }
    }

    const deleteWiki = async (wikiId) => {
        try {
            await apiClient.deleteWiki(wikiId)
            await fetchWikis()
        } catch (err) {
            setError(err.message)
            throw err
        }
    }

    const updateWiki = async (wikiId, name) => {
        try {
            await apiClient.updateWiki(wikiId, name)
            await fetchWikis()
        } catch (err) {
            setError(err.message)
            throw err
        }
    }

    return {
        wikis,
        loading,
        error,
        createWiki,
        deleteWiki,
        updateWiki,
        refetch: fetchWikis,
    }
}

export function useWiki(wikiId) {
    const [wiki, setWiki] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const { idToken } = useAuth()

    useEffect(() => {
        if (idToken) {
            apiClient.setIdToken(idToken)
        }
    }, [idToken])

    const fetchWiki = async () => {
        if (!wikiId) return

        try {
            setLoading(true)
            setError(null)
            const data = await apiClient.getWiki(wikiId)
            setWiki(data)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (idToken && wikiId) {
            fetchWiki()
        }
    }, [idToken, wikiId])

    const updateWiki = async (name) => {
        try {
            await apiClient.updateWiki(wikiId, name)
            await fetchWiki()
        } catch (err) {
            setError(err.message)
            throw err
        }
    }

    return {
        wiki,
        loading,
        error,
        updateWiki,
        refetch: fetchWiki,
    }
}
