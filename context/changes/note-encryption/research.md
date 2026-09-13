---
date: 2026-09-13T08:06:28+00:00
researcher: opencode (parallel sub-agents)
git_commit: 2d93702c7f26ec994b89f5b8fc4f9fe9e1a278d0
branch: feature/note_encryption
repository: palucdev/scytala
topic: "Impact and cost of full note encryption (title + content) at rest in the DB, decrypted only for read/edit; alignment with PRD and roadmap"
tags: [research, codebase, encryption, aes-gcm, supabase, cloudflare-workers, notes]
status: complete
last_updated: 2026-09-13
last_updated_by: opencode (parallel sub-agents)
last_updated_note: "Resolved open questions with user: 128-bit IV, AAD = note ID, envelope-ready-only rotation, local backfill script"
---

# Research: Full Note Encryption (Title + Content) at Rest

**Date**: 2026-09-13T08:06:28+00:00
**Researcher**: opencode (parallel sub-agents)
**Git Commit**: 2d93702c7f26ec994b89f5b8fc4f9fe9e1a278d0
**Branch**: feature/note_encryption
**Repository**: palucdev/scytala

## Research Question

What is the impact and cost of introducing full note encryption in the database (title + content, across all versions), storing the information securely and decrypting it only for read/edit purposes — using a **server-held secret** (key-management approach chosen by the user), with dashboard metadata and other tables out of scope for now? How does it align with `context/foundation/prd.md` and `context/foundation/roadmap.md`?

## Summary

Server-held AES-256-GCM encryption of `notes.title/content` and `note_versions.title/content` is **feasible, cheap, and well-aligned** with the PRD and roadmap:

- **Security value is real but specific**: it converts "DB access = content access" into "DB access + Worker secret = content access". It closes the biggest current gap — anyone with `SUPABASE_SERVICE_ROLE_KEY`, direct DB console access, or a Supabase backup/PITR snapshot reads all note plaintext today. It does **not** protect against a fully compromised Worker (threat c), and it is not zero-knowledge/E2EE. This is compatible with the PRD guardrail ("Note content must not be accessible without valid credentials", prd.md:46), which is a defense-in-depth statement, not a zero-knowledge requirement.
- **Latency cost is negligible vs the 2s NFR** (prd.md:141): AES-GCM via WebCrypto costs ~0.04–0.07 ms per KiB; even 100 notes × 2 fields per dashboard render is <1 ms of CPU on a Worker whose dominant cost is the Supabase fetch (wall-clock, not CPU-billed).
- **Implementation is surgically small**: encryption slots in at a single choke point — the `SupabaseDatabaseClient` adapter (`src/lib/supabase.ts`) — with **zero RPC signature changes, zero React component changes, zero auth/rate-limiting changes**, and zero impact on the already-designed S-05 diff flow (diff is client-side against plaintext delivered after server-side decryption).
- **Cost estimate: ~2–3 days** for one developer (crypto lib + env + adapter wiring, tests to the 80% gate, one-time backfill + runbook).
- **Supabase-native column encryption (pgsodium/TCE) is explicitly not recommended by Supabase itself** ("pending deprecation", "we do not recommend using either"), and Supabase Vault is designed for secrets, not general column encryption — app-level encryption in the Worker is the correct layer, converging with OWASP guidance.

**Recommendation**: Proceed with AES-256-GCM envelope encryption in the Worker (`v1:<iv>:<ciphertext>` versioned envelope, random **128-bit** IV per write, AAD = note ID, `NOTE_ENCRYPTION_KEY` as a Worker secret ≥32 chars in the zod env schema), dual-format reads (unprefixed rows = legacy plaintext), plus a one-time idempotent backfill script (local run-once, per decision 2026-09-13). Store ciphertext in the existing TEXT columns — no schema type change, no RPC changes. Rotation is envelope-ready OWASP Strategy 1 (re-run the backfill with a new key).

## Detailed Findings

### 1. Current state — everything is plaintext at rest

