# Production Readiness Report

**Date**: 2026-09-13
**Path**: /home/projekty/10xdevs/scytala (branch: `feature/note_encryption`)
**Target**: production (full rigor)
**Focus**: Note encryption at rest (S-07) — `src/lib/note-crypto.ts`, `src/lib/supabase.ts`, `src/actions/notes.ts`, `src/lib/env.ts`, migrations

## Executive Summary

- **Recommendation**: **NO-GO for immediate deployment** → **GO WITH MITIGATIONS** once the 3 blockers below are closed (all are operational, not architectural — code quality itself is high)
- **Overall Readiness**: 78%
- **Deployment Risk**: Medium (pre-launch MVP; no production users yet, but a security fix sits uncommitted and Phase 4 prod ops are unverified)
- **Blockers**: 3 · **Concerns**: 7 · **Recommendations**: 6

The note-encryption feature itself is well engineered: AES-256-GCM envelope encryption with AAD binding to note ID, fail-closed decrypt semantics, per-row graceful degradation for corrupt ciphertext, a required/validated `NOTE_ENCRYPTION_KEY`, a critical RPC-grant gap already fixed via a forward migration, and strong test coverage (575/575 unit tests, 96.9% statements / 91.4% branches, integration + E2E green). What blocks deployment is that **the security fix and its migration are not committed**, and the **Phase 4 production runbook (secret set + one-time wipe) is not executed/documented**.

## Category Breakdown

| Category      | Score | Status          |
| ------------- | ----- | --------------- |
| Configuration | 85%   | Ready w/ caveats |
| Monitoring    | 75%   | Ready w/ caveats |
| Resilience    | 85%   | Ready           |
| Performance   | 85%   | Ready           |
| Security      | 82%   | Ready w/ caveats |
| Deployment    | 62%   | **Not ready**   |

## Blockers (Must Fix)

### B1 — Security fix (RPC PUBLIC EXECUTE revoke) is uncommitted
- **Location**: `supabase/migrations/20260913120000_revoke_public_execute_on_rpcs.sql` (untracked), `src/lib/supabase.ts`, `src/lib/note-crypto.ts`, `src/lib/env.ts`, `src/actions/notes.ts`, `.env.example`, `.gitignore` (all modified, unstaged/uncommitted)
- **Issue**: Deploying the current committed HEAD (`adf472e`) would ship the **vulnerable** migration `20260913000000_create_note_with_version_optional_id.sql` whose `REVOKE ... FROM anon, authenticated` does NOT remove the implicit PUBLIC EXECUTE grant — anon-key callers could execute the `SECURITY DEFINER` `create_note_with_version` RPC directly. The fix-forward migration exists on disk but is not in git. Per `docs/deployment.md`, Cloudflare builds from git — an accidental deploy of HEAD ships the hole.
- **Fix**: Commit the full working tree of the S-07 triage (fix migration + `decryptCommittedRow` degradation + `.env.example` + all test updates) on `feature/note_encryption`, verify CI green, then deploy from the commit.

### B2 — Phase 4 prod runbook not executed or documented
- **Location**: `docs/deployment.md` (no mention of `NOTE_ENCRYPTION_KEY` or the wipe); `context/changes/note-encryption/plan.md` Phase 4 (all steps unchecked as operational execution)
- **Issue**: The plan requires, in strict order, before encrypted code serves traffic: (1) confirm prod `notes`/`note_versions` contain only test data, (2) `DELETE FROM notes` (FK cascade), (3) `wrangler secret put NOTE_ENCRYPTION_KEY`, (4) deploy, (5) prod smoke. None of this is documented in the standing deploy checklist, and there is no evidence it was executed. Deploying without the secret set → every write fails at `getEnv()`; deploying without the wipe → legacy plaintext rows fail closed as "undecryptable" placeholders (data appears lost to users).
- **Fix**: Execute Phase 4 in order; append the runbook (secret ordering, wipe SQL, count checks, smoke test) to `docs/deployment.md` and commit it with B1.

### B3 — Key-loss / rollback strategy undefined for encrypted data
- **Location**: `src/lib/note-crypto.ts`, Phase 4 plan section
- **Issue**: `NOTE_ENCRYPTION_KEY` is the single root of trust. If the Worker secret is lost, **all notes and version history become permanently unrecoverable** (fail-closed design is correct for confidentiality but brutal for availability). There is no documented key backup procedure, no rotation tooling (acknowledged out of scope), and no rollback criteria acknowledging that rolling back the app post-wipe leaves ciphertext unreadable by the old plaintext code.
- **Fix**: Document (a) secure off-platform backup of the key (e.g., password manager / Cloudflare secrets export policy), (b) explicit rollback criteria: app-level rollback is safe (fail-closed UI), but data rollback is **not** possible after the wipe — enable Supabase PITR before wiping.

## Concerns (Should Fix)

