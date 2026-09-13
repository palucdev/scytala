<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note Encryption at Rest (Title + Content)

- **Plan**: context/changes/note-encryption/plan.md
- **Scope**: Phases 1–2 of 4 (all completed phases)
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION → all findings triaged and FIXED during this session
- **Findings**: 0 critical  2 warnings  4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS (benign extras documented in F6) |
| Safety & Quality | WARNING (F1, F2 — both fixed) |
| Architecture | PASS (F3 observation fixed) |
| Pattern Consistency | WARNING (F5, F6 — both fixed) |
| Success Criteria | PASS |

## Success Criteria Verification

- Phase 1: targeted tests 25/25 ✅ · typecheck ✅ · lint ✅
- Phase 2: targeted tests 172/172 ✅ · typecheck ✅ · lint ✅ · integration 4/4 ✅
- Manual 2.6/2.7 marked [x] @ 7aca035 — diff contains EncryptionErrorNotice + test, consistent.
- Environment note: vitest initially failed to start (broken `@rolldown` native binding — npm
  optional-deps bug); repaired with `npm i @rolldown/binding-linux-x64-gnu --no-save`.
- Post-triage full suite: 44 files, 572/572 tests, coverage 97.01% stmts / 91.57% branches /
  97.07% funcs / 97.67% lines (threshold 80%).

## Findings

### F1 — Plaintext starting with "v1:" is stored unencrypted

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/note-crypto.ts:113-122
- **Detail**: Per the plan's collision guard, plaintext beginning with the literal "v1:" was
  escaped as `v0:<original>` and stored in the clear, defeating the at-rest encryption
  guarantee for such notes. Plan-level weakness, not implementation drift.
- **Fix**: Encrypt the escaped payload too (store `v0:<iv>:<ct>`), keeping disambiguation
  while encrypting everything.
  - Strength: Closes the plaintext-at-rest hole without changing the envelope grammar.
  - Tradeoff: Two nested envelopes for a rare case.
  - Confidence: HIGH — confined to note-crypto.ts.
  - Blind spot: Legacy bare `v0:...` rows would need the unwrap path kept.
- **Decision**: FIXED (custom) — user chose to remove the `v0:` escape AND legacy plaintext
  passthrough entirely: `encryptNoteField` always encrypts (including the empty string) and
  `decryptNoteField` accepts only valid `v1:` envelopes, failing closed on anything else.
  Plan.md updated to the strict envelope-only contract; tests updated (13 crypto tests +
  adapter assertion fix).

### F2 — One corrupt note blanks the entire dashboard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase.ts:518 + src/app/dashboard/[hash]/page.tsx:56-71
- **Detail**: `getNotesByDashboard` decrypted all rows via `Promise.all`; a single malformed
  envelope rejected the whole query and the page replaced the entire dashboard with one
  generic EncryptionErrorNotice.
- **Fix A ⭐ Recommended**: Per-note decrypt resilience in the adapter with a flagged DTO
  rendered as an inline notice for that tile only.
  - Strength: Matches the fail-closed contract per note instead of per dashboard.
  - Tradeoff: Touches adapter return shape + DashboardView rendering + tests.
  - Confidence: HIGH — per-row decrypt helpers already exist.
  - Blind spot: DTO/prop type changes ripple into DashboardView and its tests.
- **Decision**: FIXED (Fix A + user-requested card differentiation) — port gained
  `DashboardNote` union (`ok` / `undecryptable` with safe metadata only, never ciphertext);
  adapter logs and degrades per row; `NoteTile` renders a distinct error-styled "Note
  unavailable" card (no content, no ciphertext, no editor link); dashboard page crypto
  catch removed (no longer reachable); dto maps undecryptable rows to placeholder DTOs.
  New tests: adapter corrupt-row degradation, dto placeholder mapping, NoteTile placeholder
  rendering.

### F3 — Error classification by magic message prefix

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/app/dashboard/[hash]/note/[noteId]/page.tsx:77
- **Detail**: Note page detected decryption failures via
  `error.message.startsWith("[note-crypto]")` — control flow coupled to a message string.
- **Fix**: Export a typed `NoteCryptoError` from note-crypto.ts and `instanceof`-check it.
- **Decision**: FIXED — `NoteCryptoError` class exported (with `cause` preservation on GCM
  failure); note page uses `instanceof`; typed-error assertion added to crypto tests.

### F4 — Migration drops the 4-arg create_note_with_version

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260913000000_create_note_with_version_optional_id.sql:46
- **Detail**: Planned and safe today (sole caller is the 5-arg adapter call); flagged so ops
  isn't surprised by the atomic function-identity swap during migration.
- **Fix**: Note the overload drop in the Phase 4 deploy runbook.
- **Decision**: FIXED — runbook note added to the plan's Phase 4 contract (the
  docs/deployment.md runbook section itself lands with Phase 4).

### F5 — AGENTS.md misdescribes the key derivation

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md:3 + secrets-defense line
- **Detail**: Said "SESSION_SECRET-derived env key"; actual implementation uses an
  independent required `NOTE_ENCRYPTION_KEY`. Secrets-defense line omitted the new key.
- **Fix**: Update AGENTS.md to name NOTE_ENCRYPTION_KEY in both places.
- **Decision**: FIXED — AGENTS.md feature line corrected to "at-rest note encryption
  (AES-256-GCM envelopes via a dedicated `NOTE_ENCRYPTION_KEY`)"; secrets-defense line and
  README.md:52 secrets list now include `NOTE_ENCRYPTION_KEY`.

### F6 — Duplicated JSDoc edit artifact (benign extras also noted here)

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/supabase.ts:412-417, 562-567
- **Detail**: Identical JSDoc blocks duplicated above createNote and deleteNote. Benign
  extras confirmed by drift check: EncryptionErrorNotice `scope` prop (tested),
  AGENTS.md/README/version churn, one dependent assertion update in
  actions/notes.test.ts:464. "NOT Doing" guardrails all held.
- **Fix**: Delete the duplicated JSDoc blocks.
- **Decision**: FIXED — both duplicate blocks removed; extras accepted as benign.

## Post-Review Verification

- `npm run check:type` ✅ · `npm run lint` ✅
- Full unit suite: 572/572 ✅ (coverage above threshold on all four metrics)
- Integration: 4/4 ✅
