/**
 * WebSocket Lambda — handles API Gateway WebSocket routes:
 *
 *   $connect    — validate token, record connection in DynamoDB
 *   $disconnect — clean up connection + subscription records
 *   subscribe   — associate connection with a specific wikiId/fileId
 *   ping        — keep-alive heartbeat
 *
 * DynamoDB patterns (shares the main jot-down-table):
 *
 *   Forward lookup  (file → connections)
 *     PK: WSFILE#<wikiId>#<fileId>   SK: CONN#<connectionId>
 *     TTL: 2 hours from last action
 *
 *   Reverse lookup  (connection → file, for disconnect cleanup)
 *     PK: WSCONN#<connectionId>      SK: META
 *     Fields: wikiId, fileId, ttl
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    DeleteCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb"
import {
    ApiGatewayManagementApiClient,
    PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi"
import {
    CognitoIdentityProviderClient,
    GetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider"

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const cognito = new CognitoIdentityProviderClient({})
const TABLE_NAME = process.env.TABLE_NAME

// TTL: 2 hours from now
const ttlFromNow = () => Math.floor(Date.now() / 1000) + 7200

// ── Connection list cache ─────────────────────────────────────────────────────
// Caches DDB query results per file for 5 s so broadcast/cursor/typing actions
// don't each pay a full DDB round-trip when hit in quick succession.
const _connCache = {}
const CONN_CACHE_TTL_MS = 5000

async function getFileConnections(wikiId, fileId) {
    const key = `${wikiId}#${fileId}`
    const cached = _connCache[key]
    if (cached && Date.now() - cached.ts < CONN_CACHE_TTL_MS) return cached.items
    const result = await ddb.send(
        new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `WSFILE#${wikiId}#${fileId}`,
                ':sk': 'CONN#',
            },
        }),
    )
    const items = result.Items || []
    _connCache[key] = { items, ts: Date.now() }
    return items
}

function domainOf(event) {
    return event.requestContext.domainName
}

function stageOf(event) {
    return event.requestContext.stage
}

function mgmtClient(event) {
    return new ApiGatewayManagementApiClient({
        endpoint: `https://${domainOf(event)}/${stageOf(event)}`,
    })
}

/**
 * Validate the Cognito access token by calling GetUser.
 * This uses an AWS SDK call available in the Lambda runtime — no extra packages.
 * Returns { userId, email } on success, null on failure/expiry.
 */
async function validateToken(accessToken) {
    if (!accessToken) return null
    try {
        const result = await cognito.send(
            new GetUserCommand({ AccessToken: accessToken }),
        )
        const attrs = Object.fromEntries(
            result.UserAttributes.map(({ Name, Value }) => [Name, Value]),
        )
        return { userId: attrs.sub, email: attrs.email }
    } catch (err) {
        console.warn("Token validation failed:", err.message)
        return null
    }
}

// ── $connect ─────────────────────────────────────────────────────────────────
async function handleConnect(event) {
    const connectionId = event.requestContext.connectionId
    const token = event.queryStringParameters?.token

    const user = await validateToken(token)
    if (!user) {
        console.info(`$connect rejected — invalid token (conn=${connectionId})`)
        return { statusCode: 401, body: "Unauthorized" }
    }

    // Store the connection record (no subscription yet; subscribe action comes next)
    await ddb.send(
        new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: `WSCONN#${connectionId}`,
                SK: "META",
                connectionId,
                userId: user.userId,
                email: user.email,
                connectedAt: new Date().toISOString(),
                ttl: ttlFromNow(),
                // wikiId / fileId populated by subscribe action
            },
        }),
    )

    console.info(`$connect OK userId=${user.userId} conn=${connectionId}`)
    return { statusCode: 200, body: "Connected" }
}

// ── $disconnect ───────────────────────────────────────────────────────────────
async function handleDisconnect(event) {
    const connectionId = event.requestContext.connectionId

    // Look up the subscription to know which WSFILE# record to remove
    let wikiId, fileId
    try {
        const meta = await ddb.send(
            new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `WSCONN#${connectionId}`, SK: "META" },
            }),
        )
        wikiId = meta.Item?.wikiId
        fileId = meta.Item?.fileId
    } catch (err) {
        console.warn("$disconnect: failed to read connection meta", err.message)
    }

    // Delete connection meta record
    await ddb
        .send(
            new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { PK: `WSCONN#${connectionId}`, SK: "META" },
            }),
        )
        .catch((e) =>
            console.warn("$disconnect: failed to delete WSCONN", e.message),
        )

    // Delete subscription record if we had one
    if (wikiId && fileId) {
        await ddb
            .send(
                new DeleteCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        PK: `WSFILE#${wikiId}#${fileId}`,
                        SK: `CONN#${connectionId}`,
                    },
                }),
            )
            .catch((e) =>
                console.warn("$disconnect: failed to delete WSFILE", e.message),
            )
    }

    console.info(`$disconnect conn=${connectionId}`)
    return { statusCode: 200, body: "Disconnected" }
}