### C1 — CI does not gate the worker build or E2E suite
- **Location**: `.github/workflows/test.yml`
- **Issue**: CI runs typecheck + lint + unit tests only. `check:ready` (lint, typecheck, unit, E2E, OpenNext worker build) is never enforced. A regression that breaks the Cloudflare bundle or the E2E golden path can merge unnoticed.
- **Mitigation**: Add E2E + `build:worker` steps to CI (self-hosted or `cfl-cloudflare` compatible runner), or at minimum `opennextjs-cloudflare build` as a smoke gate.

### C2 — `updateNoteAction` detects version conflicts by error-message string matching
- **Location**: `src/actions/notes.ts:250-252` (`errorMessage.toLowerCase().includes("version mismatch")`)
- **Issue**: Fragile coupling to a human-readable PostgREST/adapter message; a wording change silently turns optimistic-concurrency conflicts into generic 500-style errors and breaks the "reload and retry" UX.
- **Mitigation**: Return a typed error code (e.g., `PG_ERR_VERSION_CONFLICT` via `raise exception ... using errcode`) from the RPC and match on that.

### C3 — Production CSP allows `unsafe-inline` scripts
- **Location**: `next.config.ts:8` (`script-src 'self' 'unsafe-inline'`)
- **Issue**: Weakens XSS protection meaningfully; note content is rendered from user input and decrypt failures degrade to placeholders, but defense-in-depth is reduced.
- **Mitigation**: Move to nonce- or hash-based script CSP (Next.js 16 supports middleware nonces) in a follow-up hardening pass.

### C4 — `SupabaseDatabaseClient` bypasses the validated `getEnv()` schema
- **Location**: `src/lib/supabase.ts:77-92` (reads raw `process.env`, accepts legacy `SUPABASE_KEY` fallback, hand-rolled timeout parse)
- **Issue**: Inconsistent with the project's "validate all runtime configuration with `src/lib/env.ts`" rule; a mistyped `SUPABASE_TIMEOUT_MS` (`"8s"`) silently falls back to 8000 instead of failing fast at startup like the schema does.
- **Mitigation**: Inject `getEnv()` values into the adapter (constructor param or direct import), keep `SUPABASE_TIMEOUT_MS` coercion in Zod.

### C5 — No external error tracking / metrics instrumentation
- **Location**: global
- **Issue**: Observability relies on Cloudflare Workers Logs (`wrangler.jsonc` observability enabled, head sampling 1 — good) plus the structured JSON logger with secret redaction (good), but there is no Sentry/error-service integration and no metrics (decrypt-failure counts, rate-limit hits). Crypto failures are only visible if someone reads logs.
- **Mitigation (staging-acceptable)**: Acceptable for MVP launch given CF logs; track a follow-up to add an error tracker and a `note.decrypt.failed` counter.

### C6 — In-memory rate-limit fallback is per-isolate on Workers
- **Location**: `src/lib/rate-limit.ts` (fallback store) + `wrangler.jsonc` (only 2 native limiters bound)
- **Issue**: When the Supabase RPC or CF binding is unavailable, the in-memory fallback limits per V8 isolate, not globally — effective limits multiply with concurrent isolates. `noteMutation` has no native CF binding.
- **Mitigation**: Documented degradation; consider adding a native `NOTE_MUTATION_LIMITER` binding in `wrangler.jsonc`.

### C7 — Zero-downtime risk from RPC signature swap
- **Location**: `supabase/migrations/20260913000000_create_note_with_version_optional_id.sql:46` (`DROP FUNCTION ... (uuid, text, text, uuid)`)
- **Issue**: The 4-arg overload is dropped in the same migration that adds the 5-arg version. A still-draining old Worker version calling the 4-arg RPC during rollout gets "function does not exist" errors — a brief error window for in-flight writes.
- **Mitigation**: For this launch (pre-users) acceptable; for future migrations, keep old overloads for one release before dropping.

## Recommendations (Nice to Have)

1. **Key rotation readiness** — the `v1:` envelope is rotation-ready; add a version-aware decrypt path (`v1` = current key) so a future `v2` can decrypt-with-old/re-encrypt-with-new without a flag day.
2. **Retry with backoff on transient Supabase failures** — currently single-shot with 8s timeout; idempotent reads (`getNotesByDashboard`, `getNoteById`) could safely retry once.
3. **`note-crypto.ts:95`** throws a plain `Error` for a malformed key while all other failures use `NoteCryptoError` — align for consistent `instanceof` handling by callers.
4. **Circuit breaker** around Supabase for sustained outage containment (currently only timeouts + graceful degradation exist).
5. **Envelope-integrity self-check in the health endpoint** — e.g., a canary encrypt/decrypt cycle to detect key/ciphertext incompatibility at probe time rather than first user request.
6. **Consider 96-bit GCM IVs** (NIST SP 800-38D standard length) in a future envelope version; the current 128-bit random IV is safe (lower collision risk than 96-bit random) but non-standard.

## Feature-Specific Assessment (Note Encryption)

