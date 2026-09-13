<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note Encryption at Rest (Title + Content)

- **Plan**: context/changes/note-encryption/plan.md
- **Scope**: Phase 1 of 4
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated Success Criteria (Phase 1)

- 1.1 Targeted unit tests (`note-crypto.test.ts`, `env.test.ts`): PASS — 25/25
- 1.2 Type checking: PASS (via `npm run check:type` — see F6)
- 1.3 Linting: PASS
- Manual items: none planned for Phase 1
- Progress checkboxes: consistent with commit 534c093
- Lessons compliance: PASS (forward-only, targeted tests only, no absolute paths in markdown)

## Findings

### F1 — .env.example is gitignored; committed docs lack the new key

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: .gitignore:47 (.env*), README.md:88-98
- **Detail**: The plan requires a NOTE_ENCRYPTION_KEY entry in .env.example with `openssl rand -hex 32` guidance. The local file has it (correct content), but .gitignore's `.env*` rule keeps it untracked — commit 534c093 does not contain it despite its commit message claiming so. Fresh clones get no .env.example (README.md:79 `cp .env.example .env.local` fails) and the committed env-var list in README.md:88-98 omits NOTE_ENCRYPTION_KEY.
- **Fix A ⭐ Recommended**: Force-track .env.example (add `!.env.example` to .gitignore, `git add -f`).
  - Strength: Fixes the plan intent AND the pre-existing fresh-clone gap at README.md:79 in one move.
  - Tradeoff: Touches .gitignore — must ensure no real secrets creep into the example file.
  - Confidence: HIGH — file already contains only placeholder guidance.
  - Blind spot: Whether the author intentionally keeps .env* untracked.
- **Fix B**: Add NOTE_ENCRYPTION_KEY to the README.md:88-98 env-var list.
  - Strength: Zero .gitignore changes; uses existing committed docs.
  - Tradeoff: Leaves the fresh-clone `cp .env.example` failure and diverges from the plan's stated contract.
  - Confidence: MEDIUM — works, but the plan explicitly named the file.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix B — user chose README update; `.env` values are the user's responsibility)

### F2 — v0: unwrap corrupts legacy plaintext starting with "v0:"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (data safety)
- **Location**: src/lib/note-crypto.ts:148-150
- **Detail**: decryptNoteField unconditionally strips a `v0:` prefix before the `v1:` check. Only the escape path produces `v0:v1:...`, but legacy plaintext rows starting with `v0:` would get the prefix silently stripped on read. All planned tests for the escape path pass; the issue only concerns pre-encryption legacy rows.
- **Fix**: Only unwrap when the remainder starts with `v1:`; otherwise treat as legacy passthrough.
- **Decision**: ACCEPTED — user justification: the plan's Phase 4 prod wipe eliminates all legacy plaintext rows (and dev/test DBs are resettable), so no legacy rows will exist; the `v0:` unwrap must stay for the write-time escape path of user content starting with `v1:` and round-trips correctly.

### F3 — Nominal "32-byte decode" test doesn't test what it claims

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/__tests__/lib/note-crypto.test.ts:139-143
- **Detail**: Test titled "throws when the raw key cannot be imported from env" asserts a valid key decodes to 32 bytes and never triggers the throw at note-crypto.ts:84-87 (unreachable via public API — env validation rejects bad keys first). All other planned test cases are present and substantive.
- **Fix**: Rename the test to reflect what it actually asserts.
- **Decision**: FIXED (renamed to "decodes a valid 64-hex-char key to exactly 32 bytes")

### F4 — Malformed envelopes throw unlabelled raw atob errors

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability/observability)
- **Location**: src/lib/note-crypto.ts:46-47
- **Detail**: A 3-part envelope with non-base64 segments (e.g. `v1:zzz:yyy`) throws a raw InvalidCharacterError from atob before the labelled try/catch — still fail-closed, but log classification loses the `[note-crypto]` prefix.
- **Fix**: Move the base64ToBytes calls inside the existing try block.
- **Decision**: FIXED (base64 decode + key import moved inside the labelled try block; 13/13 tests pass)

### F5 — Phase 2 deploy ordering: RPC migration and adapter must ship together

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: N/A (Phase 2 planning note)
- **Detail**: Phase 1 ships with zero callers (safe). In Phase 2, AAD binding depends on the pre-generated note ID reaching the RPC — if the adapter deploy lands before the migration, createNote fails loudly (unknown RPC parameter), safe but user-visible. The plan already bundles both in Phase 2; no silent-corruption window exists.
- **Fix**: None required — keep migration + adapter in the same deploy when executing Phase 2.
- **Decision**: ACKNOWLEDGED

### F6 — Plan references `npm run typecheck`; repo script is `check:type`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/note-encryption/plan.md:116, 186, 228
- **Detail**: Automated verification commands name `npm run typecheck`, which does not exist. The real gate is `npm run check:type` and it passes.
- **Fix**: Update the plan's command references to `npm run check:type`.
- **Decision**: FIXED (all three references updated)

## Triage Summary

- Fixed: F1 (Fix B), F3, F4, F6 (4)
- Accepted: F2 (1)
- Acknowledged: F5 (1)
