<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note encryption at rest (title + content) — v2 re-review

- **Plan**: context/changes/note-encryption/plan.md
- **Scope**: Phases 1–3 of 4 (fresh re-review after this morning's `impl-review-full.md` found F1–F10 which were all fixed during triage)
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 6 observations
- **Post-triage status (2026-09-13)**: F1 FIXED (clearRateLimits local gate), F2 FIXED (metadataOnly getNoteById + dedicated update message), F3 FIXED (plan addendum), F4 SKIPPED. Gates re-run after fixes: lint ✅, typecheck ✅, unit suite 578/578 ✅ (3 new tests), coverage 96.9%/91.3%/97.1%/97.5% ✅.

## Verification Evidence (re-run today, post-fix tree)

- `npm run check:type` — pass
- `npm run lint` — pass
- `npm run test` — 44 files / 575 tests passed; coverage 96.91% stmts / 91.38% branches / 97.1% funcs / 97.56% lines (threshold 80%). Note: initial run hit a vitest startup error (`@rolldown/binding-wasm32-wasi` missing, known npm optional-deps bug); fixed with a non-destructive `npm install --no-save` — environment issue, not code.
- Integration (4/4) and E2E — passing evidence recorded in `impl-review-full.md` (same committed state); not re-run this session.
- Manual Progress items (2.6, 2.7, 3.6) — checked with evidenced descriptions in change.md; accepted.

## Verdicts

| Dimension | Verdict |
|-----------|---------
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Crypto core independently re-verified SOUND: 128-bit fresh IV per write, 64-hex → 32-byte non-extractable key import, AAD = noteId both directions, strict fail-closed envelope-only reads with typed `NoteCryptoError`, chunked base64, zero key/ciphertext client leakage.

## Findings

### F1 — clearRateLimits service-role wipe is not local-gated

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: e2e/fixtures/test-base.ts:71-82 (auto fixture at :231-237)
- **Detail**: `clearRateLimits()` deletes all `rate_limits` rows with the service-role key before every test, with no `isLocalSupabaseUrl` guard. The guard exists one function below for `cleanupE2ENotes` (added by this change's Phase 3) — same-class bug left unguarded in the sibling.
- **Fix**: Gate `clearRateLimits()` with `isLocalSupabaseUrl(url)`.
- **Decision**: FIXED — guard added at test-base.ts:74; typecheck re-run clean.

### F2 — Undecryptable notes are lifecycle-stuck (no delete path)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/actions/notes.ts:204, 335 (prechecks); src/lib/supabase.ts:541-555
- **Detail**: `updateNoteAction`/`deleteNoteAction` call `db.getNoteById` as ownership precheck; `NoteCryptoError` propagates → "Failed to update/delete note." A corrupt note can never be deleted through the app; recovery requires direct DB access. Deletion needs no plaintext.
- **Fix**: In `deleteNoteAction` precheck, catch `NoteCryptoError` and proceed; give update an explicit "cannot edit" message.
- **Decision**: FIXED — `getNoteById(noteId, { metadataOnly: true })` option added to port+adapter (degrades to metadata placeholder), delete uses it; update catches `NoteCryptoError` with dedicated message. 3 new tests; full suite 578/578, coverage ≥80%.

### F3 — Version-history lane drifted from plan's fail-closed contract

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/supabase.ts:560-577 vs plan.md Phase 2 step 2 (getNoteVersions "still throw")
- **Detail**: Deliberate post-review fix — degraded version rows instead of throwing (prevents whole-history blanking). Better than plan, but plan is stale as ground truth for future reviews.
- **Fix**: Update the plan's getNoteVersions contract line as an addendum.
- **Decision**: FIXED — plan.md Phase 2 step 2 addendum documents degrade semantics + metadataOnly getNoteById option.

### F4 — Unrelated follow-up work sitting uncommitted in this change's tree

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: git working tree (src/proxy.ts, src/lib/db-errors.ts, src/app/new/layout.tsx, supabase/migrations/20260913130000_update_note_conflict_errcode.sql, diffs in supabase.ts, next.config.ts, test.yml)
- **Detail**: Uncommitted work belongs to ≥3 follow-ups (typed VersionConflictError/P0002, CSP nonce proxy, H-01 env-fallback removal, CI worker-build gate) — none planned by note-encryption. Risk of mixing into this change's commits.
- **Decision**: SKIPPED

## Observations (no decision required)

- **O1**: 20260913000000 comment at :40-41 falsely claims its REVOKE closes the PUBLIC-execute gap (actually closed by 20260913120000). Final privilege state verified correct; consider fixing the stale comment.
- **O2**: Untracked 20260913130000 defensively re-asserts REVOKE anon/authenticated + GRANT service_role but not `REVOKE ... FROM PUBLIC` — inconsistent with the 20260913120000 pattern.
- **O3**: Degraded version rows (`getNoteVersions` → empty title/content) carry no marker; a degraded row is indistinguishable from a legitimately empty one and the version UI shows blank snapshots silently. Mirror `DashboardNote`'s discriminant on version rows.
- **O4**: `dto.ts:15-19` re-sorts an already DB-sorted list; `getNotesByDashboard` decrypts full content then `dto.ts:25` slices to 300 chars — negligible.
- **O5**: Stale test name "clears title" at src/__tests__/actions/notes.test.ts:471 (asserts "Untitled Note" reset).
- **O6**: e2e/fixtures/test-base.ts: legacy `SUPABASE_KEY` fallback at :73/:161 (adapter dropped the fallback); duplicated dead `if (error)` block at :187-193 vs :189.
