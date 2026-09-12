# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-11

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced during research in each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Cross-dashboard note or credential data leakage (broken tenant isolation) | High | High | PRD §Guardrails (FR-004, Access Control), roadmap §Baseline, hot-spot dir `src/lib/` (29 commits/30d), hot-spot dir `src/actions/` (20 commits/30d) |
| 2 | Authentication & session guard bypass or invalid cookie handling | High | High | roadmap §S-02 (FR-004, FR-005), archive/dashboard-auth-login-and-tiles-view/plan.md, hot-spot dir `src/actions/` (20 commits/30d) |
| 3 | Concurrent note mutation overwrite and silent version history loss | High | Medium | PRD §Guardrails & Business Logic (FR-011, FR-012), roadmap §S-03, §S-05, archive/note-crud-and-version-persistence/plan.md |
| 4 | End-to-end browser workflow breakage across client UI, cookie persistence, and Server Action navigation | High | High | PRD §User Flows (US-01 through US-05), roadmap §Baseline, hot-spot dir `src/app/` (133 commits/30d), missing browser automation coverage |
| 5 | Supabase RPC & database query failure or unhandled exception in Server Action | Medium | High | roadmap §F-02, hot-spot dir `src/actions/` (20 commits/30d), hot-spot dir `supabase/migrations/` (12 commits/30d) |
| 6 | Untrusted input & server-side validation parity failure (abuse scenario) | Medium | Medium | PRD §FR-001, FR-006, archive/dashboard-creation-wizard/plan.md, hot-spot dir `src/actions/` (20 commits/30d) |
| 7 | Multi-user conflict diff merge inconsistency and note state corruption | High | Medium | roadmap §S-05, PRD §FR-007, FR-012, hot-spot dir `src/lib/` (29 commits/30d) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context research must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | Requesting a note ID or user alias belonging to Dashboard A with a valid session for Dashboard B returns 404/403 and never returns data or modifies rows. | Verifying that a session exists implies the user owns the accessed dashboard. | Database RPC query filters, session payload claim extraction, Server Action authorization checks. | Integration (mocked DB / test DB queries asserting tenant scoping) | Happy-path single-tenant assertion; mocking out the tenant check. |
| #2 | Unauthenticated request to protected dashboard route/action returns redirect or 401; expired, malformed, or tampered JWT cookie is rejected; valid credentials issue signed cookie. | If JWT signature verification passes in unit test, Edge cookie middleware and Server Action session extraction work in production. | Cookie parsing in Next.js Server Actions / middleware, Edge runtime Web Crypto HMAC verification, session expiry boundaries. | Integration (Server Action / route handler test with synthetic cookie headers) | Testing JWT utils in isolation without testing the action/middleware consumption path. |
| #3 | Attempting to update a note with an outdated `expected_version` fails with a conflict error without mutating `notes` or overwriting `note_versions`; valid update creates exact sequential version snapshot. | A successful note update status (200) means the version history table was updated atomically. | Version incrementing logic, atomic PostgreSQL transaction/RPC behavior, note version ordering (`DESC`). | Integration (Database client / RPC test asserting version row count and version number sequencing) | Mocking the database to always return success without asserting rollback on version mismatch. |
| #4 | Complete user journey (wizard creation -> credential copy -> dashboard login -> note creation -> version inspection -> logout) succeeds in a real headless browser with cookies preserved across navigations. | Client-side React state assertions in unit tests guarantee real browser cookie flow and multi-page transitions work together. | Playwright browser fixtures, Next.js App Router navigation timing, clipboard API permissions, cookie lifecycle in browser context. | E2E (Playwright running against Next.js test server or preview build) | Writing brittle visual pixel snapshots instead of asserting user-visible text, accessible roles, and URL state changes. |
| #5 | When Supabase returns an error or constraint violation, Server Action catches it, rolls back any partial state, and returns a structured `{ success: false, error }` contract rather than throwing an uncaught 500 error. | Database errors are automatically caught and transformed into user-friendly messages. | Error mapping in database client, Server Action try/catch contracts, Zod parsing error formats. | Unit + Integration (Action tests with rejected DB promises / synthetic Postgres error codes) | Assertion copied from implementation (testing that action returns exact internal error string rather than contract). |
| #6 | Submitting payload with HTML/script injection, excessive length, or invalid alias characters directly to Server Actions is rejected by Zod schema and sanitized before persistence. | Client-side validation in MUI form components prevents invalid payloads from reaching the backend. | Server Action Zod schemas, DB column constraints, sanitization/escaping on plain text output. | Unit (Zod schema and action unit tests with malicious payloads) | Relying solely on client UI tests to verify server validation. |
| #7 | Concurrent edits from two distinct participant sessions trigger side-by-side conflict resolution modal with correct character-level diff highlighting before merge. | Fast-forward merge always produces valid markdown without data loss when remote note changes. | Three-way diff algorithm, optimistic concurrency check, conflict resolution dialog state machine. | Integration + E2E (diff algorithm unit test + browser dual-context conflict resolution) | Mocking diff resolution to auto-overwrite without user confirmation. |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder.
Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Core Unit & Integration Regression Suite | Defend tenant isolation, crypto, session cookies, rate limiting, and note CRUD actions with Vitest | #1, #2, #5, #6 | unit + integration | complete | context/changes/note-crud-and-version-persistence/ |
| 2 | Playwright E2E Test Suite & Critical Browser Flows | Introduce Playwright for end-to-end browser testing covering dashboard creation, login, note editing, and history | #4 | e2e | complete | context/changes/testing-playwright-e2e-critical-flows/ |
| 3 | Multi-user Concurrency & Conflict Diff Resolution Tests | Verify three-way diff calculations and concurrent edit conflict resolution under simulated multi-user mutations | #3, #7 | integration + e2e | implementing | context/changes/testing-note-versioning-and-concurrency-integrity/ |
| 4 | Observability, APM & Pre-prod Gate Hardening | Wire centralized error reporting, synthetic health checks, and pre-deployment bundle & isolate validation | cross-cutting | gates | not started | — |

