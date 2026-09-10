<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note CRUD and Version Persistence

- **Plan**: `context/changes/note-crud-and-version-persistence/plan.md`
- **Scope**: Phase 1 of 6 (Zod Schemas & Auth Guard Helper)
- **Date**: 2026-08-28
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

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

### O1 — Title field rejects explicit null values

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/schemas/notes.ts:13`
- **Detail**: `title` uses `.optional()` (`z.string().trim().max(200).optional()`), which accepts `undefined` and strings, but rejects explicit `null` (`{ title: null }`). In `src/schemas/dashboard.ts`, optional fields accept `null` via `.nullable().optional()`.
- **Fix**: Add `.nullable()` or `.nullish().transform(val => val?.trim() || undefined)` to allow `null` for omitted titles.
- **Decision**: FIXED (Added `.optional().nullable().transform(...)` to normalize null/empty titles to undefined)

### O2 — Content validation allows whitespace-only strings

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/schemas/notes.ts:16`
- **Detail**: `content` enforces `.min(1)` without `.trim()`, preserving formatting/indentation (desirable for plain text notes), but also permits creating notes consisting purely of whitespace.
- **Fix**: Add `.refine(val => val.trim().length > 0, "Note content cannot be empty")` if whitespace-only notes should be rejected.
- **Decision**: FIXED (Added `.refine(val => val.trim().length > 0)` to reject whitespace-only notes)