- `notes.title/content` and `note_versions.title/content` are plain `TEXT NOT NULL DEFAULT ''` with **no BYTEA anywhere** and **no index/search over them** (supabase/migrations/20260819000000_create_dashboard_schema.sql:45-46, 64-65).
- RLS is already airtight (service_role only), so the DB enforces *who* can query — but not *what they can read*: the service-role key is the app's own credential, so any leak of it, any Supabase-side insider access, or any backup/dump exposes all notes as readable plaintext.
- Access control today is purely app-layer: session verification in `src/lib/auth-guard.ts:41` before any note query.

### 2. Where plaintext flows (write and read paths)

**Write path** (encrypt before these points):
1. `NoteEditor.tsx:93-94, 115-117` → `createNoteAction`/`updateNoteAction` (`src/actions/notes.ts:118-123, 214-220`) → `db.createNote`/`db.updateNote` (`src/lib/supabase.ts:414-432, 437-456`) → RPCs `create_note_with_version` / `update_note_with_version` (supabase/migrations/20260820000000_create_dashboard_rpcs.sql:57-134) → `notes` + `note_versions`.
2. Zod validation runs on **plaintext** (`src/schemas/notes.ts:9-21`: title ≤200, content ≤10 000) — encryption must happen *after* validation so length limits stay byte-semantic on plaintext.
3. Restore = client replay of `updateNoteAction` with historical plaintext (`NoteEditor.tsx:154-160`).

**Read path** (decrypt at these points):
1. Dashboard tiles SSR: `getNotesByDashboard` (`src/app/dashboard/[hash]/page.tsx:55`) → `mapNotesToDto` (`src/app/dashboard/[hash]/dto.ts:19-20`) — note `dto.ts:20` does `content.slice(0, 300)`, which would produce **ciphertext garbage** if decryption ordering is wrong. Argues for decrypting inside the adapter, keeping all downstream consumers plaintext.
2. Editor SSR: `getNoteById` (`note/[noteId]/page.tsx:76`) → props `initialTitle`/`initialContent` (lines 87-88).
3. Version history: `getNoteVersionHistoryAction` (`src/actions/notes.ts:476-502`) returns full plaintext per version; delta chips and the word-level diff are computed **client-side** (`NoteVersionHistoryDrawer.tsx:164-176`, `NoteVersionPreview.tsx:76-87`, `src/lib/diff.ts:26-99`).

### 3. The choke point: DB adapter, not actions

- `SupabaseDatabaseClient` in `src/lib/supabase.ts` is the single implementation of the `DatabaseClient` port (`src/client/db-client.ts`). Encrypting/decrypting inside the adapter means: **all unit tests that mock the adapter stay untouched**, all Server Actions stay untouched, all React components stay untouched.
- Exactly 4 read methods + 2 write methods change: `getNotesByDashboard` (:461), `getNoteById` (:481), `getNoteVersions` (:500), plus the plaintext JSONB return values of `createNote` (:414) and `updateNote` (:437); writes `createNote`/`updateNote`.
- **RPCs need no changes**: `create_note_with_version` / `update_note_with_version` accept `p_title TEXT, p_content TEXT` and store them opaquely — ciphertext passes through. Postgres cannot perform AES-GCM with a Worker-held key, so all crypto must live in the Worker anyway. The `p_title IS NULL` "keep title" sentinel (rpcs.sql:102-119) survives untouched since it is transport-level, not content-level.
- Optimistic concurrency (`version mismatch` exception, rpcs.sql:122), rate limiting (`check_rate_limit` touches only the `rate_limits` table; limiter keys are dashboard/user/IP — `src/lib/rate-limit.ts:63-99`), and the auth/session lifecycle are fully content-independent — **unaffected**.
- Decryption naturally sits *after* auth in every path: pages verify session before querying (`page.tsx:30→55`), actions verify session before `db.*` calls (`src/actions/notes.ts:98, 178, 305, 449`). An unauthenticated caller never triggers a decrypt.

### 4. PRD alignment

