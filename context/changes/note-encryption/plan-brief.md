# Note Encryption at Rest — Plan Brief

> Full plan: `context/changes/note-encryption/plan.md`
> Research: `context/changes/note-encryption/research.md`

## What & Why

Encrypt note title + content (notes and all version snapshots) at rest with AES-256-GCM envelope encryption. Today, DB access alone — a leaked service-role key, Supabase console access, or a backup dump — reads every note as plaintext. Encryption converts that into "DB access + Worker secret", closing the biggest security gap while staying compatible with the PRD guardrail ("content must not be accessible without valid credentials" — defense-in-depth, not zero-knowledge).

## Starting Point

Everything is plaintext: `notes` and `note_versions` store title/content as plain TEXT; the RPCs pass content opaquely. The `DatabaseClient` port has a single implementation (`SupabaseDatabaseClient`), which is the natural single choke point for both encrypt-on-write and decrypt-on-read. All decisions were settled in the research doc (128-bit IV, AAD = note ID, envelope-ready rotation, migration approach) and confirmed during planning.

## Desired End State

Users notice nothing — tiles, editor, version history, diffs, and restore all render plaintext exactly as today. But anyone inspecting the database sees only `v1:<iv>:<ciphertext>` strings. Empty titles persist as "Untitled Note" instead of empty strings. Legacy plaintext rows (if any ever appear) still render via dual-format reads; tampered or wrong-key decryption fails closed.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Key sourcing | `NOTE_ENCRYPTION_KEY` required now in envSchema (min 32) | Fail-fast beats the silent-fallback antipattern H-01 is removing | Plan (user) |
| Decrypt failure | Fail closed (throw) | Garbage plaintext or masked key errors defeat authenticated encryption | Plan (user) |
| Migration | One-time wipe of prod test data, no backfill script | Prod holds only test data; eliminates the entire backfill subsystem and its risks | Plan (user) |
| Envelope format | `v1:<iv_128bit_b64>:<ciphertext_b64>`, AAD = note ID, encrypt non-empty only | Battle-tested envelope shape; prefix keeps rotation-ready and dual-format reads unambiguous | Research |
| Empty-title UX | Zod schemas normalize empty → "Untitled Note" | One normalization point inherited by all callers; content-required already existed | Plan (user) |
| Encryption site | Inside `SupabaseDatabaseClient` (5 methods) | Zero ripple into actions, components, RPC signatures, or port-mocking tests | Research |

## Scope

**In scope:** AES-256-GCM crypto module; required env key; adapter encrypt/decrypt (2 writes, 3 reads); one additive RPC migration (optional pre-generated note ID for AAD at creation); "Untitled Note" title default; adapter/schema test updates; E2E cleanup fixture fix; prod wipe + deploy runbook.

**Out of scope:** E2EE/zero-knowledge; dashboard metadata encryption; backfill/rotation tooling; schema type changes; auth/rate-limit/concurrency changes; S-05 diff design.

## Architecture / Approach

`src/lib/note-crypto.ts` owns the envelope format and WebCrypto AES-GCM primitives (128-bit random IV, AAD = note ID, fail-closed decrypt). `SupabaseDatabaseClient` encrypts title/content immediately before its RPC writes and decrypts immediately after reads — before the DTO 300-char slice and before any consumer. Dual-format reads pass unprefixed values through. One additive migration lets `create_note_with_version` accept a pre-generated UUID (required because AAD = note ID needs the ID before the DB creates it).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Crypto core + env key | `note-crypto.ts` + required `NOTE_ENCRYPTION_KEY`, fully unit-tested | Base64 handling on Workers for binary ciphertext |
| 2. Adapter wiring + title default | Encryption live on all 5 adapter methods; "Untitled Note" default; AAD-capable create RPC | Create-time AAD conflict (solved via pre-generated UUID migration) |
| 3. E2E fixture fix + full gates | All suites green: coverage, integration, E2E | Hidden plaintext assumptions in unexamined UI surfaces |
| 4. Prod wipe + deploy | Test data wiped, secret set, deployed, prod-smoke verified | Ordering: secret + wipe must precede deploy |

**Prerequisites:** Access to prod Supabase SQL editor and Workers secrets; `NOTE_ENCRYPTION_KEY` generated (exactly 64 hex chars, e.g. `openssl rand -hex 32`).
**Estimated effort:** ~2 days across 4 phases (research estimate 2–3 days, reduced by dropping the backfill).

## Open Risks & Assumptions

- Prod is assumed to contain only test data — verified by row counts before the wipe; wipe is irreversible (accepted by decision).
- Rotation tooling is deferred: if real data arrives before tooling exists, re-encryption needs building at that point (envelope format already supports it).
- RPC `CREATE OR REPLACE` with a new optional parameter must be validated against the local DB before deploy.

## Success Criteria (Summary)

- Every prod note row shows only `v1:`-prefixed ciphertext for title/content; UI shows only plaintext.
- Full CI gates pass: typecheck, lint, 80% coverage, integration, E2E.
- Empty titles never persist — "Untitled Note" everywhere.
