# Note Encryption at Rest (Title + Content) Implementation Plan

## Overview

Encrypt `notes.title`/`notes.content` and `note_versions.title`/`note_versions.content` at rest with AES-256-GCM envelope encryption inside the `SupabaseDatabaseClient` adapter — the single choke point of the `DatabaseClient` port. Adds a required `NOTE_ENCRYPTION_KEY` Worker secret, an "Untitled Note" title default, a one-time wipe of legacy prod test data, and fixes the E2E cleanup fixture that deletes by plaintext title patterns.

## Current State Analysis

- All note content is stored as plaintext `TEXT` (supabase/migrations/20260819000000_create_dashboard_schema.sql:45-46, 64-65). DB credentials alone (service-role key, Supabase console, backups) suffice to read every note.
- Plaintext flows through exactly 3 Server Actions (`src/actions/notes.ts:118, 214, 477`) into `SupabaseDatabaseClient` (writes `src/lib/supabase.ts:414, 437`; reads `:461, :481, :500`) and out through 2 pages (`dashboard/[hash]/page.tsx:55`, `note/[noteId]/page.tsx:76`). RPCs `create_note_with_version` / `update_note_with_version` accept content opaquely and pass it through.
- `src/lib/crypto.ts` already hosts edge-compatible WebCrypto utilities (PBKDF2, constant-time compare) — the natural home for AES-GCM helpers.
- Content-required validation already exists (`src/schemas/notes.ts:19-21, 41-43`): `min(1)` + non-whitespace refine on both create and update. Only the title default is new.
- Create normalizes empty title to `""` persisted (`src/schemas/notes.ts:16`); update maps explicit `""` to "intentionally clear the title" (`src/schemas/notes.ts:36-38`).
- `src/__tests__/lib/supabase.test.ts` tests the adapter against a mocked Supabase client — these tests WILL change (mocked RPC calls will receive ciphertext). Actions-level tests that mock the adapter stay untouched except for one assertion forced by the Phase 2 title transform (`title: ""` → `"Untitled Note"` in `src/__tests__/actions/notes.test.ts`; impl-review F10).
- E2E `cleanupE2ENotes` (`e2e/fixtures/test-base.ts:96-98`) deletes by `title.like` patterns — silently broken once titles are ciphertext.
- Integration tests need `NOTE_ENCRYPTION_KEY` in the environment or `getEnv()` throws.

### Key Discoveries:

- Port/adapter architecture makes this a single-implementation change — no actions, no rate limiting, no auth changes (research §3, verified). One UI surface is added regardless: an encryption error component for the fail-closed decrypt path (Phase 2, step 4).
- Decryption must live inside the adapter and complete before `dto.ts:20` slices content to 300 chars — otherwise tiles render ciphertext garbage.
- Encryption must happen after Zod validation so the 200/10 000 limits stay byte-semantic on plaintext.
- Optimistic concurrency (`version mismatch`, rpcs.sql:122) and the `p_title IS NULL` keep-title sentinel are transport-level and survive untouched.
- **AAD vs. create-time note ID conflict** (see Critical Implementation Details) — the research's "zero RPC changes" assumption does not fully hold.

## Desired End State

- Every non-empty note title/content (notes + all versions) is stored as `v1:<iv_b64>:<ciphertext_b64>` in the existing TEXT columns, AES-256-GCM, 128-bit random IV, AAD = note ID, key from the required `NOTE_ENCRYPTION_KEY` env secret.
- Reads decrypt inside the adapter; downstream consumers (actions, DTO mapper, diff, drawer) receive plaintext exactly as today.
- Decrypt accepts only a valid `v1:` envelope — any non-envelope value or decrypt failure fails closed (no legacy/plaintext support; review decision, 2026-09-13).
- Empty titles never persist: they normalize to `"Untitled Note"` at the Zod schema layer.
- Prod test data wiped once; new prod data is encrypted from the first write.
- Full gates pass: typecheck, lint, 80% coverage, integration, E2E.

### Key Discoveries:

- `SupabaseDatabaseClient` is the sole `DatabaseClient` implementation (src/lib/supabase.ts) — all unit tests mocking the port stay untouched.
- Supabase-native column encryption (pgsodium/TCE) is deprecated-by-design; app-level Worker encryption is the correct layer (research §External 2).
- WebCrypto AES-GCM costs ~0.04–0.07 ms/KiB — negligible against the 2s NFR (prd.md:141).

## What We're NOT Doing

- No zero-knowledge/E2EE — the server can decrypt by design (PRD guardrail is defense-in-depth, not E2EE).
- No encryption of dashboard metadata, dashboard titles/descriptions, or future media — deferred until the parked media slice returns.
- No backfill script or admin route — replaced by a one-time prod data wipe (test data only, count-verified first).
- No key-ID registry, no Strategy 2 rotation machinery — envelope `v1:` prefix + dual-format reads keep the Strategy 1 path (re-encrypt later) open without code today.
- No schema type changes (TEXT columns unchanged), no destructive SQL, no `down` migrations.
- No changes to auth, rate limiting, optimistic concurrency semantics, or the S-05 diff design.

## Implementation Approach

Envelope encryption at the adapter choke point: writes encrypt title/content immediately before the RPC call; reads decrypt title/content immediately after fetch. A dedicated `src/lib/note-crypto.ts` module owns the format and primitives so the adapter stays thin and the crypto is independently testable. Every stored value is a `v1:` envelope — non-envelope values fail closed on read (review decision, 2026-09-13). One additive migration extends `create_note_with_version` with an optional pre-generated note ID so AAD binding works at creation time. The "Untitled Note" default lives in the Zod schemas — one normalization point inherited by all callers.

## Critical Implementation Details

- **AAD vs. create-time note ID (load-bearing conflict)**: the research decision "AAD = note ID" binds ciphertext to its row, but at `createNote` time the note UUID does not exist yet — the RPC generates it server-side. Resolution: the adapter pre-generates the UUID (`crypto.randomUUID()`), uses it as AAD, and passes it to the RPC; this requires an additive optional parameter (`p_note_id uuid DEFAULT NULL`) on `create_note_with_version`, with `COALESCE(p_note_id, gen_random_uuid())` preserving existing behavior. This is the plan's only RPC touch and it is additive and forward-safe. All other paths (update, all reads) already have the note ID in scope.
- **Strict envelope-only contract (review decision, 2026-09-13)**: there is no plaintext passthrough of any kind. `encryptNoteField` always encrypts — including the empty string — so every stored value is a `v1:` envelope. `decryptNoteField` accepts only a valid `v1:` envelope and throws on anything else (fail closed). This removes the earlier `v0:` escape design: a plaintext starting with the literal `v1:` is now encrypted like any other content, and a stray legacy plaintext row (e.g. from a restored backup) fails closed instead of surfacing as plaintext. Round-trip tests must include a plaintext title starting with `v1:` and a non-envelope decrypt rejection.
- **Base64 on Workers**: ciphertext bytes → base64 must avoid `String.fromCharCode(...spread)` on unbounded arrays; content is capped at 10 000 chars so chunked conversion is a safe bound. Use the existing bytes/hex helper style of `src/lib/crypto.ts` as the convention reference.
- **Timing-safe tamper handling**: rely on GCM tag verification failure (decrypt rejection) rather than any manual comparison — per research §Architecture Insights (Cloudflare timing warning).
- **Wipe-before-deploy ordering (Phase 4)**: the Worker secret must be set and the prod `notes` table wiped _before_ the encrypted app serves traffic, so no plaintext row is ever read by an expecting-to-decrypt path and no ciphertext is written by a keyless deploy.

## Phase 1: Crypto Core + Required Env Key

### Overview

Build the self-contained encryption module and its failure semantics, and make `NOTE_ENCRYPTION_KEY` a required, validated environment variable. Nothing else changes yet — the module ships with zero callers.

### Changes Required:

#### 1. Encryption module

**File**: `src/lib/note-crypto.ts`

**Intent**: Own the envelope format and all AES-GCM primitives so the adapter and tests share one implementation.

**Contract**:

