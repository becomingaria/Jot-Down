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

/**
 * Validate and sanitize the WS URL from the environment.
 * Guards against a common Netlify misconfiguration where the env var value
 * accidentally includes the key name (e.g. "VITE_WS_URL=wss://...") instead
 * of just the URL, causing the browser to treat it as a relative path.
 */
function resolveWsUrl(raw) {
    if (!raw) return null
    const trimmed = raw.trim()
    // Detect accidental KEY=VALUE format from Netlify dashboard misconfiguration
    const hasKeyPrefix =
        !trimmed.startsWith("wss://") &&
        !trimmed.startsWith("ws://") &&
        trimmed.includes("=")
    const resolved = hasKeyPrefix
        ? trimmed.slice(trimmed.indexOf("=") + 1)
        : trimmed
    if (!/^wss?:\/\//.test(resolved)) {
        console.error(
            "[useCollaboration] VITE_WS_URL is not a valid WebSocket URL.\n" +
                "Value received: " +
                JSON.stringify(raw) +
                "\n" +
                "Expected: wss://<api-id>.execute-api.<region>.amazonaws.com/<stage>\n" +
                "Fix: in the Netlify dashboard, set VITE_WS_URL to the URL only (no KEY= prefix).",
        )
        return null
    }
    if (hasKeyPrefix) {
        console.warn(
            "[useCollaboration] VITE_WS_URL had a KEY=VALUE format — extracted the value automatically.\n" +
                "Fix: in the Netlify dashboard, set VITE_WS_URL to just the URL: " +
                resolved,
        )
    }
    return resolved
}

const WS_URL = resolveWsUrl(import.meta.env.VITE_WS_URL)

const CURSOR_COLORS = [
    "#e91e63",
    "#9c27b0",
    "#2196f3",
    "#009688",
    "#ff5722",
    "#795548",
    "#ff9800",
    "#3f51b5",
]