// ── subscribe action ──────────────────────────────────────────────────────────
async function handleSubscribe(event) {
    const connectionId = event.requestContext.connectionId
    const body = JSON.parse(event.body || "{}")
    const { wikiId, fileId } = body

    if (!wikiId || !fileId) {
        return sendMessage(event, connectionId, {
            type: "error",
            message: "subscribe requires wikiId and fileId",
        })
    }

    const ttl = ttlFromNow()

    // Upsert forward lookup: file → connection
    await ddb.send(
        new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: `WSFILE#${wikiId}#${fileId}`,
                SK: `CONN#${connectionId}`,
                connectionId,
                wikiId,
                fileId,
                ttl,
            },
        }),
    )

    // Update reverse lookup: connection → file
    await ddb.send(
        new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                PK: `WSCONN#${connectionId}`,
                SK: "META",
                connectionId,
                wikiId,
                fileId,
                ttl,
            },
        }),
    )

    await sendMessage(event, connectionId, {
        type: "subscribed",
        wikiId,
        fileId,
    })

    console.info(`subscribe conn=${connectionId} file=${wikiId}/${fileId}`)
    return { statusCode: 200, body: "OK" }
}

// ── broadcast action — client sends content on each keystroke ────────────────
async function handleBroadcast(event) {
    const connectionId = event.requestContext.connectionId
    const body = JSON.parse(event.body || "{}")
    const { wikiId, fileId, content, fromEmail } = body

    if (!wikiId || !fileId || content === undefined) {
        return {
            statusCode: 400,
            body: "broadcast requires wikiId, fileId, content",
        }
    }

    let connections
    try {
        connections = await getFileConnections(wikiId, fileId)
    } catch (err) {
        console.warn("handleBroadcast: DDB query failed", err.message)
        return { statusCode: 500, body: "Internal error" }
    }

    const payload = Buffer.from(
        JSON.stringify({
            type: "file.content",
            wikiId,
            fileId,
            content,
            fromEmail,
        }),
    )
    const client = mgmtClient(event)

    await Promise.all(
        connections
            .filter((c) => c.connectionId !== connectionId)
            .map(async ({ connectionId: connId }) => {
                try {
                    await client.send(
                        new PostToConnectionCommand({
                            ConnectionId: connId,
                            Data: payload,
                        }),
                    )
                } catch (err) {
                    if (err.$metadata?.httpStatusCode === 410) {
                        await ddb
                            .send(
                                new DeleteCommand({
                                    TableName: TABLE_NAME,
                                    Key: {
                                        PK: `WSFILE#${wikiId}#${fileId}`,
                                        SK: `CONN#${connId}`,
                                    },
                                }),
                            )
                            .catch(() => {})
                        await ddb
                            .send(
                                new DeleteCommand({
                                    TableName: TABLE_NAME,
                                    Key: { PK: `WSCONN#${connId}`, SK: "META" },
                                }),
                            )
                            .catch(() => {})
                    } else {
                        console.warn(
                            `handleBroadcast: send failed conn=${connId}`,
                            err.message,
                        )
                    }
                }
            }),
    )

    return { statusCode: 200, body: "OK" }
}

