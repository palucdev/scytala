<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note CRUD and Version Persistence

- **Plan**: `context/changes/note-crud-and-version-persistence/plan.md`
- **Scope**: Phase 2 of 6 (Note Server Actions)
- **Date**: 2026-09-08
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Inability to clear existing note title back to untitled

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/schemas/notes.ts:32`, `src/actions/notes.ts:121`
- **Detail**: In `updateNoteSchema`, empty/whitespace titles were transformed to `undefined`. When passed to `db.updateNote`, `p_title` became `NULL`. The PostgreSQL RPC `update_note_with_version` only updates `title` when `p_title IS NOT NULL`, preserving the existing title when `NULL`. Consequently, once a note had a title, users could not revert it to an untitled note.
- **Fix**: Updated `updateNoteSchema` to transform `null`, `""`, and whitespace strings to `""` while preserving `undefined` when omitted.
- **Decision**: FIXED (Allowed `""` title in `updateNoteSchema` and updated schema tests)

### F2 — Rate limiting absent on password re-authentication during note deletion

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/actions/notes.ts:183`
- **Detail**: `deleteNoteAction` validates participant password using PBKDF2 without rate limiting or timing equalization on missing users.
- **Fix**: Added IP rate limiting (`authIp`), account rate limiting on failed attempts (`authAccount`), constant-time PBKDF2 calculation with `DUMMY_PBKDF2_HASH` on missing users or ID mismatch, and defense-in-depth user ID check (`user.id === session.user_id`).
- **Decision**: FIXED (Added rate limiting, exported `DUMMY_PBKDF2_HASH` from `lib/rate-limit`, and added timing equalization)

### F3 — Optimistic concurrency conflict error handling

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/actions/notes.ts:139`
- **Detail**: `updateNoteAction` caught version conflicts via substring matching on `error.message`. If a non-Error object was thrown, it was converted to an empty string.
- **Fix**: Updated to `String(error).toLowerCase().includes("version mismatch")` to handle both Error instances and non-Error thrown objects safely.
- **Decision**: FIXED (Added robust string matching and test coverage)