| PRD requirement | Impact |
|---|---|
| Guardrail: content inaccessible without valid credentials (prd.md:46, 140) | **Strengthened (defense-in-depth)**. Today, DB credentials alone suffice; after encryption they no longer do. Semantics preserved: still not zero-knowledge — the server *can* decrypt — but the PRD never demanded E2EE. |
| NFR: page load/sync ≤2s (prd.md:141) | **No measurable impact.** ~0.04–0.07 ms per KiB (WebCrypto AES-GCM, native path); full dashboard decrypt ≪1 ms CPU. Free-plan Workers get 10 ms CPU/request — plenty. Source: benchmarks in JCM paper Table III + Cloudflare limits docs (see External Research §1). |
| Version history preservation (prd.md:48) | **Unaffected** — all versions encrypted identically; envelope prefix `v1:` marks format. |
| Small data volume (prd.md:8-11) | Makes the backfill and any future re-encryption trivial. |

One honest caveat for the PRD spirit: the roadmap already flags S-04 payload bloat on many-version notes (roadmap.md:147); base64+IV overhead (~+33% size + ~28 B per field) marginally worsens an existing, pre-encryption issue.

### 5. Roadmap blast radius

| Slice | Status | Impact |
|---|---|---|
| S-03 CRUD | done | 2 write + 4 read adapter methods; everything else unchanged. |
| S-04 history browser | done | **Zero component changes** if decryption lives in the adapter — drawer, delta chips, word diff, and restore all consume plaintext from the action exactly as today. |
| S-05 sync + diff merge | ready (no change folder yet) | **Zero impact on the plan.** The planned diff is client-side JavaScript (roadmap.md:159) against local plaintext editor state vs server-fetched plaintext (delivered over HTTPS after server-side decryption). No server-side diff is planned. |
| S-06 lifecycle | ready | Dashboard title/description **out of scope** for now (user decision); cascade deletes content-independent. |
| H-01 hardening | proposed | **Natural pairing**: add `NOTE_ENCRYPTION_KEY` to `envSchema` (`src/lib/env.ts:3-19`) — and **do not repeat the fallback-to-service-key antipattern** that H-01 is fixing for `SESSION_SECRET` (`src/lib/session.ts:416-433`). H-01's zod `.max()` caps (roadmap.md:271) additionally bound ciphertext size. Add the secret to the H-01 pre-deploy gate list (roadmap.md:263). |

### 6. Existing data migration (forward-only rule)

Per `context/foundation/lessons.md:11-14`: strictly forward migrations, Expand/Contract, no destructive SQL. And since Postgres cannot do AES-GCM with a Worker-held key, **no pure SQL migration can encrypt existing rows**.

Recommended two-part strategy:

- **Envelope + dual-format reads**: store ciphertext as `v1:<iv_b64>:<ciphertext_b64>` in the existing TEXT columns. Unprefixed rows = legacy plaintext; the adapter's decrypt detects the prefix and passes legacy rows through. TEXT columns need no schema change.
- **One-time idempotent backfill** (Option B): a run-once script (Worker admin route or local script holding `SUPABASE_SERVICE_ROLE_KEY` + `NOTE_ENCRYPTION_KEY`) iterating `notes` + `note_versions`, skipping already-prefixed rows. Crash mid-backfill leaves mixed state, which dual-format reads tolerate. Rejected alternative: double-write Expand/Contract cutover (Option C) — overkill for TEXT columns and this data volume.

Optionally add an additive-only forward migration (e.g. a `key_id` column or comments) — but **no RPC changes and no destructive SQL** in any case.

### 7. Testing impact (80% coverage gate)

- **Unaffected with adapter placement**: `actions/notes.test.ts`, `schemas/notes.test.ts`, all component tests (they mock the adapter or receive plaintext props). Strong argument to keep encryption inside `SupabaseDatabaseClient`, not in the actions.
- **New tests required**: `src/__tests__/lib/note-crypto.test.ts` (round-trip, tamper detection, legacy-plaintext passthrough, wrong-key failure) to satisfy the gate.
- **Integration tests**: `integration/note-concurrency.integration.test.ts` passes transparently **provided `NOTE_ENCRYPTION_KEY` is added to `.env.example` / `.env.ai` / integration env** — `getEnv()` will throw otherwise.
- **E2E — one real breakage**: `cleanupE2ENotes` in `e2e/fixtures/test-base.ts:87-106` deletes by plaintext `title.like` patterns against the DB — ciphertext titles never match. Fix: delete by `created_at` cutoff or dashboard-id list instead. All other E2E specs assert *rendered* plaintext and are transparent to encryption. Fixtures create notes through the UI wizard (not direct DB seeding), so no test-side ciphertext machinery is needed.

