# Note CRUD and Version Persistence — Implementation Plan

## Overview

Implement the S-03 North Star slice: authenticated users can create, edit, and delete plain text notes on a dashboard, with every edit automatically preserved as an immutable version snapshot in `note_versions`. This slice wires the existing database layer (RPCs, adapter methods) to new Server Actions behind Zod validation and session guards, then builds a full-page plain text editor at `/dashboard/<hash>/note/<noteId>` with line numbers and a delete confirmation dialog requiring password re-authentication.

## Current State Analysis

The database layer for notes is **fully built** — tables (`notes`, `note_versions`), atomic RPCs (`create_note_with_version`, `update_note_with_version` with optimistic concurrency), RLS policies (service_role only), and the complete `DatabaseClient` adapter with 6 note methods (`createNote`, `updateNote`, `deleteNote`, `getNoteById`, `getNotesByDashboard`, `getNoteVersions`) are all implemented and tested.

The UI layer is **read-only** — `DashboardView` renders `NoteGrid` → `NoteTile` via pure SSR prop drilling. The `EmptyNotesState` component has a disabled "New Note" button with tooltip `"Note creation coming in S-03"`. No MUI Dialogs, no client-side mutation state, and no React contexts exist beyond the root theme provider.

The **missing middle** is: (1) Zod validation schemas for note inputs, (2) authenticated Server Actions, and (3) interactive UI components for create/edit/delete flows.

### Key Discoveries:

