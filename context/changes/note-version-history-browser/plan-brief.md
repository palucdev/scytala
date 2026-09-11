# Note Version History Browser — Plan Brief

> Full plan: `context/changes/note-version-history-browser/plan.md`

## What & Why

Implementing **S-04: Note Version History Browser** (Issue [#19](https://github.com/palucdev/scytala/issues/19)). S-03 established immutable version persistence in PostgreSQL whenever notes are created or updated. S-04 completes the user-facing loop for version history by allowing authenticated users to browse previous note versions in a slide-over drawer, inspect full historical snapshots with line numbers, view inline word-level diffs highlighting additions and deletions against the current note, and safely restore past versions via non-destructive append-only commits.

## Starting Point

The database layer already persists version snapshots in `note_versions` with an index `(note_id, version DESC)`. The note editor page exists at `/dashboard/<hash>/note/<noteId>`, and `NoteEditorHeader.tsx` has a disabled "Note history" button (`#note-history-btn`). No Server Action exists yet to fetch note version history with author names, nor do UI components exist for browsing history, previewing snapshots, calculating diffs, or restoring versions.

## Desired End State

In edit mode, users can click "Note history" to open a right-side drawer. The drawer lists the current version and all past versions chronologically with version chips (`v1`, `v2`), timestamps, author names, and character change counts. Clicking a past version switches the editor canvas to a read-only preview with line numbers and a "Show changes" toggle. When toggled, additions appear in green and deletions in red with strikethrough. Users can click "Restore this version" to commit that snapshot as a new version ($v_{N+1}$), keeping all prior history intact.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| Drawer pattern | Right-side slide-over drawer (`anchor="right"`) with canvas preview | Keeps context visible, allows full canvas reading space, responsive on mobile. |
| Diff comparison target | Compare inspected version against current active note | Directly answers "What has changed between then and now?" before deciding to restore. |
| Unsaved draft handling | Preserve draft in React state with warning on restore | Zero risk of losing work when opening history; warns if restoring will replace draft. |
| Restoration scope | Restore both Title and Content | Matches snapshot semantics where version snapshots capture the full note state. |
| Diff granularity | Word-level diff with whitespace preservation (`diffWordsWithSpace`) | Eliminates full-paragraph replacements in prose when minor words or typos are edited. |
| Diff compute location | Client-side compute in browser via `useMemo` | Zero edge CPU consumption on Cloudflare Workers, instant toggling without round-trips. |
| Author attribution | In-memory resolution via `listDashboardUsers` in Server Action | Requires zero database migrations, conforming strictly to forward-only migrations policy. |
| Restoration model | Non-destructive append-only ($v_{N+1}$) | Never rewrites or deletes history; fully auditable and reversible. |

## Scope

**In scope:**
- Add `diff` and `@types/diff` dependencies.
- Zod schema `getNoteVersionHistorySchema` and typed return contracts.
- Server Action `getNoteVersionHistoryAction` with session authentication and author resolution.
- Slide-over `NoteVersionHistoryDrawer` listing current and past versions with badges and timestamps.
- Canvas `NoteVersionPreview` with read-only snapshot display and line numbers.
- Word-level inline diff rendering using `<ins>` and `<del>` with WCAG AA compliance.
- Non-destructive "Restore this version" confirmation dialog and execution.
- Comprehensive tests maintaining the strict 80% coverage threshold.

**Out of scope:**
- Rich text / Markdown formatting (PRD §Non-Goals: plain text only).
- Line-level authorship annotations (git blame) — author is tracked per snapshot.
- 3-way merge conflict resolution (deferred to S-05).
- Infinite scroll / cursor pagination (MVP notes have <50 versions; all returned ordered descending).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Dependencies & Validation Schemas | `diff` package installed + `getNoteVersionHistorySchema` | Low — pure contracts and validation |
| 2. Server Action & Backend Retrieval | `getNoteVersionHistoryAction` with session auth & author mapping | Low — reuses existing `db.getNoteVersions` and `listDashboardUsers` |
| 3. History Drawer & Header Integration | Enabled button in `NoteEditorHeader` + `NoteVersionHistoryDrawer` | Medium — mobile responsiveness and smooth drawer transitions |
| 4. Canvas Preview, Word Diffing & Restore | `NoteVersionPreview`, `diffWordsWithSpace`, and restore flow | Medium — accessible diff markup and preserving unsaved draft state |
| 5. Testing & Quality Gates | Comprehensive tests with ≥80% coverage on all metrics | Medium — testing all drawer and preview branches |

**Prerequisites:** S-03 (Note CRUD and Version Persistence) — done.  
**Estimated effort:** ~2-3 focused sessions across 5 phases.

## Success Criteria (Summary)

- Authenticated users can open "Note history" on any existing note and view its complete version history.
- Each historical version displays version number, author alias, timestamp, and read-only content.
- Toggling "Show changes" highlights word-level additions and deletions cleanly.
- Restoring a version creates a new snapshot ($v_{N+1}$) without modifying existing history.
- All tests pass with ≥80% coverage across lines, functions, branches, and statements.