// ── cursor broadcast ──────────────────────────────────────────────────────────
async function handleCursorBroadcast(event) {
    const connectionId = event.requestContext.connectionId
    const body = JSON.parse(event.body || "{}")
    const { wikiId, fileId, blockIndex, offset, fromEmail } = body
    if (!wikiId || !fileId) return { statusCode: 400, body: "missing fields" }

    let connections = []
    try {
        connections = await getFileConnections(wikiId, fileId)
    } catch (err) {
        console.warn("handleCursorBroadcast: DDB query failed", err.message)
        return { statusCode: 500, body: "Internal error" }
    }

    const payload = Buffer.from(
        JSON.stringify({
            type: "cursor.update",
            wikiId,
            fileId,
            blockIndex: blockIndex ?? 0,
            offset: offset ?? 0,
            fromEmail,
        }),
    )
    const client = mgmtClient(event)

    await Promise.all(
        connections
            .filter((c) => c.connectionId !== connectionId)
            .map(async ({ connectionId: connId }) => {
                try {
                    await client.send(
                        new PostToConnectionCommand({
                            ConnectionId: connId,
                            Data: payload,
                        }),
                    )
                } catch (err) {
                    if (err.$metadata?.httpStatusCode === 410) {
                        await ddb
                            .send(
                                new DeleteCommand({
                                    TableName: TABLE_NAME,
                                    Key: {
                                        PK: `WSFILE#${wikiId}#${fileId}`,
                                        SK: `CONN#${connId}`,
                                    },
                                }),
                            )
                            .catch(() => {})
                        await ddb
                            .send(
                                new DeleteCommand({
                                    TableName: TABLE_NAME,
                                    Key: { PK: `WSCONN#${connId}`, SK: "META" },
                                }),
                            )
                            .catch(() => {})
                    }
                }
            }),
    )

    return { statusCode: 200, body: "OK" }
}

// ── typing indicator ─────────────────────────────────────────────────────────
// Lightweight broadcast — no content payload, just signals that a user is
// actively typing. Uses the cached connection list so there's no extra DDB read.
async function handleTypingBroadcast(event) {
    const connectionId = event.requestContext.connectionId
    const body = JSON.parse(event.body || "{}")
    const { wikiId, fileId, fromEmail } = body
    if (!wikiId || !fileId) return { statusCode: 400, body: "missing fields" }

    let connections = []
    try {
        connections = await getFileConnections(wikiId, fileId)
    } catch (err) {
        console.warn("handleTypingBroadcast: DDB query failed", err.message)
        return { statusCode: 500, body: "Internal error" }
    }

    const payload = Buffer.from(
        JSON.stringify({ type: "typing.update", wikiId, fileId, fromEmail }),
    )
    const client = mgmtClient(event)
    await Promise.all(
        connections
            .filter((c) => c.connectionId !== connectionId)
            .map(async ({ connectionId: connId }) => {
                try {
                    await client.send(
                        new PostToConnectionCommand({ ConnectionId: connId, Data: payload }),
                    )
                } catch (err) {
                    if (err.$metadata?.httpStatusCode === 410) {
                        // Stale — remove and invalidate cache
                        delete _connCache[`${wikiId}#${fileId}`]
                        await ddb.send(new DeleteCommand({
                            TableName: TABLE_NAME,
                            Key: { PK: `WSFILE#${wikiId}#${fileId}`, SK: `CONN#${connId}` },
                        })).catch(() => {})
                    }
                }
            }),
    )
    return { statusCode: 200, body: "OK" }
}

// ── ping / keep-alive ─────────────────────────────────────────────────────────
async function handlePing(event) {
    const connectionId = event.requestContext.connectionId
    await sendMessage(event, connectionId, { type: "pong" })
    return { statusCode: 200, body: "OK" }
}

// ── helpers ───────────────────────────────────────────────────────────────────
async function sendMessage(event, connectionId, payload) {
    const client = mgmtClient(event)
    try {
        await client.send(
            new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: Buffer.from(JSON.stringify(payload)),
            }),
        )
    } catch (err) {
        if (err.$metadata?.httpStatusCode === 410) {
            // Stale connection — clean it up silently
            await ddb
                .send(
                    new DeleteCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: `WSCONN#${connectionId}`, SK: "META" },
                    }),
                )
                .catch(() => {})
        } else {
            console.warn(`sendMessage failed conn=${connectionId}`, err.message)
        }
    }
}

// ── handler entry point ───────────────────────────────────────────────────────
export async function handler(event) {
    // EventBridge warmer ping — return immediately to keep the execution
    // environment alive without touching the WebSocket plumbing.
    if (event.source === 'aws.events' || event['detail-type'] === 'Scheduled Event') {
        return { statusCode: 200, body: 'warm' }
    }

    const route = event.requestContext.routeKey

    switch (route) {
        case "$connect":
            return handleConnect(event)
        case "$disconnect":
            return handleDisconnect(event)
        default: {
            const body = JSON.parse(event.body || "{}")
            switch (body.action) {
                case "subscribe":
                    return handleSubscribe(event)
                case "broadcast":
                    return handleBroadcast(event)
                case "cursor":
                    return handleCursorBroadcast(event)
                case "typing":
                    return handleTypingBroadcast(event)
                case "ping":
                    return handlePing(event)
                default:
                    return { statusCode: 400, body: "Unknown action" }
            }
        }
    }
}
