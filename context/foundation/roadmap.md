---
project: "Scytala"
version: 1
status: active
created: 2026-08-18
updated: 2026-09-13
prd_version: 1
main_goal: low-complexity
top_blocker: time
---

# Roadmap: Scytala

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Scytala addresses the problem where teams, families, and friend groups need to share private content without it getting lost in fast-moving chat streams or surrendered to third-party cloud platforms. The product wedge — the defining architectural trait that separates Scytala from generic cloud notes — is that access is bound to an isolated, self-contained dashboard URL with per-dashboard credentials rather than a global account identity, combining lightweight self-hosting with full note version history and conflict-aware synchronization.

## North star

**S-03: Note CRUD and Version Persistence** — **DELIVERED (2026-09-09)**. The north star — the smallest end-to-end slice whose successful delivery proves the core product hypothesis — delivered the complete creation, authenticated access, line-numbered editing, and note deletion workflow with automatic immutable version preservation and optimistic concurrency control, proving the core value proposition before layering multi-user sync complexity.

## At a glance

| ID   | Change ID                                              | Outcome (user can …)                                                                                                                                                               | Prerequisites    | PRD refs                                             | Status   |
| ---- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------- | -------- |
| F-01 | `dashboard-data-schema-and-auth-scaffold`              | (foundation) Database migration creates tables for dashboards, dashboard_users, notes, and note_versions, alongside Edge-compatible session cookie / JWT utilities                 | —                | FR-001, FR-002, FR-004, FR-011                       | done     |
| F-02 | `structured-api-error-logging`                         | (foundation) Structured API error handling, zero-dependency JSON logger, and App Router error boundaries for Cloudflare Workers                                                    | —                | NFRs                                                 | done     |
| S-01 | `dashboard-creation-wizard`                            | User can create a new dashboard at `/new` with title, description, and participant credentials, receiving the shareable link and secrets                                           | F-01             | US-01, FR-001, FR-002, FR-003                        | done     |
| S-02 | `dashboard-auth-login-and-tiles-view`                  | User can navigate to `/dashboard/<hash>`, log in with per-dashboard credentials, receive a signed HttpOnly session cookie, and view note tiles                                     | S-01             | US-02, FR-004, FR-005                                | done     |
| S-03 | `note-crud-and-version-persistence`                    | User can create, edit in line-numbered editor, and delete plain text notes on the dashboard with every edit automatically preserved as an immutable version with timestamps        | S-02             | US-03, FR-006, FR-007, FR-008, FR-011                | done     |
| S-04 | `note-version-history-browser`                         | User can open any note's version history panel and browse past versions with timestamps and author details                                                                         | S-03             | US-05, FR-011                                        | done     |
| S-05 | `manual-sync-and-conflict-diff-resolution`             | User can manually trigger sync to pull remote note changes and resolve concurrent edit conflicts via a side-by-side diff merge modal                                               | S-03             | US-04, FR-007, FR-012                                | ready    |
| S-06 | `dashboard-management-and-lifecycle`                   | User can update dashboard metadata (title, description) or permanently delete the dashboard and all its associated notes and credentials                                           | S-02             | FR-009, FR-010                                       | ready    |
| S-07 | `note-encryption`                                      | (security) Note titles and contents — across `notes` and all `note_versions` snapshots — are AES-256-GCM encrypted at rest; UI renders plaintext unchanged while the DB stores only `v1:` ciphertext | S-03             | Guardrails, FR-006, FR-007, FR-011                   | ready    |
| T-01 | `testing-tenant-isolation-and-auth-session-guards`     | (testing) Verify cross-dashboard data isolation and authenticated session guard boundaries with unit and integration tests                                                         | F-01, S-01, S-02 | Test Plan §3 Phase 1, FR-004, FR-005                 | ready    |
| T-02 | `testing-note-versioning-and-concurrency-integrity`    | (testing) Ensure atomic note updates, immutable version history snapshots, and conflict detection under concurrent mutations                                                       | S-03             | Test Plan §3 Phase 3, FR-007, FR-011, FR-012         | ready    |
| T-03 | `testing-server-input-validation-and-security-defense` | (testing) Enforce server-side Zod validation parity, injection defense, and credential formatting contracts                                                                        | S-01             | Test Plan §3 Phase 1, FR-001, FR-002, FR-003, FR-006 | ready    |
| T-04 | `testing-ci-quality-gates-and-coverage-hardening`      | (testing) Lock the 80% coverage floor and automated quality checks across the CI/CD pipeline                                                                                       | T-01, T-03       | Test Plan §3 Phase 4, NFRs                           | proposed |
| T-05 | `testing-playwright-e2e-critical-flows`                | (testing) End-to-end browser automation for critical flows (wizard -> credentials -> login -> note CRUD & versions -> restore -> logout) with 5-layer build isolation              | S-03, S-04       | Test Plan §3 Phase 2, Risk #4, US-01–US-05           | done     |
| O-01 | `edge-centralized-error-tracking-and-apm`              | (observability) Centralized external error tracking (Sentry Store REST API / APM) via Next.js `instrumentation.ts` (`onRequestError`) with edge compatibility and secret redaction | F-02             | NFRs, Production Readiness Blocker 1                 | proposed |
| H-01 | `production-hardening`                                 | (hardening) All server paths validate env via `getEnv()` with no `SESSION_SECRET` fallback to the service key in prod, explicit Server Action body size limit, idempotent reads retry transient Supabase failures, and CSP uses a nonce-based policy instead of `unsafe-inline` | F-01, S-03, F-02 | Production Readiness C-1, C-2, C-3, C-5, C-7         | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                              | Chain                                                         | Note                                                                                                                                                                                                                |
| ------ | ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Core Access & Note Lifecycle       | `F-01` (done) → `S-01` (done) → `S-02` (done) → `S-03` (done) | North Star slice (`S-03`) completed on 2026-09-09. Core note CRUD and immutable versioning paths operational.                                                                                                       |
| B      | Multi-user Collaboration & History | `S-04` / `S-05`                                               | Joins Stream A at `S-03`; now unblocked and ready for implementation. Builds on version persistence to provide history browsing and conflict diff resolution.                                                       |
| C      | Governance & Observability         | `F-02` (done) / `S-06` / `O-01`                               | Joins Stream A at `S-02`; provides operational error tracking, APM integration, and dashboard lifecycle management.                                                                                                 |
| D      | Quality & Security Verification    | `T-01` / `T-03` → `T-02` → `T-04`; `T-05` (done)              | Phased test rollout from `test-plan.md`. Playwright E2E browser suite (`T-05`) delivered on 2026-09-12 with Golden Path and note lifecycle coverage. Note mutation unit/action tests delivered in S-03 (>98% coverage); dedicated concurrency (`T-02`), tenant isolation (`T-01`), and security defense (`T-03`) remain ready. |
| E      | Production Hardening & Readiness   | `S-07` / `O-01` / `H-01`                                      | Derived from the production readiness review (2026-09-12, report in `context/changes/testing-note-versioning-and-concurrency-integrity/reviews/production-readiness-report.md`). `S-07` (note encryption at rest, plan reviewed 2026-09-13) closes the biggest security gap — DB access alone currently reads every note as plaintext. Pre-deployment gates (error alerting, migrations, secrets) run first; see "Proposed Change: Production Hardening" below. |

