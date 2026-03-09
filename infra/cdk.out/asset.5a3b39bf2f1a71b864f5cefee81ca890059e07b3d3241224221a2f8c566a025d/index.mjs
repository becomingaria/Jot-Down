import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const TABLE_NAME = process.env.TABLE_NAME;
const BUCKET_NAME = process.env.BUCKET_NAME;

function response(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      ...extraHeaders,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function getUserFromEvent(event) {
  const claims = event.requestContext?.authorizer?.claims;
  if (!claims) throw new Error('Unauthorized');
  return {
    userId: claims.sub,
    email: claims.email,
    groups: claims['cognito:groups']?.split(',') || [],
  };
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export async function handler(event) {
  try {
    const user = getUserFromEvent(event);
    const method = event.httpMethod;
    const path = event.resource;
    const { wikiId, folderId, fileId } = event.pathParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};
    const qs = event.queryStringParameters || {};

    // --- FOLDER CRUD ---

    // POST /wikis/{wikiId}/folders — Create folder
    if (method === 'POST' && path === '/wikis/{wikiId}/folders') {
      const folderId = randomUUID();
      const now = new Date().toISOString();
      const parentFolderId = body.parentFolderId || null;

      // Build path
      let folderPath = `/${body.name || 'Untitled Folder'}`;
      if (parentFolderId) {
        const parentResult = await ddb.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `WIKI#${wikiId}`, SK: `FOLDER#${parentFolderId}` },
        }));
        if (parentResult.Item) {
          folderPath = `${parentResult.Item.path}/${body.name || 'Untitled Folder'}`;
        }
      }

      const item = {
        PK: `WIKI#${wikiId}`,
        SK: `FOLDER#${folderId}`,
        entityType: 'folder',
        folderId,
        wikiId,
        parentFolderId,
        name: body.name || 'Untitled Folder',
        path: folderPath,
        createdAt: now,
        updatedAt: now,
      };

      await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
      return response(201, { folderId, name: item.name, path: folderPath });
    }

    // GET /wikis/{wikiId}/folders — List folders
    if (method === 'GET' && path === '/wikis/{wikiId}/folders') {
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `WIKI#${wikiId}`,
          ':sk': 'FOLDER#',
        },
      }));

      const folders = (result.Items || []).map(item => ({
        folderId: item.folderId,
        name: item.name,
        parentFolderId: item.parentFolderId,
        path: item.path,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));

      return response(200, { folders });
    }

    // GET /wikis/{wikiId}/folders/{folderId} — Get folder
    if (method === 'GET' && path === '/wikis/{wikiId}/folders/{folderId}') {
      const result = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `WIKI#${wikiId}`, SK: `FOLDER#${folderId}` },
      }));

      if (!result.Item) return response(404, { error: 'Folder not found' });

      return response(200, {
        folderId: result.Item.folderId,
        name: result.Item.name,
        parentFolderId: result.Item.parentFolderId,
        path: result.Item.path,
      });
    }

    // PUT /wikis/{wikiId}/folders/{folderId} — Update folder
    if (method === 'PUT' && path === '/wikis/{wikiId}/folders/{folderId}') {
      const now = new Date().toISOString();
      const updateExprParts = ['updatedAt = :now'];
      const exprValues = { ':now': now };
      const exprNames = {};

      if (body.name) {
        updateExprParts.push('#name = :name');
        exprValues[':name'] = body.name;
        exprNames['#name'] = 'name';
      }
      if (body.parentFolderId !== undefined) {
        updateExprParts.push('parentFolderId = :pfid');
        exprValues[':pfid'] = body.parentFolderId;
      }

      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `WIKI#${wikiId}`, SK: `FOLDER#${folderId}` },
        UpdateExpression: `SET ${updateExprParts.join(', ')}`,
        ExpressionAttributeValues: exprValues,
        ...(Object.keys(exprNames).length > 0 ? { ExpressionAttributeNames: exprNames } : {}),
      }));

      return response(200, { updated: true });
    }

    // DELETE /wikis/{wikiId}/folders/{folderId} — Delete folder (and files within)
    if (method === 'DELETE' && path === '/wikis/{wikiId}/folders/{folderId}') {
      // Find all files in this folder
      const filesResult = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'folderId = :fid',
        ExpressionAttributeValues: {
          ':pk': `WIKI#${wikiId}`,
          ':sk': 'FILE#',
          ':fid': folderId,
        },
      }));

      // Delete files from S3 and DynamoDB
      for (const file of filesResult.Items || []) {
        if (file.s3Key) {
          await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: file.s3Key }));
        }
        await ddb.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: file.PK, SK: file.SK },
        }));
      }

      // Delete the folder itself
      await ddb.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `WIKI#${wikiId}`, SK: `FOLDER#${folderId}` },
      }));

      return response(200, { deleted: true });
    }

    // --- FILE CRUD ---

    // POST /wikis/{wikiId}/files — Create file
    if (method === 'POST' && path === '/wikis/{wikiId}/files') {
      const fileId = randomUUID();
      const now = new Date().toISOString();
      const s3Key = `wikis/${wikiId}/files/${fileId}.md`;
      const content = body.content || '';

      // Upload content to S3
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: content,
        ContentType: 'text/markdown',
      }));

      // Save metadata to DynamoDB
      const item = {
        PK: `WIKI#${wikiId}`,
        SK: `FILE#${fileId}`,
        entityType: 'file',
        fileId,
        wikiId,
        folderId: body.folderId || null,
        name: body.name || 'untitled.md',
        s3Key,
        size: Buffer.byteLength(content, 'utf-8'),
        createdAt: now,
        updatedAt: now,
      };

      await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
      return response(201, { fileId, name: item.name, s3Key });
    }

    // POST /wikis/{wikiId}/files/import — Import markdown file
    if (method === 'POST' && path === '/wikis/{wikiId}/files/import') {
      const fileId = randomUUID();
      const now = new Date().toISOString();
      const s3Key = `wikis/${wikiId}/files/${fileId}.md`;

      // body.content is the markdown content, body.name is the filename
      const content = body.content || '';
      const fileName = body.name || 'imported.md';

      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: content,
        ContentType: 'text/markdown',
      }));

      const item = {
        PK: `WIKI#${wikiId}`,
        SK: `FILE#${fileId}`,
        entityType: 'file',
        fileId,
        wikiId,
        folderId: body.folderId || null,
        name: fileName,
        s3Key,
        size: Buffer.byteLength(content, 'utf-8'),
        createdAt: now,
        updatedAt: now,
      };

      await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
      return response(201, { fileId, name: fileName });
    }

    // GET /wikis/{wikiId}/files — List files
    if (method === 'GET' && path === '/wikis/{wikiId}/files') {
      let filterExpr = undefined;
      let filterValues = {
        ':pk': `WIKI#${wikiId}`,
        ':sk': 'FILE#',
      };

      if (qs.folderId) {
        filterExpr = 'folderId = :fid';
        filterValues[':fid'] = qs.folderId;
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ...(filterExpr ? { FilterExpression: filterExpr } : {}),
        ExpressionAttributeValues: filterValues,
      }));

      const files = (result.Items || []).map(item => ({
        fileId: item.fileId,
        name: item.name,
        folderId: item.folderId,
        size: item.size,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));

      return response(200, { files });
    }

    // GET /wikis/{wikiId}/files/{fileId} — Get file (metadata + content)
    if (method === 'GET' && path === '/wikis/{wikiId}/files/{fileId}') {
      const metaResult = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `WIKI#${wikiId}`, SK: `FILE#${fileId}` },
      }));

      if (!metaResult.Item) return response(404, { error: 'File not found' });

      // Fetch content from S3
      const s3Result = await s3.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: metaResult.Item.s3Key,
      }));

      const content = await streamToString(s3Result.Body);

      return response(200, {
        fileId: metaResult.Item.fileId,
        name: metaResult.Item.name,
        folderId: metaResult.Item.folderId,
        content,
        size: metaResult.Item.size,
        createdAt: metaResult.Item.createdAt,
        updatedAt: metaResult.Item.updatedAt,
      });
    }

    // PUT /wikis/{wikiId}/files/{fileId} — Update file
    if (method === 'PUT' && path === '/wikis/{wikiId}/files/{fileId}') {
      const metaResult = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `WIKI#${wikiId}`, SK: `FILE#${fileId}` },
      }));

      if (!metaResult.Item) return response(404, { error: 'File not found' });

      const now = new Date().toISOString();
      const updateExprParts = ['updatedAt = :now'];
      const exprValues = { ':now': now };
      const exprNames = {};

      // Update content in S3 if provided
      if (body.content !== undefined) {
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: metaResult.Item.s3Key,
          Body: body.content,
          ContentType: 'text/markdown',
        }));
        updateExprParts.push('#size = :size');
        exprValues[':size'] = Buffer.byteLength(body.content, 'utf-8');
        exprNames['#size'] = 'size';
      }

      if (body.name) {
        updateExprParts.push('#name = :name');
        exprValues[':name'] = body.name;
        exprNames['#name'] = 'name';
      }

      if (body.folderId !== undefined) {
        updateExprParts.push('folderId = :fid');
        exprValues[':fid'] = body.folderId;
      }

      await ddb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `WIKI#${wikiId}`, SK: `FILE#${fileId}` },
        UpdateExpression: `SET ${updateExprParts.join(', ')}`,
        ExpressionAttributeValues: exprValues,
        ...(Object.keys(exprNames).length > 0 ? { ExpressionAttributeNames: exprNames } : {}),
      }));

      return response(200, { updated: true });
    }

    // DELETE /wikis/{wikiId}/files/{fileId} — Delete file
    if (method === 'DELETE' && path === '/wikis/{wikiId}/files/{fileId}') {
      const metaResult = await ddb.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `WIKI#${wikiId}`, SK: `FILE#${fileId}` },
      }));

      if (!metaResult.Item) return response(404, { error: 'File not found' });

      // Delete from S3
      await s3.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: metaResult.Item.s3Key,
      }));

      // Delete metadata from DynamoDB
      await ddb.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `WIKI#${wikiId}`, SK: `FILE#${fileId}` },
      }));

      return response(200, { deleted: true });
    }

    return response(404, { error: 'Not found' });
  } catch (err) {
    console.error('File handler error:', err);
    return response(500, { error: err.message || 'Internal server error' });
  }
}
