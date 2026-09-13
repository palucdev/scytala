<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note Encryption at Rest (Title + Content)

- **Plan**: context/changes/note-encryption/plan.md
- **Scope**: Phases 1–3 of 4 (full sweep; Phase 4 prod ops pending)
- **Date**: 2026-09-13
- **Verdict**: REJECTED (1 critical security finding — one-migration fix)
- **Findings**: 1 critical, 2 warnings, 7 observations
- **Post-triage status (2026-09-13)**: all 10 findings fixed during triage. Gates re-run after fixes: lint ✅, typecheck ✅, unit suite 575/575 ✅ (3 new tests), coverage 96.9%/91.4%/97.1%/97.6% ✅. Effective verdict after fixes: APPROVED.

## Verification Evidence

- `npm run check:type` — pass
- `npm run lint` — pass
- `npm run test` — 572/572 passed; coverage 97.01% stmts / 91.57% branches / 97.07% funcs / 97.67% lines (threshold 80%)
- `npm run test:integration` — 4/4 passed
- E2E suite — verified at implementation time per Progress; not re-run in this review session

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Migration REVOKE misses FROM PUBLIC; RPC executable by anon

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Security)
- **Location**: supabase/migrations/20260913000000_create_note_with_version_optional_id.sql:42
- **Detail**: The new 5-arg `create_note_with_version` is a new function identity and starts with PostgreSQL's default EXECUTE granted to PUBLIC. The REVOKE only names `anon, authenticated` — every role implicitly inherits PUBLIC, so the hardening is ineffective and the migration comment is factually wrong. An anon-key caller can still execute this SECURITY DEFINER function and insert notes into any dashboard. Prior art: `20260828000000_create_rate_limits_rpc.sql:105` revokes `FROM PUBLIC, anon, authenticated`.
- **Fix**: Add a forward migration: `REVOKE ALL ON FUNCTION public.create_note_with_version(uuid, text, text, uuid, uuid) FROM PUBLIC;` (optionally also fix the three 20260820 RPCs that share the gap).
- **Decision**: FIXED — forward migration `20260913120000_revoke_public_execute_on_rpcs.sql` added (covers the 5-arg `create_note_with_version` plus the two surviving 20260820 RPCs; the 4-arg overload was already dropped). Applied via `supabase migration up` against the local DB; verified via `pg_proc.proacl` that only `postgres` (owner) and `service_role` retain EXECUTE.

### F2 — updateNote decrypts after commit; failed decrypt loops version bumps

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/lib/supabase.ts:494-497 (also createNote :454-456)
- **Detail**: `updateNote` decrypts the RPC's returned rows after the update has committed. If decryption fails, the write persists (version incremented, snapshot appended) but the action reports a generic "Failed to update note. Please try again." — each user retry bumps the version and appends another history snapshot.
- **Fix A ⭐ Recommended**: Catch `NoteCryptoError` around post-RPC decrypts and degrade like `decryptDashboardNote` does (return the note with an undecryptable marker) so the save is reported as saved.
  - Strength: Matches the per-row degradation philosophy already implemented for the dashboard listing.
  - Tradeoff: Caller (action + UI) must handle a "saved but unreadable" state for single-note responses.
  - Confidence: HIGH — the degradation pattern exists in the same file.
  - Blind spot: None significant.
- **Fix B**: Return a distinct "saved but cannot display" error result.
  - Strength: Keeps single-note reads strictly fail-closed.
  - Tradeoff: New result shape threaded through action + page.
  - Confidence: MED.
  - Blind spot: UI copy/UX for the new state not designed yet.
- **Decision**: FIXED via Fix A — `decryptCommittedRow` helper in src/lib/supabase.ts catches `NoteCryptoError` on post-RPC decrypts in `createNote`/`updateNote`, degrades to a safe placeholder (real metadata, empty title/content, never ciphertext) and returns `decryptionFailed: true`; flag threaded through the port type (db-client.ts), both actions, and the `CreateNoteActionResult`/`UpdateNoteActionResult` success variants. The editor's existing success path (router.refresh → page read → EncryptionErrorNotice) provides the "saved but cannot display" UX with no UI changes. Two new adapter tests cover the degradation; typecheck + targeted tests pass.