- `encryptNoteField(plaintext: string, noteId: string): Promise<string>` — returns `v1:<iv_b64>:<ciphertext_b64>`; always encrypts, including the empty string (strict envelope-only contract).
- `decryptNoteField(stored: string, noteId: string): Promise<string>` — only valid `v1:` envelopes are accepted and decrypted with AAD = `noteId`; any non-envelope value or decrypt failure throws (fail closed; no legacy/plaintext support).
- `isEncryptedEnvelope(value: string): boolean` — strict prefix check.
- Envelope format (the contract other phases depend on):
  ```
  v1:<iv_128bit_b64>:<ciphertext_b64>
  ```
  AES-256-GCM, 128-bit random IV per write (`crypto.getRandomValues`), AAD = note ID (UTF-8), key = `getEnv().NOTE_ENCRYPTION_KEY` — a 64-hex-char string decoded to exactly 32 bytes (following the hex helper style of `src/lib/crypto.ts`) before `importKey("raw", …, "AES-256")`, which requires byte-exact 32-byte key material (a raw 44-char base64 string as produced by `openssl rand -base64 32` would throw).

#### 2. Env schema field

**File**: `src/lib/env.ts`

**Intent**: Make the encryption key a required secret with no fallback, matching the `SESSION_SECRET` pattern but without the service-key fallback antipattern H-01 is removing.

**Contract**: `NOTE_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, "NOTE_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)")` added to `envSchema`, and the field added to the explicit mapping inside `getEnv()` (env.ts:34-43) — a schema entry without the `getEnv` mapping will fail silently. The hex format makes validation byte-exact for the AES-256 raw key import.

#### 3. Env example

**File**: `.env.example`

**Intent**: Document the new required secret for local setup.

**Contract**: `NOTE_ENCRYPTION_KEY=` entry with guidance to generate via `openssl rand -hex 32` (NOT the base64 style of the SESSION_SECRET line — base64 output is 44 chars and cannot be used as raw AES-256 key material).

#### 4. Unit tests

**File**: `src/__tests__/lib/note-crypto.test.ts`, update `src/__tests__/lib/env.test.ts`

**Intent**: Cover the crypto contract and the new env requirement.

**Contract**: round-trip; tampered ciphertext rejects; wrong-key rejects; decrypting a valid envelope with a different noteId rejects (AAD binding); non-envelope values reject on decrypt (fail closed — no plaintext support); empty-string input encrypts into a valid envelope and round-trips; `v1:`-prefixed plaintext encrypts into a real envelope and round-trips back to the original; envelope is non-deterministic across calls (fresh IV); `envSchema` rejects a missing, malformed (non-hex), or wrong-length `NOTE_ENCRYPTION_KEY`; a 64-hex-char key decodes to exactly 32 bytes for import.

### Success Criteria:

#### Automated Verification:

- Targeted unit tests pass: `npx vitest run src/__tests__/lib/note-crypto.test.ts src/__tests__/lib/env.test.ts`
- Type checking passes: `npm run check:type`
- Linting passes: `npm run lint`

#### Manual Verification:

- None — no user-visible behavior yet.

**Implementation Note**: Run targeted tests only in this phase; reserve the full suite for Phase 3 (per `context/foundation/lessons.md`).

---

## Phase 2: Adapter Wiring + Title Default + AAD-Capable Create RPC

### Overview

Wire encryption into the 5 adapter methods, extend the create RPC with an optional pre-generated note ID for AAD binding, and normalize empty titles to "Untitled Note" in both Zod schemas. Update the adapter and schema unit tests that now see ciphertext.

### Changes Required:

#### 1. Additive RPC migration

**File**: `supabase/migrations/<timestamp>_create_note_with_version_optional_id.sql`

**Intent**: Allow the adapter to supply a pre-generated note ID so the creation-time ciphertext can bind AAD = note ID.

**Contract**: `CREATE OR REPLACE FUNCTION create_note_with_version(..., p_note_id uuid DEFAULT NULL)` — new trailing optional parameter; internal insert uses `COALESCE(p_note_id, gen_random_uuid())`. Existing callers (none besides the adapter) keep working unchanged. Forward-only, additive.

