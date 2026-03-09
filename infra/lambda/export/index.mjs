import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const s3 = new S3Client({})
const TABLE_NAME = process.env.TABLE_NAME
const BUCKET_NAME = process.env.BUCKET_NAME

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

async function streamToBuffer(stream) {
    const chunks = []
    for await (const chunk of stream) {
        chunks.push(chunk)
    }
    return Buffer.concat(chunks)
}

async function streamToString(stream) {
    return (await streamToBuffer(stream)).toString("utf-8")
}

export async function handler(event) {
    try {
        const method = event.httpMethod
        const path = event.resource
        const { wikiId, folderId, fileId } = event.pathParameters || {}
        const qs = event.queryStringParameters || {}
        const format = qs.format || "md"

        // GET /wikis/{wikiId}/files/{fileId}/export — Export single file
        if (
            method === "GET" &&
            path === "/wikis/{wikiId}/files/{fileId}/export"
        ) {
            const metaResult = await ddb.send(
                new GetCommand({
                    TableName: TABLE_NAME,
                    Key: { PK: `WIKI#${wikiId}`, SK: `FILE#${fileId}` },
                }),
            )

            if (!metaResult.Item)
                return response(404, { error: "File not found" })

            const s3Result = await s3.send(
                new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: metaResult.Item.s3Key,
                }),
            )
            const content = await streamToString(s3Result.Body)

            if (format === "md") {
                return {
                    statusCode: 200,
                    headers: {
                        "Content-Type": "text/markdown",
                        "Content-Disposition": `attachment; filename="${metaResult.Item.name}"`,
                        "Access-Control-Allow-Origin": "*",
                    },
                    body: content,
                }
            }

            if (format === "docx") {
                // DOCX generation
                // Uses simple DOCX XML structure (no external deps for MVP)
                const docxContent = generateSimpleDocx(
                    content,
                    metaResult.Item.name,
                )

                return {
                    statusCode: 200,
                    headers: {
                        "Content-Type":
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "Content-Disposition": `attachment; filename="${metaResult.Item.name.replace(".md", ".docx")}"`,
                        "Access-Control-Allow-Origin": "*",
                    },
                    body: docxContent.toString("base64"),
                    isBase64Encoded: true,
                }
            }

            return response(400, { error: `Unsupported format: ${format}` })
        }

        // GET /wikis/{wikiId}/folders/{folderId}/export — Export folder as zip
        if (
            method === "GET" &&
            path === "/wikis/{wikiId}/folders/{folderId}/export"
        ) {
            return await exportFolderAsZip(wikiId, folderId)
        }

        // GET /wikis/{wikiId}/export — Export entire wiki as zip
        if (method === "GET" && path === "/wikis/{wikiId}/export") {
            return await exportWikiAsZip(wikiId)
        }

        return response(404, { error: "Not found" })
    } catch (err) {
        console.error("Export handler error:", err)
        return response(500, { error: err.message || "Internal server error" })
    }
}

// Simple DOCX generator (produces basic .docx without external deps)
// For a full implementation, we'd use the 'docx' npm package
function generateSimpleDocx(markdownContent, title) {
    // This is a placeholder. In production, bundle the 'docx' npm package
    // and use it to create proper DOCX files with formatting.
    //
    // For now, return the markdown as plain text in a minimal DOCX wrapper.
    // The actual implementation would parse markdown and create formatted paragraphs.
    //
    // TODO: Install 'docx' package and implement proper conversion

    // Return a buffer with a simple text representation for now
    return Buffer.from(
        `Markdown export: ${title}\n\n${markdownContent}`,
        "utf-8",
    )
}

async function exportFolderAsZip(wikiId, folderId) {
    // Get folder info
    const folderResult = await ddb.send(
        new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `WIKI#${wikiId}`, SK: `FOLDER#${folderId}` },
        }),
    )

    if (!folderResult.Item) return response(404, { error: "Folder not found" })

    // Get all files in folder
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

    // Build a simple ZIP-like structure (for proper ZIP, bundle 'archiver' package)
    // TODO: Use archiver package for production
    const files = []
    for (const fileMeta of filesResult.Items || []) {
        const s3Result = await s3.send(
            new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: fileMeta.s3Key,
            }),
        )
        const content = await streamToString(s3Result.Body)
        files.push({ name: fileMeta.name, content })
    }

    // For now, return as JSON with file contents (placeholder for ZIP)
    return response(200, {
        folderName: folderResult.Item.name,
        files: files.map((f) => ({ name: f.name, content: f.content })),
        note: "ZIP export will be implemented with archiver package",
    })
}

async function exportWikiAsZip(wikiId) {
    // Get all folders and files
    const allItems = await ddb.send(
        new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: "PK = :pk",
            ExpressionAttributeValues: { ":pk": `WIKI#${wikiId}` },
        }),
    )

    const folders = (allItems.Items || []).filter(
        (i) => i.entityType === "folder",
    )
    const fileMetas = (allItems.Items || []).filter(
        (i) => i.entityType === "file",
    )

    const files = []
    for (const fileMeta of fileMetas) {
        const s3Result = await s3.send(
            new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: fileMeta.s3Key,
            }),
        )
        const content = await streamToString(s3Result.Body)

        // Determine path based on folder
        let filePath = fileMeta.name
        if (fileMeta.folderId) {
            const folder = folders.find((f) => f.folderId === fileMeta.folderId)
            if (folder) {
                filePath = `${folder.name}/${fileMeta.name}`
            }
        }

        files.push({ path: filePath, content })
    }

    return response(200, {
        files: files.map((f) => ({ path: f.path, content: f.content })),
        note: "ZIP export will be implemented with archiver package",
    })
}
