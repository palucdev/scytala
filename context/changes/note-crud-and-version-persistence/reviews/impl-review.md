<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note CRUD and Version Persistence (S-03)

- **Plan**: context/changes/note-crud-and-version-persistence/plan.md
- **Scope**: All Phases (Phase 1–6)
- **Date**: 2026-09-09
- **Verdict**: APPROVED ✅
- **Findings**: 2 critical (2 fixed), 2 warnings (2 fixed), 2 observations (1 fixed, 1 skipped)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS ✅ |
| Scope Discipline | PASS ✅ |
| Safety & Quality | PASS ✅ |
| Architecture | PASS ✅ |
| Pattern Consistency | PASS ✅ |
| Success Criteria | PASS ✅ |

## Automated Verification

- `npx tsc --noEmit`: PASS (exit code 0)
- `npx eslint`: PASS (exit code 0)
- `npx vitest run --coverage`: PASS (33 test files, 420 passed, 98.09% line coverage, 91.98% branch coverage, 97.8% function/statement coverage)

## Findings

### F1 — Password re-authentication stripped from note deletion

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/actions/notes.ts:206, src/schemas/notes.ts:47, src/app/dashboard/[hash]/note/[noteId]/components/DeleteNoteDialog.tsx:30
- **Detail**: The plan (Overview, Desired End State §3, Critical Implementation Details, Phase 1, 2, 4, 6) and PRD explicitly mandate that deleting a note requires re-entering the user's password. This protects against stolen session cookies/CSRF cascading deletion of all immutable version history snapshots, and prevents any participant from deleting another user's note without credentials. The working tree had temporarily removed password validation and checks.
- **Fix A ⭐ Recommended**: Restore password re-authentication across deleteNoteSchema, deleteNoteAction, and DeleteNoteDialog.tsx as specified in the plan.
  - Strength: Guarantees defense-in-depth against session hijacking and accidental history destruction, strictly aligning with PRD security goals.
  - Tradeoff: Adds an extra credential prompt for the user when deleting a note.
  - Confidence: HIGH — implementation was already proven and tested in commit aa95a5c.
  - Blind spot: None significant.
- **Fix B**: Formally accept password-less deletion, document it in plan.md as an approved scope modification, and add user-level authorization check (note.author_id === session.user_id).
- **Decision**: FIXED (Fix A: Restored password re-authentication across deleteNoteSchema, deleteNoteAction, and DeleteNoteDialog)

### F2 — enforceIpRateLimit throttles note mutations under strict 10 req/min login quota (authIp)

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/rate-limit.ts:212, src/actions/notes.ts:50, 122, 221
- **Detail**: enforceIpRateLimit in src/lib/rate-limit.ts defaulted to limiterType: "authIp", which is configured in RATE_LIMIT_CONFIGS for strict brute-force login defense (max: 10, windowMs: 60000). Calling enforceIpRateLimit in createNoteAction, updateNoteAction, and deleteNoteAction caused note edits to exhaust the login IP rate limit bucket.
- **Fix A ⭐ Recommended**: Clean up unused enforceIpRateLimit helper from src/lib/rate-limit.ts and src/__tests__/lib/rate-limit.test.ts, keeping note actions on user-scoped noteMutation (30 req/min) and authIp strictly for password attempts during delete.
  - Strength: Eliminates denial-of-service on login for legitimate note editors while maintaining abuse protection.
  - Tradeoff: None.
  - Confidence: HIGH — isolated to rate-limit configuration and action call sites.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A: Cleaned up unused enforceIpRateLimit from rate-limit.ts and tests, decoupled note actions from authIp login quota)

### F3 — deleteNoteAction omits user-scoped noteMutation rate limiting

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/actions/notes.ts:240
- **Detail**: createNoteAction and updateNoteAction enforce user-scoped token bucket rate limiting via checkRateLimit("noteMutation", `${session.dashboard_id}:${session.user_id}`). However, deleteNoteAction omitted this check.
- **Fix**: Add checkRateLimit("noteMutation", `${session.dashboard_id}:${session.user_id}`) to deleteNoteAction after session verification.
- **Decision**: FIXED (Fix: Added checkRateLimit("noteMutation", ...) to deleteNoteAction and verified with unit test)

### F4 — Server cache invalidation omits editor sub-route

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/actions/notes.ts:170
- **Detail**: updateNoteAction called revalidatePath(`/dashboard/${dashboardHash}`) but omitted revalidating the editor route /dashboard/[hash]/note/[noteId].
- **Fix**: In updateNoteAction, call revalidatePath(`/dashboard/${dashboardHash}/note/${noteId}`) alongside the dashboard revalidation.
- **Decision**: FIXED (Fix: Added revalidatePath for note editor sub-route in updateNoteAction and updated test assertion)

### F5 — Speculative disabled placeholder buttons retained across headers

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/app/dashboard/[hash]/components/DashboardActionToolbar.tsx:99-170, src/app/dashboard/[hash]/note/[noteId]/components/NoteEditorHeader.tsx:26-70
- **Detail**: Seven permanently disabled placeholder buttons ("Dashboard settings", "Add Directory", "Add File", "Add Image", "Add Survey", "Note history", "Contributors") are rendered in headers. PRD §Non-Goals explicitly states "No file/photo/video sharing — notes (plain text) only for MVP".
- **Fix**: Prune speculative placeholder buttons from headers, keeping only active features ("Create note", "Sync", "Logout").
- **Decision**: SKIPPED (Retained disabled placeholder buttons as preview UI)

### F6 — Diverging empty title transforms between Zod schemas

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/schemas/notes.ts:15, 35
- **Detail**: In createNoteSchema, an empty/whitespace title is transformed to undefined, whereas in updateNoteSchema, an empty title is transformed to "" (to allow clearing an existing title in the database RPC). This distinction was undocumented.
- **Fix**: Add JSDoc commentary explaining that updateNoteSchema uses "" to signal title deletion in the RPC while undefined preserves existing title.
- **Decision**: FIXED (Fix: Added clarifying JSDoc documentation to schemas/notes.ts)