### 8. Cost estimate (~2–3 days, one developer)

| Work item | Effort |
|---|---|
| `src/lib/note-crypto.ts` (AES-GCM, key import, envelope, legacy detection) + `env.ts` field | 0.5–1 d |
| Adapter wiring in `src/lib/supabase.ts` (4 reads, 2 writes) | included |
| Tests to 80% gate + integration/E2E verification (incl. `test-base.ts` fix) | 0.5–1 d |
| Backfill script + runbook + manual verification | 0.5 d |

Benchmark vs repo pace: S-04 ≈ 1 day, S-03 ≈ 2–3 days, H-01 estimated 1–2 days — this change is comparable to H-01 in scope.

## Code References

- `supabase/migrations/20260819000000_create_dashboard_schema.sql:45-46,64-65` — plaintext TEXT columns for notes and note_versions
- `supabase/migrations/20260820000000_create_dashboard_rpcs.sql:57-134` — `create_note_with_version` / `update_note_with_version` (ciphertext-passthrough candidates, no signature change needed)
- `src/client/db-client.ts:73-124` — `Note`/`NoteVersion`/input types carrying plaintext
- `src/lib/supabase.ts:414-456` — write paths (encrypt here); `:461-515` — read paths (decrypt here)
- `src/actions/notes.ts:83-155, 162-268, 434-532` — Server Actions (unchanged with adapter placement)
- `src/app/dashboard/[hash]/dto.ts:19-20` — 300-char content slice; decryption must precede it
- `src/lib/crypto.ts:1-7` — existing edge-compatible WebCrypto utility module, natural host for AES-GCM helpers
- `src/lib/env.ts:3-19` — zod env schema; add `NOTE_ENCRYPTION_KEY` (min 32 chars)
- `src/lib/session.ts:416-433` — secret-sourcing pattern to follow (and NOT to copy its service-key fallback — see H-01)
- `e2e/fixtures/test-base.ts:87-106` — E2E cleanup that breaks on ciphertext titles
- `src/__tests__/integration/note-concurrency.integration.test.ts:25-170` — live-DB round-trips; needs env var

## Architecture Insights

- **Port/adapter architecture is the enabler**: `DatabaseClient` port means encryption can live at exactly one implementation point with no ripple into actions, components, RPCs, or tests that mock the port.
- **Encryption-after-validation ordering** preserves the plaintext-semantics Zod limits (200/10 000) and keeps client `maxLength` attributes meaningful.
- **Envelope format is battle-tested**: `version:iv:ciphertext` colon-joined strings mirror Standard Notes' protocol (`['004', nonce, ciphertext, aad].join(':')`), giving a free rotation path (future `v2:` rows).
- **OWASP key/data separation is satisfied by this architecture by construction**: key in Cloudflare Workers Secrets store, ciphertext in Supabase — "if an attacker only has access to one of these… they cannot access both."
- **Timing-safe verification**: use `crypto.subtle.verify()`/decrypt failure (GCM tag) rather than manual string comparison — Cloudflare explicitly warns first-mismatch string compares leak timing (Workers signing example).

## External Research (sources)

