import { useState, useEffect, useCallback } from "react"
import { wikiApi, shareApi } from "../services/api"

export function useWiki() {
    const [wikis, setWikis] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const loadWikis = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await wikiApi.list()
            setWikis(data.wikis || [])
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }, [])

    const createWiki = useCallback(
        async (name) => {
            const data = await wikiApi.create(name)
            await loadWikis() // Refresh list
            return data
        },
        [loadWikis],
    )

    const updateWiki = useCallback(
        async (wikiId, name) => {
            await wikiApi.update(wikiId, name)
            await loadWikis()
        },
        [loadWikis],
    )

    const deleteWiki = useCallback(
        async (wikiId) => {
            await wikiApi.delete(wikiId)
            await loadWikis()
        },
        [loadWikis],
    )

    const shareWiki = useCallback(async (wikiId, email, accessLevel) => {
        return await shareApi.create(wikiId, email, accessLevel)
    }, [])

    const listShares = useCallback(async (wikiId) => {
        return await shareApi.list(wikiId)
    }, [])

    const revokeShare = useCallback(async (wikiId, userId) => {
        return await shareApi.delete(wikiId, userId)
    }, [])

    return {
        wikis,
        loading,
        error,
        loadWikis,
        createWiki,
        updateWiki,
        deleteWiki,
        shareWiki,
        listShares,
        revokeShare,
    }
}
