# Jot-Down Expansion — Project Plan

> Master planning document for expanding Jot-Down from a single-file localStorage note app
> into a multi-user markdown wiki with AWS backend and Netlify-hosted frontend.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Entity Model & Data Design](#2-entity-model--data-design)
3. [AWS CDK Infrastructure](#3-aws-cdk-infrastructure)
4. [Implementation Phases](#4-implementation-phases)
5. [Cost Optimization Strategy](#5-cost-optimization-strategy)
6. [File & Folder Structure](#6-file--folder-structure)
7. [API Design](#7-api-design)
8. [Frontend Architecture Changes](#8-frontend-architecture-changes)
9. [CSV-in-Markdown Specification](#9-csv-in-markdown-specification)
10. [Image Pipeline](#10-image-pipeline)
11. [Export Pipeline](#11-export-pipeline)
12. [Auth & Sharing Model](#12-auth--sharing-model)
13. [Deployment Strategy](#13-deployment-strategy)
14. [Task Execution Order](#14-task-execution-order)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Netlify)                       │
│  React + Vite SPA                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Auth UI  │ │ Sidebar  │ │ Editor   │ │ CSV Table Render  │  │
│  │ (Cognito)│ │ (Tree)   │ │(Canister)│ │ (fenced blocks)   │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (API Gateway)
┌────────────────────────────┴────────────────────────────────────┐
│                     BACKEND (AWS)                               │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ API Gateway   │  │ Lambda Fns   │  │ Cognito User Pool    │ │
│  │ (REST)        │→ │ (Node 20)    │  │ (Auth + Admin-only   │ │
│  │ + Authorizer  │  │              │  │  user creation)      │ │
│  └──────────────┘  └──────┬───────┘  └───────────────────────┘ │
│                           │                                     │
│           ┌───────────────┼───────────────┐                     │
│           ▼               ▼               ▼                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │ DynamoDB      │ │ S3 Bucket    │ │ S3 Bucket    │           │
│  │ (metadata)    │ │ (markdown    │ │ (images -    │           │
│  │ - wikis       │ │  files)      │ │  webp)       │           │
│  │ - folders     │ │              │ │              │           │
│  │ - files meta  │ │              │ │              │           │
│  │ - shares      │ │              │ │              │           │
│  └──────────────┘ └──────────────┘ └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

- **Single S3 bucket** for both markdown files and images (separated by prefix) — reduces resource count and cost.
- **Single DynamoDB table** with composite keys (single-table design) — minimizes provisioned tables, leverages GSIs for query patterns.
- **Lambda functions** grouped by domain (wiki, file, image, export) — keeps cold starts low.
- **API Gateway with Cognito Authorizer** — zero-cost auth validation at the gateway level.
- **Frontend on Netlify** with environment variables pointing to API Gateway URL and Cognito pool.

---

## 2. Entity Model & Data Design

### Entities

#### Wiki

```
{
  PK: "WIKI#<wikiId>",
  SK: "META",
  entityType: "wiki",
  wikiId: "<uuid>",
  name: "My Wiki",
  ownerId: "<cognitoSub>",
  ownerEmail: "becomingaria@gmail.com",
  createdAt: "2026-03-08T00:00:00Z",
  updatedAt: "2026-03-08T00:00:00Z"
}
```

#### Folder

```
{
  PK: "WIKI#<wikiId>",
  SK: "FOLDER#<folderId>",
  entityType: "folder",
  folderId: "<uuid>",
  wikiId: "<wikiId>",
  parentFolderId: "<folderId|null>",  // null = root level
  name: "My Folder",
  path: "/My Folder",                 // Full path for display
  createdAt: "...",
  updatedAt: "..."
}
```

#### File (metadata — content lives in S3)

```
{
  PK: "WIKI#<wikiId>",
  SK: "FILE#<fileId>",
  entityType: "file",
  fileId: "<uuid>",
  wikiId: "<wikiId>",
  folderId: "<folderId|null>",       // null = wiki root
  name: "my-notes.md",
  s3Key: "wikis/<wikiId>/files/<fileId>.md",
  size: 2048,                         // bytes
  createdAt: "...",
  updatedAt: "..."
}
```

#### Share (wiki-level sharing)

```
{
  PK: "WIKI#<wikiId>",
  SK: "SHARE#<userId>",
  entityType: "share",
  wikiId: "<wikiId>",
  userId: "<cognitoSub>",
  userEmail: "kat.hallo@outlook.com",
  accessLevel: "edit",                // "view" | "edit"
  grantedBy: "<cognitoSub>",
  grantedAt: "..."
}
```

#### GSI: UserWikis (find all wikis a user owns or has access to)

```
GSI1PK: "USER#<userId>"
GSI1SK: "WIKI#<wikiId>"
```

- Populated on Wiki items (for owned) and Share items (for shared).

### DynamoDB Access Patterns

| Access Pattern       | Key Condition                                       |
| -------------------- | --------------------------------------------------- |
| Get wiki metadata    | PK = WIKI#id, SK = META                             |
| List folders in wiki | PK = WIKI#id, SK begins_with FOLDER#                |
| List files in wiki   | PK = WIKI#id, SK begins_with FILE#                  |
| List files in folder | PK = WIKI#id, SK begins_with FILE#, filter folderId |
| List shares for wiki | PK = WIKI#id, SK begins_with SHARE#                 |
| List wikis for user  | GSI1PK = USER#id                                    |
| Get specific share   | PK = WIKI#id, SK = SHARE#userId                     |

### S3 Key Structure

```
jot-down-content-{account-id}/
├── wikis/
│   └── <wikiId>/
│       ├── files/
│       │   ├── <fileId>.md
│       │   └── <fileId>.md
│       └── images/
│           ├── <imageId>.webp      (stored format)
│           └── <imageId>.webp
```

---

## 3. AWS CDK Infrastructure

### Stack: `JotDownStack`

Located in: `infra/` directory (separate from frontend)

**Resources:**

1. **S3 Bucket** — `jot-down-content`
    - Private, no public access
    - Lifecycle: move to IA after 90 days (cost saving)
    - CORS configured for frontend domain
    - Versioning OFF (saves cost; version history is Phase 2)
2. **DynamoDB Table** — `jot-down-table`
    - Single table design
    - PAY_PER_REQUEST billing (cost saving for low traffic)
    - PK (String), SK (String)
    - GSI1: GSI1PK (String), GSI1SK (String)
3. **Cognito User Pool** — `jot-down-users`
    - Email as username
    - Admin-only user creation (no self-signup)
    - Password policy: 8+ chars, mixed case, numbers, symbols
    - App client for frontend (no secret — SPA)
4. **Cognito Users** (seeded):
    - `becomingaria@gmail.com` — admin group
    - `kat.hallo@outlook.com` — regular user
5. **API Gateway** — `jot-down-api`
    - REST API with Cognito authorizer
    - CORS enabled
    - Throttling: 100 req/sec (prevent abuse)
6. **Lambda Functions** (Node.js 20, ARM64 for cost saving):
    - `wiki-handler` — CRUD for wikis + sharing
    - `file-handler` — CRUD for files/folders + S3 read/write
    - `image-handler` — Upload (convert to WebP), download (convert to PNG), presigned URLs
    - `export-handler` — Export .md, .docx, .zip

### CDK Directory Structure

```
infra/
├── bin/
│   └── infra.ts
├── lib/
│   ├── jot-down-stack.ts
│   └── constructs/
│       ├── storage.ts        (S3 + DynamoDB)
│       ├── auth.ts           (Cognito)
│       ├── api.ts            (API Gateway + Lambdas)
│       └── seed-users.ts     (Custom resource to create Cognito users)
├── lambda/
│   ├── wiki/
│   │   └── index.mjs
│   ├── file/
│   │   └── index.mjs
│   ├── image/
│   │   ├── index.mjs
│   │   └── package.json      (sharp for WebP conversion)
│   └── export/
│       ├── index.mjs
│       └── package.json      (docx, archiver)
├── cdk.json
├── tsconfig.json
└── package.json
```

---

## 4. Implementation Phases

### Phase 0: Infrastructure (execute first)

1. Initialize CDK project in `infra/`
2. Create S3 bucket, DynamoDB table, Cognito pool
3. Seed Cognito users
4. Create Lambda functions (stubs)
5. Create API Gateway with authorizer
6. Deploy and verify

### Phase 1: Core Backend

1. Wiki CRUD Lambda (create, list, get, update, delete)
2. Folder CRUD Lambda (create, list, get, update, delete)
3. File CRUD Lambda (create, list, get, update, delete — content in S3)
4. Share management Lambda (grant, revoke, list shares)
5. Auth middleware (verify Cognito token, extract user, check permissions)

### Phase 2: Frontend Restructure

1. Add routing (react-router-dom)
2. Login/auth flow with Cognito (aws-amplify or amazon-cognito-identity-js)
3. Sidebar with Wiki → Folder → File tree navigation
4. Breadcrumb navigation
5. Refactor App.jsx into component tree:
    - `AuthProvider` → `AppShell` → `Sidebar` + `EditorPane`
    - `Sidebar` → `WikiList` → `FolderTree` → `FileList`
    - `EditorPane` → existing canister editor

### Phase 3: CSV-in-Markdown

1. Detect ` ```csv ` fenced blocks in markdown content
2. Parse CSV content (use papaparse — lightweight)
3. Render as `<table>` in display mode
4. Allow editing raw CSV in edit mode
5. Support creating new CSV blocks via toolbar button

### Phase 4: Image Upload

1. Frontend: file picker for images
2. Lambda: accept upload → sharp convert to WebP → store in S3
3. Return markdown image link `![alt](presigned-url)`
4. Serve images via presigned URLs (short TTL for security)
5. Download endpoint: convert WebP → PNG on the fly

### Phase 5: Export

1. Export single file as .md (already exists locally — wire to S3)
2. Export single file as .docx (use `docx` npm package in Lambda)
3. Export folder as .zip (use `archiver` in Lambda, stream from S3)
4. Frontend: export buttons in toolbar/context menu

### Phase 6: Netlify Deployment

1. Add `netlify.toml` with build settings
2. Configure environment variables (API URL, Cognito pool ID, etc.)
3. Add `_redirects` for SPA routing
4. Test deploy

---

## 5. Cost Optimization Strategy

| Resource                 | Optimization                                                         | Estimated Monthly Cost |
| ------------------------ | -------------------------------------------------------------------- | ---------------------- |
| **DynamoDB**             | PAY_PER_REQUEST (no provisioned capacity)                            | ~$0-2 for low usage    |
| **S3**                   | Single bucket, IA lifecycle at 90 days, no versioning                | ~$0.50-2               |
| **Lambda**               | ARM64 (Graviton2, 20% cheaper), 128-256MB memory, bundled handlers   | ~$0-1                  |
| **API Gateway**          | REST API (cheaper than HTTP API for Cognito authorizer integration)  | ~$0-1                  |
| **Cognito**              | First 50K MAUs free                                                  | $0                     |
| **Netlify**              | Free tier (100GB bandwidth, 300 build minutes)                       | $0                     |
| **Sharp (Lambda Layer)** | Use Lambda layer to share across image functions, reduce bundle size | Reduces cold start     |
| **Total estimated**      |                                                                      | **~$1-6/month**        |

### Additional Cost Controls

- No CloudFront (overkill for 2 users — direct S3 presigned URLs)
- No Elasticsearch/OpenSearch (DynamoDB queries only)
- No NAT Gateway (Lambdas don't need VPC)
- No RDS (DynamoDB pay-per-request is cheaper for bursty workloads)
- Lambda concurrency limits to prevent runaway costs
- S3 bucket lifecycle to move old files to Infrequent Access
- API Gateway throttling to cap request rates

---

## 6. File & Folder Structure (Updated Project)

```
jot-down/
├── docs/
│   ├── 01-notion-capabilities-readout.md
│   └── 02-project-plan.md               (this file)
├── infra/                                 (AWS CDK)
│   ├── bin/
│   ├── lib/
│   ├── lambda/
│   ├── cdk.json
│   ├── tsconfig.json
│   └── package.json
├── public/
├── src/                                   (React frontend)
│   ├── components/
│   │   ├── auth/
│   │   │   ├── LoginPage.jsx
│   │   │   └── AuthProvider.jsx
│   │   ├── layout/
│   │   │   ├── AppShell.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   └── Breadcrumbs.jsx
│   │   ├── editor/
│   │   │   ├── Canister.jsx              (extracted from App.jsx)
│   │   │   ├── MultiLineEditor.jsx       (extracted from App.jsx)
│   │   │   ├── CsvTable.jsx              (CSV renderer)
│   │   │   └── ImageUploader.jsx
│   │   ├── wiki/
│   │   │   ├── WikiList.jsx
│   │   │   ├── WikiSettings.jsx
│   │   │   └── ShareDialog.jsx
│   │   ├── folder/
│   │   │   ├── FolderTree.jsx
│   │   │   └── FolderActions.jsx
│   │   └── file/
│   │       ├── FileList.jsx
│   │       ├── FileActions.jsx
│   │       └── ExportMenu.jsx
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useApi.js
│   │   ├── useWiki.js
│   │   └── useFile.js
│   ├── services/
│   │   ├── api.js                        (API client)
│   │   ├── auth.js                       (Cognito client)
│   │   └── storage.js                    (S3 presigned URL helpers)
│   ├── utils/
│   │   ├── csv.js                        (CSV parsing/rendering)
│   │   ├── markdown.js                   (extracted processLineMarkdown)
│   │   └── export.js                     (client-side export helpers)
│   ├── App.jsx                           (router + auth gate)
│   ├── main.jsx
│   └── index.css
├── index.html
├── vite.config.js
├── package.json
├── netlify.toml
└── .env.example
```

---

## 7. API Design

Base URL: `https://<api-id>.execute-api.<region>.amazonaws.com/prod`

All endpoints require `Authorization: Bearer <cognito-id-token>` header.

### Wikis

| Method | Path              | Description                        |
| ------ | ----------------- | ---------------------------------- |
| POST   | `/wikis`          | Create wiki                        |
| GET    | `/wikis`          | List user's wikis (owned + shared) |
| GET    | `/wikis/{wikiId}` | Get wiki details                   |
| PUT    | `/wikis/{wikiId}` | Update wiki (name, etc.)           |
| DELETE | `/wikis/{wikiId}` | Delete wiki (owner only)           |

### Sharing

| Method | Path                              | Description               |
| ------ | --------------------------------- | ------------------------- |
| POST   | `/wikis/{wikiId}/shares`          | Share wiki with user      |
| GET    | `/wikis/{wikiId}/shares`          | List shares               |
| PUT    | `/wikis/{wikiId}/shares/{userId}` | Update share access level |
| DELETE | `/wikis/{wikiId}/shares/{userId}` | Revoke share              |

### Folders

| Method | Path                                 | Description                    |
| ------ | ------------------------------------ | ------------------------------ |
| POST   | `/wikis/{wikiId}/folders`            | Create folder                  |
| GET    | `/wikis/{wikiId}/folders`            | List folders (flat or tree)    |
| PUT    | `/wikis/{wikiId}/folders/{folderId}` | Update folder (rename, move)   |
| DELETE | `/wikis/{wikiId}/folders/{folderId}` | Delete folder (cascades files) |

### Files

| Method | Path                             | Description                              |
| ------ | -------------------------------- | ---------------------------------------- |
| POST   | `/wikis/{wikiId}/files`          | Create file (metadata + initial content) |
| GET    | `/wikis/{wikiId}/files`          | List files (optionally by folderId)      |
| GET    | `/wikis/{wikiId}/files/{fileId}` | Get file metadata + content              |
| PUT    | `/wikis/{wikiId}/files/{fileId}` | Update file (metadata and/or content)    |
| DELETE | `/wikis/{wikiId}/files/{fileId}` | Delete file                              |

### Images

| Method | Path                                        | Description                                        |
| ------ | ------------------------------------------- | -------------------------------------------------- |
| POST   | `/wikis/{wikiId}/images/upload`             | Upload image → returns WebP S3 key + markdown link |
| GET    | `/wikis/{wikiId}/images/{imageId}`          | Get presigned URL for image                        |
| GET    | `/wikis/{wikiId}/images/{imageId}/download` | Download as PNG                                    |

### Export

| Method | Path                                                   | Description                |
| ------ | ------------------------------------------------------ | -------------------------- |
| GET    | `/wikis/{wikiId}/files/{fileId}/export?format=md`      | Export file as .md         |
| GET    | `/wikis/{wikiId}/files/{fileId}/export?format=docx`    | Export file as .docx       |
| GET    | `/wikis/{wikiId}/folders/{folderId}/export?format=zip` | Export folder as .zip      |
| GET    | `/wikis/{wikiId}/export?format=zip`                    | Export entire wiki as .zip |

### Import

| Method | Path                           | Description                      |
| ------ | ------------------------------ | -------------------------------- |
| POST   | `/wikis/{wikiId}/files/import` | Upload .md file into wiki/folder |

---

## 8. Frontend Architecture Changes

### New Dependencies

```json
{
    "react-router-dom": "^6.x",
    "amazon-cognito-identity-js": "^6.x",
    "papaparse": "^5.x"
}
```

**Why these libraries:**

- `react-router-dom` — SPA routing for wiki/folder/file navigation
- `amazon-cognito-identity-js` — Lightweight Cognito auth (much smaller than full Amplify, which saves bundle size and cost)
- `papaparse` — CSV parsing (4KB gzipped, well-maintained, handles edge cases)

### Routing Structure

```
/login                              → LoginPage
/                                   → Redirect to /wikis
/wikis                              → WikiList
/wikis/:wikiId                      → Wiki view (FolderTree + FileList)
/wikis/:wikiId/folders/:folderId    → Folder view (files in folder)
/wikis/:wikiId/files/:fileId        → File editor (canister editor)
```

### Auth Flow

1. User visits app → `AuthProvider` checks for Cognito session
2. No session → redirect to `/login`
3. User logs in → Cognito returns ID token + access token
4. Tokens stored in memory (not localStorage — security)
5. API calls include `Authorization: Bearer <idToken>`
6. Token refresh handled automatically by Cognito SDK

---

## 9. CSV-in-Markdown Specification

### Syntax

Use fenced code blocks with `csv` language identifier:

````markdown
```csv
Name,Email,Role
Alice,alice@example.com,Admin
Bob,bob@example.com,Editor
```
````

### Rendering Rules

- In **display mode**: Parse CSV and render as an HTML `<table>` with headers from the first row.
- In **edit mode**: Show raw CSV text in the canister input (multi-line editor for CSV blocks).
- Styling: Match existing canister table styles (`.canister table`, `.canister th`, `.canister td`).
- Empty cells render as empty `<td>`.
- Commas inside quoted strings `"hello, world"` are handled by papaparse.

### Implementation

1. In `processLineMarkdown()` or a new block-level processor, detect ` ```csv ` blocks.
2. Extract CSV content between fences.
3. Parse with `Papa.parse(csvString, { header: true })`.
4. Generate `<table>` HTML.
5. Replace the fenced block with the table HTML in display mode.

Since the canister model is line-by-line, CSV blocks may span multiple canisters. Options:

- **Option A**: Treat multi-line CSV as a single "merged canister" in display mode. When editing, show in multi-line editor.
- **Option B**: Detect ` ```csv ` start/end markers across canisters and render the group as a table.

**Recommended: Option A** — Simpler, aligns with multi-line editor pattern already built.

---

## 10. Image Pipeline

### Upload Flow

1. User clicks "Upload Image" button or drags image into editor.
2. Frontend reads file, sends as multipart/form-data to `/wikis/{wikiId}/images/upload`.
3. Lambda receives image buffer.
4. Lambda uses `sharp` to convert to WebP (quality 80, resize if >2000px wide).
5. Lambda stores WebP in S3 at `wikis/<wikiId>/images/<imageId>.webp`.
6. Lambda creates metadata in DynamoDB (optional — could skip for cost).
7. Lambda generates presigned GET URL (1 hour TTL).
8. Lambda returns: `{ imageId, markdownLink: "![image](presigned-url)", s3Key }`.
9. Frontend inserts markdown link into current canister.

### Display Flow

- Presigned URLs have TTL. On page load, frontend fetches fresh presigned URLs for images.
- Alternative: Use API Gateway as a proxy to serve images (simpler but slightly more latency).

### Download Flow

1. User clicks download on an image.
2. Frontend calls `/wikis/{wikiId}/images/{imageId}/download`.
3. Lambda reads WebP from S3, converts to PNG with `sharp`, returns as binary response.
4. Frontend triggers file download.

---

## 11. Export Pipeline

### Markdown Export

- Trivial: read file content from S3, return as `text/markdown` with `Content-Disposition: attachment`.

### DOCX Export

- Lambda uses `docx` npm package.
- Parse markdown content → convert to DOCX paragraphs/runs.
- Images: fetch from S3, embed in DOCX.
- Return as `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.

### ZIP Export (Folder)

- Lambda uses `archiver` npm package.
- List all files in folder from DynamoDB.
- Stream each file from S3 into the archive.
- Maintain folder structure in zip.
- Return as `application/zip` with `Content-Disposition: attachment`.

---

## 12. Auth & Sharing Model

### Cognito Setup

- **User Pool**: Email as sign-in, admin-only account creation
- **Admin Group**: `admins` — members can create users, manage all wikis
- **App Client**: No secret (public SPA client), ALLOW_USER_PASSWORD_AUTH + ALLOW_REFRESH_TOKEN_AUTH

### Initial Users

| Email                  | Group  | Temp Password                            |
| ---------------------- | ------ | ---------------------------------------- |
| becomingaria@gmail.com | admins | (set in CDK, must change on first login) |
| kat.hallo@outlook.com  | (none) | (set in CDK, must change on first login) |

### Permission Logic

```
canRead(user, wiki):
  - user is wiki.ownerId → YES
  - share exists for user on wiki with accessLevel "view" or "edit" → YES
  - user is in "admins" group → YES
  - else → NO

canEdit(user, wiki):
  - user is wiki.ownerId → YES
  - share exists for user on wiki with accessLevel "edit" → YES
  - user is in "admins" group → YES
  - else → NO

canDelete(user, wiki):
  - user is wiki.ownerId → YES
  - user is in "admins" group → YES
  - else → NO

canCreateUsers(user):
  - user is in "admins" group → YES
  - else → NO
```

---

## 13. Deployment Strategy

### AWS (CDK)

```bash
cd infra
npm install
npx cdk bootstrap --profile personal
npx cdk deploy --profile personal
```

CDK outputs:

- API Gateway URL
- Cognito User Pool ID
- Cognito App Client ID
- S3 Bucket name

### Netlify

1. `netlify.toml` in project root:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

2. Environment variables (set in Netlify dashboard after CDK deploy):

```
VITE_API_URL=https://<api-id>.execute-api.<region>.amazonaws.com/prod
VITE_COGNITO_USER_POOL_ID=<pool-id>
VITE_COGNITO_CLIENT_ID=<client-id>
VITE_COGNITO_REGION=<region>
```

3. Connect to Git repo → auto-deploy on push.

### `.env.example` for local dev:

```
VITE_API_URL=http://localhost:3001
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXX
VITE_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_COGNITO_REGION=us-east-1
```

---

## 14. Task Execution Order

This is the recommended order of implementation with dependencies shown:

```
Phase 0 — Infrastructure                    [No dependencies]
  ├── 0.1 Init CDK project
  ├── 0.2 S3 bucket
  ├── 0.3 DynamoDB table
  ├── 0.4 Cognito user pool + users
  ├── 0.5 Lambda stubs + API Gateway
  └── 0.6 Deploy + smoke test

Phase 1 — Backend API                       [Depends on Phase 0]
  ├── 1.1 Wiki CRUD Lambda
  ├── 1.2 Folder CRUD Lambda
  ├── 1.3 File CRUD Lambda
  ├── 1.4 Share management Lambda
  └── 1.5 Auth/permission middleware

Phase 2 — Frontend Restructure              [Depends on Phase 0.4]
  ├── 2.1 Install new deps (router, cognito, papaparse)
  ├── 2.2 Auth flow (login page, token management)
  ├── 2.3 App shell with sidebar
  ├── 2.4 Routing setup
  ├── 2.5 Wire sidebar to API (wiki/folder/file tree)
  └── 2.6 Wire editor to API (load/save files)

Phase 3 — CSV-in-Markdown                   [Depends on Phase 2]
  ├── 3.1 CSV block detection in markdown processor
  ├── 3.2 CSV parsing with papaparse
  ├── 3.3 Table rendering
  └── 3.4 CSV editing in multi-line editor

Phase 4 — Image Upload                      [Depends on Phase 1.3]
  ├── 4.1 Image upload Lambda (sharp WebP conversion)
  ├── 4.2 Image download Lambda (WebP → PNG)
  ├── 4.3 Frontend image upload UI
  └── 4.4 Presigned URL refresh on page load

Phase 5 — Export                            [Depends on Phase 1.3]
  ├── 5.1 Markdown export endpoint
  ├── 5.2 DOCX export Lambda
  ├── 5.3 ZIP export Lambda
  └── 5.4 Frontend export UI

Phase 6 — Deployment                        [Depends on all above]
  ├── 6.1 netlify.toml + redirects
  ├── 6.2 Environment variable config
  ├── 6.3 Final CDK deploy
  └── 6.4 Netlify deploy + test
```

---

## Appendix: Quick Reference

### Commands

```bash
# CDK
cd infra && npx cdk deploy --profile personal

# Local dev
npm run dev

# Build for Netlify
npm run build

# Preview build
npm run preview
```

### AWS Profile

- Profile name: `personal`
- Region: (will use default from profile, or specify in CDK)
