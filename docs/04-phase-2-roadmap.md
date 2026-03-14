# Jot-Down Phase 2+ Roadmap

## Overview

This document outlines the implementation plan for advanced features inspired by Notion's UX patterns.

---

## 🎯 Feature Categories

### 1. **Editor Enhancements** (Core UX)

- Slash commands
- Code block syntax highlighting
- Callouts/alerts
- Toggle/collapsible blocks

### 2. **Discovery & Navigation**

- Full-text search
- Favorites system
- Recent pages tracking
- Trash/archive functionality

### 3. **Collaboration & Sharing**

- Page-level sharing permissions
- Public pages
- Link sharing with access control
- Real-time collaboration (WebSockets)
- Activity log

### 4. **Content Management**

- PDF/HTML export
- File attachments
- Cover images
- Page icons/emoji
- Version history

### 5. **Rich Media & Interactions**

- Image resize/crop
- @mentions
- Notifications system

---

## 📊 Implementation Priority Matrix

| Feature               | Impact | Complexity | Priority | Effort    |
| --------------------- | ------ | ---------- | -------- | --------- |
| Slash commands        | HIGH   | MEDIUM     | P0       | 1-2 days  |
| Full-text search      | HIGH   | MEDIUM     | P0       | 2-3 days  |
| Code syntax highlight | HIGH   | LOW        | P0       | 1 day     |
| Recent pages          | MEDIUM | LOW        | P1       | 1 day     |
| Favorites             | MEDIUM | LOW        | P1       | 1 day     |
| Callouts              | MEDIUM | LOW        | P1       | 1 day     |
| Toggle blocks         | MEDIUM | MEDIUM     | P1       | 2 days    |
| Page icons/emoji      | MEDIUM | LOW        | P1       | 1 day     |
| Trash/archive         | MEDIUM | MEDIUM     | P1       | 2 days    |
| Link sharing          | MEDIUM | MEDIUM     | P2       | 2-3 days  |
| Public pages          | MEDIUM | MEDIUM     | P2       | 2-3 days  |
| File attachments      | MEDIUM | HIGH       | P2       | 3-4 days  |
| PDF/HTML export       | LOW    | MEDIUM     | P2       | 2-3 days  |
| Cover images          | LOW    | MEDIUM     | P2       | 2 days    |
| Image resize          | LOW    | MEDIUM     | P3       | 2 days    |
| Version history       | MEDIUM | HIGH       | P3       | 4-5 days  |
| @mentions             | LOW    | MEDIUM     | P3       | 2-3 days  |
| Notifications         | LOW    | HIGH       | P3       | 3-4 days  |
| Real-time collab      | HIGH   | VERY HIGH  | P4       | 1-2 weeks |
| Activity log          | LOW    | MEDIUM     | P4       | 2-3 days  |

---

## 🚀 Phase 2A: Quick Wins (Week 1)

### 1. Slash Commands ⚡

**Why first:** Transforms user experience, high impact/effort ratio

**Implementation:**

- Create `SlashMenu.jsx` component
- Detect `/` keypress in editor
- Show floating menu with filtered options
- Insert block types on selection
- Support keyboard navigation (↑↓ Enter Esc)

**Block types to support:**

- Headers (h1-h6)
- Lists (bullet, numbered, todo)
- Code block
- Quote
- Divider
- Callout
- Toggle

**Backend:** None needed (frontend only)

**Files to create/modify:**

- `src/components/editor/SlashMenu.jsx` (new)
- `src/components/editor/SlashMenu.css` (new)
- `src/App.jsx` (add slash detection logic)

---

### 2. Code Syntax Highlighting 💻

**Why early:** Common use case, low complexity

**Implementation:**

