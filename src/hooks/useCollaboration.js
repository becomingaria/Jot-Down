/**
 * useCollaboration — real-time WebSocket hook for collaborative editing.
 *
 * Connects to the API Gateway WebSocket endpoint when both `wikiId`/`fileId`
 * and a Cognito `accessToken` are available.  The hook:
 *
 *   1. Opens a WSS connection with the access token in the query string so the
 *      server-side Lambda can call Cognito GetUser to verify the caller.
 *   2. Sends { action: "subscribe", wikiId, fileId } on open to register
 *      interest in updates for this specific file.
 *   3. Sends a ping every 8 minutes to keep the API GW idle-timeout (10 min)
 *      from closing the connection.
 *   4. Reconnects with exponential back-off if the connection drops.
 *   5. Exposes `remoteUpdate` (latest file.update payload) and
 *      `connectionStatus` ('connecting' | 'open' | 'closed').
 *
 * Call `clearRemoteUpdate()` after processing an incoming update so that
 * the update isn't acted on twice if the component re-renders.
 */

import { useState, useEffect, useRef, useCallback } from "react"

const WS_URL = import.meta.env.VITE_WS_URL

/**
 * @param {object} params
 * @param {string|null} params.wikiId
 * @param {string|null} params.fileId
 * @param {string|null} params.accessToken - Cognito access token from AuthContext
 */
export function useCollaboration({ wikiId, fileId, accessToken, userEmail }) {
    const [connectionStatus, setConnectionStatus] = useState("closed")
    const [remoteUpdate, setRemoteUpdate] = useState(null)
    const [remoteContent, setRemoteContent] = useState(null)

    const wsRef = useRef(null)
    const reconnectTimerRef = useRef(null)
    const pingTimerRef = useRef(null)
    const reconnectDelayRef = useRef(1000)
    const mountedRef = useRef(true)
    const activeFileRef = useRef({ wikiId, fileId })
    const userEmailRef = useRef(userEmail)

    // Keep refs current for use inside WebSocket callbacks
    useEffect(() => {
        activeFileRef.current = { wikiId, fileId }
    }, [wikiId, fileId])

    useEffect(() => {
        userEmailRef.current = userEmail
    }, [userEmail])

    const clearRemoteUpdate = useCallback(() => setRemoteUpdate(null), [])
    const clearRemoteContent = useCallback(() => setRemoteContent(null), [])

    /**
     * Send current editor content to all other subscribers via WebSocket.
     * Called on every keystroke (debounced by the caller).
     */
    const sendContent = useCallback((content) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return
        wsRef.current.send(
            JSON.stringify({
                action: "broadcast",
                wikiId: activeFileRef.current.wikiId,
                fileId: activeFileRef.current.fileId,
                content,
                fromEmail: userEmailRef.current || "collaborator",
            }),
        )
    }, [])

    const startPing = useCallback((ws) => {
        if (pingTimerRef.current) clearInterval(pingTimerRef.current)
        pingTimerRef.current = setInterval(
            () => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ action: "ping" }))
                }
            },
            8 * 60 * 1000,
        ) // 8 min — keeps alive under API GW 10 min idle timeout
    }, [])

    const connect = useCallback(() => {
        if (!WS_URL || !accessToken || !wikiId || !fileId) return
        if (wsRef.current) {
            wsRef.current.onclose = null // prevent reconnect loop from old socket
            wsRef.current.close()
        }

        setConnectionStatus("connecting")

        const url = `${WS_URL}?token=${encodeURIComponent(accessToken)}`
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
            if (!mountedRef.current) return
            reconnectDelayRef.current = 1000 // reset back-off on successful connect
            setConnectionStatus("open")

            ws.send(
                JSON.stringify({
                    action: "subscribe",
                    wikiId: activeFileRef.current.wikiId,
                    fileId: activeFileRef.current.fileId,
                }),
            )

            startPing(ws)
        }

        ws.onmessage = (event) => {
            if (!mountedRef.current) return
            try {
                const msg = JSON.parse(event.data)
                const isCurrentFile =
                    msg.wikiId === activeFileRef.current.wikiId &&
                    msg.fileId === activeFileRef.current.fileId

                if (msg.type === "file.update" && isCurrentFile) {
                    // Authoritative save notification — triggers an S3 fetch
                    setRemoteUpdate(msg)
                } else if (msg.type === "file.content" && isCurrentFile) {
                    // Keystroke-level content broadcast — apply directly, no S3 fetch
                    setRemoteContent(msg)
                }
                // 'subscribed', 'pong', 'error' — no state needed
            } catch {
                // non-JSON frames ignored
            }
        }

        ws.onerror = () => {
            // onerror is always followed by onclose — let onclose handle reconnect
        }

        ws.onclose = () => {
            if (!mountedRef.current) return
            setConnectionStatus("closed")
            if (pingTimerRef.current) clearInterval(pingTimerRef.current)

            // Exponential back-off: 1s → 2s → 4s → … capped at 30s
            const delay = Math.min(reconnectDelayRef.current, 30000)
            reconnectDelayRef.current = delay * 2
            reconnectTimerRef.current = setTimeout(() => {
                if (mountedRef.current) connect()
            }, delay)
        }
    }, [accessToken, wikiId, fileId, startPing]) // eslint-disable-line react-hooks/exhaustive-deps

    // Open connection when wikiId/fileId/accessToken are available
    useEffect(() => {
        if (!WS_URL || !accessToken || !wikiId || !fileId) return

        mountedRef.current = true
        reconnectDelayRef.current = 1000
        connect()

        return () => {
            mountedRef.current = false
            if (reconnectTimerRef.current)
                clearTimeout(reconnectTimerRef.current)
            if (pingTimerRef.current) clearInterval(pingTimerRef.current)
            if (wsRef.current) {
                wsRef.current.onclose = null
                wsRef.current.close()
                wsRef.current = null
            }
            setConnectionStatus("closed")
        }
    }, [wikiId, fileId, accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

    return { connectionStatus, remoteUpdate, clearRemoteUpdate, remoteContent, clearRemoteContent, sendContent }
}