- Database RPCs already handle atomic note+version creation and optimistic concurrency — [`create_note_with_version`](../../../supabase/migrations/20260820000000_create_dashboard_rpcs.sql#L56-L84) and [`update_note_with_version`](../../../supabase/migrations/20260820000000_create_dashboard_rpcs.sql#L86-L134)
- Session verification pattern is duplicated inline in [`src/app/dashboard/[hash]/page.tsx:62-73`](../../../src/app/dashboard/%5Bhash%5D/page.tsx#L62-L73) — extracting a reusable auth guard helper will reduce duplication across the note editor page and Server Actions
- No `layout.tsx` exists under `dashboard/[hash]/` — the new note route inherits only the root layout and must perform its own auth check
- The `author_id` column in `note_versions` references `dashboard_users(id)` — the session's `user_id` maps directly to this FK, enabling authorship tracking per version
- `NoteTile` already displays `"Untitled Note"` for empty titles via [`displayTitle = note.title?.trim() || "Untitled Note"`](../../../src/app/dashboard/%5Bhash%5D/components/NoteTile.tsx#L17) — title-optional behavior is consistent from DB to UI
- Server Action pattern established in [`src/actions/auth.ts`](../../../src/actions/auth.ts) and [`src/actions/dashboard.ts`](../../../src/actions/dashboard.ts): `"use server"` → Zod `safeParse` → rate limiting → `createDatabaseClient()` → domain call → structured error with `{ success, error, fieldErrors }` discriminated union
- [`LoginForm`](../../../src/app/dashboard/%5Bhash%5D/components/LoginForm.tsx) uses `useTransition` + `startTransition` for Server Action calls with `router.refresh()` on success — this is the established client mutation pattern

## Desired End State

After this plan is complete:

1. An authenticated user on a dashboard can click the "New Note" button, navigate to a full-page plain text editor at `/dashboard/<hash>/note/new`, type content with an optional title, and save — creating the note atomically with its version 1 snapshot.
2. An authenticated user can click any note tile on the dashboard, navigate to `/dashboard/<hash>/note/<noteId>`, edit the content in a line-numbered plain text editor, and save — creating a new immutable version snapshot under optimistic concurrency control.
3. An authenticated user on the editor page can delete the note via a confirmation dialog that requires re-entering their password — cascading deletion of all version history.
4. On version conflict (another user edited the note since it was loaded), the editor displays an error alert with a "Reload" action to re-fetch the latest version. Full 3-way merge is deferred to S-05.
5. After any mutation (create/edit/delete), the user is navigated back to the dashboard which displays the fresh state.
6. All new code maintains the 80% coverage threshold with Zod schema tests, Server Action tests, and component tests following established patterns.

**Verification**: Navigate to a dashboard with notes, create a new note, edit it, verify version increments in the tile badge, delete it with password confirmation, and confirm the note disappears. Check Supabase `note_versions` table to verify immutable history snapshots exist for every edit.

## What We're NOT Doing

- **Rich text / Markdown editing** — PRD §Non-Goals: plain text only for MVP. The editor is a `<textarea>` with line numbers, not a code editor (CodeMirror/Monaco).
- **Per-line authorship annotations** — The `note_versions` schema tracks `author_id` per whole-note snapshot, not per line. Git-blame-style annotations require line-level diff storage not present in the current schema. Deferred to a future slice.
- **3-way merge conflict resolution** — S-05 scope. S-03 shows an error alert with "Reload" on version conflict.
- **Real-time sync / WebSocket push** — PRD §Non-Goals: manual sync only.
- **Note reordering / pinning / categorization** — Not in PRD scope.
- **Rate limiting on note mutations** — Originally scheduled for T-03, note mutation rate limiting (`noteMutation`: 30 req/min) was pulled forward into S-03 as a security addendum to protect Server Actions against script abuse.

## Implementation Approach

Build bottom-up through 6 phases: (1) Zod schemas and a shared auth guard helper, (2) three authenticated Server Actions wired to the existing `DatabaseClient`, (3) the full-page note editor route with line-numbered textarea, (4) delete confirmation dialog with password re-authentication, (5) dashboard integration (enable buttons, make tiles clickable), and (6) comprehensive tests.

The mutation strategy is **optimistic UI with local state**: the editor manages its own state, calls Server Actions directly, and on success navigates back to the dashboard via `router.push()` + `router.refresh()` which triggers a full SSR re-render with fresh data. On failure, the editor stays open and displays the error. This leverages the existing `useTransition` + Server Action pattern from `LoginForm`.

## Critical Implementation Details

**Version conflict handling**: The `update_note_with_version` RPC raises `RAISE EXCEPTION 'Version mismatch or note not found (expected version %)'` when `WHERE id = p_note_id AND version = p_expected_version` matches zero rows. The `SupabaseDatabaseClient.updateNote` translates this to a thrown `Error` with the RPC message. The `updateNoteAction` must catch this specific error pattern and return a typed `{ success: false, error: "...", versionConflict: true }` discriminant so the editor can distinguish version conflicts from generic errors and show the appropriate "Reload" UI.

**Delete re-authentication**: The `deleteNoteAction` accepts the user's password, looks up their `password_hash` from `dashboard_users` via `db.getDashboardUserByAlias(session.dashboard_id, session.user_alias)`, and calls `verifyPassword(password, user.password_hash)` before proceeding. This reuses the existing PBKDF2 verification from the auth flow and ensures only the authenticated user (not a stolen session) can cascade-delete note history.

**Edge-Only Session Verification Rate Limiting (Resource Inversion Avoidance)**: Protecting `verifyDashboardSession` against WebCrypto CPU exhaustion must be enforced strictly at the Cloudflare Worker edge (via native `SESSION_VERIFY_LIMITER` binding or in-memory sliding window). It must **never** invoke the Supabase PostgreSQL Token Bucket RPC (`check_rate_limit`) on unauthenticated traffic or verification failures. Calling database transactions with row-level `FOR UPDATE` locks on untrusted or failed requests introduces an asymmetric Resource Inversion / Secondary DoS vulnerability that can exhaust database connection pools and cause system-wide outages. Supabase RPC rate limiting remains reserved strictly for authenticated, high-cost operations (`noteMutation`).

---

## Phase 1: Zod Schemas & Auth Guard Helper

### Overview

Define Zod validation schemas for note CRUD inputs and extract the repeated session cookie verification pattern into a reusable helper function.

### Changes Required:

#### 1. Note Validation Schemas

**File**: `src/schemas/notes.ts`

**Intent**: Define three Zod schemas (`createNoteSchema`, `updateNoteSchema`, `deleteNoteSchema`) that validate Server Action inputs. These schemas enforce content length limits, title constraints, version number format (for update), and password presence (for delete). They follow the same pattern as `src/schemas/dashboard.ts` and `src/schemas/auth.ts`.

**Contract**:
- `createNoteSchema`: validates `{ dashboardHash: string, content: string (1–10000 chars), title?: string (0–200 chars) }`
- `updateNoteSchema`: validates `{ dashboardHash: string, noteId: string (UUID), content: string (1–10000 chars), title?: string (0–200 chars), expectedVersion: number (positive integer) }`
- `deleteNoteSchema`: validates `{ dashboardHash: string, noteId: string (UUID), password: string (1–128 chars) }`
- Export discriminated union result types: `CreateNoteActionResult`, `UpdateNoteActionResult`, `DeleteNoteActionResult` following the `{ success: true, ... } | { success: false, error, fieldErrors?, ... }` pattern from `CreateDashboardActionResult`
- `UpdateNoteActionResult` adds a `versionConflict?: boolean` discriminant to the failure case

#### 2. Shared Auth Guard Helper

**File**: `src/lib/auth-guard.ts`

**Intent**: Extract the cookie-reading + JWT verification + dashboard_id/hash matching logic currently inline in `src/app/dashboard/[hash]/page.tsx:62-73` into a reusable async function. Both the note editor page and the note Server Actions need to verify the session belongs to the target dashboard.

**Contract**:
- `verifyDashboardSession(dashboardHash: string): Promise<VerifiedSessionPayload | null>` — reads cookies, tries scoped then fallback cookie name, verifies JWT, checks `dashboard_hash` match, returns payload or `null`
- For Server Actions that also need `dashboard_id` validation (the session stores both `dashboard_id` and `dashboard_hash`), the returned `VerifiedSessionPayload` already contains both fields

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Schemas parse valid inputs and reject boundary cases (verified via tests in Phase 6)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Note Server Actions

### Overview

Create three authenticated Server Actions (`createNoteAction`, `updateNoteAction`, `deleteNoteAction`) that validate input via Zod, verify the session, call `DatabaseClient` methods, and return typed results. Delete requires password re-authentication.

### Changes Required:

#### 1. Note Actions Module

**File**: `src/actions/notes.ts`

**Intent**: Implement three `"use server"` exported async functions following the established action pattern from `src/actions/auth.ts`. Each action: (1) Zod-validates input, (2) verifies dashboard session via `verifyDashboardSession`, (3) calls the appropriate `DatabaseClient` method, (4) returns a typed discriminated union result. The logger child uses `{ module: "notes" }`.

**Contract**:
- `createNoteAction(input: CreateNoteInput): Promise<CreateNoteActionResult>` — calls `db.createNote({ dashboard_id: session.dashboard_id, title, content, author_id: session.user_id })`, returns `{ success: true, note }` on success
- `updateNoteAction(input: UpdateNoteInput): Promise<UpdateNoteActionResult>` — calls `db.updateNote(...)`, catches version mismatch errors and returns `{ success: false, versionConflict: true, error: "..." }`, also verifies the note belongs to the session's dashboard via `db.getNoteById` before updating
- `deleteNoteAction(input: DeleteNoteInput): Promise<DeleteNoteActionResult>` — verifies password against stored hash via `db.getDashboardUserByAlias(session.dashboard_id, session.user_alias)` + `verifyPassword(password, user.password_hash)`, then calls `db.deleteNote(noteId)` after confirming the note belongs to the session's dashboard
- All three actions verify note ownership by checking `note.dashboard_id === session.dashboard_id` to prevent cross-dashboard mutation
- Error messages are sanitized (no database internals leaked to client)

#### 2. Note Mutation Rate Limiting (Addendum)

**Files**: `src/actions/notes.ts`, `src/lib/rate-limit.ts`, `src/schemas/notes.ts`

**Intent**: Protect `createNoteAction` and `updateNoteAction` from automated abuse by enforcing a 30 ops/min rate limit per `dashboard_id:user_id` pair. Returns typed `{ success: false, rateLimited: true, retryAfterSeconds }` on throttle.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Actions callable from a test client component (verified via tests in Phase 6)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Note Editor Route & Components

### Overview

Build the full-page note editor at `/dashboard/<hash>/note/<noteId>` as a Next.js App Router page. The SSR page verifies auth and fetches the note (or creates a blank state for `noteId === "new"`). The client component renders a line-numbered plain text `<textarea>` with a toolbar containing Save, Cancel (back to dashboard), and Delete actions. Optimistic local state with `useTransition` for Server Action calls.

### Changes Required:

#### 1. Note Editor SSR Page

**File**: `src/app/dashboard/[hash]/note/[noteId]/page.tsx`

**Intent**: Async Server Component that resolves both `hash` and `noteId` params, verifies the dashboard exists, authenticates the session (via `verifyDashboardSession`), and either fetches the note (edit mode) or passes empty initial state (create mode, `noteId === "new"`). Returns `notFound()` for invalid hash, redirects to login for unauthenticated users, and verifies note ownership (`note.dashboard_id === dashboard.id`).

**Contract**:
- `export const dynamic = "force-dynamic"`
- Props: `{ params: Promise<{ hash: string; noteId: string }> }`
- Create mode: `noteId === "new"` → render `NoteEditor` with `mode="create"`, empty content, no version
- Edit mode: `noteId` is UUID → `db.getNoteById(noteId)` → render `NoteEditor` with `mode="edit"`, populated content, current version
- Passes `dashboardHash` and `userAlias` to the client component (`authorId` omitted from props for security; Server Actions extract `author_id` directly from verified session cookie)

#### 2. Note Editor Client Component

**File**: `src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx`

**Intent**: `"use client"` component that renders the full-page editor UI. Manages local state for `title` and `content` fields. The content area is a MUI-styled `<textarea>` with CSS-based line numbers rendered via a side gutter (a `<Box>` with line count derived from content split by `\n`). Toolbar contains: Back/Cancel button (navigates to `/dashboard/<hash>`), Save button (calls `createNoteAction` or `updateNoteAction` via `useTransition`), and Delete button (opens delete dialog, Phase 4). Displays version conflict errors inline with a "Reload" action.

**Contract**:
- Props: `{ mode: "create" | "edit", dashboardHash: string, noteId?: string, initialTitle?: string, initialContent?: string, initialVersion?: number, userAlias: string }` (`authorId` resolved server-side in Server Actions to prevent client authorship spoofing)
- Save flow: `startTransition(async () => { ... })` → on success, `router.push(\`/dashboard/${dashboardHash}\`)` + `router.refresh()`
- Version conflict: detects `result.versionConflict === true`, shows MUI `Alert` with `severity="warning"` and a "Reload" `Button` that calls `router.refresh()`
- Unsaved changes: tracks `isDirty` state (content or title changed from initial values)
- Loading state: `isPending` from `useTransition` disables Save button and shows `CircularProgress`

#### 3. Line Number Gutter Component

**File**: `src/app/dashboard/[hash]/note/[noteId]/components/LineNumberGutter.tsx`

**Intent**: `"use client"` presentational component that renders line numbers alongside the textarea. Takes the content string, splits by newlines, and renders numbered lines in a fixed-width gutter `<Box>` with `monospace` font, matching the textarea's `lineHeight` and `fontSize` for vertical alignment.

**Contract**:
- Props: `{ content: string, lineHeight?: number, fontSize?: string }`
- Renders a `<Box>` with `Typography` for each line number, styled to align with the adjacent textarea
- Uses `color: "text.disabled"` and `userSelect: "none"` for the gutter

#### 4. Editor Toolbar Component

**File**: `src/app/dashboard/[hash]/note/[noteId]/components/EditorToolbar.tsx`

**Intent**: `"use client"` component rendering the editor's top toolbar with Back/Cancel, note title display (or "New Note"), version badge (edit mode), and action buttons (Save, Delete).

**Contract**:
- Props: `{ mode: "create" | "edit", noteTitle: string, version?: number, dashboardHash: string, isSaving: boolean, isDirty: boolean, onSave: () => void, onDelete: () => void }`
- Back button: `Link` to `/dashboard/${dashboardHash}` (or `router.push` if dirty, with unsaved changes warning)
- Save button: disabled when `!isDirty || isSaving`
- Delete button: hidden in create mode, shows in edit mode

#### 5. Barrel Export

**File**: `src/app/dashboard/[hash]/note/[noteId]/components/index.ts`

**Intent**: Barrel export for the note editor components.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Navigate to `/dashboard/<hash>/note/new` while authenticated — editor renders with empty state and line numbers
- Navigate to `/dashboard/<hash>/note/<noteId>` while authenticated — editor populates with existing note content
- Unauthenticated navigation shows login form
- Save creates/updates the note and navigates back to dashboard

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Delete Confirmation Dialog

### Overview

Build a MUI `<Dialog>` component for note deletion that requires the user to re-enter their password before confirming. This is the first dialog in the codebase and establishes the pattern for future modals.

### Changes Required:

#### 1. Delete Note Dialog Component

**File**: `src/app/dashboard/[hash]/note/[noteId]/components/DeleteNoteDialog.tsx`

**Intent**: `"use client"` MUI `<Dialog>` that displays the note title being deleted, a password `<TextField>`, and Confirm/Cancel buttons. On confirm, calls `deleteNoteAction` with the password. On success, navigates back to the dashboard. On password verification failure, shows inline error. Uses `useTransition` for the async action.

**Contract**:
- Props: `{ open: boolean, onClose: () => void, dashboardHash: string, noteId: string, noteTitle: string }`
- Dialog content: warning text with the note title, password `TextField` (type `password`), error `Alert` for failed password
- Confirm button: `color="error"`, disabled when password is empty or `isPending`
- On success: `router.push(\`/dashboard/${dashboardHash}\`)` + `router.refresh()`
- On close/cancel: clears password and error state

#### 2. Wire Dialog into NoteEditor

**File**: `src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx` (modification)

**Intent**: Add `useState<boolean>` for `deleteDialogOpen`, pass the toggle to `EditorToolbar`'s `onDelete` prop, and render `<DeleteNoteDialog>` conditionally.

#### 3. Cross-View Button & Icon Sizing Alignment (Addendum)

**Files**: `src/app/dashboard/[hash]/components/DashboardHeader.tsx`, `src/app/dashboard/[hash]/components/LogoutButton.tsx`, `src/app/dashboard/[hash]/note/[noteId]/components/EditorToolbar.tsx`

**Intent**: Standardize button and icon sizes across the dashboard and editor views by aligning from `size="small"` to default `size="medium"` and removing explicit small font size overrides on icons.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Click Delete on an existing note → dialog opens with note title and password field
- Enter wrong password → inline error message
- Enter correct password → note deleted, navigated to dashboard, note gone from tile grid
- Press Cancel or Escape → dialog closes, no deletion

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Dashboard Integration

### Overview

Enable the "New Note" button, make note tiles clickable, and ensure the dashboard reflects fresh state after mutations.

### Changes Required:

#### 1. Enable "New Note" Button in EmptyNotesState

**File**: `src/app/dashboard/[hash]/components/EmptyNotesState.tsx`

**Intent**: Remove the `disabled` prop and the `Tooltip` wrapper from the "New Note" button. Make it a `Link` (or wrap in `Link`) navigating to `/dashboard/<hash>/note/new`. The component needs to receive `dashboardHash` as a prop.

**Contract**:
- New prop: `dashboardHash: string`
- Button becomes an enabled MUI `Button` wrapped in (or rendered as) a Next.js `Link` to `/dashboard/${dashboardHash}/note/new`
- Remove the `"Note creation coming in S-03"` tooltip

#### 2. Add "New Note" Button to DashboardHeader

**File**: `src/app/dashboard/[hash]/components/DashboardHeader.tsx`

**Intent**: Add a "+ New Note" button in the header toolbar (alongside the Sync and Logout buttons) so users can create notes even when the dashboard already has notes.

**Contract**:
- Renders a MUI `Button` with `AddIcon` startIcon, navigating to `/dashboard/${dashboardHash}/note/new`
- Positioned before the Sync button in the toolbar `Stack`

#### 3. Make NoteTile Clickable

**File**: `src/app/dashboard/[hash]/components/NoteTile.tsx`

**Intent**: Wrap the `Card` in a Next.js `Link` (or use `CardActionArea`) to navigate to `/dashboard/<hash>/note/<noteId>` on click. The tile becomes the entry point for editing.

**Contract**:
- New prop: `dashboardHash: string`
- The entire card is clickable, navigating to `/dashboard/${dashboardHash}/note/${note.id}`
- Hover state already exists via the `Card`'s `sx` transition — add `cursor: "pointer"` and ensure focus/keyboard accessibility

#### 4. Pass dashboardHash Through Component Tree

**File**: `src/app/dashboard/[hash]/components/DashboardView.tsx` and `src/app/dashboard/[hash]/components/NoteGrid.tsx`

**Intent**: Thread `dashboardHash` through `DashboardView` → `NoteGrid` → `NoteTile` and `DashboardView` → `EmptyNotesState` so the link targets can be constructed.

**Contract**:
- `DashboardViewProps` already has `dashboardHash?: string` — make it required (non-optional)
- `NoteGridProps` adds `dashboardHash: string`
- `NoteTileProps` adds `dashboardHash: string`
- `EmptyNotesState` adds `dashboardHash: string` prop

#### 5. Update Barrel Exports

**File**: `src/app/dashboard/[hash]/components/index.ts`

**Intent**: Add any new exports if needed (likely just type updates since components are already exported).

#### 6. Dashboard Header Layout Evolution & Speculative Action Buttons (Addendum)

**File**: `src/app/dashboard/[hash]/components/DashboardHeader.tsx`

**Intent**: Rather than placing "+ New Note" inline in the top toolbar stack, expand the header with a dedicated "Dashboard Actions" container panel (Layer 3) featuring "Create note" alongside disabled speculative placeholders for future content types ("Add Directory", "Add File", "Add Image", "Add Survey") and a "Dashboard settings" placeholder in Layer 1.

**Contract**:
- "Create note" button uses `NoteIcon` and navigates to `/dashboard/${dashboardHash}/note/new`
- Disabled action placeholders establish layout structure for future slices

#### 7. Note Editor Header & Confirmation Dialog Additions (Addendum)

**Files**: `src/app/dashboard/[hash]/note/[noteId]/components/NoteEditorHeader.tsx`, `src/components/ConfirmationDialog.tsx`, `src/app/dashboard/[hash]/note/[noteId]/components/EditorToolbar.tsx`

**Intent**: Add a dedicated `NoteEditorHeader` displaying the authenticated user's alias nameplate, placeholder action buttons ("Note history", "Contributors"), and logout. Replace browser `window.confirm` with an accessible `ConfirmationDialog` modal in `EditorToolbar` for confirming departure when unsaved edits exist.

**Contract**:
- `NoteEditorHeader` renders user alias chip, disabled action buttons, and `LogoutButton`
- `ConfirmationDialog` provides an accessible modal prompt for discarding unsaved changes

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- On a dashboard with notes: each tile is clickable and navigates to the editor
- On an empty dashboard: "New Note" button navigates to `/dashboard/<hash>/note/new`
- On a dashboard with notes: header "New Note" button navigates to create editor
- After creating a note: dashboard shows the new tile
- After editing a note: dashboard shows updated content/timestamp/version
- After deleting a note: dashboard no longer shows the tile

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: Tests

### Overview

Write comprehensive tests for all new code: Zod schemas, Server Actions, auth guard helper, editor components, and updated dashboard components. Maintain the 80% coverage threshold.

### Changes Required:

#### 1. Auth Guard Helper Tests

**File**: `src/__tests__/lib/auth-guard.test.ts`

**Intent**: Test `verifyDashboardSession` with valid session, invalid token, expired token, mismatched dashboard hash, missing cookie, and scoped vs fallback cookie resolution. Mock `next/headers` cookies and `verifySessionToken`.

#### 2. Note Schema Tests

**File**: `src/__tests__/schemas/notes.test.ts`

**Intent**: Test all three Zod schemas with valid inputs, boundary values (min/max content length, empty title, missing fields), and invalid inputs (negative version, empty content, oversized content).

#### 3. Note Server Action Tests

**File**: `src/__tests__/actions/notes.test.ts`

**Intent**: Test `createNoteAction`, `updateNoteAction`, `deleteNoteAction` following the established pattern in `src/__tests__/actions/auth.test.ts`. Mock `createDatabaseClient`, `verifyDashboardSession`, `verifyPassword`. Test: successful operations, validation failures, unauthorized access, cross-dashboard ownership rejection, version conflict detection (for update), password verification failure (for delete), and exception handling.

#### 4. Note Editor Component Tests

**File**: `src/__tests__/app/dashboard/note/NoteEditor.test.tsx`

**Intent**: Test the NoteEditor component in both create and edit modes. Verify: title and content fields render, line numbers update with content, save button calls the correct action, version conflict alert displays, loading state during save, dirty state tracking. Use `renderWithTheme` pattern. Mock `next/navigation` router and Server Actions.

#### 5. Delete Dialog Component Tests

**File**: `src/__tests__/app/dashboard/note/DeleteNoteDialog.test.tsx`

**Intent**: Test the DeleteNoteDialog component. Verify: dialog opens/closes, password field renders, confirm disabled when password empty, successful delete navigates, failed password shows error, cancel clears state.

#### 6. Updated Dashboard Component Tests

**File**: `src/__tests__/app/dashboard/components/DashboardComponents.test.tsx` (modifications)

**Intent**: Update existing dashboard component tests to verify: "New Note" button is enabled and links correctly in EmptyNotesState, NoteTile is clickable and links to the editor route, DashboardHeader contains the "+ New Note" button, `dashboardHash` prop is threaded through component tree.

#### 7. Updated Dashboard Page Tests

**File**: `src/__tests__/app/dashboard/page.test.tsx` (modifications)

**Intent**: Update existing page test to verify the `dashboardHash` prop is passed to `DashboardView`. Verify the page still correctly handles unauthenticated and authenticated flows.

### Success Criteria:

#### Automated Verification:

- All tests pass: `npm run test`
- Coverage threshold met: 80% across lines, functions, branches, statements
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Full end-to-end flow works: create dashboard → log in → create note → edit note → verify version badge increments → delete note with password → confirm note is gone

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 7: Session Verification Edge Rate Limiting & Resource Inversion Defense (Addendum)

### Overview

Harden the dashboard session verification entry point (`verifyDashboardSession`) and Server Actions against cryptographic DoS / CPU exhaustion without introducing a secondary database denial-of-service vulnerability.

The defense is implemented strictly at the Cloudflare Worker edge using native rate limiting (`SESSION_VERIFY_LIMITER`) and an in-memory sliding window fallback. Under no circumstances does unauthenticated traffic or verification failure trigger the Supabase PostgreSQL Token Bucket RPC, preserving database connections and row locks.

### Changes Required:

#### 1. Cloudflare Native Rate Limiter Binding Configuration

**File**: `wrangler.jsonc`

**Intent**: Add a dedicated rate-limiting namespace binding `SESSION_VERIFY_LIMITER` to `wrangler.jsonc` for session verification throttling at the Cloudflare edge.

**Contract**:
- Name: `SESSION_VERIFY_LIMITER`
- Namespace ID: `"1002"`
- Simple limit: `limit: 60`, `period: 60` (60 requests per 60 seconds per Cloudflare PoP)

#### 2. Rate Limiting Abstraction & Configuration Extension

**File**: `src/lib/rate-limit.ts`

**Intent**: Add `sessionVerifyIp` to `RateLimiterType` and `RATE_LIMIT_CONFIGS`. Extend `checkRateLimit` to support `sessionVerifyIp` through the `SESSION_VERIFY_LIMITER` Cloudflare binding when present, falling back to `inMemoryStore` with zero database round-trips.

**Contract**:
- `RateLimiterType`: includes `"sessionVerifyIp"`
- `RATE_LIMIT_CONFIGS`: `sessionVerifyIp: { max: 60, windowMs: 60 * 1000, refillRate: 60 / 60 }`
- In Cloudflare environment: calls `cfEnv.SESSION_VERIFY_LIMITER.limit({ key: identifier })`
- Fallback: calls `inMemoryStore.limit(\`sessionVerifyIp:\${identifier}\`, 60, 60000)`
- Explicit architectural guarantee: never calls `db.checkRateLimit` for `sessionVerifyIp`

#### 3. Hardened `verifyDashboardSession` & `SessionRateLimitError`

**File**: `src/lib/auth-guard.ts`

**Intent**: Perform pre-verification rate limiting on client IP before reading cookies or executing WebCrypto operations. If throttled, throw `SessionRateLimitError` (when requested) or return `null`. If cookie verification fails (invalid token, tampered signature, expired session, hash mismatch), immediately return `null` without invoking any database write or RPC.

**Contract**:
- Export `SessionRateLimitError extends Error`: contains `retryAfterSeconds: number`
- `VerifyDashboardSessionOptions`: `{ throwOnRateLimit?: boolean }`
- Signature: `verifyDashboardSession(dashboardHash: string, options?: VerifyDashboardSessionOptions): Promise<VerifiedSessionPayload | null>`
- Pre-check: `const clientIp = await getClientIp()`; `const rateCheck = await checkRateLimit("sessionVerifyIp", clientIp)`
- If rate limited and `throwOnRateLimit === true`: throws `new SessionRateLimitError(rateCheck.retryAfterSeconds)`
- If rate limited and `throwOnRateLimit` is falsy: returns `null`
- On token failure: return `null` immediately (no DB calls)

#### 4. Server Actions Rate Limit Handling

**File**: `src/actions/notes.ts`

**Intent**: Update `createNoteAction`, `updateNoteAction`, and `deleteNoteAction` to call `verifyDashboardSession(dashboardHash, { throwOnRateLimit: true })` and handle `SessionRateLimitError`. Return standard `{ success: false, error: string, rateLimited: true, retryAfterSeconds: number }` on throttle.

**Contract**:
- When `SessionRateLimitError` is caught in any note Server Action:
  - Log warning with `clientIp` and `retryAfterSeconds`
  - Return `{ success: false, error: \`Too many session attempts. Please try again in \${error.retryAfterSeconds} seconds.\`, rateLimited: true, retryAfterSeconds: error.retryAfterSeconds }`
- Ensures an unauthenticated flood targeting `createNoteAction` or `updateNoteAction` is stopped at the IP rate limit before executing WebCrypto or attempting database queries.

#### 5. Dashboard Pages Graceful Handling

**Files**: `src/app/dashboard/[hash]/page.tsx`, `src/app/dashboard/[hash]/note/[noteId]/page.tsx`

**Intent**: Catch `SessionRateLimitError` in Server Component page renders to display an explicit rate-limit alert or HTTP 429 response rather than misinterpreting throttling as an unauthenticated state (which would display `<LoginForm />` and lead to user confusion or login retry loops).

#### 6. Unit & Integration Tests

**Files**: `src/__tests__/lib/auth-guard.test.ts`, `src/__tests__/lib/rate-limit.test.ts`, `src/__tests__/actions/notes.test.ts`

**Intent**: Comprehensive tests verifying:
- `checkRateLimit("sessionVerifyIp", ...)` works via Cloudflare binding and in-memory store
- `verifyDashboardSession` throttles after burst requests and throws `SessionRateLimitError` when `throwOnRateLimit: true`
- Verification failures do NOT trigger `db.checkRateLimit` (verifying absence of DB Resource Inversion)
- Note Server Actions catch `SessionRateLimitError` and return formatted `{ rateLimited: true, retryAfterSeconds }`

### Success Criteria:

#### Automated Verification:

- All tests pass: `npm run test`
- Coverage threshold met: ≥ 80% across all metrics
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`

#### Manual Verification:

- Rapid bursts of requests to `/dashboard/[hash]` or note actions trigger the edge rate limiter with HTTP 429 / structured error.
- Verified absence of database queries or connection spikes during session verification load tests.
- Legitimate users with valid cookies continue uninterrupted.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Zod schema validation for all three note schemas (boundary values, rejection cases)
- Auth guard helper (cookie resolution, JWT verification, hash matching)
- Server Action logic (input validation, session checks, DB calls, error translation)
- Line number gutter rendering (correct count, alignment)
- Delete dialog state management (open/close, password, error)

### Integration Tests:

- Note editor page SSR (auth flow, note fetch, create vs edit mode selection)
- Full component tree rendering (DashboardView → NoteGrid → NoteTile with clickable links)
- Server Action → DatabaseClient call chain (with mocked DB)

### Manual Testing Steps:

1. Create a new dashboard with two participants
2. Log in as participant A, create a note with title and content
3. Verify note appears on dashboard tile grid with `v1` badge
4. Click the note tile, verify editor loads with populated content and line numbers
5. Edit the note content, save — verify tile shows `v2` badge and updated timestamp
6. Click the note tile again, click Delete, enter wrong password — verify error
7. Enter correct password — verify note is deleted and dashboard shows empty state or remaining notes
8. Log in as participant B, create a note, verify it appears
9. Check Supabase `note_versions` table — verify immutable version snapshots exist for every edit
10. Navigate to `/dashboard/<hash>/note/nonexistent-uuid` — verify 404

## Performance Considerations

- Note content is limited to 10,000 characters via Zod schema — prevents payload bloat on create/update
- `getNoteById` uses `.maybeSingle()` which is indexed by primary key UUID — O(1) lookup
- Line number gutter derives line count from `content.split('\n').length` — O(n) on content length, negligible for 10K char limit
- `force-dynamic` on the editor page ensures fresh data on every load — no stale cache issues

## References

- PRD: `context/foundation/prd.md` — US-03, FR-006, FR-007, FR-008, FR-011
- Roadmap: `context/foundation/roadmap.md` — S-03 (North Star)
- Existing action patterns: [`src/actions/auth.ts`](../../../src/actions/auth.ts), [`src/actions/dashboard.ts`](../../../src/actions/dashboard.ts)
- Database RPCs: [`supabase/migrations/20260820000000_create_dashboard_rpcs.sql`](../../../supabase/migrations/20260820000000_create_dashboard_rpcs.sql)
- DatabaseClient interface: [`src/client/db-client.ts`](../../../src/client/db-client.ts)
- UI components: [`src/app/dashboard/[hash]/components/`](../../../src/app/dashboard/%5Bhash%5D/components)
- Test patterns: [`src/__tests__/actions/auth.test.ts`](../../../src/__tests__/actions/auth.test.ts)
- Security finding: [`context/changes/note-crud-and-version-persistence/reviews/security-finding-session-verification-rate-limiting.md`](reviews/security-finding-session-verification-rate-limiting.md) — session verification rate limiting and Resource Inversion defense
- Lessons learned: `context/foundation/lessons.md` — forward-only migrations rule

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Zod Schemas & Auth Guard Helper

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck`
- [x] 1.2 Linting passes: `npm run lint`

#### Manual

- [x] 1.3 Schemas parse valid inputs and reject boundary cases

### Phase 2: Note Server Actions

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck`
- [x] 2.2 Linting passes: `npm run lint`

#### Manual

- [x] 2.3 Actions callable from a test client component — 1f735f5

### Phase 3: Note Editor Route & Components

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck` — 371b704
- [x] 3.2 Linting passes: `npm run lint` — 371b704

#### Manual

- [x] 3.3 Navigate to `/dashboard/<hash>/note/new` — editor renders with empty state and line numbers — 371b704
- [x] 3.4 Navigate to `/dashboard/<hash>/note/<noteId>` — editor populates with existing note content — 371b704
- [x] 3.5 Unauthenticated navigation shows login form — 371b704
- [x] 3.6 Save creates/updates the note and navigates back to dashboard — 371b704

### Phase 4: Delete Confirmation Dialog

#### Automated

- [x] 4.1 Type checking passes: `npm run typecheck` — 748e68e
- [x] 4.2 Linting passes: `npm run lint` — 748e68e

#### Manual

- [x] 4.3 Delete dialog opens with note title and password field — 748e68e
- [x] 4.4 Wrong password shows inline error — 748e68e
- [x] 4.5 Correct password deletes note and navigates to dashboard — 748e68e
- [x] 4.6 Cancel closes dialog without deletion — 748e68e

### Phase 5: Dashboard Integration

#### Automated

- [x] 5.1 Type checking passes: `npm run typecheck`
- [x] 5.2 Linting passes: `npm run lint`

#### Manual

- [x] 5.3 Note tiles are clickable and navigate to editor
- [x] 5.4 Empty state "New Note" button navigates to create editor
- [x] 5.5 Header "New Note" button navigates to create editor
- [x] 5.6 Dashboard reflects fresh state after create/edit/delete

### Phase 6: Tests

#### Automated

- [x] 6.1 All tests pass: `npm run test`
- [x] 6.2 Coverage threshold met: 80% across lines, functions, branches, statements
- [x] 6.3 Type checking passes: `npm run typecheck`
- [x] 6.4 Linting passes: `npm run lint`

#### Manual

- [x] 6.5 Full end-to-end flow: create → edit → version increment → delete with password → confirm deletion

### Phase 7: Session Verification Edge Rate Limiting & Resource Inversion Defense (Addendum)

#### Automated

- [x] 7.1 Cloudflare `SESSION_VERIFY_LIMITER` binding configured in `wrangler.jsonc`
- [x] 7.2 `sessionVerifyIp` added to `RateLimiterType` and `RATE_LIMIT_CONFIGS` in `src/lib/rate-limit.ts` with in-memory fallback
- [x] 7.3 `verifyDashboardSession` updated with pre-verification edge rate limit check and `SessionRateLimitError` class in `src/lib/auth-guard.ts`
- [x] 7.4 Server Actions (`createNoteAction`, `updateNoteAction`, `deleteNoteAction`) in `src/actions/notes.ts` catch `SessionRateLimitError` and return typed rate limit errors
- [x] 7.5 Route pages (`/dashboard/[hash]` and `/dashboard/[hash]/note/[noteId]`) gracefully catch rate-limit exceptions and render 429 notice
- [x] 7.6 Unit and integration tests for `verifyDashboardSession` rate limiting and Server Actions throttle handling
- [x] 7.7 All tests pass: `npm run test` with coverage ≥ 80%
- [x] 7.8 Type checking passes: `npm run typecheck`
- [x] 7.9 Linting passes: `npm run lint`

#### Manual

- [ ] 7.10 Verify rapid burst of unauthenticated or forged verification requests is throttled at the edge without querying Supabase
- [ ] 7.11 Verify normal authenticated user navigation is unaffected and operates with zero noticeable latency
- [ ] 7.12 Verify Server Actions return structured `{ success: false, rateLimited: true, retryAfterSeconds }` when throttled