- Use `prismjs` or `highlight.js`
- Detect code blocks (```language)
- Apply syntax highlighting based on language
- Support 20+ languages (js, python, java, etc.)
- Add language selector dropdown

**Backend:** None needed

**Files to create/modify:**

- `src/components/editor/CodeBlock.jsx` (new)
- `src/components/editor/CodeBlock.css` (new)
- `src/App.jsx` (render code blocks separately)

**Dependencies:**

```bash
npm install prismjs
```

---

### 3. Full-Text Search 🔍

**Why early:** Critical for usability as content grows

**Implementation:**

**Frontend:**

- Create `CommandPalette.jsx` (⌘K trigger)
- Search wikis, folders, files by name and content
- Show recent files at top
- Fuzzy search with `fuse.js`
- Navigate on Enter

**Backend (Lambda):**

- Add search endpoint: `GET /search?q=query`
- Search file content in S3
- Search names in DynamoDB
- Return ranked results

**Files to create/modify:**

- `src/components/search/CommandPalette.jsx` (new)
- `src/components/search/CommandPalette.css` (new)
- `src/App.jsx` (add ⌘K handler)
- `infra/lambda/search.js` (new backend function)
- `src/services/api.js` (add search API)

**Dependencies:**

```bash
npm install fuse.js
```

---

### 4. Recent Pages & Favorites ⭐

**Why early:** Improves navigation, low effort

**Implementation:**

**Frontend:**

- Track file opens in localStorage (temporary)
- Show "Recent" section in sidebar
- Add star icon to files
- Show "Favorites" section in sidebar
- Persist to backend

**Backend:**

- Add `favorites` array to user metadata
- Add `recentFiles` array with timestamps
- Endpoints:
    - `POST /favorites/{fileId}`
    - `DELETE /favorites/{fileId}`
    - `GET /recent`

**Files to create/modify:**

- `src/components/layout/Sidebar.jsx` (add sections)
- `infra/lambda/favorites.js` (new)
- `src/services/api.js` (add endpoints)

---

### 5. Callouts 📢

**Why early:** Enhances content richness, easy to implement

**Implementation:**

- New block type: "callout"
- Support icons (💡, ⚠️, ✅, ❌, 📌)
- Support colors (info, warning, success, error, note)
- Render with Vista Aero styling

**Backend:** None needed (stored as markdown extension)

**Files to create/modify:**

- `src/components/editor/Callout.jsx` (new)
- `src/components/editor/Callout.css` (new)
- `src/App.jsx` (parse callout syntax)

**Syntax:**

```markdown
:::info
This is an info callout
:::
```

---

## 🔨 Phase 2B: Power Features (Week 2)

### 6. Toggle/Collapsible Blocks 🔽

**Implementation:**

- New block type with expand/collapse state
- Nested content support
- Persist state to prevent auto-collapse

**Backend:** Store as JSON with nested structure

---

### 7. Page Icons & Cover Images 🎨

**Implementation:**

- Emoji picker for page icons
- Cover image upload (reuse image API)
- Cover image positioning
- Store in file metadata

**Backend:** Add `icon` and `coverImage` to file schema

---

### 8. Trash & Archive 🗑️

**Implementation:**

- Soft delete: `deletedAt` timestamp
- Trash view in sidebar
- Restore functionality
- 30-day auto-delete cron job

**Backend:**

- Update delete endpoints to soft delete
- Add restore endpoint
- Add EventBridge cron for cleanup

---

## 🌐 Phase 2C: Sharing & Export (Week 3)

### 9. Link Sharing & Public Pages 🔗

**Implementation:**

- Generate shareable links
- Access control (view, edit, comment)
- Public pages (no auth required)
- SEO meta tags for public pages

**Backend:**

- Share links table (DynamoDB)
- Public access Lambda (no Cognito)
- CloudFront distribution for public pages

---

### 10. Enhanced Export 📄

**Implementation:**

- PDF generation with `jspdf`
- HTML export with full styling
- Markdown export (already have)
- Bulk export (zip multiple files)

**Backend:** Use Lambda layers for PDF generation

---

## 🎯 Phase 2D: Advanced Features (Week 4+)

### 11. File Attachments 📎

**Complexity:** HIGH

- Upload any file type to S3
- Display as download links in editor
- Thumbnail previews for PDFs/images
- Size limits and validation

---

### 12. Version History ⏱️

**Complexity:** HIGH

- Snapshot on every save
- Show diff view
- Restore previous version
- Limit to last 30 versions

**Backend:** Store versions in S3 with timestamps

---

### 13. @Mentions & Notifications 🔔

**Complexity:** MEDIUM-HIGH

- Mention parser (@username)
- Notification system (in-app + email)
- WebSocket for live notifications
- Mark as read functionality

**Backend:**

- Notifications table
- SES for email
- WebSocket API Gateway

---

### 14. Real-Time Collaboration 🤝

**Complexity:** VERY HIGH

- WebSocket connection
- Operational Transform or CRDT
- Presence indicators
- Conflict resolution
- Cursor positions

**Backend:**

- WebSocket API Gateway
- DynamoDB for state sync
- Lambda for connection management

---

## 🛠️ Technical Dependencies

### Frontend Libraries

```bash
npm install prismjs fuse.js emoji-picker-react jspdf marked-react
```

### Backend Services

- DynamoDB: Add tables for favorites, shares, notifications
- S3: Version buckets, attachment buckets
- Lambda: New functions for search, favorites, shares
- API Gateway: WebSocket API (for real-time)
- EventBridge: Cron jobs for cleanup
- SES: Email notifications
- CloudFront: Public page distribution

---

## 📈 Success Metrics

Track these KPIs post-implementation:

1. **Slash Command Usage:** % of blocks created via slash vs manual
2. **Search Engagement:** Searches per session, click-through rate
3. **Favorites Growth:** Avg favorites per user
4. **Share Link Creation:** Public pages created, share links generated
5. **Code Block Usage:** % of pages with code blocks
6. **Time to Action:** Reduction in time to create/find content

---

## 🎬 Recommended Start Order

### Week 1 (Most Impact)

1. ✅ **Slash Commands** (2 days) - Game changer for UX
2. ✅ **Code Highlighting** (1 day) - Common need, easy win
3. ✅ **Full-Text Search** (3 days) - Essential as content grows

### Week 2 (Quick Wins)

4. ✅ **Recent & Favorites** (2 days) - Navigation boost
5. ✅ **Callouts** (1 day) - Visual richness
6. ✅ **Page Icons** (1 day) - Personalization

### Week 3 (Power Features)

7. ✅ **Toggle Blocks** (2 days) - Content organization
8. ✅ **Trash/Archive** (2 days) - Safety net
9. ✅ **Link Sharing** (3 days) - Collaboration start

### Week 4+ (Advanced)

10. File attachments
11. PDF/HTML export
12. Version history
13. Real-time collaboration (major undertaking)

---

## 🤔 Questions Before Implementation

1. **Which feature should we start with?** Recommend: Slash commands
2. **Backend deployment strategy?** CDK updates needed for new Lambdas
3. **Testing approach?** Need E2E tests for critical paths
4. **Mobile support?** Some features (slash menu, search) need mobile UX
5. **Performance budget?** Monitor bundle size with new libraries

---

## 📝 Next Steps

Ready to implement! Suggested first task:

**Implement Slash Commands** (Highest impact/effort ratio)

- Creates foundation for other block types
- Dramatically improves UX
- No backend changes needed
- Can be done in 1-2 days

Would you like to proceed with slash commands first?
