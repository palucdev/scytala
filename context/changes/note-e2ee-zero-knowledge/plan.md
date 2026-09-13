# Zero-Knowledge Note Encryption (Client-Side E2EE) Implementation Plan

## Overview

Upgrade note confidentiality from the current server-key encryption (S-07 `v1` envelopes, `SupabaseDatabaseClient` encrypts/decrypts with `NOTE_ENCRYPTION_KEY`) to a Tuta-inspired zero-knowledge scheme: note content is encrypted AES-256-GCM in the **browser** under a random per-**dashboard** data key (DEK); the DEK is wrapped once per **dashboard participant** under a key (KEK) derived client-side from that participant's password; login authenticates via a **one-way verifier** derived from the password, so the raw password never crosses the wire and the server holds nothing usable to decrypt any note. Result: an admin with production DB access (and even knowledge of any server secret) can read no note content; only a participant's password can.

## Current State Analysis

- **S-07 v1 envelope encryption is implemented and reviewed** (`context/changes/note-encryption/`, status `impl_reviewed`): `src/lib/note-crypto.ts` provides `encryptNoteField`/`decryptNoteField` (`v1:<iv_b64>:<ciphertext_b64>`, AES-256-GCM, AAD = note ID, 128-bit random IV, `getEnv().NOTE_ENCRYPTION_KEY` hex key), and `src/lib/supabase.ts` encrypts/decrypts at the adapter boundary including degrade-to-placeholder semantics (`decryptCommittedRow`, `decryptDashboardNote`, `decryptVersionRowOrDegrade`, `metadataOnly` reads).
- **Server components render plaintext today.** `src/app/dashboard/[hash]/page.tsx` → `db.getNotesByDashboard()` → `mapNotesToDto` (`src/app/dashboard/[hash]/dto.ts`) → SSR'd `NoteGrid`/`NoteTile`. `src/app/dashboard/[hash]/note/[noteId]/page.tsx:82` fetches a decrypted note and passes `initialTitle`/`initialContent` into the client `NoteEditor`. Under zero-knowledge the server cannot produce plaintext; ciphertext must flow to client components that decrypt with the in-memory DEK.
- **Login** (`src/actions/auth.ts`) sends the raw password, verifies server-side against `password_hash` (PBKDF2-SHA256 100k, `$pbkdf2$<iters>$<salt>$<hash>` format in `src/lib/crypto.ts`), sets an HttpOnly JWT session cookie. Rate limiting (`checkRateLimit` IP + account) exists and stays unchanged.
- **Creation wizard** (`src/app/new/hooks/useWizardState.ts`) generates passwords client-side (`generateRandomPassword(16)` — cryptographically strong, 16 chars incl. symbols) then `src/actions/dashboard.ts:61-75` hashes them server-side via `hashPassword` before `create_dashboard_with_users` RPC.
- **Deleting a note** re-authenticates with the password via `DeleteNoteDialog` (server-side password verify).
- **`NOTE_ENCRYPTION_KEY`** is a required zod env field (`src/lib/env.ts:12-19`); referenced in `.env.example`, README, AGENTS.md.
- **No vault/KEK/DEK/verifier code exists anywhere yet** (grep confirmed).
- Diff/version-history UI (`src/lib/diff.ts` usage in `NoteContentArea`, `NoteVersionPreview`, `NoteVersionHistoryDrawer`) is already client-side — compatible with client-side decryption.
- Constraint: Cloudflare Workers edge runtime, no Node APIs, Supabase PostgreSQL with forward-only migrations and RPC layers (`create_note_with_version`, `update_note_with_version` accept pre-encrypted title/content strings — they are format-agnostic and remain untouched).

## Desired End State