function emailToColor(email) {
    let h = 0
    for (let i = 0; i < (email || "").length; i++)
        h = (email.charCodeAt(i) + ((h << 5) - h)) | 0
    return CURSOR_COLORS[Math.abs(h) % CURSOR_COLORS.length]
}

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
    const [remoteCursors, setRemoteCursors] = useState({}) // keyed by email

    const wsRef = useRef(null)
    const reconnectTimerRef = useRef(null)
    const pingTimerRef = useRef(null)
    const connectTimeoutRef = useRef(null)
    const reconnectDelayRef = useRef(1000)
    const mountedRef = useRef(true)
    const activeFileRef = useRef({ wikiId, fileId })
    const userEmailRef = useRef(userEmail)
    const cursorExpireTimers = useRef({})

    // Keep refs current for use inside WebSocket callbacks
    useEffect(() => {
        activeFileRef.current = { wikiId, fileId }
        setRemoteCursors((prev) => (Object.keys(prev).length === 0 ? prev : {})) // clear cursors when file changes
    }, [wikiId, fileId])

    useEffect(() => {
        userEmailRef.current = userEmail
    }, [userEmail])

    const clearRemoteUpdate = useCallback(() => setRemoteUpdate(null), [])
    const clearRemoteContent = useCallback(() => setRemoteContent(null), [])

    /** Send current editor content to all other subscribers (called on keystroke debounce). */
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

    /** Broadcast cursor position to all other subscribers. */
    const sendCursor = useCallback((blockIndex, offset) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return
        wsRef.current.send(
            JSON.stringify({
                action: "cursor",
                wikiId: activeFileRef.current.wikiId,
                fileId: activeFileRef.current.fileId,
                blockIndex,
                offset,
                fromEmail: userEmailRef.current || "collaborator",
            }),
        )
    }, [])

    /** Broadcast a typing indicator (no content). Throttle calls on the sender side. */
    const sendTyping = useCallback(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return
        wsRef.current.send(
            JSON.stringify({
                action: "typing",
                wikiId: activeFileRef.current.wikiId,
                fileId: activeFileRef.current.fileId,
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

        // If the current socket is still mid-handshake, don't replace it.
        // The connect timeout below will close it after 10 s and trigger onclose → backoff.
        if (wsRef.current?.readyState === WebSocket.CONNECTING) return

        if (wsRef.current) {
            wsRef.current.onclose = null // prevent reconnect loop from old socket
            wsRef.current.close()
        }

        // Cancel any leftover connect timeout from the previous socket
        if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current)
            connectTimeoutRef.current = null
        }

        setConnectionStatus("connecting")

        const url = `${WS_URL}?token=${encodeURIComponent(accessToken)}`
        const ws = new WebSocket(url)
        wsRef.current = ws

        // If the socket stays in CONNECTING for 10 s, close it so onclose fires
        // and the exponential back-off cycle can continue without flooding connect() calls.
        connectTimeoutRef.current = setTimeout(() => {
            connectTimeoutRef.current = null
            if (ws.readyState === WebSocket.CONNECTING) {
                ws.close()
            }
        }, 10000)

        ws.onopen = () => {
            if (connectTimeoutRef.current) {
                clearTimeout(connectTimeoutRef.current)
                connectTimeoutRef.current = null
            }
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
                    // Authoritative save notification — triggers an S3 fetch.
                    // Skip self-broadcasts: our own saves come back via WS but
                    // Canister already updates refs inline, so re-processing
                    // them would trigger a spurious setBlocks and drop focus.
                    if (msg.updatedBy && msg.updatedBy === userEmailRef.current)
                        return
                    setRemoteUpdate(msg)
                } else if (msg.type === "file.content" && isCurrentFile) {
                    // Keystroke-level content broadcast — apply directly, no S3 fetch.
                    // Skip self-broadcasts: own typing is already in contentRef.
                    if (msg.fromEmail && msg.fromEmail === userEmailRef.current)
                        return
                    setRemoteContent(msg)
                } else if (msg.type === "typing.update" && isCurrentFile) {
                    // Lightweight typing indicator — show immediately without waiting
                    // for full content broadcast (sub-100ms on warm path)
                    if (msg.fromEmail !== userEmailRef.current) {
                        setRemoteContent({
                            content: null,
                            fromEmail: msg.fromEmail,
                            typingOnly: true,
                        })
                    }
                } else if (msg.type === "cursor.update" && isCurrentFile) {
                    const color = emailToColor(msg.fromEmail)
                    setRemoteCursors((prev) => ({
                        ...prev,
                        [msg.fromEmail]: {
                            blockIndex: msg.blockIndex,
                            offset: msg.offset,
                            color,
                            email: msg.fromEmail,
                        },
                    }))
                    // Auto-expire cursor after 5 seconds of inactivity
                    if (cursorExpireTimers.current[msg.fromEmail])
                        clearTimeout(cursorExpireTimers.current[msg.fromEmail])
                    cursorExpireTimers.current[msg.fromEmail] = setTimeout(
                        () => {
                            setRemoteCursors((prev) => {
                                const n = { ...prev }
                                delete n[msg.fromEmail]
                                return n
                            })
                        },
                        5000,
                    )
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
            if (connectTimeoutRef.current) {
                clearTimeout(connectTimeoutRef.current)
                connectTimeoutRef.current = null
            }
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
            if (connectTimeoutRef.current) {
                clearTimeout(connectTimeoutRef.current)
                connectTimeoutRef.current = null
            }
            if (wsRef.current) {
                wsRef.current.onclose = null
                wsRef.current.close()
                wsRef.current = null
            }
            setConnectionStatus("closed")
            setRemoteCursors((prev) =>
                Object.keys(prev).length === 0 ? prev : {},
            )
            Object.values(cursorExpireTimers.current).forEach(clearTimeout)
            cursorExpireTimers.current = {}
        }
    }, [wikiId, fileId, accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

    return {
        connectionStatus,
        remoteUpdate,
        clearRemoteUpdate,
        remoteContent,
        clearRemoteContent,
        sendContent,
        remoteCursors,
        sendCursor,
        sendTyping,
    }
}