**Correctness & design — PASS**
- Envelope format `v1:<iv_b64>:<ct_b64>` with fresh random IV per write; non-determinism tested.
- AAD = note ID prevents cross-note ciphertext transplant; same-note version transplant documented as accepted risk (version rows share AAD).
- Fail-closed decrypt: non-envelope values, tampered data, wrong key, and wrong note ID all throw `NoteCryptoError`; UI renders `EncryptionErrorNotice` instead of crashing.
- Empty string is always encrypted (no plaintext passthrough); user plaintext beginning `v1:` round-trips correctly.
- Post-write decrypt failures degrade safely (`decryptCommittedRow`, `decryptDashboardNote`, `decryptVersionRowOrDegrade`): metadata kept, title/content emptied, **ciphertext never surfaced**, `decryptionFailed` flagged to the action result.
- `NOTE_ENCRYPTION_KEY` required in `envSchema` (64-hex, case-insensitive — aligned with parser), validated at startup via `instrumentation.ts` (fail-fast), and re-checked per call with a cached `CryptoKey`.

**Security — PASS (after B1 commit)**
- Impl-review finding F1 (PUBLIC EXECUTE on SECURITY DEFINER RPCs) has a correct fix-forward migration covering all three RPCs, matching the prior-art pattern in `20260828000000_create_rate_limits_rpc.sql`.
- Secrets stay server-side; logger redacts keys/secrets/tokens; `npm audit` (prod deps): **0 vulnerabilities**; CSP + security headers + HSTS configured.

**Tests — PASS**
- `note-crypto.test.ts`: 14 tests covering round-trip (incl. emoji/CJK, `v1:`-prefixed plaintext), tamper rejection, AAD cross-note rejection, wrong-key rejection, empty-string, non-determinism, envelope shape (16-byte IV, 16-byte GCM tag).
- Full suite: 575/575 passed; coverage 96.9% stmts / 91.4% branches / 97.1% funcs / 97.6% lines (threshold 80%); `note-crypto.ts` itself 94.7% lines.
- Integration (live Supabase): 4/4 passed at implementation time. Typecheck and lint pass on the working tree.

## Risk Assessment & Rollback Criteria

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Deploy from HEAD ships vulnerable RPC (B1) | Medium pre-commit | High | Commit fix before any deploy; verify migration applied |
| Deploy without `NOTE_ENCRYPTION_KEY` secret | Medium | High (all writes fail) | Phase 4 order: secret → deploy; startup fail-fast surfaces it immediately |
| Legacy plaintext rows post-deploy | Low (prod is test data) | Medium (rows show as "undecryptable") | One-time wipe before deploy; verify counts = 0 |
| Key loss | Low | Critical (permanent data loss) | Secure key backup; enable Supabase PITR before wipe |
| Corrupt ciphertext in DB | Low | Low (per-row degradation works) | None needed — placeholder + notice UX already ships |
| Rollback of app post-wipe | — | High (old code can't read ciphertext) | **Rollback criterion**: app rollback is safe (old UI fails closed/renders notices) but **data rollback is impossible after the wipe** — PITR snapshot is the only data-restore path |

**Rollback plan**: (1) app-level — redeploy previous Worker version; expect decryption notices on all notes until re-forwarded (fail-closed, no leak); (2) data-level — Supabase PITR to pre-wipe snapshot only, which also reverts to pre-encryption schema state; (3) migrations are forward-only — never roll back SQL.

## Post-Deployment Verification Checklist

1. [ ] `SELECT COUNT(*) FROM notes;` / `note_versions;` → 0 immediately post-wipe, pre-deploy
2. [ ] `wrangler secret list` shows `NOTE_ENCRYPTION_KEY`, `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
3. [ ] `GET /api/health` → 200, `checks.database.status: "up"`
4. [ ] Startup audit row appended to `info` table for version 0.5.0
5. [ ] Prod smoke: create note with empty title → shows "Untitled Note"; edit it; open version history → both versions render plaintext
6. [ ] Supabase Studio: `notes.title`/`content` and `note_versions` rows all match `v1:<base64>:<base64>` — zero plaintext
7. [ ] Delete note with wrong password → "Invalid password" (no deletion); correct password → deleted, versions cascaded
8. [ ] Verify RPC grants in Studio: only `service_role` (+owner) has EXECUTE on `create_note_with_version`, `update_note_with_version`, `create_dashboard_with_users`
9. [ ] Deliberately corrupt one ciphertext cell (test dashboard) → tile shows "Note unavailable" notice; rest of dashboard still renders
10. [ ] CF Workers Logs show structured JSON, no `[REDACTED]` bypasses, no plaintext note content in any log line

## Next Steps (Prioritized)

1. **Commit the S-07 triage working tree** (B1) — fix migration, degradation code, `.env.example`, tests; push; CI green.
2. **Execute + document Phase 4** (B2) — PITR snapshot → verify counts → wipe → set secret → deploy → smoke; append runbook to `docs/deployment.md`.
3. **Back up `NOTE_ENCRYPTION_KEY`** in a secure store and enable Supabase PITR (B3).
4. Add worker-build + E2E gates to CI (C1).
5. File follow-ups: typed version-conflict error code (C2), CSP nonces (C3), env consolidation in the Supabase adapter (C4).
