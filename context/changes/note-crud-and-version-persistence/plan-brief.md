# Note CRUD and Version Persistence — Plan Brief

> Full plan: `context/changes/note-crud-and-version-persistence/plan.md`

## What & Why

Implementing the **S-03 North Star slice** — the smallest end-to-end delivery that proves Scytala's core value proposition. Authenticated users will be able to create, edit, and delete plain text notes on their dashboard, with every edit automatically preserved as an immutable version snapshot. This completes the read→write loop that S-02 left open (tiles are currently read-only with a disabled "New Note" button).

## Starting Point

The database layer is 100% built: `notes` and `note_versions` tables, atomic RPCs (`create_note_with_version`, `update_note_with_version` with optimistic concurrency), and a complete `DatabaseClient` adapter with 6 note methods. The dashboard UI renders read-only note tiles via SSR prop drilling. A disabled "New Note" button sits in `EmptyNotesState` with tooltip "Note creation coming in S-03". No Server Actions, Zod schemas, or interactive UI components for notes exist yet.

## Desired End State

Users can click "New Note" on the dashboard, navigate to a full-page plain text editor at `/dashboard/<hash>/note/new` with line numbers, write content, save, and return to the dashboard where the new tile appears with a `v1` badge. They can click any tile to edit it — each save increments the version and creates an immutable snapshot. They can delete a note from the editor via a confirmation dialog that requires re-entering their password. On version conflict (concurrent edit), the editor shows an error with a "Reload" button (full 3-way merge is S-05).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Editor UX | Full-page plain text editor with line numbers at dedicated route | User preferred full-page over dialog; plain text matches PRD §Non-Goals. |
| Editor route | `/dashboard/<hash>/note/<noteId>` (dedicated App Router segment) | Enables browser back-button, bookmarkable URLs, and SSR auth checks. |
| Mutation strategy | Optimistic UI with local state + rollback on failure | User chose this over server revalidation; editor manages own state and navigates back on success. |
| Delete confirmation | MUI Dialog with password re-entry | User specifically requested password re-authentication for destructive actions. |
| Title field | Optional, auto-generated as "Untitled Note" if blank | Matches existing `NoteTile` fallback and DB schema `DEFAULT ''`. |
| "New Note" trigger | Activate the existing disabled button in EmptyNotesState + add to DashboardHeader | User preferred activating the existing CTA over a FAB. |
| Version conflict UX | Error alert with "Reload" button (S-03); full 3-way merge deferred to S-05 | Merge infrastructure doesn't exist yet; simple error is appropriate for MVP. |
| Per-line authorship | Deferred — schema tracks author per version snapshot, not per line | Would require line-level diff storage (schema change) beyond S-03 scope. |

## Scope

**In scope:**
- Zod validation schemas for note create/update/delete
- Shared auth guard helper (extracted from repeated session verification pattern)
- Three authenticated Server Actions with structured logging
- Full-page note editor with line-numbered textarea
- Delete confirmation dialog with password re-authentication
- Dashboard integration (enable buttons, clickable tiles)
- Comprehensive tests maintaining 80% coverage threshold

**Out of scope:**
- Rich text / Markdown editing (PRD §Non-Goals)
- Per-line authorship annotations (requires schema changes)
- 3-way merge conflict resolution (S-05)
- Real-time sync / WebSocket push (PRD §Non-Goals)
- Rate limiting on note mutations (can be added in T-03)

## Architecture / Approach

Bottom-up build through the existing layered architecture:

```
[Zod Schemas] → [Server Actions] → [DatabaseClient (existing)] → [Supabase RPCs (existing)]
                       ↑
              [Auth Guard Helper]
                       ↑
[Note Editor Page (SSR)] → [NoteEditor (client)] → [Server Actions]
                                    ↓
[Dashboard Page (SSR)] → [DashboardView] → [NoteGrid] → [NoteTile (clickable)]
```

The editor page is a new App Router segment (`/dashboard/[hash]/note/[noteId]`) with SSR auth checks. The client component manages local state and calls Server Actions via `useTransition`. After mutation, `router.push() + router.refresh()` triggers SSR re-render with fresh data.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Zod Schemas & Auth Guard | Validation contracts + reusable session helper | Low — follows established patterns |
| 2. Note Server Actions | Create/update/delete actions with auth + version conflict detection | Medium — version conflict error detection must match RPC exception message |
| 3. Note Editor Route & Components | Full-page editor with line numbers, save/cancel flow | Medium — first new App Router segment; needs own auth check (no shared layout) |
| 4. Delete Confirmation Dialog | MUI Dialog with password re-auth | Low — first dialog in codebase but straightforward MUI pattern |
| 5. Dashboard Integration | Enabled buttons, clickable tiles, navigation wiring | Low — mostly prop threading and removing `disabled` |
| 6. Tests | Full test suite maintaining 80% coverage | Medium — many new files to cover; must mock Server Actions and navigation |

**Prerequisites:** S-02 (Dashboard Auth Login and Tiles View) — done.
**Estimated effort:** ~3-4 focused sessions across 6 phases.

## Open Risks & Assumptions

- Version conflict error detection relies on matching the RPC's `RAISE EXCEPTION` message text ("Version mismatch or note not found") — if the message changes, the `versionConflict` discriminant breaks silently. Consider adding a dedicated error code in a future migration.
- The auth guard helper reads cookies synchronously within Server Actions — `next/headers` `cookies()` is async in Next.js 15+, which is already the pattern used in `auth.ts`.
- No rate limiting on note mutations in S-03 — a malicious authenticated user could create/update notes rapidly. Acceptable for MVP scale (≤5 concurrent users) but should be addressed in T-03.

## Success Criteria (Summary)

- An authenticated user can create, edit, and delete notes with version tracking visible on dashboard tiles
- Every note edit creates an immutable `note_versions` row (verifiable in database)
- Deleting a note requires password re-authentication and cascades all version history
- All tests pass with ≥80% coverage across lines, functions, branches, and statements
