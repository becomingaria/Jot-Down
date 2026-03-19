import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import {
    DynamoDBDocumentClient,
    PutCommand,
    GetCommand,
    QueryCommand,
    UpdateCommand,
    DeleteCommand,
} from "@aws-sdk/lib-dynamodb"
import {
    CognitoIdentityProviderClient,
    AdminCreateUserCommand,
    AdminDeleteUserCommand,
    AdminSetUserPasswordCommand,
    AdminAddUserToGroupCommand,
    ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider"
import { randomUUID, randomBytes } from "crypto"

// Generate a cryptographically random temporary password that always satisfies
// Cognito's policy (upper, lower, digit, symbol, min length 8).
function generateTempPassword() {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    const lower = "abcdefghjkmnpqrstuvwxyz"
    const digits = "23456789"
    const symbols = "!@#$%"
    const all = upper + lower + digits + symbols
    const buf = randomBytes(16)
    // Guarantee at least one character from each required class
    const chars = [
        upper[buf[0] % upper.length],
        upper[buf[1] % upper.length],
        lower[buf[2] % lower.length],
        lower[buf[3] % lower.length],
        digits[buf[4] % digits.length],
        digits[buf[5] % digits.length],
        symbols[buf[6] % symbols.length],
        all[buf[7] % all.length],
        all[buf[8] % all.length],
        all[buf[9] % all.length],
        all[buf[10] % all.length],
        all[buf[11] % all.length],
    ]
    // Fisher-Yates shuffle
    const sb = randomBytes(chars.length)
    for (let i = chars.length - 1; i > 0; i--) {
        const j = sb[i] % (i + 1)
        ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }
    return chars.join("")
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const cognito = new CognitoIdentityProviderClient({})
const TABLE_NAME = process.env.TABLE_NAME
const USER_POOL_ID = process.env.USER_POOL_ID

// Helper: extract user info from Cognito authorizer claims
function getUserFromEvent(event) {
    const claims = event.requestContext?.authorizer?.claims
    if (!claims) throw new Error("Unauthorized")
    return {
        userId: claims.sub,
        email: claims.email,
        groups: claims["cognito:groups"]?.split(",") || [],
    }
}

function isAdmin(user) {
    return user.groups.includes("admins")
}

function response(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        body: JSON.stringify(body),
    }
}

// Check if user can access a wiki (owner, shared, or admin)
async function canAccessWiki(userId, wikiId, requiredAccess = "view") {
    // Get wiki metadata
    const wikiResult = await ddb.send(
        new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `WIKI#${wikiId}`, SK: "META" },
        }),
    )

    if (!wikiResult.Item) return { allowed: false, wiki: null }

    const wiki = wikiResult.Item

    // Owner has full access
    if (wiki.ownerId === userId) return { allowed: true, wiki }

    // Check share
    const shareResult = await ddb.send(
        new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `WIKI#${wikiId}`, SK: `SHARE#${userId}` },
        }),
    )

    if (shareResult.Item) {
        if (requiredAccess === "view") return { allowed: true, wiki }
        if (
            requiredAccess === "edit" &&
            shareResult.Item.accessLevel === "edit"
        )
            return { allowed: true, wiki }
    }

    return { allowed: false, wiki }
}