## Baseline

What's already in place in the codebase as of `2026-09-12` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Next.js 16 App Router + MUI 9 theme and providers (`src/providers/mui-theme-provider.tsx`, `src/app/layout.tsx`), Dashboard Creation Wizard at `/new` (`src/app/new/page.tsx`), Dashboard Login / Note Tiles view at `/dashboard/[hash]` (`src/app/dashboard/[hash]/page.tsx`, `src/app/dashboard/[hash]/components/`), and full-page Note Editor with line numbers and password-gated delete dialog at `/dashboard/[hash]/note/[noteId]` (`src/app/dashboard/[hash]/note/[noteId]/components/`).
- **Backend / API:** present — Next.js Server Actions for dashboard creation (`src/actions/dashboard.ts`), authentication and session management (`src/actions/auth.ts`), startup audit (`src/actions/audit.ts`), note CRUD operations (`src/actions/notes.ts`), and health check route handler (`src/app/api/health/route.ts`).
- **Data:** present — PostgreSQL schema with migrations for `dashboards`, `dashboard_users`, `notes`, `note_versions`, and `rate_limits` with atomic RPC functions (`create_dashboard_with_users`, `create_note_with_version`, `update_note_with_version`, `check_rate_limit`) and `DatabaseClient` adapter layer (`src/client/db-client.ts`, `supabase/migrations/`). Schema management is strictly forward-only.
- **Auth & Security:** present — Per-dashboard credentials validation (PBKDF2 Web Crypto with dummy timing-equalization), signed HttpOnly session cookies (`scytala_session_<hash>`), HMAC session token signing/verification (`src/lib/session.ts`), shared session guard helper (`src/lib/auth-guard.ts`), dual-layer rate limiting (Cloudflare Worker edge rate limiter bindings + Supabase token bucket RPC) protecting login and note mutations (`src/lib/rate-limit.ts`), edge session verification rate limiting, and password re-authentication on note deletion.
- **Testing & E2E:** present — 42 Vitest test files (549 tests) running under `happy-dom` with strict 80% coverage enforcement; Playwright E2E suite (`playwright.config.ts`, `e2e/fixtures/test-base.ts`, `e2e/golden-path.spec.ts`, `e2e/note-lifecycle.spec.ts`) covering Golden Path and note deletion flows locally across Chromium and Firefox with 5-layer Cloudflare production build isolation (`tsconfig.build.json`, `next.config.ts` `outputFileTracingExcludes`, `vitest.config.ts`, `eslint.config.mjs`, `.gitignore`).
- **Deploy / infra:** present — OpenNext Cloudflare Workers deployment configuration (`wrangler.jsonc`), test build isolation (`.assetsignore`, dedicated tsconfig excluding test files from production bundles), and GitHub Actions CI workflow (`.github/workflows/test.yml`).
- **Observability & Resilience:** present — Edge-compatible zero-dependency structured JSON logger with recursive sanitization (`src/lib/logger.ts`), App Router error boundaries (`src/app/error.tsx`, `src/app/global-error.tsx`), health check probe endpoint (`src/app/api/health/route.ts`), startup deployment audit logging (`src/instrumentation.ts`), and 8-second global timeout fetch (`createTimeoutFetch` via `SUPABASE_TIMEOUT_MS`) on all Supabase database queries.

