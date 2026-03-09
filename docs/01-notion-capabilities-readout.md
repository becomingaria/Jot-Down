# Notion Capabilities Readout

> Reference document for Jot-Down feature planning. This details what Notion offers and maps
> which capabilities are relevant to Jot-Down's scope as a lightweight markdown wiki.

---

## 1. Content & Editing

| Capability                                                      | Notion Behavior                                                                                                                       | Jot-Down Relevance                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Block-based editing**                                         | Every paragraph, heading, list item, image, embed, etc. is a discrete "block" that can be moved, nested, and converted between types. | **Already implemented** — Jot-Down uses "canister" blocks per line. Keep this model.                          |
| **Markdown support**                                            | Notion auto-converts markdown shortcuts (e.g., `**bold**`, `# heading`) while typing. Export to markdown is supported.                | **Core feature** — Jot-Down renders markdown. Enhance with full CommonMark + GFM spec compliance.             |
| **Rich text inline formatting**                                 | Bold, italic, underline, strikethrough, code, highlight, color, link.                                                                 | **Mostly implemented** — Bold, italic, underline, strikethrough, code, highlight, links all work via hotkeys. |
| **Slash commands**                                              | Typing `/` opens a command palette to insert blocks (heading, list, table, divider, image, code, callout, toggle, etc.).              | **Phase 2** — Nice-to-have. Not in initial scope.                                                             |
| **Tables (simple)**                                             | Basic table blocks with rows/columns. Cells support rich text.                                                                        | **In scope** — CSV-in-markdown support fills this need. Parse CSV fenced blocks into rendered tables.         |
| **Databases (tables, boards, calendars, galleries, timelines)** | Full relational database blocks with views, filters, sorts, formulas, rollups, relations.                                             | **Out of scope** — Too complex. CSV table rendering is the lightweight equivalent.                            |
| **Embeds**                                                      | Embed external content: images, videos, PDFs, bookmarks, code, Google Docs, Figma, etc.                                               | **Partial scope** — Image upload/embedding is in scope. Other embeds are Phase 2+.                            |
| **Code blocks**                                                 | Syntax-highlighted code blocks with language selector.                                                                                | **Phase 2** — Currently inline code only. Full fenced code blocks with highlight can be added later.          |
| **Callout blocks**                                              | Highlighted info/warning/tip blocks with icons.                                                                                       | **Phase 2** — Easy to add as custom markdown extension.                                                       |
| **Toggle blocks**                                               | Collapsible content sections.                                                                                                         | **Phase 2**                                                                                                   |
| **Synced blocks**                                               | Content blocks that stay in sync across pages.                                                                                        | **Out of scope**                                                                                              |
| **Comments & discussions**                                      | Inline comments on any block, resolved/unresolved threads.                                                                            | **Out of scope** for MVP                                                                                      |
| **AI writing**                                                  | AI-assisted writing, summarization, translation.                                                                                      | **Out of scope**                                                                                              |

## 2. Page & Content Organization

| Capability                   | Notion Behavior                                                                        | Jot-Down Relevance                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Pages (documents)**        | Every document is a "page." Pages are nested infinitely. A page can contain sub-pages. | **In scope** — Maps to "File" entity. Files contain markdown content.                       |
| **Workspaces**               | Top-level container for all content. Owned by an account.                              | **In scope** — Maps to "Wiki" entity. A Wiki is owned by a user and contains Folders/Files. |
| **Sidebar navigation**       | Tree-view sidebar with pages, sub-pages, favorites, shared.                            | **In scope** — Need sidebar with Wiki → Folder → File tree navigation.                      |
| **Breadcrumbs**              | Show page hierarchy at top of each page.                                               | **In scope** — Display current path (Wiki > Folder > File).                                 |
| **Search**                   | Full-text search across all pages.                                                     | **Phase 2** — Can be added with DynamoDB + search index later.                              |
| **Favorites / Quick access** | Pin pages to sidebar.                                                                  | **Phase 2**                                                                                 |
| **Recently viewed**          | Track recent pages.                                                                    | **Phase 2**                                                                                 |
| **Templates**                | Pre-built page templates.                                                              | **Out of scope**                                                                            |
| **Trash / Archive**          | Soft-delete with recovery.                                                             | **Phase 2** — Implement soft-delete flag in DynamoDB.                                       |

## 3. Sharing & Permissions

| Capability             | Notion Behavior                                                 | Jot-Down Relevance                                                                 |
| ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Team workspaces**    | Multiple members with role-based access (admin, member, guest). | **Simplified** — Wiki owner can share with other users as read-only or read-write. |
| **Page-level sharing** | Share individual pages with specific people or publish to web.  | **In scope** — Share at Wiki level. Individual file sharing is Phase 2.            |
| **Permission levels**  | Full access, Can edit, Can comment, Can view.                   | **Simplified** — Two levels: "can edit" (read+write) and "can view" (read-only).   |
| **Guest access**       | Invite external users to specific pages.                        | **In scope** — Admin adds users via Cognito. Users can be shared onto wikis.       |
| **Public pages**       | Publish pages with a public URL.                                | **Phase 2**                                                                        |
| **Link sharing**       | Generate shareable links with permission controls.              | **Phase 2**                                                                        |