### F3 — .env.example is untracked; documented setup template not in git

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / repo hygiene
- **Location**: .env.example (on disk, untracked; not gitignored either)
- **Detail**: The Phase 1 deliverable exists on disk with the correct `NOTE_ENCRYPTION_KEY` entry and `openssl rand -hex 32` guidance, but the file was never committed — fresh clones don't get the documented setup template (pre-existing gap surfaced by this change).
- **Fix**: `git add .env.example` and commit it.
- **Decision**: FIXED — verified the file contains only placeholders (no secrets), added `!.env.example` negation to the `.env*` rule in .gitignore (which was silently excluding the template), and staged the file for the next commit.

### F4 — getNoteVersions is all-or-nothing on corrupt rows

- **Severity**: 🔹 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase.ts:560-562
- **Detail**: One corrupt version row fails the entire history listing, inconsistent with the per-row degradation used for the dashboard listing.
- **Fix**: Degrade corrupt version rows to placeholders, or document why history is intentionally all-or-nothing.
- **Decision**: FIXED — `decryptVersionRowOrDegrade` in src/lib/supabase.ts catches `NoteCryptoError` per row in `getNoteVersions` and degrades to a safe placeholder (real metadata, empty title/content, never ciphertext), mirroring `decryptDashboardNote`; non-crypto errors still throw. New adapter test covers a mixed healthy/corrupt history listing; targeted tests + typecheck pass.

### F5 — AAD doc claims row binding, version rows bind to note_id only

- **Severity**: 🔹 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/lib/note-crypto.ts:13 vs src/lib/supabase.ts:617-618
- **Detail**: A ciphertext transplanted between versions of the same note still authenticates (row identity is (note_id, version)).
- **Fix**: Correct the doc comment (or include version in version-row AAD).
- **Decision**: FIXED — doc comment in src/lib/note-crypto.ts corrected to state that AAD binds ciphertext to its note, and that transplants between versions of the same note still authenticate (version rows share AAD = note_id).

### F6 — env schema rejects uppercase hex the parser accepts

- **Severity**: 🔹 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/env.ts:17 vs src/lib/note-crypto.ts:70
- **Detail**: Fail-closed, but a valid uppercase-hex key is rejected at the env boundary while crypto.ts:50 accepts both cases.
- **Fix**: Align env.ts regex to `[0-9a-fA-F]`.
- **Decision**: FIXED — env.ts regex aligned to `[0-9a-fA-F]`, matching crypto.ts/note-crypto.ts; new env test asserts uppercase hex is accepted. Tests + typecheck pass.

### F7 — EncryptionErrorNotice has an unused scope prop

- **Severity**: 🔹 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/EncryptionErrorNotice.tsx:9-22
- **Detail**: `scope?: "note" | "title"` exists only to serve its own test; no production caller passes "title". Dead surface.
- **Fix**: Remove the prop and simplify the test.
- **Decision**: FIXED — `scope` prop and `EncryptionErrorNoticeProps` export removed; component simplified to the single production-used "Note unavailable" rendering; test's title-scoped case removed. Typecheck + component tests pass.

### F8 — package.json version bump 0.4.2→0.5.0 not covered by the plan

- **Severity**: 🔹 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: package.json
- **Detail**: Benign release bump riding along with the change; no plan step covers it.
- **Fix**: None needed — note it in the change record if intentional.
- **Decision**: FIXED — documented as intentional in change.md.

### F9 — E2E route hook registers visited dashboards, cleanup wipes their notes

- **Severity**: 🔹 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (DataSafety)
- **Location**: e2e/fixtures/test-base.ts:215-218 vs :99-102
- **Detail**: Cleanup deletes all notes of every dashboard visited during a run, contradicting the "pre-existing local data is never touched" comment. Mitigated by the `isLocalSupabaseUrl` guard.
- **Fix**: Register only fixture-created hashes, or fix the comment.
- **Decision**: FIXED — comment in e2e/fixtures/test-base.ts corrected to state that visited dashboards' notes are also cleanup targets, acceptable because cleanup only runs against a local Supabase URL (isLocalSupabaseUrl guard), never against a cloud project.

### F10 — actions test changed despite plan's "stay untouched" prediction

- **Severity**: 🔹 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/__tests__/actions/notes.test.ts (~line 464)
- **Detail**: One assertion (`title: ""` → `"Untitled Note"`) was forced by the plan's own Phase 2 schema transform — the plan's prediction was wrong, not the implementation. No action needed; documenting for the record.
- **Fix**: None — record for the record.
- **Decision**: FIXED — plan's "stay untouched" line updated to document the one forced assertion change.