## 4. Stack

The classic test base for this project. Recommendations in this section are grounded in local manifests/configs plus the MCP/tools actually exposed in the current session.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | ^4.1.11 | Configured with `happy-dom` environment and 80% coverage threshold |
| DOM testing | @testing-library/react | ^16.3.2 | Component testing with `@testing-library/user-event` |
| assertions & coverage | @vitest/coverage-v8 | ^4.1.11 | Strict 80% line/func/branch/stmt thresholds enforced |
| schema validation | Zod | ^4.4.3 | Server Action and API payload validation |
| edge runtime | @opennextjs/cloudflare | ^1.20.6 | Cloudflare Workers V8 isolates (`workerd`) |
| database & auth | @supabase/supabase-js | ^2.112.3 | PostgreSQL client with custom PBKDF2 Web Crypto & JWT sessions |
| e2e browser testing | Playwright (@playwright/test) | ^1.63.0 | Headless Chromium/Firefox browser automation running locally on developer machines (local-only, no CI/CD) |

**Stack grounding tools (current session):**
- Docs: Context7 CLI (`npx ctx7`) — available for current framework/library API verification; checked: 2026-09-12
- Search: Exa.ai (`web_search_exa`, `web_fetch_exa`) — available in session for documentation lookup; checked: 2026-09-12
- Runtime/browser: Playwright / browser tools — available for browser automation verification; checked: 2026-09-12
- Provider/platform: Supabase CLI & OpenNext Cloudflare deployment scripts — local and deployment tools; checked: 2026-09-12

## 5. Quality Gates

The full set of gates that must pass before a change reaches production. "Required for §3 Phase <N>" means the gate is enforced once that rollout phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint (ESLint 9) | local + CI | required | syntactic drift, unused vars, rule violations |
| typecheck (tsc --noEmit) | local + CI | required | TypeScript type drift and contract mismatches |
| unit + integration (Vitest) | local + CI | required (enforced) | logic regressions, crypto failures, session errors |
| 80% coverage threshold (v8) | local + CI | required (enforced) | untested logic branches, functions, and statements |
| build verification (OpenNext) | local + CI | required (enforced) | Cloudflare Worker isolate bundle compatibility |
| e2e on critical flows (Playwright) | local only (developer side) | required manually / on demand before PR | broken browser navigation, cookie failures, clipboard regressions (local only; no CI/CD integration due to execution costs and absence of nonprod Supabase setup on free plan) |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the relevant rollout phase ships; before that, the sub-section reads "TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Location**: `src/__tests__/lib/` or `src/__tests__/schemas/` mirroring source modules.
- **Naming**: `<module>.test.ts`.
- **Reference test**: `src/__tests__/lib/session.test.ts` (Edge Web Crypto HMAC and cookie session validation).
- **Run locally**: `npx vitest run src/__tests__/lib/session.test.ts`.

### 6.2 Adding a Server Action integration test

- **Location**: `src/__tests__/actions/`.
- **Naming**: `<action-group>.test.ts`.
- **Mocking policy**: Mock database adapter (`src/client/db-client.ts`) or Supabase client at the boundary using `vi.mock`. Mock auth guard (`src/lib/auth-guard.ts`) to simulate authenticated participant vs unauthorized caller.
- **Reference test**: `src/__tests__/actions/notes.test.ts`.
- **Run locally**: `npx vitest run src/__tests__/actions/notes.test.ts`.

### 6.3 Adding a React component or page DOM test