## 4. Import & Export

| Capability                  | Notion Behavior                                  | Jot-Down Relevance                                          |
| --------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| **Import markdown**         | Import .md files into Notion.                    | **In scope** — Upload .md files into a Wiki/Folder.         |
| **Export markdown**         | Export pages as .md files.                       | **In scope** — Already partially implemented (save as .md). |
| **Export PDF**              | Export pages as PDF.                             | **Phase 2**                                                 |
| **Export HTML**             | Export pages as HTML.                            | **Phase 2**                                                 |
| **Export CSV**              | Export database views as CSV.                    | **In scope** — Export CSV table blocks.                     |
| **Import from other tools** | Evernote, Confluence, Google Docs, Word, HTML.   | **Partial** — Import .md and .docx.                         |
| **DOCX export**             | Not native — requires copy/paste or third-party. | **In scope** — Export files as .docx using a library.       |
| **Bulk export**             | Export entire workspace as zip.                  | **In scope** — Export folder as .zip archive.               |

## 5. Media & Files

| Capability           | Notion Behavior                                         | Jot-Down Relevance                                                                             |
| -------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Image upload**     | Upload images, displayed inline. Stored in Notion's S3. | **In scope** — Upload images, convert to WebP for storage, serve as linked images in markdown. |
| **Image resize**     | Drag to resize images in-page.                          | **Phase 2**                                                                                    |
| **File attachments** | Upload arbitrary files (PDF, etc.).                     | **Phase 2**                                                                                    |
| **Cover images**     | Banner images at top of pages.                          | **Phase 2**                                                                                    |
| **Icons / Emoji**    | Custom icons/emoji for pages.                           | **Phase 2**                                                                                    |
| **Image gallery**    | Grid view of images.                                    | **Out of scope**                                                                               |

## 6. Collaboration

| Capability               | Notion Behavior                                          | Jot-Down Relevance                                             |
| ------------------------ | -------------------------------------------------------- | -------------------------------------------------------------- |
| **Real-time co-editing** | Multiple users edit simultaneously with cursors visible. | **Out of scope** — Too complex for MVP. Users edit separately. |
| **Version history**      | View and restore previous versions.                      | **Phase 2** — S3 versioning can enable this cheaply.           |
| **Activity log**         | See who edited what and when.                            | **Phase 2**                                                    |
| **Mentions**             | @mention users in content.                               | **Out of scope**                                               |
| **Notifications**        | Alerts for changes, mentions, comments.                  | **Out of scope**                                               |

## 7. Authentication & Users

| Capability        | Notion Behavior                                           | Jot-Down Relevance                                                                                     |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **SSO / OAuth**   | Google, Apple, SAML SSO.                                  | **Simplified** — AWS Cognito with email/password. Admin-only account creation.                         |
| **User profiles** | Name, avatar, preferences.                                | **Minimal** — Email as identifier. Display name from Cognito attributes.                               |
| **Roles**         | Workspace admin, member, guest with granular permissions. | **Simplified** — Admin role and regular user role. Admin can create users. Admin can manage all wikis. |
| **Audit log**     | Enterprise audit trail.                                   | **Out of scope**                                                                                       |

---

## Summary: What Jot-Down Should Implement (MVP)

### Core Features

1. **Entity model**: Wiki → Folder → File hierarchy
2. **Markdown editing**: Keep current canister-based editor, enhance with CSV table support
3. **CSV-in-markdown**: Fenced `csv` code blocks rendered as interactive tables
4. **User auth**: Cognito-based auth, admin-only user creation
5. **Wiki sharing**: Owner shares wiki with other users (read or edit access)
6. **Image upload**: Upload images → convert to WebP → store in S3 → embed as markdown links
7. **File operations**: Create, read, update, delete files and folders within wikis
8. **Import/Export**: Import .md, export .md / .docx / .zip (folder)
9. **Navigation**: Sidebar tree with Wiki > Folder > File hierarchy + breadcrumbs
10. **AWS Infrastructure**: CDK with S3 (file storage), DynamoDB (metadata), Cognito (auth), API Gateway + Lambda (API)
11. **Deployment**: Frontend on Netlify, backend on AWS

### Deferred to Phase 2+

- Slash commands, code block syntax highlighting, callouts, toggles
- Full-text search, favorites, recent pages, trash/archive
- Page-level sharing, public pages, link sharing
- PDF/HTML export, file attachments, cover images, icons
- Real-time collaboration, version history, activity log
- Image resize, mentions, notifications
