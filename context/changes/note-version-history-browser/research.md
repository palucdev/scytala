---
date: 2026-09-10T11:23:30Z
researcher: Antigravity
git_commit: 4feeb6da3d79454a2a40503c6ac6fa9f46624aac
branch: feature/docs
repository: palucdev/scytala
topic: "Note Version History Browser: UX Interaction Patterns & Diffing Algorithms"
tags: [research, note-versioning, jsdiff, myers-diff, ux-patterns, mui, cloudflare-workers, supabase]
status: complete
last_updated: 2026-09-10
last_updated_by: Antigravity
last_updated_note: "Added follow-up research on non-dimming drawer and popup version preview dialog"
---

# Research: Note Version History Browser

**Date**: 2026-09-10T11:23:30Z  
**Researcher**: Antigravity  
**Git Commit**: [4feeb6da3d79454a2a40503c6ac6fa9f46624aac](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac)  
**Branch**: `feature/docs`  
**Repository**: [palucdev/scytala](https://github.com/palucdev/scytala)  

---

## Research Question

> Use exa and context7 to check for proper algorithms and approaches from the UX perspective that will be beneficial in note versioning browsing (`/10x-research note-version-history-browser`).

Specifically addressing:
1. **UX Interaction Patterns**: How to balance full snapshot browsing with optional inline diffing; layout patterns (side drawer vs modal vs split view); version timeline navigation; non-destructive restoration flows.
2. **Diffing Algorithms & Engineering**: Optimal algorithms (Myers diff, patience diff, line vs word granularity) for plain-text notes up to 10,000 characters; evaluation of JavaScript libraries (`diff`/`jsdiff`, `fast-diff`, `diff-match-patch`); computation location (client-side vs edge); WCAG 2.1 AA accessibility.
3. **Scytala Codebase Integration**: Database schema (`note_versions`, `dashboard_users`), server actions, author mapping, and Material-UI integration with the existing `NoteEditor` and `NoteEditorHeader`.

---

## Summary

1. **UX Core Paradigm — Snapshot-First with Inline Diff Toggle**:
   - Modern version browsing patterns (Google Docs, Notion, Obsidian, GitHub) demonstrate that users navigate version history with two distinct intents: **Snapshot Recall** ("What did this note look like yesterday?") and **Change Auditing** ("What exactly was added or deleted since version 2?").
   - The recommended design is a **Right-Side Slide-Over Drawer** (`MUI Drawer anchor="right"`, 380–420px width on desktop, full-width on mobile) that lists versions chronologically descending (`vCurrent`, `v(N-1)`, ..., `v1`).
   - Selecting a version opens a read-only preview of that version's full content in the editor canvas, with an accessible **"Show changes" (Inline Diff) toggle**.
   - When "Show changes" is toggled ON, the preview renders an inline diff: additions highlighted in soft accessible green (`#2e7d32` / `rgba(46, 125, 50, 0.12)`) and deletions in soft red with strikethrough (`#d32f2f` / `rgba(211, 47, 47, 0.12)`).

2. **Diffing Algorithm — Myers Diff with Word-Level Granularity (`jsdiff`)**:
   - Plain-text prose notes (up to 10,000 characters) behave differently than source code: in notes, a paragraph is often a single line or few lines. Line-level diffs (`diffLines`) replace entire paragraphs on minor punctuation or word edits, creating jarring, unhelpful diffs.
   - The optimal algorithm is **Myers Diff (1986)** with **Word-Level Granularity with Whitespace Preservation** (`diffWordsWithSpace` from `diff` / `jsdiff`).
   - Benchmark & Complexity: Myers diff runs in $O((N+M)D)$ where $D$ is the number of differences. For Scytala notes (max 10,000 characters), word diffing takes **<5ms** on the client, rendering instantly without UI freezing.
   - **Compute Location**: Strictly **Client-Side** (`useMemo`). Client-side execution avoids serverless edge CPU billing on Cloudflare Workers, eliminates round-trip latency when switching versions, and provides instantaneous toggle between snapshot and diff.

3. **Restoration Model — Non-Destructive Append-Only**:
   - In accordance with Scytala's forward-only architecture ([lessons.md:11-14](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/context/foundation/lessons.md#L11-L14)), restoring past version $v_k$ **never deletes or rewrites history**.
   - Clicking "Restore this version" opens a confirmation dialog, which upon confirmation invokes `updateNoteAction`, creating a new version snapshot $v_{Current+1}$ containing $v_k$'s title and content.
   - This provides complete auditability, zero data loss, and safe reversal if a user restores an incorrect version.

4. **Codebase Integration**:
   - The database foundation is already in place: `notes` and `note_versions` tables with `idx_note_versions_note_history (note_id, version DESC)` ([schema.sql:73](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/supabase/migrations/20260819000000_create_dashboard_schema.sql#L73)).
   - Existing `db.getNoteVersions(noteId)` returns raw `NoteVersion[]` with `author_id`. In `getNoteVersionHistoryAction`, we resolve `author_id` against `dashboard_users.user_alias` using `db.listDashboardUsers(dashboard_id)`.
   - `NoteEditorHeader.tsx` already has a reserved disabled button with ID `#note-history-btn` ([NoteEditorHeader.tsx:26-47](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/src/app/dashboard/[hash]/note/[noteId]/components/NoteEditorHeader.tsx#L26-L47)), ready to be wired in edit mode.

---

## Detailed Findings

### 1. UX Interaction Patterns for Note Version Browsing

#### 1.1 Snapshot Browsing vs. Inline Diffing
| Dimension | Pure Snapshot Browsing | Inline Visual Diffing | Hybrid: Snapshot + Diff Toggle (Recommended) |
|---|---|---|---|
| **Primary User Goal** | "I want to read or recover the note as it was." | "I want to see what someone edited or deleted." | Both goals satisfied seamlessly. |
| **Cognitive Load** | Very low (plain readable document). | Moderate (visual noise from strikethroughs and highlights). | Low by default, detail on demand. |
| **Punctuation/Typo Visibility** | Hard to spot minor changes across versions. | Instantly highlights single-word and punctuation changes. | Highlighted when toggle is ON. |
| **Restoration Decision** | User can verify full context before restoring. | User can verify exactly what will change relative to current. | Optimal safety for restore action. |

#### 1.2 Layout Architecture: Drawer vs. Split Screen vs. Modal
- **Recommended: Right-Side Slide-Over Drawer (`MUI Drawer anchor="right"`)**:
  - *Context preservation*: The note editor canvas remains visible. Clicking different versions smoothly updates the canvas preview.
  - *Responsive adaptation*: On desktop ($>900\text{px}$), the drawer occupies 380px on the right while the note canvas shifts or overlays cleanly; on tablet and mobile, the drawer expands to 100% width with a clear close button.
  - *Material-UI alignment*: Reuses standard `@mui/material/Drawer`, `@mui/material/List`, and `@mui/material/ListItemButton` without introducing custom layout engines.
- **Alternative (Rejected): Split-Screen View**:
  - Requires horizontal room ($>1200\text{px}$) that fails on mobile/tablets. For plain text notes under 10,000 characters, dual synchronized scroll panes introduce unnecessary complexity.
- **Alternative (Rejected): Modal Dialog**:
  - Disconnects the user from the editor context, feels heavy, and prevents fluid comparison with the active note state.

#### 1.3 Version List Timeline Design
Each row in the history list represents an immutable snapshot:
1. **Synthetic Current Version Row** (top of list):
   - Badged with a distinct chip: `Current (vN)`.
   - Displays live editor state.
   - Restore button disabled (user is already on it).
2. **Historical Version Rows** (`v(N-1)` down to `v1`):
   - **Version Badge**: `<Chip label="v2" size="small" variant="outlined" />`.
   - **Timestamp**: Relative time (e.g. `2 hours ago`, `Sep 8, 14:20`) using Scytala's `<FormattedDate date={v.created_at} />` ([FormattedDate.tsx:8-25](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/src/app/dashboard/[hash]/components/FormattedDate.tsx#L8-L25)).
   - **Author Attribution**: `by <user_alias>` (or `"Unnamed collaborator"` if author was deleted or anonymous).
   - **Change Delta Badge**: Quick summary counts (e.g., `+18 / -4` characters) so users immediately spot major versus minor revisions.
   - **Active Selection**: Clear highlight state (`bgcolor: "action.selected"`, border indicator).

#### 1.4 Restoration UX ("Restore this version")
- **Non-Destructive Principle**: In Git or PostgreSQL append-only architectures, "restoring" is an additive operation. Restoring version 2 when the note is at version 5 creates **version 6**.
- **User Confirmation Dialog**:
  - Triggered by clicking "Restore this version" on any historical version row or preview header.
  - Modal text:
    > **Restore Version 2?**  
    > This will replace current note content with the snapshot from version 2 (created on Sep 8 by Alice). A new version (v6) will be created. All previous versions will remain safely preserved in history.
  - Actions: `[Cancel]` and `[Restore Version]`.
- **Post-Restore Feedback**:
  - Submits `updateNoteAction` with `expectedVersion: currentVersion`.
  - On success, updates active editor state to the newly created version, displays a success snackbar/alert, and returns focus to the editor.

---

### 2. Diffing Algorithms & Engineering Trade-offs

#### 2.1 Algorithm Analysis
1. **Myers Difference Algorithm (1986)**:
   - *How it works*: Models string editing as a directed graph on a grid where diagonal edges represent matching characters/tokens and horizontal/vertical edges represent insertions/deletions. It searches diagonally to find the shortest edit script.
   - *Time & Space Complexity*: $O((N+M)D)$ time, $O(N+M)$ space, where $N, M$ are document lengths and $D$ is the number of differences.
   - *Characteristics*: Extremely fast when differences $D$ are small relative to document size. Guarantees minimal edit distance.
   - *Fitness for Scytala*: Ideal. Scytala notes are capped at `MAX_NOTE_CONTENT_LENGTH = 10000` characters ([NoteEditor.tsx:19](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx#L19)). In practice, sequential note edits have small $D$, executing in **1–3ms**.
2. **Patience Diff / Histogram Diff (Bram Cohen / Git)**:
   - *How it works*: Matches unique lines that appear exactly once in both documents as anchors, then recurses on the segments between anchors.
   - *Characteristics*: Excellent for large source code files where function declarations or class definitions move, preventing scrambled diff hunks.
   - *Drawback for Notes*: In prose and free-form text notes, lines are frequently repeated (blank lines, bullet points, headers) or unstructured. Patience diff has higher startup overhead and provides no benefit for plain-text notes.
3. **Granularity: Line-Level vs Word-Level vs Character-Level**:
   - *Line-level (`diffLines`)*: Coarse. In notes, editing one word in a 3-line paragraph causes the entire paragraph to be marked as deleted and re-inserted. This creates high visual fatigue.
   - *Character-level (`diffChars`)*: Extremely fine. Every typed keystroke or misspelling creates fragmented single-character chips that look noisy.
   - *Word-level with spaces (`diffWordsWithSpace`)*: **Optimal for prose notes**. It treats words and punctuation marks as individual tokens while preserving whitespace alignment. A modified sentence cleanly shows the specific replaced word.

#### 2.2 JavaScript Diffing Libraries Comparison
Evaluated via `ctx7`, `exa`, and package metadata:

| Library | Version | Unpacked Size | Granularity | Edge / Browser Support | TS Types | Verdict |
|---|---|---|---|---|---|---|
| **`diff` (`jsdiff`)** | `^8.0.4` / `^9.0.0` | ~600KB unbundled (~6KB gzip) | Line, Word, Char, Sentences, Patches | 100% pure JS, ESM + CJS, zero dependencies | Built-in (`libcjs/index.d.ts`) | **Recommended**. De facto standard (380M+ npm downloads/month), comprehensive word and line diffing, active maintenance. |
| **`fast-diff`** | `^1.3.0` | 52KB (~2KB gzip) | Character-level only | Pure JS | Built-in | Fast for Quill rich-text internals, but lacks word/line tokenization. Not suitable for human-readable prose diffs. |
| **`diff-match-patch`** | `^1.0.5` | 97KB | Char/Word via regex cleanup | Pure JS | Requires `@types/diff-match-patch` | Historical Google library; unmaintained on npm, lacks modern ESM exports. |

#### 2.3 `jsdiff` API Usage Details (from Context7)
From `ctx7 docs /kpdecker/jsdiff`:
```ts
import { diffWordsWithSpace, diffLines, type ChangeObject } from 'diff';

// For plain text note diffing:
const changes: ChangeObject<string>[] = diffWordsWithSpace(oldText, newText);

// Each change item contains:
// - change.value: string
// - change.added: boolean | undefined
// - change.removed: boolean | undefined
// - change.count: number | undefined
```

#### 2.4 WCAG 2.1 AA Accessibility & Styling
Visual diff highlights must comply with WCAG 2.1 AA (minimum 4.5:1 contrast ratio for normal text and 3:1 for graphical UI components):
1. **Never rely on color alone**:
   - Additions: Soft green background (`rgba(46, 125, 50, 0.15)`), dark green text (`#1b5e20`), underlined or preceded by `+` in accessible text.
   - Deletions: Soft red background (`rgba(211, 47, 47, 0.15)`), dark red text (`#b71c1c`), with CSS `textDecoration: "line-through"`.
   - Papyrus Theme Compatibility: Soft tinted backgrounds blend naturally with the warm papyrus theme background (`#efe0c4` / `#fbf7ee`) without clashing.
2. **Screen Reader Considerations**:
   - Wrap added segments with `<ins aria-label="Added: ...">` or `<Typography component="ins">`.
   - Wrap removed segments with `<del aria-label="Deleted: ...">` or `<Typography component="del">`.
   - Provide an invisible screen reader summary before the diff content: `aria-live="polite"` announcing `"Diff view: X additions, Y deletions"`.

---

### 3. Scytala Codebase Architecture & Integration Points

#### 3.1 Database & RPC Layer
1. **Schema**:
   - `note_versions` table ([schema.sql:60-69](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/supabase/migrations/20260819000000_create_dashboard_schema.sql#L60-L69)):
     ```sql
     CREATE TABLE IF NOT EXISTS public.note_versions (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
         version INT NOT NULL,
         title TEXT NOT NULL DEFAULT '',
         content TEXT NOT NULL DEFAULT '',
         author_id UUID REFERENCES public.dashboard_users(id) ON DELETE SET NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
         CONSTRAINT uq_note_version UNIQUE (note_id, version)
     );
     ```
   - Indexed for ordered retrieval: `CREATE INDEX IF NOT EXISTS idx_note_versions_note_history ON public.note_versions(note_id, version DESC);` ([schema.sql:73](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/supabase/migrations/20260819000000_create_dashboard_schema.sql#L73)).
2. **Database Client Interface** ([db-client.ts:84-92](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/src/client/db-client.ts#L84-L92)):
   - `NoteVersion` has: `id`, `note_id`, `version`, `title`, `content`, `author_id`, `created_at`.
   - Adapter method `db.getNoteVersions(note_id)` ([supabase.ts:500-515](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/src/lib/supabase.ts#L500-L515)) queries `note_versions` ordered by `version DESC`.
3. **Author Mapping Resolution**:
   - `NoteVersion` holds `author_id` (foreign key to `dashboard_users.id`), not the human alias.
   - When listing versions, Scytala must display the author's alias (e.g. "Alice") instead of a raw UUID.
   - *In-Action Resolution Strategy*:
     In `getNoteVersionHistoryAction`:
     ```ts
     const [versions, users] = await Promise.all([
       db.getNoteVersions(noteId),
       db.listDashboardUsers(session.dashboard_id),
     ]);
     const userMap = new Map(users.map(u => [u.id, u.user_alias]));
     const hydratedVersions = versions.map(v => ({
       ...v,
       authorAlias: v.author_id ? userMap.get(v.author_id) ?? "Former member" : "Unnamed collaborator",
     }));
     ```
     *Benefit*: Zero new database migrations required! Follows forward-only migration rule and leverages existing cached queries.

#### 3.2 Server Action & Validation Contracts
1. **Zod Validation Schema** (`src/schemas/notes.ts`):
   ```ts
   export const getNoteVersionHistorySchema = z.object({
     dashboardHash: z.string().trim().min(1, "Dashboard identifier is required"),
     noteId: z.string().uuid("Invalid note ID format"),
   });

   export type GetNoteVersionHistoryActionResult =
     | {
         success: true;
         versions: HydratedNoteVersion[];
       }
     | {
         success: false;
         error: string;
         rateLimited?: boolean;
         retryAfterSeconds?: number;
       };
   ```
2. **Server Action** (`src/actions/notes.ts`):
   - Implements `getNoteVersionHistoryAction`.
   - Validates input with `getNoteVersionHistorySchema`.
   - Enforces auth via `verifyDashboardSession(dashboardHash, { throwOnRateLimit: true })`.
   - Enforces cross-dashboard boundary: verifies `note = await db.getNoteById(noteId)` and `note.dashboard_id === session.dashboard_id`.
   - Returns version snapshots with resolved `authorAlias`.

#### 3.3 UI Component Wiring
1. **Header Integration** (`NoteEditorHeader.tsx`):
   - Enable the existing `#note-history-btn` button when `mode === "edit"`.
   - Pass an `onOpenHistory: () => void` handler from `NoteEditor.tsx`.
   - When in `create` mode (`noteId === "new"`), keep button disabled with tooltip `"History is available after saving"`.
2. **Drawer Component** (`NoteVersionHistoryDrawer.tsx`):
   - Positioned as a slide-in drawer on the right.
   - Houses the version list timeline.
   - Top action bar: "Version History", close icon button, and "Diff vs Current" toggle switch.
3. **Canvas Preview & Diff Component** (`NoteVersionPreview.tsx`):
   - When a historical version is selected, it displays that version's title, version badge, author info, and content.
   - If "Diff vs Current" is toggled OFF: Renders the full text snapshot with line numbering (`LineNumberGutter`).
   - If "Diff vs Current" is toggled ON: Renders the word-level diff computed against the current editor text using `diffWordsWithSpace`.
   - Header banner: "Previewing version X (read-only)" with action buttons `[Restore this version]` and `[Back to current editor]`.

---

## Code References

- `src/app/dashboard/[hash]/note/[noteId]/components/NoteEditorHeader.tsx:26-47` — Existing disabled "Note history" button with tooltip and icon.
- `src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:18-41` — NoteEditor state, `MAX_NOTE_CONTENT_LENGTH = 10000`, `title`, `content`, `version`.
- `src/app/dashboard/[hash]/note/[noteId]/components/LineNumberGutter.tsx:1-45` — Line number gutter component that synchronizes with text scrolling.
- `src/app/dashboard/[hash]/note/[noteId]/components/EditorToolbar.tsx:99-110` — Version chip indicator `v{version}` in the editor toolbar.
- `src/app/dashboard/[hash]/components/NoteTile.tsx:112-132` — Version badge rendering on dashboard tiles (`v{note.version}`).
- `src/app/dashboard/[hash]/components/FormattedDate.tsx:8-25` — Accessible date formatting utility.
- `src/client/db-client.ts:84-92` — `NoteVersion` interface definition.
- `src/client/db-client.ts:236` — `getNoteVersions(note_id: string): Promise<NoteVersion[]>` interface declaration.
- `src/lib/supabase.ts:500-515` — `SupabaseDatabaseClient.getNoteVersions` implementation.
- `supabase/migrations/20260819000000_create_dashboard_schema.sql:60-75` — `note_versions` schema and `idx_note_versions_note_history` index.
- `supabase/migrations/20260820000000_create_dashboard_rpcs.sql:87-134` — `update_note_with_version` RPC with optimistic concurrency.
- `src/actions/notes.ts:168-275` — `updateNoteAction` implementation.

---

## Architecture Insights

1. **Client-Side Diffing is the Optimal Strategy for Serverless Edge**:
   - In Next.js App Router deployed to Cloudflare Workers, server compute time is bounded (CPU time limits). Performing text diffing on edge workers consumes CPU and memory unnecessarily.
   - Running `diffWordsWithSpace` inside the client browser via `useMemo` is zero-cost to infrastructure, runs in <5ms for 10KB text, and provides instantaneous responsive feedback when switching between versions or flipping the "Show changes" switch.

2. **Non-Destructive Restoration Aligns with Immutability**:
   - `note_versions` are immutable audit records. A restore is simply an edit whose payload equals an earlier snapshot.
   - This ensures that restoring does not erase the history of what was edited between then and now.
   - Concurrency conflicts are gracefully handled: `updateNoteAction` passes `expectedVersion: currentVersion`, preventing accidental overwrites if a collaborator edited the note concurrently while the history browser was open.

3. **Additive Author Resolution Avoids Complex Schema Migrations**:
   - Because `dashboard_users` per dashboard is small ($\le 20$ participants per dashboard in Scytala's design), resolving authors in-memory in the Server Action eliminates the need for complex database views or join migrations, adhering strictly to Scytala's forward-only migrations policy.

---

## Historical Context (from prior changes)

- `context/changes/note-crud-and-version-persistence/plan-brief.md:20-29` — Decision in S-03: Line-level authorship deferred; author is tracked per version snapshot in `note_versions.author_id`. Optimistic UI with Server Actions established.
- `context/foundation/lessons.md:7-15` — Lesson 1: Database migrations must be forward-only; non-destructive operations are mandatory.
- `context/foundation/roadmap.md:134-145` — S-04 specification: Authenticated user can open note's version history panel and browse previous versions in chronological order with timestamps and author details.
- `context/foundation/roadmap.md:262` — Question 5: "Should the version history drawer display full past note content snapshots or computed unified text diffs against current state?" — Resolved: Hybrid approach (Full snapshot default with an optional inline word-level diff toggle).

---

## Open Questions & Recommendations for Planning

1. **Package Dependency**:
   - Recommend adding `diff` (`npm install diff @types/diff`) to `package.json`. It is pure JS, tree-shakeable, and standard across React/Next.js ecosystems.
2. **Maximum Versions Displayed**:
   - In S-04, notes typically have <50 versions. Direct retrieval of all versions via `db.getNoteVersions(noteId)` is fast and simple. If a note exceeds 100 versions in the future, cursor pagination can be introduced additively.
3. **Restoration of Title vs. Content**:
   - When restoring version $k$, should both title and content be restored?
   - *Recommendation*: Yes, both title and content from version $k$ should be restored, preserving the snapshot exactly as it was saved.

---

## Follow-up Research 2026-09-10T19:07:00Z: Non-dimming Drawer & Popup Version Preview Dialog

### Context & Problem Statement
During initial manual verification of the Phase 4 implementation, two key user experience deficiencies were identified:
1. **Darkened and Inactive Background**: Opening `NoteVersionHistoryDrawer` darkens the background and prevents any interaction with the note editor canvas or toolbar. The user requested: *"The background of the opened version history is darkened out and inactive (should not be like that)."*
2. **In-Place Canvas Swapping**: Clicking a version item in the history drawer unmounted the note editor textarea and replaced the entire card body with an in-place preview canvas. The user requested: *"By clicking on version history the whole note is changing in the main view - it should not be like that, it should be opened in a popup with menu options (restore this version, show changes toggle, exit etc.)."*

---

### Investigation 1: MUI Drawer Non-Dimming & Interactive Background Architecture

#### Root Cause Analysis
- In Material-UI, `<Drawer>` defaults to `variant="temporary"` when `variant` is omitted.
- `variant="temporary"` mounts an underlying `<Modal>` with an active `<Backdrop>`:
  - **Visual overlay**: Renders `rgba(0, 0, 0, 0.5)` backdrop over the entire viewport.
  - **Pointer-event trapping**: The fixed modal container (`position: fixed; inset: 0; z-index: 1200`) captures all clicks outside the drawer paper, either closing the drawer immediately or swallowing clicks.
  - **Scroll lock & Focus trap**: Applies `overflow: hidden` to `document.body` and locks keyboard focus within the drawer.
  - **Accessibility masking**: Injects `aria-hidden="true"` onto all sibling DOM elements in `document.body`, making the main editor inert to assistive technologies and test runners.

#### Evaluation of Solutions
1. **`hideBackdrop={true}`**:
   - Skips visual backdrop rendering (`rgba(0, 0, 0, 0)`), but leaves the invisible `<Modal>` container mounted across `inset: 0; z-index: 1200`.
   - Result: Background is not dark, but still completely inactive/unclickable. Fails user requirement.
2. **CSS overrides (`pointerEvents: 'none'` on modal root)**:
   - Fragile, retains `aria-hidden="true"` on the page, and breaks accessibility.
3. **`variant="persistent"` on Desktop (Recommended)**:
   - Completely bypasses `<Modal>` and `<Backdrop>` rendering. MUI renders a docked `<div>` with `Slide` and `PaperSlot`.
   - Result:
     - Zero background darkening (no backdrop component mounted).
     - Full interactivity: The main editor, toolbar, and buttons remain fully clickable and active.
     - Zero scroll locking or focus trapping.
     - Clean accessibility tree without `aria-hidden="true"` corruption.
     - Fixed right-side slide-over (`width: 380px`, `z-index: 1200`, `elevation: 8`, left border + drop shadow).
4. **Adaptive Responsive Configuration**:
   ```tsx
   variant={isMobile ? "temporary" : "persistent"}
   ```
   - Desktop ($\ge 600\text{px}$): `variant="persistent"`, allowing the user to keep history visible alongside the editor without dimming.
   - Mobile ($< 600\text{px}$): `variant="temporary"`, where a full-screen sheet auto-closes on selection.

---

### Investigation 2: Popup Version Preview Dialog Architecture

#### Architectural Shift: Decoupling Draft Canvas from Historical Inspection
- Instead of unmounting the note's active draft textarea from `<Card>`, the main editor canvas remains permanently mounted.
- Unsaved draft edits, text selection, and scroll position in `#note-content-input` are never destroyed.
- Selecting a version snapshot opens a dedicated MUI modal `<Dialog>`: `NoteVersionPreviewDialog`.

#### Component Specification: `NoteVersionPreviewDialog`
1. **Dialog Shell**:
   - Component: `<Dialog open={Boolean(selectedVersion)} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile} scroll="paper">`
   - `maxWidth="md"` provides a readable 900px wide canvas for code/text diffs.
   - `scroll="paper"` keeps the action header and footer pinned while the content scrolls smoothly.
2. **Header (`DialogTitle`)**:
   - Version Chip: `Viewing v{selectedVersion.version} (Read-only)` (color="warning", size="small").
   - Author & Relative Timestamp: `by {selectedVersion.author_alias} • {dayjs(selectedVersion.created_at).fromNow()}`.
   - "Show changes" Switch: `<FormControlLabel control={<Switch checked={showDiff} ... />} label="Show changes" />`.
   - Close Icon Button: `<IconButton onClick={onClose} aria-label="Close preview"><CloseIcon fontSize="small" /></IconButton>`.
3. **Body (`DialogContent dividers`)**:
   - Title Difference Callout: Displayed if `selectedVersion.title !== currentTitle`.
   - Historical Title Typography: Read-only display of `selectedVersion.title || "(Untitled note)"`.
   - Content Pane:
     - When `!showDiff`: Preformatted read-only snapshot with `<LineNumberGutter>`.
     - When `showDiff`: Word-level inline diff tokens formatted via `formatDiffLines`, rendering line gutter numbers alongside WCAG AA contrast `<ins>` (`#1b5e20`) and `<del>` (`#b71c1c`) elements, plus polite screen reader live region announcements.
4. **Footer (`DialogActions`)**:
   - Left: Diff character stats (`+X chars, -Y chars`) when diffing.
   - Right:
     - `Button variant="outlined"`: "Exit preview" / "Close".
     - `Button variant="contained" color="primary"`: "Restore this version", prompting `<ConfirmationDialog>`.

#### Benefits to `NoteEditor.tsx`:
- No conditional card body replacement.
- No `isPreview` mode required in `EditorToolbar` (the dialog modal naturally focuses interaction on the preview).
- Zero risk of draft content loss or unmounting.