export async function handler(event) {
    try {
        const user = getUserFromEvent(event)
        const method = event.httpMethod
        const path = event.resource
        const { wikiId, userId: targetUserId } = event.pathParameters || {}
        const body = event.body ? JSON.parse(event.body) : {}

        // --- WIKI CRUD ---

        // POST /wikis — Create wiki
        if (method === "POST" && path === "/wikis") {
            const wikiId = randomUUID()
            const now = new Date().toISOString()

            const item = {
                PK: `WIKI#${wikiId}`,
                SK: "META",
                entityType: "wiki",
                wikiId,
                name: body.name || "Untitled Wiki",
                ownerId: user.userId,
                ownerEmail: user.email,
                createdAt: now,
                updatedAt: now,
                // GSI for user lookups
                GSI1PK: `USER#${user.userId}`,
                GSI1SK: `WIKI#${wikiId}`,
            }

            await ddb.send(
                new PutCommand({ TableName: TABLE_NAME, Item: item }),
            )
            return response(201, { wikiId, name: item.name })
        }

        // GET /wikis — List user's wikis
        if (method === "GET" && path === "/wikis") {
            const result = await ddb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: "GSI1",
                    KeyConditionExpression: "GSI1PK = :pk",
                    ExpressionAttributeValues: { ":pk": `USER#${user.userId}` },
                }),
            )

            const wikis = (result.Items || []).map((item) => ({
                wikiId: item.wikiId,
                name: item.name,
                ownerId: item.ownerId,
                ownerEmail: item.ownerEmail,
                accessLevel: item.accessLevel || "owner",
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            }))

            return response(200, { wikis })
        }

        // GET /wikis/{wikiId} — Get wiki details
        if (method === "GET" && path === "/wikis/{wikiId}") {
            const { allowed, wiki } = await canAccessWiki(user.userId, wikiId)
            if (!allowed && !isAdmin(user))
                return response(403, { error: "Forbidden" })

            return response(200, {
                wikiId: wiki.wikiId,
                name: wiki.name,
                ownerId: wiki.ownerId,
                ownerEmail: wiki.ownerEmail,
                createdAt: wiki.createdAt,
                updatedAt: wiki.updatedAt,
            })
        }

        // PUT /wikis/{wikiId} — Update wiki
        if (method === "PUT" && path === "/wikis/{wikiId}") {
            const { allowed, wiki } = await canAccessWiki(
                user.userId,
                wikiId,
                "edit",
            )
            if (!allowed && !isAdmin(user))
                return response(403, { error: "Forbidden" })

            const now = new Date().toISOString()
            await ddb.send(
                new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: "META" },
                    UpdateExpression: "SET #name = :name, updatedAt = :now",
                    ExpressionAttributeNames: { "#name": "name" },
                    ExpressionAttributeValues: {
                        ":name": body.name,
                        ":now": now,
                    },
                }),
            )

            return response(200, { wikiId, name: body.name })
        }

        // DELETE /wikis/{wikiId} — Delete wiki (owner or admin only)
        if (method === "DELETE" && path === "/wikis/{wikiId}") {
            const { allowed, wiki } = await canAccessWiki(user.userId, wikiId)
            if (!wiki) return response(404, { error: "Wiki not found" })
            if (wiki.ownerId !== user.userId && !isAdmin(user)) {
                return response(403, {
                    error: "Only the owner or admin can delete a wiki",
                })
            }

            // Delete all items with this wiki's PK
            const allItems = await ddb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: "PK = :pk",
                    ExpressionAttributeValues: { ":pk": `WIKI#${wikiId}` },
                }),
            )

            for (const item of allItems.Items || []) {
                await ddb.send(
                    new DeleteCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: item.PK, SK: item.SK },
                    }),
                )
            }

            return response(200, { deleted: true })
        }

        // --- SHARING ---

        // POST /wikis/{wikiId}/shares — Share wiki
        if (method === "POST" && path === "/wikis/{wikiId}/shares") {
            const { allowed, wiki } = await canAccessWiki(user.userId, wikiId)
            if (!wiki) return response(404, { error: "Wiki not found" })
            if (wiki.ownerId !== user.userId && !isAdmin(user)) {
                return response(403, {
                    error: "Only the owner can share a wiki",
                })
            }

            // Look up target user by email in Cognito
            const usersResult = await cognito.send(
                new ListUsersCommand({
                    UserPoolId: USER_POOL_ID,
                    Filter: `email = "${body.email}"`,
                }),
            )

            if (!usersResult.Users || usersResult.Users.length === 0) {
                return response(404, { error: "User not found" })
            }

            const targetUser = usersResult.Users[0]
            const targetSub = targetUser.Attributes?.find(
                (a) => a.Name === "sub",
            )?.Value
            const now = new Date().toISOString()

            const shareItem = {
                PK: `WIKI#${wikiId}`,
                SK: `SHARE#${targetSub}`,
                entityType: "share",
                wikiId,
                userId: targetSub,
                userEmail: body.email,
                accessLevel: body.accessLevel || "view",
                grantedBy: user.userId,
                grantedAt: now,
                // GSI so shared user can find this wiki
                GSI1PK: `USER#${targetSub}`,
                GSI1SK: `WIKI#${wikiId}`,
                // Include wiki info for the GSI query result
                name: wiki.name,
                ownerId: wiki.ownerId,
                ownerEmail: wiki.ownerEmail,
            }

            await ddb.send(
                new PutCommand({ TableName: TABLE_NAME, Item: shareItem }),
            )
            return response(201, {
                shared: true,
                userEmail: body.email,
                accessLevel: shareItem.accessLevel,
            })
        }

        // GET /wikis/{wikiId}/shares — List shares
        if (method === "GET" && path === "/wikis/{wikiId}/shares") {
            const { allowed, wiki } = await canAccessWiki(user.userId, wikiId)
            if (!allowed && !isAdmin(user))
                return response(403, { error: "Forbidden" })

            const result = await ddb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                    ExpressionAttributeValues: {
                        ":pk": `WIKI#${wikiId}`,
                        ":sk": "SHARE#",
                    },
                }),
            )

            const shares = (result.Items || []).map((item) => ({
                userId: item.userId,
                userEmail: item.userEmail,
                accessLevel: item.accessLevel,
                grantedBy: item.grantedBy,
                grantedAt: item.grantedAt,
            }))

            return response(200, { shares })
        }

        // GET /wikis/{wikiId}/users — Search users by email (for share autocomplete)
        if (method === "GET" && path === "/wikis/{wikiId}/users") {
            const { allowed, wiki } = await canAccessWiki(user.userId, wikiId)
            if (!allowed && !isAdmin(user))
                return response(403, { error: "Forbidden" })

            const query = event.queryStringParameters?.query || ""
            const filter = query
                ? `email ^= "${query.replace(/"/g, '"')}"`
                : undefined

            const result = await cognito.send(
                new ListUsersCommand({
                    UserPoolId: USER_POOL_ID,
                    ...(filter ? { Filter: filter } : {}),
                    Limit: 25,
                }),
            )

            const users = (result.Users || []).map((u) => ({
                userId: u.Username,
                email: u.Attributes?.find((a) => a.Name === "email")?.Value,
            }))

            return response(200, { users })
        }

        // PUT /wikis/{wikiId}/shares/{userId} — Update share access level
        if (method === "PUT" && path === "/wikis/{wikiId}/shares/{userId}") {
            const { allowed, wiki } = await canAccessWiki(user.userId, wikiId)
            if (wiki?.ownerId !== user.userId && !isAdmin(user)) {
                return response(403, {
                    error: "Only the owner can update shares",
                })
            }

            await ddb.send(
                new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: `SHARE#${targetUserId}` },
                    UpdateExpression: "SET accessLevel = :level",
                    ExpressionAttributeValues: { ":level": body.accessLevel },
                }),
            )

            return response(200, { updated: true })
        }

        // DELETE /wikis/{wikiId}/shares/{userId} — Revoke share
        if (method === "DELETE" && path === "/wikis/{wikiId}/shares/{userId}") {
            const { allowed, wiki } = await canAccessWiki(user.userId, wikiId)
            if (wiki?.ownerId !== user.userId && !isAdmin(user)) {
                return response(403, {
                    error: "Only the owner can revoke shares",
                })
            }

            await ddb.send(
                new DeleteCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: `SHARE#${targetUserId}` },
                }),
            )

            return response(200, { deleted: true })
        }

        // --- ADMIN: User Management ---

        // GET /admin/users — List all users
        if (method === "GET" && path === "/admin/users") {
            if (!isAdmin(user))
                return response(403, { error: "Only admins can list users" })

            const result = await cognito.send(
                new ListUsersCommand({
                    UserPoolId: USER_POOL_ID,
                    Limit: 60,
                }),
            )

            const users = (result.Users || []).map((u) => ({
                username: u.Username,
                email: u.Attributes?.find((a) => a.Name === "email")?.Value,
                status: u.UserStatus,
                enabled: u.Enabled,
                created: u.UserCreateDate,
            }))

            return response(200, { users })
        }

        // POST /admin/users — Create user
        if (method === "POST" && path === "/admin/users") {
            if (!isAdmin(user))
                return response(403, { error: "Only admins can create users" })

            const tempPassword = body.temporaryPassword || generateTempPassword()

            await cognito.send(
                new AdminCreateUserCommand({
                    UserPoolId: USER_POOL_ID,
                    Username: body.email,
                    TemporaryPassword: tempPassword,
                    UserAttributes: [
                        { Name: "email", Value: body.email },
                        { Name: "email_verified", Value: "true" },
                    ],
                }),
            )

            if (body.group) {
                await cognito.send(
                    new AdminAddUserToGroupCommand({
                        UserPoolId: USER_POOL_ID,
                        Username: body.email,
                        GroupName: body.group,
                    }),
                )
            }

            return response(201, {
                created: true,
                email: body.email,
                temporaryPassword: tempPassword,
            })
        }

        // DELETE /admin/users/{userId} — Delete user
        if (method === "DELETE" && path === "/admin/users/{userId}") {
            if (!isAdmin(user))
                return response(403, { error: "Only admins can delete users" })

            const targetUsername = event.pathParameters?.userId

            await cognito.send(
                new AdminDeleteUserCommand({
                    UserPoolId: USER_POOL_ID,
                    Username: targetUsername,
                }),
            )

            return response(200, { deleted: true })
        }

        // PUT /admin/users/{userId} — Reset password
        if (method === "PUT" && path === "/admin/users/{userId}") {
            if (!isAdmin(user))
                return response(403, {
                    error: "Only admins can reset passwords",
                })

            const targetUsername = event.pathParameters?.userId
            if (!targetUsername)
                return response(400, { error: "Missing userId" })

            const newPassword = body.temporaryPassword || generateTempPassword()

            try {
                await cognito.send(
                    new AdminSetUserPasswordCommand({
                        UserPoolId: USER_POOL_ID,
                        Username: targetUsername,
                        Password: newPassword,
                        Permanent: false,
                    }),
                )
            } catch (err) {
                // Cognito user not found or password policy failure
                if (err.name === "UserNotFoundException") {
                    return response(404, { error: "User not found" })
                }
                if (err.name === "InvalidPasswordException") {
                    return response(400, { error: err.message })
                }
                console.error("AdminSetUserPassword failed:", err)
                return response(500, {
                    error: err.message || "Failed to set user password",
                })
            }

            return response(200, {
                reset: true,
                temporaryPassword: newPassword,
            })
        }

        return response(404, { error: "Not found" })
    } catch (err) {
        console.error("Wiki handler error:", err)
        return response(500, { error: err.message || "Internal server error" })
    }
}