**Privileges + overload hygiene (load-bearing)**: because `CREATE OR REPLACE` with a changed argument list creates a _new_ function identity, the migration must repeat the existing hardening on the new 5-arg signature — `REVOKE ALL ON FUNCTION public.create_note_with_version(uuid, text, text, uuid, uuid) FROM anon, authenticated;` and `GRANT EXECUTE ... TO service_role` — otherwise the new overload gets default PUBLIC EXECUTE privileges (existing grants live at 20260820000000_create_dashboard_rpcs.sql:138, 142). The migration also `DROP FUNCTION public.create_note_with_version(uuid, text, text, uuid);` to remove the now-unused 4-arg overload (no other callers exist; additive cleanup, no destructive data SQL).

#### 2. Adapter encryption

**File**: `src/lib/supabase.ts`

**Intent**: Encrypt on write, decrypt on read — all downstream consumers keep receiving plaintext.

**Contract**:

- `createNote` (supabase.ts:414): pre-generate `note_id = crypto.randomUUID()`, encrypt title/content with AAD = that ID, pass `p_note_id`; decrypt the returned `note` + `initialVersion` before returning.
- `updateNote` (supabase.ts:437): encrypt title/content with AAD = `input.note_id`; `p_title` stays `input.title ?? null` (sentinel preserved); decrypt the returned `note` + `newVersion`.
- `getNotesByDashboard` (supabase.ts:461), `getNoteById` (supabase.ts:481): decrypt `title` + `content` of each row, AAD = row `id`.
- `getNoteVersions` (supabase.ts:500): decrypt `title` + `content` of each row, AAD = row `note_id`.
- Decryption happens before return — before the `dto.ts:20` 300-char slice and before any action consumes the result.
- **Per-note degradation for the dashboard listing (review decision, 2026-09-13)**: `getNotesByDashboard` returns `DashboardNote[]` — a discriminated union of `{ status: "ok", note }` and `{ status: "undecryptable", id, version, updated_at }`. A row whose ciphertext fails decryption is logged server-side and degraded to an `undecryptable` placeholder (safe metadata only — never ciphertext) so one corrupt note never blanks the whole dashboard. Single-note read `getNoteById` still throws (fail closed) and is handled by the note page — see step 4.
- **Addendum (v2 review triage, 2026-09-13)**: `getNoteVersions` degrades corrupt version rows to empty title/content instead of throwing (prevents blanking the whole version history and version-bump loops) — supersedes the "still throw" wording above. Also: `getNoteById` accepts optional `{ metadataOnly: true }` — on decrypt failure it returns real metadata with empty title/content instead of throwing, used by `deleteNoteAction`'s ownership precheck (deletion needs no plaintext); the display path and `updateNoteAction` keep failing closed, the latter with a dedicated "cannot edit" message.

#### 3. Title default in schemas

**File**: `src/schemas/notes.ts`

**Intent**: Empty titles never persist — create and explicit-clear both normalize to the literal "Untitled Note".

**Contract**:

- `createNoteSchema.title` (schemas/notes.ts:9-16): transform empty/whitespace-only to `"Untitled Note"` instead of `undefined`.
- `updateNoteSchema.title` (schemas/notes.ts:30-38): explicit `""` now maps to `"Untitled Note"` (reset-to-default) instead of `""` (clear); `undefined` (absent) still maps to the keep-title path — the RPC's `p_title IS NULL` sentinel is untouched.
- Update the two inline comments to document the new semantics.

#### 4. Encryption error component

**File**: `src/components/EncryptionErrorNotice.tsx` (export from `src/components/index.ts`)

**Intent**: Give users a clear, non-technical surface for the fail-closed path: when a note (or its versions) cannot be decrypted, the UI explains the problem instead of crashing or leaking ciphertext.

**Contract**:

- A Material-UI `Alert` with `severity="error"` (matching the `RateLimitNotice` component style) that renders a generic message: the note's content is unavailable because of an encryption problem, with a hint to try again later — no ciphertext, key material, or stack details ever reach the client.
- The note page (`note/[noteId]/page.tsx`) wraps the adapter read in a try/catch that distinguishes decryption failure (log server-side, render `EncryptionErrorNotice` instead of the note content) — a missing note and a corrupt note render differently, per the fail-closed contract of `decryptNoteField`.
- The dashboard page (`dashboard/[hash]/page.tsx`) no longer needs a crypto catch: the adapter degrades undecryptable rows to `undecryptable` placeholders (see step 2), which `NoteTile` renders as a distinct error-styled "Note unavailable" card (no note content, no ciphertext, no editor link) while healthy notes render normally.

#### 5. Adapter + schema test updates

**Files**: `src/__tests__/lib/supabase.test.ts`, `src/__tests__/schemas/notes.test.ts`, `.env.ai`

**Intent**: Align tests with ciphertext-at-the-boundary behavior and the new title semantics.

**Contract**:

- `supabase.test.ts`: mocked RPC assertions now expect encrypted `p_title`/`p_content` (assert envelope-shape via `isEncryptedEnvelope`, not exact bytes — ciphertext is non-deterministic); mocked return values supply ciphertext the adapter must decrypt back to the asserted plaintext; create assertions verify `p_note_id` is a valid UUID; the suite's `process.env` snapshot must include a valid 64-hex-char `NOTE_ENCRYPTION_KEY` (via the existing env snapshot/restore block, supabase.test.ts:34-43) — adapter methods now call `getEnv()` through note-crypto, so unit tests throw env-validation errors without it.
- `schemas/notes.test.ts`: empty/whitespace title now expects `"Untitled Note"`; update with explicit `""` expects `"Untitled Note"`.
- All env files carry the new key stub: `.env.example` (Phase 1), `.env.ai` (integration), and the unit-suite env stub above — any environment that exercises `getEnv()` needs a valid `NOTE_ENCRYPTION_KEY` or validation fails.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npm run db:reset`
- Targeted unit tests pass: `npx vitest run src/__tests__/lib/supabase.test.ts src/__tests__/schemas/notes.test.ts src/__tests__/actions src/__tests__/components`
- Type checking passes: `npm run check:type`
- Linting passes: `npm run lint`
- Integration tests pass: `set -a && . ./.env.ai && set +a && npm run test:integration`

#### Manual Verification:

- Create a note with an empty title via the dev UI → tile shows "Untitled Note"; DB row shows a `v1:`-prefixed ciphertext for title and content (inspect via Supabase studio).
- Edit the note and open version history → both versions render plaintext, delta chips and word diff work.
- Corrupt a `v1:` ciphertext value directly in the DB (flip bytes in the studio) → the page loads and renders `EncryptionErrorNotice` instead of crashing; no ciphertext or error details leak to the UI; the failure is logged server-side.

**Implementation Note**: Pause for the manual verification above before Phase 3 — this is the first user-visible encryption behavior.

---

## Phase 3: E2E Fixture Fix + Full-Suite Gates

### Overview

Fix the only known encryption-induced test breakage and run every gate, including the full coverage threshold and the Playwright suite.

### Changes Required:

#### 1. E2E cleanup fixture

**File**: `e2e/fixtures/test-base.ts`

**Intent**: Replace the plaintext-title-LIKE deletion with a content-independent, run-scoped criterion that preserves pre-existing local data (reviewer override, 2026-09-13: delete-all `.neq("id", "")` was rejected so local notes outside the E2E run are never wiped).

**Contract**: `registerCreatedDashboard(hash)` is called from two places: (a) the `createTestDashboard` fixture when the wizard succeeds, and (b) an auto per-test route hook that registers the hash from every `/dashboard/<hash>` URL the page requests (covers specs that drive the wizard manually, e.g. `golden-path.spec.ts`). Registration mirrors hashes into an NDJSON registry file (default `test-results/e2e-created-dashboards.jsonl`, override via `E2E_DASHBOARD_REGISTRY`) because Playwright test workers and global teardown run in separate Node processes — the module-level `Set` alone is invisible to teardown. `cleanupE2ENotes` (test-base.ts:90+) runs once after the suite via `e2e/global-teardown.ts`, merges the in-memory set with the file, resolves dashboard IDs (`.in("hash", hashes)`), and deletes only `notes` rows whose `dashboard_id` is in that set — no-op when nothing was registered; registry is truncated on success, stale entries are idempotent next run. `isLocalSupabaseUrl` additionally accepts `host.docker.internal` (the local-Docker URL convention in `.env.ai`), since the previous localhost-only guard silently disabled cleanup in Docker environments. Deleting by `dashboard_id` is orthogonal to the note-title ciphertext, so it stays correct under encryption.

#### 2. Full-suite verification

**Files**: none (verification only)

**Intent**: Prove the 80% coverage gate and all E2E flows survive the change end-to-end.

**Contract**: none — run the gates.

### Success Criteria:

#### Automated Verification:

- Full unit suite with coverage passes: `npm run test`
- Type checking passes: `npm run check:type`
- Linting passes: `npm run lint`
- Integration tests pass: `set -a && . ./.env.ai && set +a && npm run test:integration`
- E2E suite passes: `set -a && . ./.env.ai && set +a && npm run test:e2e`

#### Manual Verification:

- Dashboard tiles render note previews as plaintext (300-char slice intact).
- Editor load, edit, save, version history drawer, and version restore all work in the local dev app.
- No ciphertext visible anywhere in the UI.

**Implementation Note**: Pause for full manual confirmation before the prod phase.

---

## Phase 4: Prod Wipe + Deploy Runbook

### Overview

Execute the one-time data decision (wipe prod test notes), set the Worker secret, deploy, and verify. This phase is a documented operational procedure, not a code change (besides docs).

### Changes Required:

#### 1. Deployment documentation

**Files**: `docs/deployment.md` (and/or `context/deployment/deploy-plan.md`), `context/foundation/roadmap.md`

**Intent**: Make the new secret and its ordering requirement part of the standing deploy checklist.

**Contract**:

- Add `NOTE_ENCRYPTION_KEY` to the secrets checklist with the ordering note: secret set → prod notes wiped → deploy.
- Add the key to the H-01 pre-deploy gate list (roadmap.md:263) so future hardening work covers it.
- Note that migration `20260913000000_create_note_with_version_optional_id.sql` drops the old 4-arg `create_note_with_version(uuid, text, text, uuid)` overload when it applies (impl-review F4) — ops should expect the function identity to swap atomically during migration; the sole caller (the adapter) already uses the 5-arg signature.

#### 2. One-time prod wipe (operational step, documented in the runbook section)

**Files**: none — SQL executed once via Supabase SQL editor.

**Intent**: Remove legacy plaintext test data so no plaintext rows persist after deploy.

**Contract**:

1. `SELECT COUNT(*) FROM notes;` and `SELECT COUNT(*) FROM note_versions;` — confirm only test data (agreed loss-of-data decision, 2026-09-13).
2. `DELETE FROM notes;` — FK cascade removes `note_versions`.
3. Re-count → 0 rows.
4. `wrangler secret put NOTE_ENCRYPTION_KEY` (or dashboard equivalent) with a fresh ≥32-char key.
5. `npm run deploy`.
6. Prod smoke: create + edit a note; verify `v1:` ciphertext in the studio, plaintext in the UI.

### Success Criteria:

#### Automated Verification:

- Post-deploy prod smoke passes via the running app (create/edit/version-history round-trip).
- `SELECT COUNT(*)` on prod `notes`/`note_versions` returns 0 pre-deploy, >0 post-smoke with `v1:`-prefixed values only.

#### Manual Verification:

- Prod tiles/editor render plaintext; prod DB shows ciphertext only.
- Runbook (secret ordering, wipe steps, counts) documented and committed.

---

## Testing Strategy

### Unit Tests:

- `note-crypto.test.ts`: round-trip, tamper rejection, wrong-key rejection, AAD note-ID binding (cross-note decrypt fails), non-envelope decrypt rejection (fail closed), empty-string encryption round-trip, non-deterministic envelopes.
- `env.test.ts`: required key, 64-hex-char format enforcement.
- `supabase.test.ts`: ciphertext at RPC boundary, plaintext at method boundary, `p_note_id` UUID on create, sentinel `p_title: null` on update without title.
- `schemas/notes.test.ts`: "Untitled Note" defaulting for create and explicit-clear update; content-required rules unchanged.
- `components/EncryptionErrorNotice.test.tsx`: renders the error alert with generic (non-technical) copy and never renders note content or ciphertext.

### Integration Tests:

- `note-concurrency.integration.test.ts` passes transparently with `NOTE_ENCRYPTION_KEY` in env — live-DB round-trips now store and return ciphertext internally while asserting plaintext results.

### Manual Testing Steps:

1. Create note with empty title → "Untitled Note"; encrypted row in studio.
2. Edit note twice → version history drawer shows both versions with correct delta chips and word-level diff.
3. Restore an older version → editor and tiles reflect restored plaintext.
4. Confirm no `v1:` string ever surfaces in any UI surface.

## Performance Considerations

- AES-GCM ~0.04–0.07 ms/KiB via WebCrypto native path; full dashboard decrypt is ≪1 ms CPU against the free-plan 10 ms/request budget and the 2s NFR (prd.md:141).
- Base64 + IV overhead (~+33% size + ~28 B/field) marginally worsens the pre-existing S-04 payload bloat concern (roadmap.md:147) — accepted, not addressed here.

## Migration Notes

- Forward-only: the single migration is additive (`CREATE OR REPLACE` with a defaulted optional parameter). No destructive SQL; the prod wipe is a data operation, not a migration.
- Strict envelope-only reads: any stray legacy plaintext row (e.g. from a restored backup) fails closed rather than surfacing as plaintext — the Phase 4 prod wipe ensures no such rows exist.
- Rotation (future, out of scope): re-encrypt with a new key by decrypt-with-old/re-encrypt-with-new over all rows — the `v1:` envelope + AAD contract is rotation-ready.

## References

- Research: `context/changes/note-encryption/research.md`
- Choke point: `src/lib/supabase.ts:414-534`
- Crypto conventions: `src/lib/crypto.ts`
- Env pattern: `src/lib/env.ts`, `.env.example:24`
- E2E breakage: `e2e/fixtures/test-base.ts:87-106`
- Prior art: `context/changes/testing-note-versioning-and-concurrency-integrity/reviews/production-readiness-report.md` (H-01 secret antipatterns to avoid)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Crypto Core + Required Env Key

#### Automated

- [x] 1.1 Targeted unit tests pass (`note-crypto.test.ts`, `env.test.ts`) — 534c093
- [x] 1.2 Type checking passes — 534c093
- [x] 1.3 Linting passes — 534c093

### Phase 2: Adapter Wiring + Title Default + AAD-Capable Create RPC

#### Automated

- [x] 2.1 Migration applies cleanly (`npm run db:reset`) — 7aca035
- [x] 2.2 Targeted unit tests pass (adapter, schemas, actions) — 7aca035
- [x] 2.3 Type checking passes — 7aca035
- [x] 2.4 Linting passes — 7aca035
- [x] 2.5 Integration tests pass — 7aca035

#### Manual

- [x] 2.6 Empty title → "Untitled Note"; `v1:` ciphertext verified in studio; version history renders plaintext — 7aca035
- [x] 2.7 Encryption error component implemented with unit test; corrupted ciphertext in DB renders the notice instead of crashing — 7aca035

### Phase 3: E2E Fixture Fix + Full-Suite Gates

#### Automated

- [x] 3.1 Full unit suite with coverage passes
- [x] 3.2 Type checking passes
- [x] 3.3 Linting passes
- [x] 3.4 Integration tests pass
- [x] 3.5 E2E suite passes

#### Manual

- [x] 3.6 Tiles, editor, version history, restore verified in local dev app; no ciphertext in UI

### Phase 4: Prod Wipe + Deploy Runbook

#### Automated

- [ ] 4.1 Prod smoke round-trip passes post-deploy
- [ ] 4.2 Prod row counts verified (0 pre-deploy, encrypted-only post-smoke)

#### Manual

- [ ] 4.3 Prod UI renders plaintext, DB ciphertext-only; runbook documented and committed