## Foundations

### F-01: Wire per-dashboard Data Schema and Auth Scaffold

- **Outcome:** (foundation) Database migration creates tables for `dashboards`, `dashboard_users`, `notes`, and `note_versions` with RLS policies and indexes; cryptographic utilities provide password hashing and Edge-compatible signed HttpOnly session cookie / JWT verification.
- **Change ID:** `dashboard-data-schema-and-auth-scaffold`
- **PRD refs:** FR-001, FR-002, FR-004, FR-011, Access Control
- **Unlocks:** `S-01`, `S-02`, `S-03`
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Schema design must ensure note versioning and per-dashboard user credential isolation are resilient to concurrent mutations on Supabase PostgreSQL.
- **Status:** done

### F-02: Structured API Error Logging and Exception Handling

- **Outcome:** (foundation) Centralized API error handling, zero-dependency structured JSON logger (`src/lib/logger.ts`), health check probe (`/api/health`), and App Router error boundaries for Next.js Server Actions and Route Handlers executing on Cloudflare Workers.
- **Change ID:** `structured-api-error-logging`
- **PRD refs:** Non-Functional Requirements (Guardrails, p95 < 2s)
- **Unlocks:** `S-01`, `S-02`, `S-04`, `S-05`
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Must remain lightweight and adhere to Cloudflare worker bundle limits without introducing heavy external logging dependencies.
- **Status:** done

## Slices

### S-01: Dashboard Creation Wizard

- **Outcome:** User can navigate to `/new`, fill in dashboard title and description, specify participant user IDs, generate randomized strong passwords, and view the shareable dashboard link (`/dashboard/<hash>`) and credentials to distribute.
- **Change ID:** `dashboard-creation-wizard`
- **PRD refs:** US-01, FR-001, FR-002, FR-003
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Credential generation must be secure, randomized, and easily copyable for out-of-band distribution.
- **Status:** done

### S-02: Dashboard Auth Login and Tiles View

- **Outcome:** User can open `/dashboard/<hash>`, authenticate using their per-dashboard user ID and password, receive a signed HttpOnly session cookie, and view the dashboard displaying all existing notes as readable MUI tiles.
- **Change ID:** `dashboard-auth-login-and-tiles-view`
- **PRD refs:** US-02, FR-004, FR-005
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Authentication must properly restrict access without leaking dashboard existence or metadata to unauthenticated users.
- **Status:** done

### S-03: Note CRUD and Version Persistence

- **Outcome:** Authenticated user can create new plain text notes, edit existing notes in a full-page line-numbered editor (`/dashboard/<hash>/note/<noteId>`), and delete notes via password re-authentication, with every edit automatically creating an immutable record in `note_versions` with creation/edit timestamps under optimistic concurrency control.
- **Change ID:** `note-crud-and-version-persistence`
- **PRD refs:** US-03, FR-006, FR-007, FR-008, FR-011
- **Prerequisites:** S-02
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:**
  - Optimistic UI vs Server Action direct mutation: Resolved in S-03 — Note editor manages local client state, invoking Server Actions directly (`createNoteAction`, `updateNoteAction`, `deleteNoteAction`). On success, client navigates back to dashboard with `router.push()` + `router.refresh()`. On version mismatch, Server Action returns `{ success: false, versionConflict: true }` rendering an alert with a "Reload" action.
