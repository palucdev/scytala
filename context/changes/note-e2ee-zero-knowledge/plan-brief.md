# Zero-Knowledge Note Encryption (Client-Side E2EE) — Plan Brief

> Full plan: `context/changes/note-e2ee-zero-knowledge/plan.md`
> Research: superseding the research + reviews in `context/changes/note-encryption/` (v1, done in-session 2026-09-13)

## What & Why

Upgrade Scytala from v1 server-side note encryption (DB stores AES-256-GCM envelopes, but a holder of `NOTE_ENCRYPTION_KEY` + DB access can decrypt everything) to a Tuta-inspired **zero-knowledge** scheme: notes are encrypted **in the browser** under a random per-dashboard DEK; the DEK is wrapped per participant under a KEK derived from their password; login sends only a one-way **verifier** (password never crosses the wire, not even over TLS). The motivating thread of this whole change is the original question: "can an admin with DB access read every note?" — after this change, no.

## Starting Point

S-07 already shipped v1 envelope encryption inside the `SupabaseDatabaseClient` adapter (server encrypts/decrypts with `NOTE_ENCRYPTION_KEY`, degrade-to-placeholder semantics, reviewed 2026-09-13). Dashboards are collaborative — **all participants share all notes** (US-04/US-05) — which forced the early per-user-DEK idea to the Tuta "group key" shape: DEK per dashboard, wrapped once per member.

## Desired End State

An admin with production DB credentials — or even `NOTE_ENCRYPTION_KEY`-equivalent server secrets (now deleted) — inspects only opaque `v2,<iv>,<cipher>` envelopes and per-participant wrapped keys. A participant types dashboard alias + password; the browser derives KEK → unwraps the shared DEK → dashboard renders decrypted tiles, editor, version history. Reload with a live session shows a passive "Vault locked" banner until re-unlock; idle 30 min auto-wipes the DEK. The honest residual risk ("server-shipped JS") is documented.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Encryption architecture | Client-side E2EE (Tuta-inspired) | Original "too dangerous" concern resolved by adopting Tuta's verifier + no-password-on-wire pattern | Plan (user-directed research) |
| Auth secret | One-way `authVerifier` derived client-side (HKDF separated from KEK); server stores PBKDF2(verifier) in existing `password_hash` column | Removes the dual-use-password leak vector entirely; ~20 extra lines | Plan (Tuta) |
| Key hierarchy | Per-**dashboard** DEK, wrapped per participant | Dashboards are collaborative — all members share notes — matching Tuta's user-group-key pattern | Plan (PRD constraint) |
| KDF | PBKDF2-SHA256, 600k iterations, per-participant salt, non-extractable keys | Zero-dep edge/browser compatible; OWASP-baseline | Plan (user pick) |
| Recovery | None: lost password = notes unrecoverable | User's explicit trade-off; additive later | Plan (user pick) |
| Migration | None — local + prod DB reset; code reads only `v2` envelopes | User decision; also supersedes S-07's v1 data | Plan (user pick) |
| Vault delivery | Login action response bundles `{kdf_salt, kdf_iterations, wrapped_dek, unwrap_verifier}` | Single round trip; no salt endpoint (dark-patterned enumeration avoided by design) | Plan |
| Wrong passphrase | Inline retry client-side, no server re-call, no rate-limit burn | Verifier already proved auth; unlock is browser-only | Plan |
| Locked state (reload) | Passive banner + blurred tiles; 30-min idle auto-lock | No navigation blocking; DEK persistence in web storage rejected | Plan |
| Delete re-auth | Client-side unwrap check (no server round trip) | Consistent with verifier model; server still enforces session | Plan |
| Testing depth | Unit crypto core + adapted suites + Playwright (golden-path, note-lifecycle, locked-state) | Matches S-03/S-07 precedent and the 80% floor | Plan |
| S-07 disposition | Superseded by S-08; roadmap + PRD updated during planning | Clean lineage for /10x-implement | Plan |

## Scope

**In scope:** new e2e-crypto module; dashboard_users schema columns + hardened `create_dashboard_with_users` overload; auth action verifier login + vault bundle; wizard client-side vault provisioning; adapter passthrough; client-side tile/editor/drawer decryption; VaultProvider with locked state + 30-min auto-lock; delete-dialog unwrap check; delete `note-crypto.ts` + `NOTE_ENCRYPTION_KEY` from env/docs; ESLint boundary rule; PRD + roadmap updates.

**Out of scope:** recovery code wrap, password change/rotation flow, passkey/PRF unlock, OPAQUE, per-user note privacy inside a dashboard, server-side content search, DEK persistence in sessionStorage, changes to rate limiting/sessions/RPC versioning/optimistic concurrency.

## Architecture / Approach

```
Browser:  password → PBKDF2(600k) → HKDF "kek" → KEK (non-extractable, memory only)
          HKDF "verifier" → SHA-256 → authVerifier = the ONLY thing sent at login
          DEK (random 32B) ⇄ wrapped per participant under KEK
          notes: v2:<iv>:<AES-GCM(plaintext, DEK, AAD=noteId)>
Server:   stores envelopes + wrapped DEKs; verifies hash(verifier); ships vault bundle
          in the login response; delivers ciphertext via existing RPCs, never sees keys
VaultProvider holds DEK only in memory; idle auto-lock + logout wipe it.
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Crypto core | Auditable `e2e-crypto.ts` + full unit suite | Derivation indirection order (HKDF info separation) |
| 2. Schema + RPC | Vault columns + hardened `create_dashboard_with_users` forward migration | REVOKE/GRANT symmetry regression |
| 3. Server rewiring | Verifier login, vault-bundle response, wizard client crypto, adapter passthrough | Accidentally keeping a server-side decrypt path |
| 4. Unlock lifecycle | VaultProvider, LoginForm/Wizard wiring, client tile/editor/drawer decryption, locked banner, auto-lock, delete re-auth | SSR cannot render plaintext → hydration-time unlock UX leak |
| 5. Cleanup + hardening + docs | Boundary lint rule, env/doc purge, full `check:ready` | Stale docs / remaining server references |

**Prerequisites:** S-07 remnants understood (module exists, must be deleted not adapted); DB reset scheduled before deploy; `.env.ai` loaded for integration + E2E runs.
**Estimated effort:** ~5 sessions across 5 phases (crypto core; schema/RPC; server rewiring; client unlock + decrypt UX; cleanup/docs) — the connector to `/10x-implement` for each.

## Open Risks & Assumptions

- Server-shipped JS trust ceiling (inherent web E2EE limit) — mitigated (small auditable module, planned boundary rules + separate-origin static bundle in a follow-up if desired), not solved; documented honestly in README.
- PBKDF2 600k ≈ 300–900 ms client KDF per unlock — acceptable; if it regresses on weak phones, drop to 300k with documented justification.
- 100+ note dashboard decrypt-at-hydration could pressure the 2s NFR — mitigated via batched `Promise.all` and 300-char client-side preview slicing (already the format customers see).
- User accepted: no recovery ⇒ forgotten password = permanently unreadable notes (server cannot help — that is the feature).

## Success Criteria (Summary)

- An admin with DB access (plus any previously-arranged secret) cannot read note titles or contents — the DB holds only v2 envelopes and wrapped DEKs.
- Participants log in the same way as today and see decrypted notes immediately; reload shows a locked banner pending passphrase; idle auto-lock after 30 min.
- Full gate green (`npm run check:ready`), coverage ≥80%, golden-path E2E suites green, README/AGENTS/env purge complete.
