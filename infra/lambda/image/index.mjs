import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { randomUUID } from "crypto"

const s3 = new S3Client({})
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

function getUserFromEvent(event) {
    const claims = event.requestContext?.authorizer?.claims
    if (!claims) throw new Error("Unauthorized")
    return { userId: claims.sub, email: claims.email }
}

export async function handler(event) {
    try {
        const user = getUserFromEvent(event)
        const method = event.httpMethod
        const path = event.resource
        const { wikiId, imageId } = event.pathParameters || {}

        // POST /wikis/{wikiId}/images/upload — Upload image
        if (method === "POST" && path === "/wikis/{wikiId}/images/upload") {
            const imageId = randomUUID()
            const s3Key = `wikis/${wikiId}/images/${imageId}.webp`

            // Decode base64 body
            let imageBuffer
            if (event.isBase64Encoded) {
                imageBuffer = Buffer.from(event.body, "base64")
            } else {
                // If JSON body with base64 data field
                const body = JSON.parse(event.body)
                imageBuffer = Buffer.from(body.data, "base64")
            }

            // Convert to WebP using sharp (will be added as a layer or bundled)
            // For now, store as-is and add sharp conversion when the layer is set up
            // In production, uncomment the sharp conversion:
            //
            // const sharp = (await import('sharp')).default;
            // const webpBuffer = await sharp(imageBuffer)
            //   .resize({ width: 2000, withoutEnlargement: true })
            //   .webp({ quality: 80 })
            //   .toBuffer();

            const webpBuffer = imageBuffer // Placeholder until sharp layer is added

            await s3.send(
                new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: s3Key,
                    Body: webpBuffer,
                    ContentType: "image/webp",
                }),
            )

            // Generate presigned URL for immediate use
            const presignedUrl = await getSignedUrl(
                s3,
                new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: s3Key,
                }),
                { expiresIn: 3600 },
            )

            return response(201, {
                imageId,
                s3Key,
                markdownLink: `![image](${presignedUrl})`,
                presignedUrl,
            })
        }

        // GET /wikis/{wikiId}/images/{imageId} — Get presigned URL
        if (method === "GET" && path === "/wikis/{wikiId}/images/{imageId}") {
            const s3Key = `wikis/${wikiId}/images/${imageId}.webp`

            const presignedUrl = await getSignedUrl(
                s3,
                new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: s3Key,
                }),
                { expiresIn: 3600 },
            )

            return response(200, { imageId, presignedUrl })
        }

        // DELETE /wikis/{wikiId}/images/{imageId} — Remove image from S3
        if (
            method === "DELETE" &&
            path === "/wikis/{wikiId}/images/{imageId}"
        ) {
            const s3Key = `wikis/${wikiId}/images/${imageId}.webp`
            await s3.send(
                new DeleteObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: s3Key,
                }),
            )
            return response(204, "")
        }

        // GET /wikis/{wikiId}/images/{imageId}/download — Download as PNG
        if (
            method === "GET" &&
            path === "/wikis/{wikiId}/images/{imageId}/download"
        ) {
            const s3Key = `wikis/${wikiId}/images/${imageId}.webp`

            const s3Result = await s3.send(
                new GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: s3Key,
                }),
            )

            const chunks = []
            for await (const chunk of s3Result.Body) {
                chunks.push(chunk)
            }
            const imageBuffer = Buffer.concat(chunks)

            // Convert WebP to PNG for download
            // TODO: Add sharp layer for production
            // const sharp = (await import('sharp')).default;
            // const pngBuffer = await sharp(imageBuffer).png().toBuffer();

            const pngBuffer = imageBuffer // Placeholder

            return {
                statusCode: 200,
                headers: {
                    "Content-Type": "image/png",
                    "Content-Disposition": `attachment; filename="${imageId}.png"`,
                    "Access-Control-Allow-Origin": "*",
                },
                body: pngBuffer.toString("base64"),
                isBase64Encoded: true,
            }
        }

        return response(404, { error: "Not found" })
    } catch (err) {
        console.error("Image handler error:", err)
        return response(500, { error: err.message || "Internal server error" })
    }
}
