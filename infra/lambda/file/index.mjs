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
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3"
import { randomUUID } from "crypto"

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const s3 = new S3Client({})
const TABLE_NAME = process.env.TABLE_NAME
const BUCKET_NAME = process.env.BUCKET_NAME
const MAX_VERSIONS_PER_FILE = parseInt(
    process.env.MAX_VERSIONS_PER_FILE || "10",
    10,
)

function response(statusCode, body, extraHeaders = {}) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            ...extraHeaders,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
    }
}

function getUserFromEvent(event) {
    const claims = event.requestContext?.authorizer?.claims
    if (!claims) throw new Error("Unauthorized")
    return {
        userId: claims.sub,
        email: claims.email,
        groups: claims["cognito:groups"]?.split(",") || [],
    }
}

async function streamToString(stream) {
    const chunks = []
    for await (const chunk of stream) {
        chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString("utf-8")
}

export async function handler(event) {
    try {
        const user = getUserFromEvent(event)
        const method = event.httpMethod
        const path = event.resource
        const { wikiId, folderId, fileId } = event.pathParameters || {}
        const body = event.body ? JSON.parse(event.body) : {}
        const qs = event.queryStringParameters || {}

        // --- FOLDER CRUD ---

        // POST /wikis/{wikiId}/folders — Create folder
        if (method === "POST" && path === "/wikis/{wikiId}/folders") {
            const folderId = randomUUID()
            const now = new Date().toISOString()
            const parentFolderId = body.parentFolderId || null

            // Build path
            let folderPath = `/${body.name || "Untitled Folder"}`
            if (parentFolderId) {
                const parentResult = await ddb.send(
                    new GetCommand({
                        TableName: TABLE_NAME,
                        Key: {
                            PK: `WIKI#${wikiId}`,
                            SK: `FOLDER#${parentFolderId}`,
                        },
                    }),
                )
                if (parentResult.Item) {
                    folderPath = `${parentResult.Item.path}/${body.name || "Untitled Folder"}`
                }
            }

            const item = {
                PK: `WIKI#${wikiId}`,
                SK: `FOLDER#${folderId}`,
                entityType: "folder",
                folderId,
                wikiId,
                parentFolderId,
                name: body.name || "Untitled Folder",
                path: folderPath,
                createdAt: now,
                updatedAt: now,
            }

            await ddb.send(
                new PutCommand({ TableName: TABLE_NAME, Item: item }),
            )
            return response(201, {
                folderId,
                name: item.name,
                path: folderPath,
            })
        }

        // GET /wikis/{wikiId}/folders — List folders
        if (method === "GET" && path === "/wikis/{wikiId}/folders") {
            const result = await ddb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                    ExpressionAttributeValues: {
                        ":pk": `WIKI#${wikiId}`,
                        ":sk": "FOLDER#",
                    },
                }),
            )

            const folders = (result.Items || []).map((item) => ({
                folderId: item.folderId,
                name: item.name,
                parentFolderId: item.parentFolderId,
                path: item.path,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            }))

            return response(200, { folders })
        }

        // GET /wikis/{wikiId}/folders/{folderId} — Get folder
        if (method === "GET" && path === "/wikis/{wikiId}/folders/{folderId}") {
            const result = await ddb.send(
                new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: `FOLDER#${folderId}` },
                }),
            )

            if (!result.Item)
                return response(404, { error: "Folder not found" })

            return response(200, {
                folderId: result.Item.folderId,
                name: result.Item.name,
                parentFolderId: result.Item.parentFolderId,
                path: result.Item.path,
            })
        }

        // PUT /wikis/{wikiId}/folders/{folderId} — Update folder
        if (method === "PUT" && path === "/wikis/{wikiId}/folders/{folderId}") {
            const now = new Date().toISOString()
            const updateExprParts = ["updatedAt = :now"]
            const exprValues = { ":now": now }
            const exprNames = {}

            if (body.name) {
                updateExprParts.push("#name = :name")
                exprValues[":name"] = body.name
                exprNames["#name"] = "name"
            }
            if (body.parentFolderId !== undefined) {
                updateExprParts.push("parentFolderId = :pfid")
                exprValues[":pfid"] = body.parentFolderId
            }

            await ddb.send(
                new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: `FOLDER#${folderId}` },
                    UpdateExpression: `SET ${updateExprParts.join(", ")}`,
                    ExpressionAttributeValues: exprValues,
                    ...(Object.keys(exprNames).length > 0
                        ? { ExpressionAttributeNames: exprNames }
                        : {}),
                }),
            )

            return response(200, { updated: true })
        }

        // DELETE /wikis/{wikiId}/folders/{folderId} — Delete folder (move children up)
        if (
            method === "DELETE" &&
            path === "/wikis/{wikiId}/folders/{folderId}"
        ) {
            // Get the folder to find its parent
            const folderResult = await ddb.send(
                new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: `FOLDER#${folderId}` },
                }),
            )
            const parentFolderIdOfDeleted =
                folderResult.Item?.parentFolderId || null

            // Move all files in this folder up to the parent folder
            const filesResult = await ddb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                    FilterExpression: "folderId = :fid",
                    ExpressionAttributeValues: {
                        ":pk": `WIKI#${wikiId}`,
                        ":sk": "FILE#",
                        ":fid": folderId,
                    },
                }),
            )

            for (const file of filesResult.Items || []) {
                await ddb.send(
                    new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: file.PK, SK: file.SK },
                        UpdateExpression: "SET folderId = :pfid",
                        ExpressionAttributeValues: {
                            ":pfid": parentFolderIdOfDeleted,
                        },
                    }),
                )
            }

            // Move child folders up to the parent folder
            const childFoldersResult = await ddb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                    FilterExpression: "parentFolderId = :fid",
                    ExpressionAttributeValues: {
                        ":pk": `WIKI#${wikiId}`,
                        ":sk": "FOLDER#",
                        ":fid": folderId,
                    },
                }),
            )

            for (const childFolder of childFoldersResult.Items || []) {
                await ddb.send(
                    new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { PK: childFolder.PK, SK: childFolder.SK },
                        UpdateExpression: "SET parentFolderId = :pfid",
                        ExpressionAttributeValues: {
                            ":pfid": parentFolderIdOfDeleted,
                        },
                    }),
                )
            }

            // Delete only the folder itself
            await ddb.send(
                new DeleteCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: `FOLDER#${folderId}` },
                }),
            )

            return response(200, { deleted: true, movedUp: true })
        }

        // --- FILE CRUD ---

        // POST /wikis/{wikiId}/files — Create file
        if (method === "POST" && path === "/wikis/{wikiId}/files") {
            const fileId = randomUUID()
            const now = new Date().toISOString()
            const s3Key = `wikis/${wikiId}/files/${fileId}.md`
            const content = body.content || ""

            // Upload content to S3
            await s3.send(
                new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: s3Key,
                    Body: content,
                    ContentType: "text/markdown",
                }),
            )

            // Save metadata to DynamoDB
            const parentFileId = body.parentFileId || null
            const item = {
                PK: `WIKI#${wikiId}`,
                SK: `FILE#${fileId}`,
                entityType: "file",
                fileId,
                wikiId,
                folderId: body.folderId || null,
                parentFileId,
                fileType: body.fileType || "page",
                name: body.name || "untitled.md",
                s3Key,
                size: Buffer.byteLength(content, "utf-8"),
                createdAt: now,
                updatedAt: now,
            }

            await ddb.send(
                new PutCommand({ TableName: TABLE_NAME, Item: item }),
            )

            // If this is a sub-page, append a subpage link to the parent file
            if (parentFileId) {
                try {
                    const parentMeta = await ddb.send(
                        new GetCommand({
                            TableName: TABLE_NAME,
                            Key: {
                                PK: `WIKI#${wikiId}`,
                                SK: `FILE#${parentFileId}`,
                            },
                        }),
                    )
                    if (parentMeta.Item?.s3Key) {
                        const parentS3 = await s3.send(
                            new GetObjectCommand({
                                Bucket: BUCKET_NAME,
                                Key: parentMeta.Item.s3Key,
                            }),
                        )
                        let parentContent = await streamToString(parentS3.Body)
                        const linkLine = `[\ud83d\udcc4 ${item.name}](subpage:${fileId})`
                        parentContent =
                            parentContent.trimEnd() + "\n\n" + linkLine
                        await s3.send(
                            new PutObjectCommand({
                                Bucket: BUCKET_NAME,
                                Key: parentMeta.Item.s3Key,
                                Body: parentContent,
                                ContentType: "text/markdown",
                            }),
                        )
                    }
                } catch (err) {
                    console.warn(
                        "Failed to append subpage link to parent:",
                        err,
                    )
                }
            }

            return response(201, {
                fileId,
                name: item.name,
                s3Key,
                parentFileId,
            })
        }

        // POST /wikis/{wikiId}/files/import — Import markdown file
        if (method === "POST" && path === "/wikis/{wikiId}/files/import") {
            const fileId = randomUUID()
            const now = new Date().toISOString()
            const s3Key = `wikis/${wikiId}/files/${fileId}.md`

            // body.content is the markdown content, body.name is the filename
            const content = body.content || ""
            const fileName = body.name || "imported.md"

            await s3.send(
                new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: s3Key,
                    Body: content,
                    ContentType: "text/markdown",
                }),
            )

            const item = {
                PK: `WIKI#${wikiId}`,
                SK: `FILE#${fileId}`,
                entityType: "file",
                fileId,
                wikiId,
                folderId: body.folderId || null,
                parentFileId: body.parentFileId || null,
                name: fileName,
                s3Key,
                size: Buffer.byteLength(content, "utf-8"),
                createdAt: now,
                updatedAt: now,
            }

            await ddb.send(
                new PutCommand({ TableName: TABLE_NAME, Item: item }),
            )
            return response(201, { fileId, name: fileName })
        }

        // GET /wikis/{wikiId}/files — List files
        if (method === "GET" && path === "/wikis/{wikiId}/files") {
            let filterExpr = "entityType = :et"
            let filterValues = {
                ":pk": `WIKI#${wikiId}`,
                ":sk": "FILE#",
                ":et": "file",
            }

            if (qs.folderId) {
                filterExpr += " AND folderId = :fid"
                filterValues[":fid"] = qs.folderId
            }

            const result = await ddb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                    FilterExpression: filterExpr,
                    ExpressionAttributeValues: filterValues,
                }),
            )

            const files = (result.Items || []).map((item) => ({
                fileId: item.fileId,
                name: item.name,
                folderId: item.folderId,
                parentFileId: item.parentFileId || null,
                fileType: item.fileType || "page",
                size: item.size,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            }))

            return response(200, { files })
        }

        // GET /wikis/{wikiId}/files/{fileId} — Get file (metadata + content)
        if (method === "GET" && path === "/wikis/{wikiId}/files/{fileId}") {
            const metaResult = await ddb.send(
                new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: `FILE#${fileId}` },
                }),
            )

            if (!metaResult.Item)
                return response(404, { error: "File not found" })

            // Fetch content from S3
            const s3Result = await s3.send(
                new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: metaResult.Item.s3Key,
                }),
            )

            const content = await streamToString(s3Result.Body)

            return response(200, {
                fileId: metaResult.Item.fileId,
                name: metaResult.Item.name,
                folderId: metaResult.Item.folderId,
                parentFileId: metaResult.Item.parentFileId || null,
                fileType: metaResult.Item.fileType || "page",
                content,
                size: metaResult.Item.size,
                createdAt: metaResult.Item.createdAt,
                updatedAt: metaResult.Item.updatedAt,
            })
        }

        // PUT /wikis/{wikiId}/files/{fileId} — Update file
        if (method === "PUT" && path === "/wikis/{wikiId}/files/{fileId}") {
            const metaResult = await ddb.send(
                new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: `FILE#${fileId}` },
                }),
            )

            if (!metaResult.Item)
                return response(404, { error: "File not found" })

            const now = new Date().toISOString()
            const updateExprParts = ["updatedAt = :now"]
            const exprValues = { ":now": now }
            const exprNames = {}

            // Update content in S3 if provided
            if (body.content !== undefined) {
                await s3.send(
                    new PutObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: metaResult.Item.s3Key,
                        Body: body.content,
                        ContentType: "text/markdown",
                    }),
                )
                updateExprParts.push("#size = :size")
                exprValues[":size"] = Buffer.byteLength(body.content, "utf-8")
                exprNames["#size"] = "size"
            }

            if (body.name) {
                updateExprParts.push("#name = :name")
                exprValues[":name"] = body.name
                exprNames["#name"] = "name"
            }

            if (body.folderId !== undefined) {
                updateExprParts.push("folderId = :fid")
                exprValues[":fid"] = body.folderId
            }

            if (body.parentFileId !== undefined) {
                updateExprParts.push("parentFileId = :pfid")
                exprValues[":pfid"] = body.parentFileId
            }

            await ddb.send(
                new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: `FILE#${fileId}` },
                    UpdateExpression: `SET ${updateExprParts.join(", ")}`,
                    ExpressionAttributeValues: exprValues,
                    ...(Object.keys(exprNames).length > 0
                        ? { ExpressionAttributeNames: exprNames }
                        : {}),
                }),
            )

            return response(200, { updated: true })
        }

        // --- VERSION HISTORY ---
        // POST /wikis/{wikiId}/files/{fileId}/versions — create a version checkpoint
        if (
            method === "POST" &&
            path === "/wikis/{wikiId}/files/{fileId}/versions"
        ) {
            const metaResult = await ddb.send(
                new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: `FILE#${fileId}` },
                }),
            )

            if (!metaResult.Item)
                return response(404, { error: "File not found" })

            const now = new Date().toISOString()
            const versionId = `${Date.now()}#${randomUUID()}`
            const item = {
                PK: `WIKI#${wikiId}`,
                SK: `FILE#${fileId}#VERSION#${versionId}`,
                entityType: "version",
                wikiId,
                fileId,
                versionId,
                content: body.content || "",
                label: body.label || "Checkpoint",
                createdAt: now,
                createdBy: user.userId,
            }

            await ddb.send(
                new PutCommand({ TableName: TABLE_NAME, Item: item }),
            )

            // Garbage collect older versions to keep storage bounded.
            // Only keep the newest N versions per file (newest first).
            if (MAX_VERSIONS_PER_FILE > 0) {
                const versionsResult = await ddb.send(
                    new QueryCommand({
                        TableName: TABLE_NAME,
                        KeyConditionExpression:
                            "PK = :pk AND begins_with(SK, :sk)",
                        ExpressionAttributeValues: {
                            ":pk": `WIKI#${wikiId}`,
                            ":sk": `FILE#${fileId}#VERSION#`,
                        },
                        ScanIndexForward: false, // newest first
                    }),
                )

                const versionsToDelete = (versionsResult.Items || []).slice(
                    MAX_VERSIONS_PER_FILE,
                )
                if (versionsToDelete.length > 0) {
                    await Promise.all(
                        versionsToDelete.map((v) =>
                            ddb.send(
                                new DeleteCommand({
                                    TableName: TABLE_NAME,
                                    Key: { PK: v.PK, SK: v.SK },
                                }),
                            ),
                        ),
                    )
                }
            }

            return response(201, { versionId, createdAt: now })
        }

        // GET /wikis/{wikiId}/files/{fileId}/versions — list versions
        if (
            method === "GET" &&
            path === "/wikis/{wikiId}/files/{fileId}/versions"
        ) {
            const result = await ddb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                    ExpressionAttributeValues: {
                        ":pk": `WIKI#${wikiId}`,
                        ":sk": `FILE#${fileId}#VERSION#`,
                    },
                    ScanIndexForward: false, // newest first
                }),
            )

            const versions = (result.Items || []).map((item) => ({
                versionId: item.versionId,
                label: item.label || "Checkpoint",
                createdAt: item.createdAt,
                createdBy: item.createdBy,
            }))

            return response(200, { versions })
        }

        // GET /wikis/{wikiId}/files/{fileId}/versions/{versionId} — get version details
        if (
            method === "GET" &&
            path === "/wikis/{wikiId}/files/{fileId}/versions/{versionId}"
        ) {
            const { versionId: rawVersionId } = event.pathParameters || {}
            const versionId = decodeURIComponent(rawVersionId)
            const sk = `FILE#${fileId}#VERSION#${versionId}`
            const result = await ddb.send(
                new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: sk },
                }),
            )

            if (!result.Item)
                return response(404, { error: "Version not found" })

            return response(200, {
                versionId: result.Item.versionId,
                label: result.Item.label || "Checkpoint",
                createdAt: result.Item.createdAt,
                createdBy: result.Item.createdBy,
                content: result.Item.content,
            })
        }

        // DELETE /wikis/{wikiId}/files/{fileId} — Delete file
        if (method === "DELETE" && path === "/wikis/{wikiId}/files/{fileId}") {
            const metaResult = await ddb.send(
                new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: `FILE#${fileId}` },
                }),
            )

            if (!metaResult.Item)
                return response(404, { error: "File not found" })

            // If this file is a sub-page, remove its link from the parent
            if (metaResult.Item.parentFileId) {
                try {
                    const parentMeta = await ddb.send(
                        new GetCommand({
                            TableName: TABLE_NAME,
                            Key: {
                                PK: `WIKI#${wikiId}`,
                                SK: `FILE#${metaResult.Item.parentFileId}`,
                            },
                        }),
                    )
                    if (parentMeta.Item?.s3Key) {
                        const parentS3 = await s3.send(
                            new GetObjectCommand({
                                Bucket: BUCKET_NAME,
                                Key: parentMeta.Item.s3Key,
                            }),
                        )
                        let parentContent = await streamToString(parentS3.Body)
                        // Remove the subpage link line
                        const linkPattern = new RegExp(
                            `\\n?\\n?\\[\ud83d\udcc4 [^\\]]*\\]\\(subpage:${fileId}\\)`,
                        )
                        parentContent = parentContent.replace(linkPattern, "")
                        await s3.send(
                            new PutObjectCommand({
                                Bucket: BUCKET_NAME,
                                Key: parentMeta.Item.s3Key,
                                Body: parentContent,
                                ContentType: "text/markdown",
                            }),
                        )
                    }
                } catch (err) {
                    console.warn(
                        "Failed to remove subpage link from parent:",
                        err,
                    )
                }
            }

            // Delete from S3
            await s3.send(
                new DeleteObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: metaResult.Item.s3Key,
                }),
            )

            // Delete metadata from DynamoDB
            await ddb.send(
                new DeleteCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: `FILE#${fileId}` },
                }),
            )

            // Re-parent any child files that used this file as parentFileId.
            // Query all files for this wiki and find orphans.
            const allFilesResult = await ddb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                    ExpressionAttributeValues: {
                        ":pk": `WIKI#${wikiId}`,
                        ":sk": "FILE#",
                    },
                }),
            )
            const childFiles = (allFilesResult.Items || []).filter(
                (item) => item.parentFileId === fileId,
            )
            // Move each child up: clear parentFileId, inherit the deleted file's folderId
            const inheritedFolderId = metaResult.Item.folderId || null
            await Promise.all(
                childFiles.map((child) =>
                    ddb.send(
                        new UpdateCommand({
                            TableName: TABLE_NAME,
                            Key: {
                                PK: `WIKI#${wikiId}`,
                                SK: `FILE#${child.fileId}`,
                            },
                            UpdateExpression:
                                "SET parentFileId = :null, folderId = :fid, updatedAt = :now",
                            ExpressionAttributeValues: {
                                ":null": null,
                                ":fid": inheritedFolderId,
                                ":now": new Date().toISOString(),
                            },
                        }),
                    ),
                ),
            )

            return response(200, { deleted: true })
        }

        return response(404, { error: "Not found" })
    } catch (err) {
        console.error("File handler error:", err)
        return response(500, { error: err.message || "Internal server error" })
    }
}