- Note titles and contents (in `notes` and every `note_versions` snapshot) exist **only** as `v2:<iv_b64>:<ciphertext_b64>` envelopes encrypted by the browser with the per-dashboard DEK (AAD = note ID). The server never encrypts or decrypts note fields — no plaintext ever reaches a Server Action, adapter, or DB.
- Each `dashboard_users` row stores: a per-participant KDF salt, KDF iteration count, `wrapped_dek` (DEK encrypted under that participant's password-derived KEK), an `unwrap_verifier` (a fixed known plaintext encrypted under the DEK, used to detect a wrong passphrase), and `password_hash` — now the server-side hash of a **password-derived auth verifier** rather than of the password itself.
- Login UX is unchanged in feel: user types dashboard alias + password; the form derives the verifier client-side and sends only that; on success the action's response bundles `{kdf_salt, kdf_iterations, wrapped_dek, unwrap_verifier}`; the client derives the KEK, unwraps the DEK into memory, and the dashboard renders decrypted. Wrong passphrase = clean inline retry without touching the server again. Password loss = notes unrecoverable (documented, accepted).
- On reload with a valid session but no DEK in memory, tiles render blurred with a passive "Vault locked" banner + passphrase prompt; DEK auto-wipes after 30 minutes of idle.
- `NOTE_ENCRYPTION_KEY` is deleted from env schema, `.env.example`, README, AGENTS.md; server-side note crypto imports are gone; server adapters treat note fields as opaque strings.
- Verified by: new unit tests for the crypto core (roundtrip, tamper, wrong passphrase, verifier independence), adapted adapter/action/E2E suites, Playwright login → tiles decrypted → reload shows locked banner → unlock → edit/version history/restore/delete flows, and full `npm run check:ready`.

### Key Discoveries:

- S-07's adapter choke point (`src/lib/supabase.ts:414-720`) is the seam to convert into an opaque passthrough — degrade semantics (`decryptionFailed`, `undecryptable`) become client-side concerns.
- Dashboards are collaborative (US-04 sync, all members see all notes) ⇒ DEK is per-dashboard, wrapped per participant — matching Tuta's "user group key indirection" (`tuta.com/encryption`).
- Tuta's login trick is adopted: verifier = one-way hash of the KEK-derived material; server stores only a server-side hash of the verifier. TLS leak of the verifier does not enable decryption.
- `note_versions` carries `note_id`, so AAD binding works for history snapshots exactly as in v1 (`src/lib/note-crypto.ts:13`).
- Wizard already produces passwords in the browser; moving KDF/wrapping there requires no new password entry UX.

## What We're NOT Doing

- **No recovery mechanism** — no recovery-code wrapping, no forgotten-passphrase reset. Lost password = notes permanently unreadable (accepted decision; a recovery wrap can be added later as a pure additive migration).
- **No migration of v1 ciphertext** — DBs (local + prod) will be reset; the new code reads/writes only `v2` envelopes and never reads `v1` or plaintext.
- **No credential management / password change** — PRD non-goal; avoids the DEK re-wrap-at-rotation problem entirely.
- **No passkey/PRF unlock, no OPAQUE** — documented as future options; the passphrase verifier design supersedes the earlier `NOTE_ENCRYPTION_KEY` threat.
- **No per-user note privacy inside a dashboard** — all participants share one dashboard DEK and can read all notes on that dashboard (PRD model), not per-user-private notes.
- **No server-side plaintext features** — no server-side search, summaries, or analytics on note content (impossible by design; matches Tuta's local encrypted-search-index trade-off).
- **No session-storage persistence of the DEK** — key exists only in browser memory for the unlocked session (locked-banner + auto-lock cover reloads).
- **No changes to rate limiting, sessions, RPC versioning, optimistic concurrency, or sync semantics** — they operate on opaque fields or existing columns.

## Implementation Approach

Six phases, ordered so the crypto core is testable before touching flows:

1. **Client crypto core** — new client-only module (`src/lib/e2e-crypto.ts`), zero dependencies, native WebCrypto: KDF, non-extractable KEK, DEK generate/DEK wrap-unwrap, verifier derivation, `v2` envelope helpers, boot self-test (unwrap-verifier decrypt). Unit-tested in isolation first.
2. **Schema + migration + RPC overloads** — additive forward migration on `dashboard_users`; new `create_dashboard_with_users` overload accepting per-participant vault material (with REVOKE/GRANT hardening per repo pattern).
3. **Server rewiring** — env schema drop of `NOTE_ENCRYPTION_KEY`; login action verifier verification + vault bundle response; wizard action accepts client-derived vault material; adapter becomes passthrough.
4. **Unlock lifecycle + client decryption** — DEK memory store (React context/provider) with 30-min idle auto-lock; login form derives KEK/verifier and unwraps on action success; dashboard tiles + note editor decrypt client-side; locked banner; delete-dialog unwrap check.
5. **Cleanup, hardening, docs** — delete `note-crypto.ts` server usage, `.env.example`/README/AGENTS.md/env docs, ESLint boundary rule forbidding server imports of the crypto module, envelope-golden-path boot self-test wiring, full `check:ready`.
6. **PRD/roadmap update is done during planning** (not an implementation phase) — recorded here so the implementer doesn't re-edit them.

## Critical Implementation Details

- **Derivation indirection (Tuta-order matters)**: `wrappedKekSeed = PBKDF2(password, kdf_salt, iters)` → `kek = HKDF(seed, "scytala-kek-v1")` → `authVerifier = SHA-256(HKDF(seed, "scytala-verifier-v1"))`. The verifier must be HKDF-separated from the KEK so the value crossing the wire cannot be reused as decryption key material; the server stores its own PBKDF2(verifier, server salt) in the existing `password_hash` column format. Get this ordering wrong once and login-with-encryption-derivation leaks or locks the vault.
- **Verifier vs DEK failure distinction**: the login action only establishes *authentication* (verifier check) and ships the vault bundle in the same response; DEK unwrap happens after, purely client-side, judged against `unwrap_verifier` (fixed plaintext constant decrypted under the DEK, AAD = dashboard id). Wrong passphrase ⇒ the post-login banner shows "Wrong passphrase" — no second server call (also keeps `authAccount` rate limit for the untrusted server-side path untouched).
- **First-ever login / provisioning asymmetry**: the wizard is the only place a DEK is *created* (its wizard step generates a dashboard DEK and wraps it per participant). Every user of an already-provisioned dashboard always receives the bundle from their login response — there is no "vault null" path after creation. If `wrapped_dek` arrives `null` at login (never in practice), the client must show the locked banner with a clear "vault not provisioned" message rather than guessing.
- **Server-side note reads are now ciphertext-only** — every call site that previously received plaintext from the adapter must be audited: server components can't decrypt, so the page boundary must pass ciphertext into client components and decryption happens in a client wrapper. The `DashboardNote` discriminated union (`status: "ok" | "undecryptable"`) survives, but its semantics move to the client ("`decryptionFailed`" replaces "server undecryptable").

## Phase 1: Client Crypto Core (`src/lib/e2e-crypto.ts`)

### Overview

Build and unit-test the complete client-side cryptographic vocabulary before any integration: password → KEK, DEK lifecycle, verifier derivation, `v2` envelopes, unwrap-verifier self-test. Zero dependencies, native WebCrypto only (edge-compatible by construction since it runs in the browser and mirrors `src/lib/crypto.ts`/`note-crypto.ts` style).

### Changes Required:

#### 1. New module: `src/lib/e2e-crypto.ts`

**Intent**: Provide all client-side key derivation, wrapping, enveloping, and verifier primitives in one auditable, dependency-free module; explicit export of every constant (AAD labels, HKDF info strings, envelope version) sibling to existing `note-crypto.ts` conventions.

**Contract**:

- `deriveWrappedKekSeedFromPassword(password, kdfSaltHex, iterations): Promise<Uint8Array>` — PBKDF2-SHA256, 600k iterations default.
- `deriveKek(seed): Promise<CryptoKey>` — HKDF-SHA256 with info `"scytala-kek-v1"`, non-extractable AES-256-GCM CryptoKey, usages `["encrypt","decrypt"]`.
- `deriveAuthVerifier(seed): Promise<string>` (hex) — HKDF info `"scytala-verifier-v1"` then SHA-256. Must be cryptographically incompatible with KEK (different info domain).
- `generateDek(): Promise<Uint8Array>` — 32 random bytes.
- `wrapDek(dek, kek): Promise<string>` / `unwrapDek(wrapped, kek): Promise<Uint8Array>` — AES-256-GCM, AAD `"scytala-wrapped-dek-v1"`.
- `createEnvelope(plaintext, dek, aad: noteId): Promise<string>` → `v2:<iv_b64>:<ciphertext_b64>`; `decipherEnvelope(envelope, dek, noteId): Promise<string>` — fail closed (throws on non-envelope, wrong key, tamper) mirroring `decryptNoteField`'s strictness.
- `createUnwrapVerifier(dek, dashboardId): Promise<string>`; `verifyUnwrapVerifier(verifier, dek, dashboardId): Promise<boolean>` — fixed plaintext constant, AAD = dashboard ID.
- b64/b64url helpers private to the module; error types typed (`E2eCryptoError`) rather than message matching.

#### 2. Unit tests: `src/__tests__/lib/e2e-crypto.test.ts`

**Intent**: Lock every semantic from S-07's precedent (envelope-only, fail-closed, tamper, wrong key, empty-string, plaintext starting with literal `v2:`) plus new ones: verifier/KEK non-derivation from each other, wrong passphrase fails at DEK unwrap, non-extractable key type assertions, wrong AAD fails.

**Contract**: mirroring `src/__tests__/lib/note-crypto.test.ts` (env stub pattern); includes ≥1 test asserting that a plainly derived verifier hash is *not* accepted as a decryption key.

### Success Criteria:

#### Automated Verification:

- `npm run test -- src/__tests__/lib/e2e-crypto.test.ts` green.
- `npm run check:type`, `npm run lint` green.

#### Manual Verification:

- Review that no plaintext key bytes are exported (all raw-byte/password helpers private; only `Uint8Array` seeds leave the module) — read the module once with a "would I audit this" mindset (Tuta-style smallness).

**Implementation Note**: Pause for manual confirmation before integration phases.

---

## Phase 2: Schema, Migration, and RPC Overloads

### Overview

Add per-participant vault material columns and a hardened RPC overload for dashboard creation (DB reset accepted; no v1 migration needed but the schema change must be a clean forward migration).

### Changes Required:

#### 1. Forward migration: `supabase/migrations/<timestamp>_add_zero_knowledge_vault.sql`

**Intent**: Add `kdf_salt text not null`, `kdf_iterations integer not null default 600000`, `wrapped_dek text`, `unwrap_verifier text` to `dashboard_users` (nullable because they're per-participant, not per-dashboard). Old `password_hash` semantically reinterpreted (server-side hash of the auth verifier) without schema change. RLS/indexes unaffected.

**Contract**: forward-only, no `down.sql`, no destructive statements (lesson #1 in `context/foundation/lessons.md`).

#### 2. New RPC overload: `create_dashboard_with_users_v2` (or 6-arg overload) + drop of the old 3-arg path

**Intent**: The RPC accepts `p_users` rows expanded with `p_kdf_salt`, `p_kdf_iterations`, `p_wrapped_dek`, `p_unwrap_verifier` alongside `p_password_hash`. Follow the *exact* pattern used for the 5-arg `create_note_with_version` overload in S-07 (same `supabase/migrations/` directory, same revoke/grant hardening, drop the old signature).

**Contract**: old RPC **dropped** (no passing callers), REVOKE from anon, GRANT to service role only, mirrors `20260913120000_revoke_public_execute_on_rpcs.sql`.

#### 3. Adapter types: `src/client/db-client.ts`

**Intent**: Extend `DashboardUser` and `CreateDashboardUserInput` with the new fields (salt/iters/wrapped/verifier passthrough, nullable for non-provisioned); `CreateDashboardInput` forwards them; no other types change.

**Contract**: types only at port level; adapter wiring in Phase 3.

### Success Criteria:

#### Automated Verification:

- `npm run db:reset` (migration chain applies cleanly) against local Supabase.
- `npm run test:integration` (load `.env.ai` in bash first) covering the new RPC: creates users with vault fields, rejects calls without service role via REVOKE, old RPC signature no longer exists.

#### Manual Verification:

- Inspect migration SQL for REVOKE/GRANT symmetry with the S-07 precedent.

---

## Phase 3: Server Rewiring (env, auth, dashboard action, adapter passthrough)

### Overview

Make the server cryptographically blind to note content: env loses the note key, auth verifies client-derived verifiers and returns the vault bundle in the same response, the wizard action accepts client-derived vault material, and the adapter stops encrypting/decrypting entirely (passthrough semantics).

### Changes Required:

#### 1. `src/lib/env.ts`

**Intent**: Remove `NOTE_ENCRYPTION_KEY` from the schema and validation source mapping (env gets validated per-field, two places to edits at `src/lib/env.ts:12-19` and `:47`).

**Contract**: env schema omits the key entirely; `.env.example`, README, AGENTS.md updated in Phase 5.

#### 2. `src/lib/supabase.ts` — remove the encrypt/decrypt choke point

**Intent**: Delete all `encryptNoteField`/`decryptNoteField`/`NoteCryptoError` usage and the degrade helpers tied to ciphertext errors (`decryptCommittedRow` etc.). `createNote`/`updateNote` call RPCs with **already-envelope fields they receive**; all read paths return raw ciphertext rows (server never inspects). The `DashboardNote` union switches from server-decided to client-decided (`decryptionFailed` computed client-side when DEK/verifier unwrap fails).

**Contract**: `getNotesByDashboard`/`getNoteById`/`getNoteVersions` return raw row values — type `Note`/`NoteVersion` fields retain the same names (`title`, `content`) but are now opaque envelope strings; DTOs (`src/app/dashboard/[hash]/dto.ts`) keep envelope strings verbatim and drop the title/content slicing (via `.slice(0,300)` — that becomes client-side after decryption).

#### 3. `src/actions/auth.ts` — verifier login + vault bundle response

**Intent**: Accept the verifier string in place of the raw password in `loginDashboardSchema` (field still named `password` on the wire or renamed to `verifier` — choose the less-confusing contract: `verifier`), verify against `user.password_hash` with existing `verifyPassword` (unusual number of iterations now server-side but same constant-time compare). On success, augment the response with vault bundle for the user. Session cookie creation, rate limiting, and timing-equalization (`DUMMY_PBKDF2_HASH`) stay untouched (the dummy still burns representative cycles because the verifier is also PBKDF2-hashed server-side).

**Contract**: `LoginDashboardActionResult` success branch becomes `{ success: true; vault: {kdf_salt, kdf_iterations, kdf_algo:"pbkdf2-sha256", wrapped_dek, unwrap_verifier} }`; `getDashboardUserByAlias` already selects `*` so vault fields arrive for free.

#### 4. `src/actions/dashboard.ts` — client-sourced vault material at creation

**Intent**: The wizard action stops receiving raw passwords and starts receiving per-participant `{password?…no—}{user_alias, derived_verifier(hex), kdf_salt, kdf_iterations, wrapped_dek, unwrap_verifier}` already computed in the browser; the action only server-side-hashes the verifier (existing `hashPassword` reused, format-compatible `password_hash` column); the RPC payload reserves these fields.

**Contract**: `CreateDashboardSchema` per-user input shape renamed; **no password is ever durable on the server or in a network payload**. Cleartext credential display (`ParticipantCredential`) falls out of StepSuccess (already client-side).

#### 5. Delete `src/lib/note-crypto.ts` and its tests

**Intent**: S-07's server crypto module is fully replaced; keeping it live-side would be a decryption accident waiting to happen. `EncryptionErrorNotice` handling in `note/[noteId]/page.tsx` moves/dereferences accordingly (that try/catch around `db.getNoteById` becomes obsolete — client-side surfaces encryption failure).

**Contract**: file deleted; `supabase.test.ts` refactored in Phase 4 with the new envelope passthrough + e2e-crypto mocks.

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` green.
- `npm run test -- src/__tests__/actions` green (auth + dashboard action adjusted).
- `npm run check:type` green (no dangling `NOTE_ENCRYPTION_KEY` / `note-crypto` references — also enforced by lint rule in Phase 5).

#### Manual Verification:

- `grep -rn "encryptNoteField\|NOTE_ENCRYPTION_KEY\|note-crypto" src --exclude-dir=__tests__` returns nothing except e2e-crypto references — confirm by eye.

---

## Phase 4: Unlock Lifecycle, Client Decryption, and Locked UX

### Overview

The largest user-visible phase. Login form/Wizard derive KEK + verifier client-side and unwrap DEK on login response; a React context holds the (non-extractable) DEK in memory; dashboard and note surfaces render decrypted content client-side; passive "Vault locked" banner appears on reload with valid session but absent DEK; 30-minute idle auto-lock wipes the DEK; delete dialog's re-auth becomes a client-side unwrap check.

### Changes Required:

#### 1. Vault context/provider: `src/app/dashboard/[hash]/components/VaultProvider.tsx` (new)

**Intent**: Single React context owning {status: `locked` | `unlocked` | `wrongPassphrase`, dek: CryptoKey | null, passphrase: cleared}, exposed via `useVault()` hook. DEK auto-wipe on 30-min idle (`useEffect` + idle listener), explicit wipe on logout/tab close. No storage of key bytes in web storage (see What-Not-Doing).

**Contract**: provider obtains bundle either from a login-success handoff or a post-login fetch path triggered by the locked banner (bundle fetch endpoint is a new Server Action that requires a verified session and returns the same vault payload); the banner triggers a local prompt, never a re-login redirect.

#### 2. `LoginForm.tsx` + `loginDashboardSchema`

**Intent**: On submit, the client derives KEK seed/verifier from the typed password via `e2e-crypto` (no fetch of salt — a salt endpoint is intentionally omitted: the login action returns the vault and the unwrap-verifier determines wrong-passphrase UX); the action call receives the *verifier string*, not the password. On success with a `vault` field, immediately derive KEK → unlock in VaultProvider, then render the dashboard; clearing the password input wipes the passphrase. On DEK-failure (`unwrap_verifier` mismatch) show inline "Wrong passphrase" without re-invoking the server.

**Contract**: form UX unchanged from the user's perspective (dashboard alias + password) — only payload contents and post-success flow change.

#### 3. Wizard (`useWizardState`, StepReview submit button in `src/actions/dashboard.ts` call)

**Intent**: When the wizard finalizes, generate dashboard DEK client-side, then for each participant derive salt+KEK and produce `{wrapped_dek, unwrap_verifier}`; the *creator's own* participant password applies identically (creator is a participant). All password values shown in StepSuccess remain identical; server sees only derived material.

**Contract**: `p_users` rows in the creation action payload include the four vault fields computed with `e2e-crypto`; server-side hashing of verifier per `CreateDashboardInput` contract in Phase 3 item 4.

#### 4. Server components → ciphertext handoff

**Intent**:
- `src/app/dashboard/[hash]/page.tsx` and `dto.ts` stop calling `mapNotesToDto` on decrypted data; they pass **envelope DTOs** (`NoteDto` keeps `title`/`content` fields as envelope strings with a `decryptionFailed` client-side fill).
- `src/app/dashboard/[hash]/note/[noteId]/page.tsx` stops calling `db.getNoteById` and never renders title/concept content server-side; it passes note metadata (id, version, dashboard id) + envelope payload (title envelope, content envelope) to the client `NoteEditor` via a dedicated fetch from a new client-side data hook or via a Server Action on the client that returns ciphertext by note id.
- `NoteGrid`/`NoteTile` become client components (or a client wrapper around them) decrypting via `useVault()`; `tileMeta` and `mapNotesToDto` preview slicing move into the client after decryption.
- `NoteVersionHistoryDrawer`/`NoteVersionPreview` fetch versions via existing Server Action paths that now return envelope versions; decryption + diff stay client-side (`src/lib/diff.ts` unchanged).

**Contract**: no plaintext ever appears in server-rendered HTML (verified by a Playwright assertion that HTML before `__next_hydration`/first paint doesn't contain the note's secret string — see Testing).

#### 5. `DeleteNoteDialog.tsx` + `src/actions/notes.ts` (delete)

**Intent**: Local re-auth: dialog derives KEK from the typed password and verifies `unwrap_verifier` client-side; only then sends the delete session action (which still requires an authenticated session; rate limiting on note mutations unchanged). The current `verifyPassword` server call for delete is removed and notes.ts's re-auth hook contract falls away with it.

**Contract**: Dialog input stays visually "Dashboard password"; no payload of password/verifier leaves the browser for this step.

#### 6. Locked banner + auto-lock UI

**Intent**: When `useVault().status === "locked"` (valid session, no DEK) render tiles as blurred placeholders with a banner ("Vault locked — enter your dashboard password to unlock notes"); the NotesEditor renders an equivalent non-destructive placeholder. Component naming follows existing dialog/banner components (`components/EncryptionErrorNotice.tsx` pattern).

**Contract**: `NoteDto` gains `locked?: true` rendering marker (distinct from `decryptionFailed` which means ciphertext-cryptographic failure).

### Success Criteria:

#### Automated Verification:

- `npm run test` (all unit suites incl. adapted supabase.test.ts, dashboard action, LoginForm component) green; coverage ≥80%.
- `npm run lint` green (boundary rule enforced, see Phase 5).
- Playwright `e2e/golden-path.spec.ts` extended: full wizard → credentials → login → tiles — with **decrypted** tile contents visible; note authoring; version history; logout works. `e2e/note-lifecycle.spec.ts`: deletion re-auth via unwrap check. New locked-state spec: reload after login → banner + blur → passphrase → tiles decrypt.

#### Manual Verification:

- Clear browser → login → dashboard shows plaintext tiles — clipboard copy of a tile works.
- Leave tab idle 30+ min → locked banner appears; unlock restores content without losing unsaved edits.
- Log out → close tab → reopen with session cookie → locked state (never silently decrypted).
- Real browser devtools: confirm decrypted text exists only post-hydration, never in the framer-raw SSR HTML (view-source check by eye).

---

## Phase 5: Cleanup, Hardening, Documentation

### Overview

Close the loop: remove all traces of v1 concept, enforce module boundaries statically, document the model honestly, and run the full gate.

### Changes Required:

#### 1. ESLint boundary rule

**Intent**: `no-restricted-imports` — `src/lib/e2e-crypto.ts` importable only under `src/app/**` client bundles; banned inside `src/actions/**`, `src/lib/supabase.ts`, `src/client/db-client.ts`. Ensures server code can never accidentally grow a decrypt path.

**Contract**: lint error; enforced in CI alongside the 80% coverage gate.

#### 2. Docs & env hygiene

**Intent**: Remove `NOTE_ENCRYPTION_KEY` from `.env.example`, README (including its threat-model sentence about "at-rest encryption" — replace with the zero-knowledge description), AGENTS.md references. Document honestly in README/docs: what the scheme covers (DB access alone reads nothing) and what it can't (server-shipped JS — mitigated by small audit module, not provable).

**Contract**: grep-clean for the old key name; PRD/roadmap already updated during planning (note in change.md).

#### 3. Full quality gate

**Intent**: `npm run check:ready` (lint, typecheck, unit tests with coverage, E2E, OpenNext Worker build) as the final proof that the Cloudflare production bundle excludes test code and that the removed env var doesn't break the preview build.

### Success Criteria:

#### Automated Verification:

- `npm run check:ready` fully green.

#### Manual Verification:

- README and AGENTS.md describe the new model accurately with no stale references.

---

## Testing Strategy

### Unit Tests:

- **e2e-crypto core** (Phase 1): roundtrip v2 envelope; tamper rejected; non-envelope rejected; empty string; plaintext starting with literal `v2:`; AAD mismatch (cross-note); wrong passphrase fails DEK unwrap cleanly; verifier and KEK are one-way separable; PBKDF2 honors configured iteration count from DB column (600k default).
- **Adapter/supabase tests**: passthrough semantics (create/update return raw envelopes unmodified), VaultProvider state machine (locked → unwrapping → unlocked → wrong passphrase → locked), LoginForm derivation wiring (mocked e2e-crypto asserts verifier — not password — is passed to the action).
- **Dashboard action**: creation payload without passwords (derived verifiers only) produces correct RPC params.

### Integration Tests:

- Local Supabase RPCs accept vault fields (`test:integration` with `.env.ai`), old RPC dropped, REVOKE verified against anon role.

### Manual Testing Steps:

1. View-source on the dashboard page: pre-hydration HTML must contain no note plaintext (SSR boundary check).
2. 30-minute idle auto-lock; reload + unlock round-trip.
3. Wrong passphrase on login: inline retry, no rate-limit trip.
4. Delete note: typed passphrase → unwrap check passes → deletion proceeds; wrong passphrase blocks deletion client-side.
5. Multiple participants on one dashboard: each logs in and sees the same decrypted notes (shared dashboard DEK proving wrap-per-participant works for all members).

## Performance Considerations

- KEK derivation is ~50–100 ms client-side (PBKDF2-SHA256 600k measured budgets in research: 300–900 ms on weak devices; runs in the user's browser, zero Worker CPU cost).
- Envelope size grows modestly (~200 bytes overhead/note field) — same class as v1; no per-read server latency regression (pure passthrough).
- Decryption batch on tile view: initial dashboard load decrypts N envelopes client-side — evaluated in Playwright against the 2s NFR with 100+ notes; if it regresses, batch decrypt with `Promise.all` and lazy-render long content (only tile previews, first 300 chars, at first).

## Migration Notes

- **DB reset is the migration story** (explicitly agreed): local (`db:reset`) and prod DBs wiped before this deploy; no v1 reading, no dual-format support. Deploy ordering: reset DB → apply new migration → deploy this change (mirrors the wipe-before-deploy ordering S-07 used for its own key handoff).
- `password_hash` column meaning changes in place; existing rows are dropped with the reset, no re-hash path needed.
- Roadmap's separately scheduled "PBKDF2 raise 100k → 600k" post-launch item is superseded for the *vault KDF* (client-side 600k from day one); the server-side verifier hashing can stay at 100k because its input is already a high-entropy 256-bit derivation product, not a human password.

## References

- Prior change (superseded design): `context/changes/note-encryption/` (plan + reviews + research)
- Tuta encryption architecture: `tuta.com/encryption`, `tuta.com/blog/zero-knowledge-architecture`, `tuta.com/blog/best-encryption-with-kdf` (research done 2026-09-13 in-session)
- OWASP PBKDF2 600k baseline: 2023 Password Storage Cheat Sheet (per plan-review precedent in `context/changes/note-encryption/reviews/plan-review.md`)
- Agreed related slices: S-05 (sync/conflict — client decrypt-inserted paths interplay minimal change), S-06 (dashboard deletion cascades users — vault columns cascade with them, no new work)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Client Crypto Core

#### Automated

- [ ] 1.1 e2e-crypto unit tests green (`npm run test -- src/__tests__/lib/e2e-crypto.test.ts`)
- [ ] 1.2 `npm run check:type` green
- [ ] 1.3 `npm run lint` green

#### Manual

- [ ] 1.4 Module audit signed off (no plaintext key export, no dependency, constants surface clean)

### Phase 2: Schema, Migration, and RPC Overloads

#### Automated

- [ ] 2.1 `npm run db:reset` applies migration chain cleanly
- [ ] 2.2 `npm run test:integration` green (vault fields persisted, REVOKE enforced, old RPC absent)

#### Manual

- [ ] 2.3 Migration SQL inspected for REVOKE/GRANT symmetry with S-07 precedent

### Phase 3: Server Rewiring

#### Automated

- [ ] 3.1 `npm run test:integration` green after adapter passthrough rewiring
- [ ] 3.2 `npm run test -- src/__tests__/actions` green (auth + dashboard vault contracts)
- [ ] 3.3 `npm run check:type` green

#### Manual

- [ ] 3.4 Grep-clean check: no server-side note-crypto references outside tests

### Phase 4: Unlock Lifecycle, Client Decryption, and Locked UX

#### Automated

- [ ] 4.1 All unit suites green with ≥80% coverage
- [ ] 4.2 Playwright extended golden-path + note-lifecycle + locked-state specs green
- [ ] 4.3 `npm run lint` green

#### Manual

- [ ] 4.4 Manual test steps listed in Testing Strategy executed and confirmed

### Phase 5: Cleanup, Hardening, Documentation

#### Automated

- [ ] 5.1 `npm run check:ready` fully green
- [ ] 5.2 ESLint boundary rule fires on a deliberately-bad import in a scratch check then passes on the real tree

#### Manual

- [ ] 5.3 README/AGENTS.md/env docs describe zero-knowledge model with no stale references