- **Location**: `src/__tests__/app/` or `src/__tests__/components/`.
- **Naming**: `<ComponentName>.test.tsx` or `page.test.tsx`.
- **Pattern**: Wrap render with MUI theme provider or mock sub-components; assert accessible roles (`getByRole`), labels, and user interaction events (`userEvent.click`).
- **Reference test**: `src/__tests__/app/dashboard/page.test.tsx`.
- **Run locally**: `npx vitest run src/__tests__/app/dashboard/page.test.tsx`.

### 6.4 Adding an E2E browser test in Playwright

- **Location**: `e2e/`.
- **Naming**: `<feature>.spec.ts` (e2e test files must match `**/*.spec.ts` to be discovered by `@playwright.config.ts` and excluded from Vitest/builds).
- **Setup dependencies**: Run `npm run test:e2e:init` (`playwright install --with-deps`) to install required browser binaries (Chromium, Firefox) and Linux system libraries.
- **Fixture imports**: Always import `test` and `expect` from `e2e/fixtures/test-base`:
  ```ts
  import { test, expect } from "./fixtures/test-base";
  ```
  The fixture provides:
  - `createTestDashboard({ title, description, alias, password })`: Creates an isolated workspace via `/new` and returns credentials.
  - `loginToDashboard(hash, alias, password)`: Authenticates via `#login-user-alias` and awaits session transition to dashboard.
  - `clipboard`: Cross-browser clipboard read/write simulation.
  - `_rateLimitReset`: Automatically clears Supabase `public.rate_limits` table before each test to prevent 429 throttling.
- **Execution Model (Local-Only)**:
  - **No CI/CD Integration**: E2E browser tests are run strictly on the developer side. They are deliberately NOT integrated into GitHub Actions CI pipelines because full browser automation against database services is a costly operation and the project operates on a free-tier Supabase plan without dedicated non-production cloud staging instances.
  - **Prerequisites**: A running local Supabase instance (`npx supabase start` or host Docker container) with environment variables loaded (`.env.local` or `.env.ai`).
  - **Dev Server**: The Next.js dev server runs with webpack (`npx next dev --webpack`) managed automatically by `webServer` in `playwright.config.ts`.
- **Run commands**:
  - Full suite headless: `npm run test:e2e`
  - Interactive UI mode: `npm run test:e2e:ui`
  - Single spec: `npx playwright test e2e/golden-path.spec.ts`
  - Browser project filter: `npx playwright test --project=chromium` or `npx playwright test --project=firefox`
- **Build isolation reminder**: Tests under `e2e/` must never be imported into production modules. Build isolation is enforced across `tsconfig.build.json` and `outputFileTracingExcludes` in `next.config.ts`.

### 6.5 Adding a multi-user concurrency & conflict diff test

- TBD — see §3 Phase 3 for side-by-side diff resolution and concurrent mutation conflict patterns.

### 6.6 Per-rollout-phase notes

- Phase 1 shipped 42 test files and 549 tests covering tenant isolation, authentication sessions, cryptographic utilities, rate limiting, and note CRUD operations with >80% coverage enforced by `@vitest.config.ts`. Tests run under `happy-dom` with Cloudflare Worker bindings mocked in `src/__tests__/setup.ts`. Production builds use `@tsconfig.build.json` to guarantee test files are never bundled into Cloudflare Workers edge assets.
- Phase 2 shipped the Playwright E2E testing framework (`@playwright/test` ^1.63.0) with custom fixtures in `e2e/fixtures/test-base.ts`, smoke tests in `e2e/smoke.spec.ts`, seed exemplar in `e2e/seed.spec.ts`, complete golden path user journey in `e2e/golden-path.spec.ts`, and note lifecycle & password re-auth verification in `e2e/note-lifecycle.spec.ts`. All specs pass across Chromium and Firefox. Execution is designated local-only for developers.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future contributors should respect these unless the underlying assumption changes.

- **Automated E2E execution in CI/CD pipelines** — Browser-level Playwright test runs are strictly local developer checks. They are not integrated into GitHub Actions CI workflows because running headless browsers with database containers is compute/cost-heavy, and the project operates on a free-tier Supabase plan without dedicated non-production cloud environments.
- **MUI visual snapshot & styling details** — Testing exact CSS colors, font families, margins, or DOM class hierarchies produces brittle tests with low regression signal. Rely on manual review and standard MUI theme tokens. (Source: Phase 2 interview Q5.)
- **Third-party library internals** — Do not test Supabase client internals or Web Crypto engine standards directly; test our application contracts and boundaries. (Source: Phase 2 interview Q5.)
- **Ephemeral in-memory states** — Serverless edge functions do not share memory across requests; state must be asserted against database rows or signed session cookies.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-12
- Stack versions last verified: 2026-09-12
- AI-native tool references last verified: 2026-09-12

Refresh (`/10x-test-plan --refresh`) when:
- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.

