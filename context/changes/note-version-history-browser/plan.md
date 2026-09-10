# Note Version History Browser — Implementation Plan

## Overview

This plan implements **S-04: Note Version History Browser** (Issue [#19](https://github.com/palucdev/scytala/issues/19)), addressing User Story US-05 and Functional Requirement FR-011. Building on the immutable version persistence delivered in S-03 (`note_versions`), this feature allows authenticated dashboard users to open a slide-over history drawer while viewing or editing a note, browse chronological version snapshots with timestamps and author attribution, inspect full read-only snapshots with an optional word-level inline diff against current state, and safely restore past versions via non-destructive append-only commits.

---

## Current State Analysis

1. **Database & Persistence (`F-01` & `S-03`)**:
   - PostgreSQL table `note_versions` is fully established (`id`, `note_id`, `version`, `title`, `content`, `author_id`, `created_at`) with index `idx_note_versions_note_history (note_id, version DESC)` ([schema.sql:60-75](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/supabase/migrations/20260819000000_create_dashboard_schema.sql#L60-L75)).
   - `create_note_with_version` and `update_note_with_version` RPCs atomically record version snapshots on every creation and edit under optimistic concurrency control ([rpcs.sql:57-134](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/supabase/migrations/20260820000000_create_dashboard_rpcs.sql#L87-L134)).
   - `DatabaseClient.getNoteVersions(note_id)` exists in [`src/lib/supabase.ts:500-515`](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/src/lib/supabase.ts#L500-L515) and [`src/client/db-client.ts:236`](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/src/client/db-client.ts#L236), returning raw `NoteVersion[]`.
2. **Current UI State**:
   - `NoteEditorHeader.tsx` renders a disabled button with ID `#note-history-btn` with tooltip `"Note history coming soon"` ([NoteEditorHeader.tsx:26-47](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/src/app/dashboard/[hash]/note/[noteId]/components/NoteEditorHeader.tsx#L26-L47)).
   - `NoteEditor.tsx` manages client-side form state (`title`, `content`, `isDirty`, `isPending`), wrapping `<EditorToolbar>`, title `<TextField>`, `<LineNumberGutter>`, and `<textarea>`.
3. **What Is Missing**:
   - No Server Action or Zod contract to retrieve version history for a note with resolved author aliases.
   - No UI drawer or modal to display the version timeline.
   - No read-only snapshot preview or inline diffing engine.
   - No "Restore this version" workflow.

---

## Desired End State

1. **Non-Dimming History Drawer**: In `/dashboard/[hash]/note/[noteId]` (edit mode), clicking "Note history" in `NoteEditorHeader` opens a slide-over drawer from the right (responsive width: 380px on desktop, `100vw` on mobile). On desktop ($\ge 600\text{px}$), the drawer uses `variant="persistent"`, eliminating background dimming and keeping the note editor canvas and toolbar active and interactive without modal backdrop obstruction. On mobile ($<600\text{px}$), it uses `variant="temporary"`.
2. **Version Timeline**: The drawer lists:
   - A **Current (vN)** row badged with active status and author.
   - All previous immutable versions chronologically descending (`v(N-1)` down to `v1` via `versions.slice(1)`), displaying version chip, relative timestamp (with absolute date tooltip), author alias (`by Alice` or `"Unnamed collaborator"`), and character delta summary (`+X / -Y`) computed relative to immediate predecessor $v_{K-1}$ (with $v_1$ displaying initial creation length `+${v1.content.length}`).
3. **Popup Version Preview Dialog**:
   - Selecting a historical version opens a popup modal `<Dialog>` (`NoteVersionPreviewDialog`, `maxWidth="md"`, `fullWidth`, `scroll="paper"`, `fullScreen` on mobile) instead of replacing the main note editor canvas.
   - The main note editor canvas in `NoteEditor.tsx` remains permanently mounted, preventing any loss of cursor focus, scroll position, or uncommitted draft edits.
   - **Dialog Header (`DialogTitle`)**:
     - Badge: `Viewing vK (Read-only)`
     - Author attribution & relative timestamp (`by Alice • 2 hours ago`)
     - Menu Controls: **"Show changes" (Inline Diff)** switch toggle, and close 'X' icon button.
     - Mobile only: "Switch version" button to re-open the history drawer.
   - **Dialog Body (`DialogContent`)**:
     - Historical title header displayed as read-only, with a title comparison banner if the title was modified relative to the current draft.
     - When `showDiff === false`: Displays historical content in a read-only preformatted container with synchronized `<LineNumberGutter>`.
     - When `showDiff === true`: Renders word-level additions in accessible dark green (`<ins>` with `#1b5e20` and `rgba(46, 125, 50, 0.15)`) and deletions in dark red with strikethrough (`<del>` with `#b71c1c` and `rgba(211, 47, 47, 0.15)`), formatted via `formatDiffLines` with line gutter numbers and screen reader polite live region announcements.
   - **Dialog Actions (`DialogActions`)**:
     - Diff change summary (`+X chars, -Y chars`).
     - Button: `"Close"` / `"Exit preview"` (variant `outlined`).
     - Button: `"Restore this version"` (variant `contained`, color `primary`), opening confirmation safeguard.
4. **Non-Destructive Restoration**:
   - Clicking "Restore this version" opens a confirmation dialog.
   - If note has unsaved draft changes, prompt warns that uncommitted changes will be replaced.
   - Confirming invokes `updateNoteAction` with `expectedVersion: currentVersion`, appending a new snapshot $v_{N+1}$ with version $K$'s content and title, and triggers `router.refresh()`.
5. **Quality & Coverage**: All tests pass maintaining the strict ≥80% coverage threshold across lines, functions, branches, and statements, with `typecheck` and `lint` green.

---

### Key Discoveries & Architectural Constraints

- **Forward-Only Database Policy** ([lessons.md:7-15](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/context/foundation/lessons.md#L7-L15)): No new database migrations or destructive SQL are permitted. Author resolution (`author_id` -> `user_alias`) must be handled in the Server Action using `listDashboardUsers`, avoiding migration risk.
- **Client-Side Diffing on Edge** ([research.md:266-277](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/context/changes/note-version-history-browser/research.md#L266-L277)): Notes are capped at 10,000 characters. Computing word diffs in browser React state via `diffWordsWithSpace` executes in <5ms, costing 0 Cloudflare Workers edge CPU time and providing instantaneous UI transitions.
- **Strict MUI Only** ([AGENTS.md:7](https://github.com/palucdev/scytala/blob/4feeb6da3d79454a2a40503c6ac6fa9f46624aac/AGENTS.md#L7)): Tailwind is prohibited. All layout and diff styling must use `@mui/material` components and sx styling consistent with the Scytala Papyrus theme.

---

## What We're NOT Doing

- **Line-level authorship annotations (git blame)**: Deferred to a future milestone; schema tracks author per version snapshot, not per individual line.
- **3-way merge conflict resolution**: Deferred to S-05; concurrent edit conflicts continue to use S-03's optimistic lock reload alert.
- **Rich Text / Markdown rendering**: PRD §Non-Goals explicitly constrains notes to plain text.
- **Infinite cursor pagination for versions**: MVP notes have <50 versions; fetching all versions ordered by `version DESC` is performant and avoids pagination complexity.

---

## Implementation Approach

```
[NoteEditorHeader] (Enabled button in edit mode)
         │
         ▼
[NoteEditor] (Card body always retains active draft canvas)
   │     │
   │     ├───────────────────────────────┐
   ▼                                     ▼
[NoteVersionHistoryDrawer]   [NoteVersionPreviewDialog] (MUI Dialog popup)
(Non-dimming persistent sidebar)         │
 - Synthetic Current Row                 ├─ Snapshot view (LineNumberGutter + read-only pre)
 - Historical Version List               ├─ Inline Diff ("Show changes" toggle + ins/del)
 - Author & Time Badges                  └─ "Restore this version" ──► [ConfirmationDialog]
         │                                                             │
         ▼                                                             ▼
[getNoteVersionHistoryAction]                                 [updateNoteAction]
(Auth + cross-tenant guard +                                  (Appends new snapshot vN+1
 in-memory author resolution)                                  with expectedVersion guard)
```

---

## Critical Implementation Details

### 1. Data Contracts (`src/schemas/notes.ts`)

```ts
export interface HydratedNoteVersion {
  id: string;
  note_id: string;
  version: number;
  title: string;
  content: string;
  author_id: string | null;
  author_alias: string;
  created_at: string;
}

export const getNoteVersionHistorySchema = z.object({
  dashboardHash: z.string().trim().min(1, "Dashboard identifier is required"),
  noteId: z.string().uuid("Invalid note ID format"),
});

export type GetNoteVersionHistoryInput = z.infer<
  typeof getNoteVersionHistorySchema
>;

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

### 2. Server Action (`src/actions/notes.ts`)

`getNoteVersionHistoryAction`:

1. Validate input via `getNoteVersionHistorySchema.safeParse`.
2. Verify session via `verifyDashboardSession(dashboardHash, { throwOnRateLimit: true })`.
3. Verify note exists and belongs to `session.dashboard_id`.
4. Concurrently fetch `db.getNoteVersions(noteId)` and `db.listDashboardUsers(session.dashboard_id)`.
5. Map `author_id` to `user_alias` (defaulting to `"Unnamed collaborator"` if null or unmapped).
6. Return `{ success: true, versions }`.

### 3. Diff Engine & Accessibility Helper (`src/lib/diff.ts`)

```ts
import { diffWordsWithSpace, type ChangeObject } from "diff";

export interface WordDiffToken {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export interface DiffLineRow {
  lineNumber?: number;
  type: "normal" | "add" | "delete" | "modify";
  tokens: WordDiffToken[];
}

export function computeNoteWordDiff(
  historicalContent: string,
  currentContent: string,
): WordDiffToken[] {
  return diffWordsWithSpace(historicalContent, currentContent);
}

/**
 * Splits diff tokens across newline boundaries into structured rows with synchronized
 * line numbers for the preview gutter.
 */
export function formatDiffLines(tokens: WordDiffToken[]): DiffLineRow[] {
  const rows: DiffLineRow[] = [];
  let currentTokens: WordDiffToken[] = [];
  let lineNumber = 1;

  const pushRow = (type: DiffLineRow["type"]) => {
    rows.push({
      lineNumber: type === "delete" ? undefined : lineNumber++,
      type,
      tokens: currentTokens,
    });
    currentTokens = [];
  };

  for (const token of tokens) {
    const lines = token.value.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        // Line boundary reached
        const hasAdds = currentTokens.some((t) => t.added);
        const hasDels = currentTokens.some((t) => t.removed);
        const rowType: DiffLineRow["type"] =
          hasAdds && hasDels
            ? "modify"
            : hasAdds
              ? "add"
              : hasDels
                ? "delete"
                : "normal";
        pushRow(rowType);
      }
      if (lines[i].length > 0) {
        currentTokens.push({
          value: lines[i],
          added: token.added,
          removed: token.removed,
        });
      }
    }
  }

  if (currentTokens.length > 0 || rows.length === 0) {
    const hasAdds = currentTokens.some((t) => t.added);
    const hasDels = currentTokens.some((t) => t.removed);
    const rowType: DiffLineRow["type"] =
      hasAdds && hasDels
        ? "modify"
        : hasAdds
          ? "add"
          : hasDels
            ? "delete"
            : "normal";
    pushRow(rowType);
  }

  return rows;
}

export function summarizeDiff(tokens: WordDiffToken[]): {
  addedChars: number;
  removedChars: number;
} {
  let addedChars = 0;
  let removedChars = 0;
  for (const token of tokens) {
    if (token.added) addedChars += token.value.length;
    if (token.removed) removedChars += token.value.length;
  }
  return { addedChars, removedChars };
}
```

#### Accessibility & Contrast Specifications (WCAG 2.1 AA)

- **Added Text (`<ins>`)**:
  - Semantic tag `<ins aria-label={`Added: ${token.value}`}>`
  - Text color: `#1b5e20` (minimum 4.5:1 contrast ratio against papyrus surface)
  - Background color: `rgba(46, 125, 50, 0.15)`
  - Text decoration: none
- **Removed Text (`<del>`)**:
  - Semantic tag `<del aria-label={`Deleted: ${token.value}`}>`
  - Text color: `#b71c1c` (minimum 4.5:1 contrast ratio against papyrus surface)
  - Background color: `rgba(211, 47, 47, 0.15)`
  - Text decoration: `line-through`
- **Diff Summary Announcement**:
  - An `aria-live="polite"` element visually hidden (via MUI `visuallyHidden`) announcing: `"{addedChars} characters added, {removedChars} characters removed"`.

---

### 4. UI Components Architecture & Contracts

#### Component Interfaces

```ts
export interface NoteVersionHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  versions: HydratedNoteVersion[];
  isLoading: boolean;
  error: string | null;
  selectedVersionId: string | null;
  onSelectVersion: (version: HydratedNoteVersion | null) => void;
  currentVersionNumber?: number;
  onRefresh?: () => void;
  isMobile?: boolean;
}

export interface NoteVersionPreviewDialogProps {
  open?: boolean;
  selectedVersion: HydratedNoteVersion | null;
  currentTitle: string;
  currentContent: string;
  onClose: () => void;
  onRestore: (version: HydratedNoteVersion) => void;
  onOpenDrawer?: () => void;
  isRestoring: boolean;
  isDirty?: boolean;
  isMobile?: boolean;
}
```

#### State Ownership in `NoteEditor.tsx`

- `NoteEditor.tsx` owns:
  - `isHistoryOpen: boolean` (toggle drawer)
  - `versions: HydratedNoteVersion[]` (fetched lazily via `getNoteVersionHistoryAction` when history is first opened)
  - `isLoadingVersions: boolean` and `versionHistoryError: string | null`
  - `selectedVersion: HydratedNoteVersion | null` (current historical snapshot previewed, or null if editing active draft)
- Active draft canvas (`TextField` and `<textarea>` with `LineNumberGutter`) remains **permanently mounted** in the `<Card>` body; browsing or previewing versions never unmounts the draft or clears DOM cursor/scroll state.
- Clicking a historical version in `NoteVersionHistoryDrawer` populates `selectedVersion`, opening `<NoteVersionPreviewDialog>` as a modal overlay above the editor canvas.
- Clicking "Current (vN)" in `NoteVersionHistoryDrawer` clears `selectedVersion = null`.

1. **`NoteEditorHeader.tsx`**:
   - Add props: `mode: "create" | "edit"`, `onOpenHistory?: () => void`.
   - When `mode === "edit"`, enable `#note-history-btn`, remove disabled tooltip, and attach `onClick={onOpenHistory}`.
   - When `mode === "create"`, keep disabled with tooltip `"History is available after saving"`.
2. **`NoteVersionHistoryDrawer.tsx`**:
   - Right-side slide-over (`anchor="right"`, responsive width: 380px on desktop, `100vw` on mobile).
   - Uses `variant={isMobile ? "temporary" : "persistent"}`:
     - On desktop ($\ge 600\text{px}$): persistent sidebar without modal backdrop, eliminating background dimming and keeping the background note canvas active and interactive.
     - On mobile ($<600\text{px}$): temporary full-screen drawer that auto-closes on version selection.
   - Header with title "Version History", close button, and refresh indicator.
   - List rendering synthetic `Current (vN)` row followed by historical snapshots.
   - For each historical snapshot $v_K$: displays version badge, author alias, relative timestamp with tooltip, and character delta (`+X / -Y`) computed against predecessor $v_{K-1}$ (with $v_1$ showing `+${v1.content.length}`).
   - Highlights the currently selected version row.
3. **`NoteVersionPreviewDialog.tsx`**:
   - Modal `<Dialog>` (`maxWidth="md"`, `fullWidth`, `scroll="paper"`, `fullScreen={isMobile}`) opening when `selectedVersion !== null`.
   - Dialog Header (`DialogTitle`):
     - Badge: `Viewing vK (Read-only)`
     - Author attribution & relative timestamp (`by Alice • 2 hours ago`)
     - Menu Controls: `"Show changes"` (Inline Diff) switch toggle, and close 'X' icon button (`onClose`).
     - Mobile only: Button `"Switch version"` (`onOpenDrawer`) to re-open the history drawer.
   - Dialog Body (`DialogContent` with `dividers`):
     - Historical title header displayed as read-only (with title diff banner if changed from current draft).
     - When `showDiff === false`: Displays historical content in read-only preformatted container with synchronized `<LineNumberGutter>`.
     - When `showDiff === true`: Displays diff tokens formatted by `formatDiffLines`, rendering synchronized per-line gutter numbers matching diff line rows alongside `<ins>` and `<del>` with WCAG AA contrast colors (`#1b5e20` and `#b71c1c`) and screen reader announcements.
   - Dialog Actions (`DialogActions`):
     - Character delta count (`+X chars, -Y chars`).
     - Button: `"Close"` / `"Exit preview"` (`variant="outlined"`).
     - Button: `"Restore this version"` (`variant="contained"`, `color="primary"`), opening confirmation dialog.
4. **Restore Confirmation Dialog**:
   - Reuses existing `<ConfirmationDialog>`:
     - Title: `Restore Version K?`
     - Description: `This will restore the note's title and content to version K (saved by Alice). A new version (vN+1) will be created. All previous versions will remain in history.${isDirty ? " Any unsaved changes in your current draft will be overwritten." : ""}`
     - Confirm Label: `Restore Version`
     - Confirm Action: Calls `updateNoteAction({ dashboardHash, noteId, title: selectedVersion.title, content: selectedVersion.content, expectedVersion: currentVersion })`.

---

## Implementation Phases

### Phase 1: Dependencies & Validation Schemas

- Install `diff` under `dependencies` and `@types/diff` under `devDependencies` in `package.json`.
- Define `HydratedNoteVersion`, `getNoteVersionHistorySchema`, and `GetNoteVersionHistoryActionResult` in `src/schemas/notes.ts`.
- Export the new schemas and types from `src/schemas/notes.ts`.
- Add unit tests for `getNoteVersionHistorySchema` in `src/__tests__/schemas/notes.test.ts` validating correct inputs, invalid UUIDs, and missing hash requirements.

#### Automated Verification:

- Unit tests in `src/__tests__/schemas/notes.test.ts` pass verifying valid inputs, invalid UUIDs, and missing hash validation.
- TypeScript check (`npm run typecheck`) passes with exports available.

#### Manual Verification:

- None.

## Phase 2: Server Action & Backend Retrieval

- Implement `getNoteVersionHistoryAction` in `src/actions/notes.ts`.
- Enforce session authentication using `verifyDashboardSession` with rate limit handling.
- Verify note existence and cross-tenant dashboard boundary.
- Retrieve version records via `db.getNoteVersions(noteId)` and author aliases via `db.listDashboardUsers(session.dashboard_id)`.
- Map `author_id` to `user_alias` (defaulting to `"Unnamed collaborator"` if null or unmapped).
- Write unit tests in `src/__tests__/actions/notes.test.ts`.

#### Automated Verification:

- Unit tests in `src/__tests__/actions/notes.test.ts` pass verifying successful retrieval, author alias mapping, null author fallback, unauthorized access, and DB error handling.
- Action returns typed `GetNoteVersionHistoryActionResult`.

#### Manual Verification:

- None.

## Phase 3: History Drawer & Header Integration

- Create diff utility helpers in `src/lib/diff.ts`:
  - `computeNoteWordDiff`: word diffing via `diffWordsWithSpace`.
  - `formatDiffLines`: splits tokens across newlines into structured `DiffLineRow[]` with per-line numbering for gutter synchronization.
  - `summarizeDiff`: calculates added/removed character counts.
- Add comprehensive tests for `diff.ts` in `src/__tests__/lib/diff.test.ts` covering single-line, multiline, add/delete/modify row classifications, and empty states.
- Update `NoteEditorHeader.tsx` to receive `mode` and `onOpenHistory` props:
  - In `edit` mode, enable `#note-history-btn` and attach click handler.
  - In `create` mode, keep disabled with tooltip `"History is available after saving"`.
- Build `NoteVersionHistoryDrawer.tsx` implementing `NoteVersionHistoryDrawerProps`:
  - Right-side slide-over (`anchor="right"`, responsive width: 380px on desktop, `100vw` on mobile).
  - Header with title "Version History", close button, and refresh indicator.
  - List rendering synthetic `Current (vN)` row followed by historical snapshots. Clicking `Current (vN)` exits preview mode.
  - For each historical snapshot $v_K$: displays version badge, author alias, relative timestamp with tooltip, and character delta (`+X / -Y`) computed against predecessor $v_{K-1}$ (with $v_1$ showing `+${v1.content.length}`).
  - Highlights the currently previewed version row.
  - On mobile (`<600px`), selecting a version automatically closes the drawer so the snapshot is visible.
- Wire drawer state (`isHistoryOpen`, `versions`, `isLoadingVersions`, `selectedVersion`) into `NoteEditor.tsx`.

#### Automated Verification:

- Unit tests for diff utility (`diff.test.ts`) pass.
- Component tests for `NoteEditorHeader` verify history button enabled in edit mode, disabled in create mode.
- Component tests for `NoteVersionHistoryDrawer` verify version listing, predecessor delta calculation, mobile auto-close callback, and selection events.

#### Manual Verification:

- Open note editor in edit mode, click "Note history", verify slide-over drawer opens showing version timeline.

## Phase 4: Non-Dimming History Drawer & Popup Version Preview Dialog

- Update `NoteVersionHistoryDrawer.tsx` to use responsive variant (`variant={isMobile ? "temporary" : "persistent"}`):
  - On desktop ($\ge 600\text{px}$): persistent sidebar without modal backdrop, eliminating background dimming and keeping the background note canvas active and interactive.
  - On mobile ($<600\text{px}$): temporary full-screen drawer that auto-closes on version selection.
  - Paper styling: elevation 8, left border with divider color, and papyrus-compatible drop shadow.
- Refactor `NoteVersionPreview.tsx` into a modal Dialog (`NoteVersionPreviewDialog`) implementing `NoteVersionPreviewDialogProps`:
  - Opens in a MUI `<Dialog maxWidth="md" fullWidth fullScreen={isMobile} scroll="paper">` when `selectedVersion !== null`.
  - Header (`DialogTitle`): Version badge `Viewing vK (Read-only)`, author attribution, relative timestamp, "Show changes" switch toggle, and close 'X' icon button.
  - Body (`DialogContent dividers`): Title comparison banner (if changed), historical title, and scrollable content area with line numbers and word-level diffing (`<ins>` and `<del>`).
  - Footer (`DialogActions`): Change summary stats, "Close" / "Exit preview" button, and "Restore this version" CTA opening `<ConfirmationDialog>`.
- Update `NoteEditor.tsx`:
  - Keep the active draft `<TextField>` and `<textarea>` canvas permanently mounted in the `<Card>` body (eliminating canvas swapping and `EditorToolbar.isPreview`).
  - Mount `<NoteVersionPreviewDialog>` as a floating modal overlay when `selectedVersion !== null`.
  - Handle restoration flow and conflict detection cleanly.
- Update component and integration tests in `NoteVersionPreview.test.tsx`, `NoteEditor.test.tsx`, and `NoteVersionHistoryDrawer.test.tsx`.

#### Automated Verification:

- Component tests in `NoteVersionHistoryDrawer.test.tsx` verify persistent variant on desktop and temporary variant on mobile.
- Component tests in `NoteVersionPreview.test.tsx` verify popup Dialog rendering, header controls ("Show changes" switch, close button), and restore confirmation.
- Integration tests in `NoteEditor.test.tsx` verify that opening a version opens the popup dialog, active draft textarea remains mounted and unmodified, and restore flow succeeds.
- All test suites pass maintaining ≥80% coverage.

#### Manual Verification:

- Open note editor in edit mode, open "Note history", and verify background is NOT darkened and note editor remains active.
- Click a past version and verify it opens in a popup dialog rather than replacing the note in the main view.
- Toggle "Show changes" inside the popup dialog and verify inline diff highlights.
- Click "Restore this version", confirm, and verify the note updates to $v_{N+1}$.

## Phase 5: Testing, Quality Gates & Verification

- Add component unit tests in `src/__tests__/app/dashboard/note/`:
  - `NoteEditorHeader.test.tsx`: test history button enabled in edit mode, disabled in create mode.
  - `NoteVersionHistoryDrawer.test.tsx`: test drawer opening, version listing, author rendering, selection event.
  - `NoteVersionPreview.test.tsx`: test read-only snapshot display, inline diff toggling, additions and deletions formatting.
  - `NoteEditor.test.tsx`: test end-to-end integration: open history, preview version, restore version, preserve draft.
- Run `npm test` and verify ≥80% coverage across lines, statements, functions, and branches.
- Run `npm run typecheck` and `npm run lint` ensuring clean build.
- Update roadmap entry for `S-04` in `context/foundation/roadmap.md` to indicate implementation complete.

#### Automated Verification:

- `npm test` passes with ≥80% coverage across all 4 metrics.
- `npm run typecheck` passes with 0 errors.
- `npm run lint` passes with 0 warnings or errors.

#### Manual Verification:

- End-to-end sanity check in browser preview of history drawer, preview, diffing, and restore.

---

## Success Criteria & Verification

1. **User Experience Verification**:
   - An authenticated user on `/dashboard/[hash]/note/[noteId]` clicks "Note history" and sees the history drawer slide in with all past versions and current version listed, without darkening the background or disabling the editor.
   - Clicking a past version opens a popup dialog showing its full text content in read-only mode with line numbers.
   - Toggling "Show changes" highlights additions in green and deletions in red with strikethrough.
   - Clicking "Restore this version" presents a confirmation dialog. Confirming commits a new version $v_{N+1}$ and updates the editor.
   - On note creation (`/note/new`), the "Note history" button is disabled.
2. **Data Integrity & Non-Destructive Verification**:
   - Restoring an older version creates a new incremented version in `note_versions` without deleting or modifying any existing historical snapshot.
3. **Automated Test Gate**:
   - `npm test` passes with all test suites green and coverage ≥80% across all 4 metrics.
   - `npm run typecheck` passes with zero errors.
   - `npm run lint` passes with zero warnings or errors.

---

## Open Risks & Assumptions

- **Cloudflare Edge Bundle Size**: Adding `diff` (jsdiff) adds ~6KB gzipped. It contains zero Node.js native dependencies and is 100% Edge-safe.
- **Large Note Diffs**: For notes up to 10,000 characters, word diffing takes <5ms. We run it client-side inside `useMemo` so it never blocks edge requests.
- **Deleted Author Attribution**: If an author user is deleted from the dashboard, foreign key `author_id` becomes `null` (`ON DELETE SET NULL`). The server action handles this cleanly by falling back to `"Unnamed collaborator"`.

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Dependencies & Validation Schemas

#### Automated

- [x] 1.1 Add diff dependencies and export getNoteVersionHistorySchema — 73b2057
- [x] 1.2 Add schema unit tests and verify typecheck — 73b2057

### Phase 2: Server Action & Backend Retrieval

#### Automated

- [x] 2.1 Implement getNoteVersionHistoryAction with session auth and author mapping — 73b2057
- [x] 2.2 Add unit tests for getNoteVersionHistoryAction — 73b2057

### Phase 3: History Drawer & Header Integration

#### Automated

- [x] 3.1 Implement diff utility and NoteEditorHeader mode props — 73b2057
- [x] 3.2 Build NoteVersionHistoryDrawer and wire into NoteEditor — 73b2057

#### Manual

- [x] 3.3 Verify history drawer opens and displays version list in browser — 73b2057

### Phase 4: Non-Dimming History Drawer & Popup Version Preview Dialog

#### Automated

- [x] 4.1 Configure NoteVersionHistoryDrawer with non-dimming persistent desktop variant — 947f856
- [x] 4.2 Refactor NoteVersionPreview into a popup Dialog with header menu options and diff toggle — 947f856
- [x] 4.3 Update NoteEditor to preserve active canvas and mount preview popup overlay — 947f856

#### Manual

- [x] 4.4 Verify non-dimming drawer, popup preview dialog, diff toggle, and restoration flow

### Phase 5: Testing, Quality Gates & Verification

#### Automated

- [x] 5.1 Verify all tests pass with ≥80% coverage threshold
- [x] 5.2 Run typecheck, lint, and update roadmap status

#### Manual

- [x] 5.3 Complete end-to-end verification of history browser