1. **Cloudflare Workers**: full Web Crypto support incl. AES-GCM all-ops (developers.cloudflare.com/workers/runtime-apis/web-crypto/); CPU limits: Free 10 ms/request, Paid 30 s–5 min; fetch wall-clock not billed as CPU (developers.cloudflare.com/workers/platform/limits/); secrets: encrypted bindings, 5 KB/value (developers.cloudflare.com/workers/configuration/secrets/).
2. **Supabase**: pgsodium/TCE officially "pending deprecation" and not recommended due to "operational complexity and misconfiguration risk" (supabase.com/docs/guides/database/extensions/pgsodium); Vault is secrets-table-oriented with provider-managed root key (supabase.com/docs/guides/database/vault); baseline disk encryption AES-256 covers tables/WAL/backups/PITR but not app/DB-level access (supabase.com/security).
3. **Industry**: Notion = server-held AES-256 (not E2EE); Standard Notes = true E2EE with `version:nonce:ciphertext:aad` envelope and AAD = item UUID; Obsidian Sync default = E2EE, but Cure53's 2024 audit shows *managed/server-held* encryption "fails to provide meaningful encryption at rest" against an honest-but-curious server — confirming server-held keys are defense-in-depth, not E2EE (obsidian.md/files/security/2024-Obsidian-Cure53-Sync-Audit-Full.pdf).
4. **Standards**: NIST SP 800-38D — 96-bit random IV, ≤2³² invocations per key (nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf); OWASP Cryptographic Storage Cheat Sheet — store keys separately from data, envelope DEK/KEK (cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html); OWASP Key Management — rotation Strategies 1 (re-encrypt all) and 2 (key-ID per item), rotation machinery must exist *before* compromise (cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html); OWASP Top 10:2025 A04 — always use authenticated encryption.
5. **Flagged nuance**: 2024 cryptanalysis (eprint 2024/1111) recommends ≥128-bit random nonces over 96-bit for random-IV GCM; a 96-bit random IV is NIST-conformant and fine within the 2³² bound, but 128-bit costs nothing extra in WebCrypto. **Resolved: user chose 128-bit random IV (2026-09-13).**

## Historical Context (from prior changes)

- `context/foundation/lessons.md:7-14` — forward-only migration rule born from the S-02 readiness review (no `DROP TABLE ... CASCADE`); Expand/Contract is the sanctioned pattern.
- `context/changes/testing-note-versioning-and-concurrency-integrity/reviews/production-readiness-report.md` — source of H-01; already identified the env-bypass and secret-fallback antipatterns that this change must avoid for its new key.
- `context/changes/note-crud-and-version-persistence/` (S-03, PR #31) — established the RPC + optimistic-concurrency design that ciphertext-passthrough preserves.
- `context/changes/testing-playwright-e2e-critical-flows/` (T-05) — established the local E2E model and the title-LIKE cleanup pattern that needs the one fix identified above.

## Related Research

- No prior `research.md` artifacts directly cover encryption; adjacent: `context/changes/testing-note-versioning-and-concurrency-integrity/reviews/production-readiness-report.md` (security posture baseline).

## Open Questions

**All resolved 2026-09-13 with the user (decision record for plan phase):**

1. **IV length: 128-bit random IV** — conservative-optimal per 2024 cryptanalysis (eprint 2024/1111); free in WebCrypto. Envelope: `v1:<iv_128bit_b64>:<ciphertext_b64>` with ≤2³² bound no longer the governing constraint.
2. **AAD: note ID only** — GCM additional authenticated data binds each ciphertext to its note row, blocking ciphertext transplantation; version/dashboard binding rejected as fragile for restore/copy flows.
3. **Key rotation: envelope-ready only** — the `v1:` prefix + re-runnable backfill script constitute a complete OWASP Strategy 1 rotation process (decrypt-all/re-encrypt-all), satisfying "machinery before compromise" with zero extra code; `v2:` is a drop-in for any future Strategy 2 need. No key-ID registry now.
4. **Backfill: local script** — run-once locally with both secrets in env, documented in a runbook; no permanent admin surface on the Worker.
5. **Scope extension timing** (dashboard metadata, future media) — remains deferred; revisit when the parked media slice returns.

## Recommendation

Proceed with a dedicated change (this folder, `note-encryption`): **AES-256-GCM envelope encryption of `notes` + `note_versions` title/content in `SupabaseDatabaseClient`**, `v1:<iv>:<ciphertext>` TEXT storage with **128-bit random IV** and **AAD = note ID**, dual-format reads, idempotent one-time **local backfill script**, `NOTE_ENCRYPTION_KEY` in the zod env schema + Worker secret (no fallbacks), E2E cleanup-fixture fix, and new crypto unit tests. Rotation machinery: envelope-ready OWASP Strategy 1 (re-run backfill with a new key). Estimated **2–3 days**; zero impact on S-05's planned design; strict alignment with the PRD guardrail and NFRs, and with the forward-only migration rule.
