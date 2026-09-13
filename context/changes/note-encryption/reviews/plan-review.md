<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Note Encryption at Rest (Title + Content)

- **Plan**: context/changes/note-encryption/plan.md
- **Mode**: Deep
- **Date**: 2026-09-13
- **Verdict**: REVISE (→ SOUND after triage)
- **Findings**: 1 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL → PASS (all fixed) |
| Plan Completeness | WARNING → PASS (fixed) |

## Grounding

10/10 paths ✓, 5/5 symbols ✓, brief↔plan ✓, Progress↔Phase consistent ✓ (4 phases, 15 steps map 1:1). Sub-agent verification confirmed the choke-point analysis: the 5 adapter methods are the only note read/write paths, restore routes through `updateNote`, decrypt-before-dto-slice holds.

## Findings

### F1 — Key material spec: plan's own key-generation guidance fails raw importKey

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Encryption module contract (plan.md:84, 92, 100)
- **Detail**: Plan said key is "imported as a raw AES-GCM key" with only `z.string().min(32)` validation, and `.env.example` mirrors the SESSION_SECRET guidance (`openssl rand -base64 32` → ~44-char base64 string). `importKey("raw", …, "AES-256")` requires exactly 32 bytes, so a key generated per the plan's own guidance would throw on first encrypt/decrypt. No decode/derive step existed anywhere in plan.md or research.md; src/lib/crypto.ts has only private hex helpers.
- **Fix A ⭐ Recommended**: Specify key decoding + hex guidance in the contract
  - Strength: Smallest change; hex-decode (64 hex chars → 32 bytes) with strict length check reuses the repo's established hex helper style; validation becomes byte-exact.
  - Tradeoff: Adds a decode step + one more unit test.
  - Confidence: HIGH — verified no existing decode helper; hex style already established.
  - Blind spot: None significant.
- **Fix B**: Derive the AES key via SHA-256(getEnv().NOTE_ENCRYPTION_KEY)
  - Strength: Accepts any ≥32-char secret; no operator discipline needed.
  - Tradeoff: Changes the documented "raw key" crypto contract.
  - Confidence: MED — works, but weakens entropy awareness.
  - Blind spot: Rotation tooling must never change the derivation, only the secret.
- **Decision**: FIXED (Fix A)

### F2 — Migration omits REVOKE/GRANT; new 5-arg RPC is PUBLIC-executable

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Additive RPC migration (plan.md:136-141)
- **Detail**: PostgreSQL `CREATE OR REPLACE FUNCTION` with a changed argument list creates a new function identity (overload). Existing REVOKE/GRANT (20260820000000_create_dashboard_rpcs.sql:138, 142) bind to the 4-arg signature only; the new 5-arg function would get default PUBLIC EXECUTE privileges, and the old 4-arg overload stays callable. Migration contract didn't mention repeating REVOKE/GRANT.
- **Fix**: Extend the migration contract to repeat REVOKE ... FROM anon, authenticated / GRANT EXECUTE TO service_role on the new signature.
  - Strength: Matches the existing hardening pattern verbatim; zero risk.
  - Tradeoff: None.
  - Confidence: HIGH — standard PG overload semantics, verified.
  - Blind spot: Optionally drop the unused 4-arg overload in a later additive migration.
- **Decision**: FIXED (custom: repeat grants + DROP the old 4-arg overload in the same migration)

### F3 — Required env key breaks adapter unit tests; plan only covers integration env

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Adapter + schema test updates (plan.md:166-175)
- **Detail**: Once `NOTE_ENCRYPTION_KEY` is required in `envSchema`, note-crypto calls `getEnv()` inside every adapter method. Adapter unit tests inject a mocked client and set no env (setup.ts is a single jest-dom import; vitest loads no env file) — they would throw `[Scytala Env Validation Failed]` wholesale. Plan added the key to `.env.ai` for integration tests only.
- **Fix**: Add NOTE_ENCRYPTION_KEY to the unit test env (stubEnv in supabase.test.ts beforeEach, or the shared setup.ts).
  - Strength: One-line fix where tests already snapshot/restore process.env (supabase.test.ts:34-43).
  - Tradeoff: None.
  - Confidence: HIGH — verified no unit test currently sets env for getEnv.
  - Blind spot: Other suites reaching getEnv transitively (audit) may need the same stub.
- **Decision**: FIXED (custom: all env files + unit-suite env snapshot carry the key)

### F4 — Plaintext starting with literal "v1:" would fail closed

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details — empty-string carve-out (plan.md:57)
- **Detail**: A legacy plaintext title literally starting with "v1:" would be misdetected as an envelope and its decrypt would throw. After the prod wipe this is theoretical, but user content makes the collision possible.
- **Fix**: Optionally note the collision edge case in the dual-format doc line.
- **Decision**: FIXED (custom: `v0:` escape mechanism in encryptNoteField/decryptNoteField with three-shape recognition; round-trip test for `v1:`-prefixed plaintext)

## Triage Summary

- Fixed: F1 (Fix A), F2 (custom), F3 (custom), F4 (custom) — 4
- Skipped / Accepted / Dismissed: none
- **Verdict after fixes: SOUND**