- **Risk:** Note creation and editing in MUI must feel instantaneous while ensuring reliable transactional persistence in Supabase.
- **Status:** done (PR #31, commit `1249e5e`, 2026-09-09)

### S-04: Note Version History Browser

- **Outcome:** Authenticated user can open any note's version history panel and browse previous versions in chronological order with timestamps and author details.
- **Change ID:** `note-version-history-browser`
- **PRD refs:** US-05, FR-011
- **Prerequisites:** S-03 (done)
- **Parallel with:** S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Version retrieval queries must be ordered by timestamp descending and optimized to avoid payload bloat on notes with many edits.
- **Status:** done

### S-05: Manual Sync and Conflict Diff Resolution

- **Outcome:** Authenticated user can click the manual sync button to pull remote changes, auto-detect note edit conflicts against local state, and resolve them via a side-by-side diff merge modal without silent data loss.
- **Change ID:** `manual-sync-and-conflict-diff-resolution`
- **PRD refs:** US-04, FR-007, FR-012
- **Prerequisites:** S-03 (done)
- **Parallel with:** S-04, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Diff algorithm in JavaScript must handle edge-case text divergences cleanly without losing concurrent note versions.
- **Status:** ready

### S-06: Dashboard Management and Lifecycle

- **Outcome:** Authenticated user can update dashboard settings (title, description) or permanently delete the dashboard and all its associated notes, versions, and credentials.
- **Change ID:** `dashboard-management-and-lifecycle`
- **PRD refs:** FR-009, FR-010
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Cascade deletion must cleanly remove all dependent notes, versions, and credentials without leaving orphaned rows.
- **Status:** ready

### S-07: Note Encryption at Rest

- **Outcome:** (security) All note titles and contents — across `notes` and every `note_versions` snapshot — are encrypted at rest with AES-256-GCM envelope encryption (`v1:<iv_128bit_b64>:<ciphertext_b64>`, 128-bit random IV, AAD = note ID) inside the `SupabaseDatabaseClient` adapter, the single choke point of the `DatabaseClient` port. Users notice nothing — tiles, editor, version history, diffs, and restore all render plaintext exactly as today — while the database stores only ciphertext. Adds a required `NOTE_ENCRYPTION_KEY` Worker secret (64 hex chars, no fallback), an "Untitled Note" title default, a one-time wipe of legacy prod test data (no backfill), and fixes the E2E cleanup fixture that deletes by plaintext title patterns.
- **Change ID:** `note-encryption`
- **PRD refs:** Guardrails ("Note content must not be accessible without valid credentials" — defense-in-depth, not zero-knowledge), FR-006, FR-007, FR-011
- **Prerequisites:** S-03 (done)
- **Parallel with:** S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - Key material format: Resolved in plan review — key is generated as 64 hex chars (`openssl rand -hex 32`) and hex-decoded to exactly 32 bytes for raw AES-256 `importKey`; `NOTE_ENCRYPTION_KEY` is required in the zod env schema with no fallback (fail-fast beats the silent-fallback antipattern H-01 is removing).
  - Plaintext starting with literal `v1:`: Resolved in plan review — `v0:` escape marker written at encrypt time with three-shape recognition on decrypt (`v1:` → decrypt, `v0:` → unwrap, no prefix → legacy passthrough).
- **Risk:** Decrypt must fail closed (throw) — garbage plaintext or masked key errors defeat authenticated encryption. Wipe-before-deploy ordering: the Worker secret + prod `notes` wipe must precede the encrypted deploy. The new 5-arg `create_note_with_version` overload must repeat REVOKE/GRANT hardening and drop the old 4-arg signature.
- **Status:** ready (plan reviewed SOUND 2026-09-13)

## Testing & Verification

### T-01: Tenant Isolation & Auth Session Guards

- **Outcome:** (testing) Verify cross-dashboard data isolation and authenticated session guard boundaries with unit and integration tests (covering risks #1, #2).
- **Change ID:** `testing-tenant-isolation-and-auth-session-guards`
- **PRD refs:** Test Plan §3 Phase 1, Risk #1, Risk #2, FR-004, FR-005, Access Control
- **Prerequisites:** F-01, S-01, S-02
- **Parallel with:** F-02, S-03, T-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Cross-tenant leakage and session bypass must be tested without asserting happy-path only; must test with synthetic forged cookie headers and invalid tenant IDs.
- **Status:** ready

### T-02: Note Versioning & Concurrency Integrity

- **Outcome:** (testing) Ensure atomic note updates, immutable version history snapshots, and conflict detection under concurrent mutations (covering risks #3, #4).
- **Change ID:** `testing-note-versioning-and-concurrency-integrity`
- **PRD refs:** Test Plan §3 Phase 2, Risk #3, Risk #4, FR-007, FR-011, FR-012
- **Prerequisites:** S-03 (done)
- **Parallel with:** S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** RPC and transaction rollbacks must be validated on outdated `expected_version` without relying on mocked success paths.
- **Status:** ready

### T-03: Server Input Validation & Security Defense

- **Outcome:** (testing) Enforce server-side Zod validation parity, injection defense (HTML/script/malicious payloads), and credential formatting contracts (covering risks #5, #6).
- **Change ID:** `testing-server-input-validation-and-security-defense`
- **PRD refs:** Test Plan §3 Phase 3, Risk #5, Risk #6, FR-001, FR-002, FR-003, FR-006
- **Prerequisites:** S-01
- **Parallel with:** F-02, S-03, T-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Server-side validation must not rely on client UI form constraints and must cleanly handle oversized or invalid payloads.
- **Status:** ready

### T-04: CI Quality Gates & Coverage Hardening

- **Outcome:** (testing) Lock the 80% coverage floor, automated linting, typechecking, and build verification gates across the CI/CD pipeline.
- **Change ID:** `testing-ci-quality-gates-and-coverage-hardening`
- **PRD refs:** Test Plan §3 Phase 4, Test Plan §5 Quality Gates, NFRs
- **Prerequisites:** T-01, T-03
- **Parallel with:** S-03, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** CI threshold enforcement must prevent regression without slowing down deployment pipelines.
- **Status:** proposed

### T-05: Playwright E2E Test Suite and Critical Browser Flows

- **Outcome:** (testing) Automated end-to-end browser testing verifies critical user journeys (wizard creation, credential copy, login, note authoring, version history drawer diff inspection, version restoration, note deletion with password re-authentication, and logout) in headless Chromium and Firefox using custom fixtures (`test.extend`) and local Supabase persistence, protected by 5-layer Cloudflare production build isolation.
- **Change ID:** `testing-playwright-e2e-critical-flows`
- **PRD refs:** Test Plan §3 Phase 2, Risk #4, US-01, US-02, US-03, US-04, US-05
- **Prerequisites:** S-03, S-04
- **Parallel with:** S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - CI/CD execution vs local-only: Resolved in plan — E2E execution is strictly local developer-side (`npm run test:e2e`, `npm run test:e2e:ui`, `npm run test:e2e:init`) due to compute cost and the absence of a non-production Supabase environment on the free usage plan. Excluded from GitHub Actions CI.
- **Risk:** Build isolation and test runner collision risks resolved via 5-layer isolation (`tsconfig.build.json`, `next.config.ts` `outputFileTracingExcludes`, `vitest.config.ts` exclusions, `eslint.config.mjs`, and `.gitignore`).
- **Status:** done (commits `952b906`, `1b66e39`, 2026-09-12)

## Observability & Operations

### O-01: Edge Centralized Error Tracking and APM Integration

- **Outcome:** (observability) Centralized external error tracking and alerting for Cloudflare Workers edge runtime and client React error boundaries. When an unhandled exception or critical error occurs, it is automatically captured, grouped, and forwarded to an external APM / Sentry dashboard without impacting request latency or leaking credentials.
- **Change ID:** `edge-centralized-error-tracking-and-apm`
- **PRD refs:** Non-Functional Requirements (Guardrails, Reliability), Production Readiness Review (Blocker 1)
- **Prerequisites:** F-02
- **Parallel with:** S-04, S-05, S-06
- **Blockers:** —
- **Recommended Architecture / Approach:**
  - Avoid heavy Node-specific SDKs (`@sentry/nextjs`): Recent research on OpenNext Cloudflare Workers (getsentry/sentry-javascript #18842, #14931) proves that full Sentry Next.js SDKs cause `AsyncLocalStorage bound function outside request` crashes in V8 edge isolates and add 2MB+ to worker bundle size (violating Cloudflare's 10MB limit).
  - Adopt Next.js 15/16 official `instrumentation.ts` (`onRequestError` hook): Natively captures server-side rendering, route handler, and server action exceptions.
  - Implement zero-heavy-dependency Edge HTTP Client (`src/lib/error-tracker.ts`): Directly posts structured JSON events to Sentry Store REST API (`/api/{projectId}/store/` with `X-Sentry-Auth`) or a generic APM webhook URL (Axiom / Datadog) using standard `fetch` with an `AbortSignal.timeout(3000)`.
  - Recursive Sanitization: Reuses `sanitizeValue` from `src/lib/logger.ts` to ensure no passwords, session tokens, or credentials ever leave the system.
  - Fail-safe & Non-blocking: If unconfigured or if the error tracker network request fails, it silently no-ops without disrupting user requests.
- **Status:** proposed (deferred during early demo stage; recommended for public launch)

## Proposed Change: Production Hardening

Derived from the production readiness review (2026-09-12, GO WITH MITIGATIONS, readiness 81%, medium risk; full findings in `context/changes/testing-note-versioning-and-concurrency-integrity/reviews/production-readiness-report.md`). A single change consolidates all code fixes identified by the review; it is preceded by deployment gates that need no change folder.

### Pre-deployment gates (ops/config)

1. **Error alerting stopgap** — Cloudflare Workers Logs already captures 100% of invocations as structured JSON; enable alert notifications for `error`-level logs plus the `Supabase rate limit RPC failed` warning so incidents and degraded rate limiting surface immediately. Full external error tracking is proposed separately as `O-01`.
2. **Database migrations** — apply `supabase/migrations/*` to the production Supabase project manually before deploy (Cloudflare build watch paths exclude them, so deploys do not carry schema changes).
3. **Worker secrets** — verify `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and an independent `SESSION_SECRET` (≥32 chars) are configured on the Worker via `wrangler secret list`.

### H-01: `production-hardening` (~1–2 days, single change)

Consolidates the configuration, resilience, and security gaps from the review:

- Route all env access through `getEnv()` by refactoring `src/lib/supabase.ts` and `src/lib/session.ts`, which currently read `process.env` directly and bypass the zod validation schema (including a legacy `SUPABASE_KEY` fallback).
- Fail fast in production when `SESSION_SECRET` is absent instead of falling back to `SUPABASE_SERVICE_ROLE_KEY`, which couples session signing to a rotating DB credential; dev/test fallbacks remain.
- Make the Server Action body limit explicit (`serverActions.bodySizeLimit`, e.g. `256kb`) and cap note content with zod `.max()` in `createNoteSchema`/`updateNoteSchema` so oversized payloads cannot inflate per-version DB storage or the DoS surface.
- Add a small retry wrapper (2 retries, exponential backoff + jitter) around idempotent Supabase reads — `getDashboardByHash`, `getNotesByDashboard`, `checkHealth` — so transient network blips or PostgREST 503s no longer surface as user-facing "temporarily unavailable" errors. Mutations (`createNote`, `updateNote`, `deleteNote`) stay single-shot because they lack idempotency keys; retrying them risks duplicate note versions.
- Replace `script-src 'unsafe-inline'` in the production CSP with a nonce-based policy propagated via Next.js middleware.
- Trivial hygiene bundled here: `import type { Dashboard }` in `src/app/new/components/StepSuccess.tsx`.

### Also scheduled post-launch (no dedicated change yet)

- `npm audit fix` for dev-toolchain CVEs (wrangler → miniflare → sharp) on a dev branch; production dependencies are clean (0 vulnerabilities).
- Staging wrangler environment + Supabase staging project.
- PBKDF2 iteration raise (100k → ~600k) on the next schema-touching release only (rehash-on-verify already supports migration of old hashes).
- Metrics instrumentation (login success/failure, rate-limit trips, note mutations).

### Accepted for MVP

- No read caching — revisit on latency/cost signals; no circuit breaker — revisit together with `H-01`; no feature flags — no current need; graceful shutdown / connection pooling — N/A on stateless Cloudflare Workers isolates.

## Backlog Handoff

| Roadmap ID | Change ID                                              | GitHub Issue / Source                                                                                            | Status        | Prerequisites     |
| ---------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------- | ----------------- |
| F-01       | `dashboard-data-schema-and-auth-scaffold`              | [#14: [F-01] Wire per-dashboard Data Schema and Auth Scaffold](https://github.com/palucdev/scytala/issues/14)    | done          | —                 |
| F-02       | `structured-api-error-logging`                         | [#15: [F-02] Structured API Error Logging and Exception Handling](https://github.com/palucdev/scytala/issues/15) | done          | —                 |
| S-01       | `dashboard-creation-wizard`                            | [#16: [S-01] Dashboard Creation Wizard (/new)](https://github.com/palucdev/scytala/issues/16)                    | done          | F-01              |
| S-02       | `dashboard-auth-login-and-tiles-view`                  | [#17: [S-02] Dashboard Auth Login and Tiles View](https://github.com/palucdev/scytala/issues/17)                 | done          | S-01              |
| S-03       | `note-crud-and-version-persistence`                    | [#18: [S-03] Note CRUD and Version Persistence (North Star)](https://github.com/palucdev/scytala/issues/18)      | done (PR #31) | S-02 (North Star) |
| S-04       | `note-version-history-browser`                         | [#19: [S-04] Note Version History Browser](https://github.com/palucdev/scytala/issues/19)                        | done          | S-03              |
| S-05       | `manual-sync-and-conflict-diff-resolution`             | [#20: [S-05] Manual Sync and Conflict Diff Resolution](https://github.com/palucdev/scytala/issues/20)            | ready         | S-03              |
| S-06       | `dashboard-management-and-lifecycle`                   | [#21: [S-06] Dashboard Management and Lifecycle](https://github.com/palucdev/scytala/issues/21)                  | ready         | S-02              |
| S-07       | `note-encryption`                                      | [#39: [S-07] Note Encryption at Rest (Title + Content)](https://github.com/palucdev/scytala/issues/39)           | ready         | S-03              |
| T-01       | `testing-tenant-isolation-and-auth-session-guards`     | [#24: [T-01] Tenant Isolation & Auth Session Guards](https://github.com/palucdev/scytala/issues/24)              | ready         | F-01, S-01, S-02  |
| T-02       | `testing-note-versioning-and-concurrency-integrity`    | [#26: [T-02] Note Versioning & Concurrency Integrity](https://github.com/palucdev/scytala/issues/26)             | ready         | S-03              |
| T-03       | `testing-server-input-validation-and-security-defense` | [#27: [T-03] Server Input Validation & Security Defense](https://github.com/palucdev/scytala/issues/27)          | ready         | S-01              |
| T-04       | `testing-ci-quality-gates-and-coverage-hardening`      | [#28: [T-04] CI Quality Gates & Coverage Hardening](https://github.com/palucdev/scytala/issues/28)               | proposed      | T-01, T-03        |
| T-05       | `testing-playwright-e2e-critical-flows`                | [Plan](context/changes/testing-playwright-e2e-critical-flows/plan.md) (Branch `feature/e2e`, Commits `952b906`, `1b66e39`)       | done          | S-03, S-04        |
| O-01       | `edge-centralized-error-tracking-and-apm`              | [#33: [O-01] Edge Centralized Error Tracking and APM Integration](https://github.com/palucdev/scytala/issues/33) | proposed      | F-02              |
| H-01       | `production-hardening`                                 | Production readiness review (2026-09-12, report in T-02 reviews/)                                               | proposed      | F-01, S-03, F-02  |

## Open Roadmap Questions

1. **Session cookie expiration duration** — Resolved in S-02: 7 days (`DEFAULT_SESSION_TTL_SECONDS = 604800`) balancing security with browser convenience.
2. **Note tile ordering policy** — Resolved in S-02: sorted by `updated_at` descending so most recently modified notes appear first.
3. **Note CRUD mutation strategy** — Resolved in S-03: Editor manages local client state, invoking Server Actions directly (`createNoteAction`, `updateNoteAction`, `deleteNoteAction`). On successful mutation, `router.push()` + `router.refresh()` triggers SSR re-rendering of dashboard tiles. Version mismatches return typed `{ versionConflict: true }` prompting a manual reload to prevent lost updates.
4. **Speculative UI elements pruning** — Owner: product/developer. 7 disabled placeholder buttons ("Add Directory", "Add File", "Add Image", "Add Survey", "Dashboard settings" in `DashboardHeader`, and "Note history", "Contributors" in `NoteEditorHeader`) were flagged during S-03 reality review as out-of-scope for MVP. Should they be pruned or retained behind feature flags until their respective slices ship?
5. **Version history presentation format (S-04)** — Resolved in S-04: Drawer displays past snapshots with metadata and character delta badges; clicking opens a modal preview with optional inline word-level diff and restore CTA.

## Parked

- **File/photo/video attachments** — Why parked: PRD §Non-Goals (plain text notes only for MVP).
- **Real-time WebSocket / cursor collaboration** — Why parked: PRD §Non-Goals (manual sync and on-enter sync is sufficient for MVP scale).
- **Mobile native applications** — Why parked: PRD §Non-Goals (web-only responsive design).
- **Rich text formatting (Markdown/HTML)** — Why parked: PRD §Non-Goals (plain text only for MVP simplicity).
- **Credential management after dashboard creation** — Why parked: PRD §Non-Goals (credentials generated once up front).

## Done

- **F-01: Wire per-dashboard Data Schema and Auth Scaffold** — Implemented 2026-08-20 (`context/changes/dashboard-data-schema-and-auth-scaffold/`). Database migration creates tables for `dashboards`, `dashboard_users`, `notes`, and `note_versions`, alongside Edge-compatible session cookie / JWT utilities and DatabaseClient adapter.
- **F-02: Structured API Error Logging and Exception Handling** — Implemented 2026-08-27. Zero-dependency edge-compatible structured JSON logger (`src/lib/logger.ts`) with recursive sensitive field redaction, Next.js App Router error boundaries (`src/app/error.tsx`, `src/app/global-error.tsx`), health check probe endpoint (`src/app/api/health/route.ts`), and structured logging across Server Actions.
- **S-01: Dashboard Creation Wizard** — Implemented 2026-08-26 (`context/changes/dashboard-creation-wizard/`). User can create a new dashboard at `/new` with title, description, and participant credentials, receiving the shareable link and secrets.
- **S-02: Dashboard Auth Login and Tiles View** — Implemented 2026-08-27 (`context/changes/dashboard-auth-login-and-tiles-view/`). User can open `/dashboard/<hash>`, authenticate using per-dashboard credentials, receive a signed HttpOnly session cookie, and view note tiles with logout and empty-state handling.
- **S-03: Note CRUD and Version Persistence (North Star)** — Implemented 2026-09-09 (`context/changes/note-crud-and-version-persistence/`, PR #31, commit `1249e5e`). Authenticated users can create plain text notes, edit notes in a full-page editor with line numbering (`/dashboard/<hash>/note/<noteId>`), and delete notes with password re-authentication (`DeleteNoteDialog`). Edits atomically commit immutable versions via PostgreSQL RPCs (`create_note_with_version`, `update_note_with_version`), guarded by optimistic concurrency conflict detection and `noteMutation` rate limiting (30 ops/min). Tested with 98.07% line coverage.
- **S-04: Note Version History Browser** — Implemented 2026-09-10 (`context/changes/note-version-history-browser/`, Issue #19). Authenticated users can open a slide-over non-dimming version history drawer while editing a note, browse chronological version snapshots with timestamps, author attribution, and character deltas, inspect full read-only snapshots in a popup modal dialog with optional word-level inline diff against current state, and restore past versions via non-destructive append-only commits with optimistic concurrency protection. Tested with 97.72% line coverage.
- **T-05: Playwright E2E Test Suite and Critical Browser Flows** — Implemented 2026-09-12 (`context/changes/testing-playwright-e2e-critical-flows/`, commits `952b906`, `1b66e39`). Installed `@playwright/test` and hardened 5-layer build isolation (`tsconfig.build.json`, `next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `.gitignore`) shielding Cloudflare Worker production bundles and Vitest coverage gates. Delivered custom fixtures (`test.extend`) in `e2e/fixtures/test-base.ts` for clipboard permissions, dynamic tenant creation, and login. Verified complete Golden Path journey (`e2e/golden-path.spec.ts`: wizard creation $\rightarrow$ credential copy $\rightarrow$ login $\rightarrow$ note authoring $\rightarrow$ version history drawer diff inspection $\rightarrow$ restore $\rightarrow$ logout) and note lifecycle (`e2e/note-lifecycle.spec.ts`: note deletion with password re-authentication) across Chromium and Firefox. Registered `test:e2e:init` in `package.json`, updated cookbook patterns in `context/foundation/test-plan.md`, and formalized the local developer-only execution model (due to compute cost and free-tier Supabase constraints).
- **Supporting Infrastructure & Hardening (Post-S-02)**:
  - **Native Stack Rate Limiting Migration** — Implemented 2026-08-27 (`context/changes/replace-upstash-rate-limiting/`, commit `7f6a0f3`). Replaced external Upstash dependency with Cloudflare Worker edge rate limiter bindings and native Supabase PostgreSQL token bucket RPC (`rate_limits` table + `check_rate_limit`).
  - **Cloudflare Build Isolation** — Implemented 2026-08-28 (`context/changes/exclude-tests-from-cloudflare-build/`, commit `0708ef7`). Isolated automated test files (`src/__tests__/**`, `vitest.config.ts`) from production Cloudflare builds via tsconfig separation and `.assetsignore`.
  - **Dashboard Logout Fix** — Implemented 2026-08-28 (`context/changes/fix-dashboard-logout/`, commit `ec43009`). Fixed session cookie deletion and error boundary behavior during dashboard logout.
