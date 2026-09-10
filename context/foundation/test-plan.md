# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run test plan refresh when stale (see §8).
>
> Last updated: 2026-08-26

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
| 1 | Cross-dashboard note or credential data leakage (broken tenant isolation) | High | High | interview Q1, interview Q2, PRD §Guardrails (FR-004, Access Control), hot-spot dir `src/lib/` (7 commits/30d) |
| 2 | Authentication & session guard bypass or invalid cookie handling | High | High | interview Q4, roadmap §S-02 (FR-004, FR-005), archive/dashboard-data-schema-and-auth-scaffold/plan.md, hot-spot dir `src/actions/` (7 commits/30d) |
| 3 | Concurrent note mutation overwrite and silent version history loss | High | Medium | PRD §Guardrails & Business Logic (FR-011, FR-012), roadmap §S-03, §S-05, interview Q3 |
| 4 | Supabase RPC & database query failure or unhandled exception in Server Action | Medium | High | interview Q3, hot-spot dir `src/actions/` (7 commits/30d), hot-spot dir `supabase/migrations/` (3 commits/30d) |
| 5 | Untrusted input & server-side validation parity failure (abuse scenario) | Medium | Medium | PRD §FR-001, FR-006, archive/dashboard-creation-wizard/plan.md, hot-spot dir `src/actions/` (7 commits/30d) |
| 6 | Credential generation & serialization drift breaking out-of-band sharing | High | Low | PRD §US-01, FR-002, FR-003, archive/dashboard-creation-wizard/plan.md, hot-spot dir `src/app/new/` (38 commits/30d) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context research must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | Requesting a note ID or user alias belonging to Dashboard A with a valid session for Dashboard B returns 404/403 and never returns data or modifies rows. | Verifying that a session exists implies the user owns the accessed dashboard. | Database RPC query filters, session payload claim extraction, Server Action authorization checks. | Integration (mocked DB / test DB queries asserting tenant scoping) | Happy-path single-tenant assertion; mocking out the `dashboard_id` check. |
| #2 | Unauthenticated request to protected dashboard route/action returns redirect or 401; expired, malformed, or tampered JWT cookie is rejected; valid credentials issue signed cookie. | If JWT signature verification passes in unit test, Edge cookie middleware and Server Action session extraction work in production. | Cookie parsing in Next.js Server Actions / middleware, Edge runtime Web Crypto HMAC verification, session expiry boundaries. | Integration (Server Action / route handler test with synthetic cookie headers) | Testing JWT utils in isolation without testing the action/middleware consumption path. |
| #3 | Attempting to update a note with an outdated `expected_version` fails with a conflict error without mutating `notes` or overwriting `note_versions`; valid update creates exact sequential version snapshot. | A successful note update status (200) means the version history table was updated atomically. | Version incrementing logic, atomic PostgreSQL transaction/RPC behavior, note version ordering (`DESC`). | Integration (Database client / RPC test asserting version row count and version number sequencing) | Mocking the database to always return success without asserting rollback on version mismatch. |
| #4 | When Supabase returns an error or constraint violation, Server Action catches it, rolls back any partial state, and returns a structured `{ success: false, error }` contract rather than throwing an uncaught 500 error. | Database errors are automatically caught and transformed into user-friendly messages. | Error mapping in `src/lib/supabase.ts`, Server Action try/catch contracts, Zod parsing error formats. | Unit + Integration (Action tests with rejected DB promises / synthetic Postgres error codes) | Assertion copied from implementation (testing that action returns the exact internal error string rather than contract). |
| #5 | Submitting payload with HTML/script injection, excessive length, or invalid alias characters directly to Server Actions is rejected by Zod schema and sanitized before persistence. | Client-side validation in MUI form components prevents invalid payloads from reaching the backend. | Server Action Zod schemas, DB column constraints, sanitization/escaping on plain text output. | Unit (Zod schema and action unit tests with malicious payloads) | Relying solely on client UI tests to verify server validation. |
| #6 | Dashboard creation action produces an accessible slug and exact unhashed participant credentials matching the hashed database records. | Generating a random string guarantees it meets password complexity rules and is URL-safe. | `generateDashboardSlug`, `generateRandomPassword`, PBKDF2 hash verification round-trip, credential text formatter. | Unit + Integration (deterministic crypto round-trip test and credential formatter contract test) | UI snapshot of success screen instead of verifying raw credential string contents. |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder.
Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Tenant Isolation & Auth Session Guards | Verify cross-dashboard data isolation and authenticated session guard boundaries | #1, #2 | unit + integration | change opened | context/changes/testing-tenant-isolation-and-auth-session-guards/ |
| 2 | Note Versioning & Concurrency Integrity | Ensure atomic note updates, immutable version history snapshots, and conflict detection | #3, #4 | integration | not started | — |
| 3 | Server Input Validation & Security Defense | Enforce server-side Zod validation parity, injection defense, and credential formatting contracts | #5, #6 | unit + integration | not started | — |
| 4 | CI Quality Gates & Coverage Hardening | Lock the 80% coverage floor and automated quality checks in CI pipeline | cross-cutting | gates | not started | — |

## 4. Stack

The classic test base for this project. Recommendations in this section are grounded in local manifests/configs plus the MCP/tools actually exposed in the current session.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | ^4.1.10 | Configured with `happy-dom` environment and 80% coverage threshold |
| DOM testing | @testing-library/react | ^16.3.2 | Component testing with `@testing-library/user-event` |
| assertions & coverage | @vitest/coverage-v8 | ^4.1.10 | Strict 80% line/func/branch/stmt thresholds enforced |
| schema validation | Zod | ^4.4.3 | Server Action and API payload validation |
| edge runtime | @opennextjs/cloudflare | ^1.20.2 | Cloudflare Workers V8 isolates (`workerd`) |
| database & auth | @supabase/supabase-js | ^2.112.3 | PostgreSQL client with custom PBKDF2 Web Crypto & JWT sessions |

**Stack grounding tools (current session):**
- Docs: Context7 CLI (`npx ctx7`) — available for current framework/library API verification; checked: 2026-08-26
- Search: Exa.ai (`web_search_exa`, `web_fetch_exa`) — available in session for documentation lookup; checked: 2026-08-26
- Runtime/browser: Playwright / browser automation — not available in current session; checked: 2026-08-26
- Provider/platform: Supabase CLI & OpenNext Cloudflare deployment scripts — local and CI deployment tools; checked: 2026-08-26

## 5. Quality Gates

The full set of gates that must pass before a change reaches production. "Required for §3 Phase <N>" means the gate is enforced once that rollout phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint (ESLint 9) | local + CI | required | syntactic drift, unused vars, rule violations |
| typecheck (tsc --noEmit) | local + CI | required | TypeScript type drift and contract mismatches |
| unit + integration (Vitest) | local + CI | required after §3 Phase 1 | logic regressions, crypto failures, session errors |
| 80% coverage threshold (v8) | local + CI | required after §3 Phase 4 | untested logic branches, functions, and statements |
| build verification (OpenNext) | local + CI | required after §3 Phase 4 | Cloudflare Worker isolate bundle compatibility |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the relevant rollout phase ships; before that, the sub-section reads "TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- TBD — see §3 Phase 1 for unit test patterns (Server Actions, crypto, session).

### 6.2 Adding an integration test

- TBD — see §3 Phase 1 for cross-dashboard isolation and session guard integration patterns.

### 6.3 Adding a database RPC & concurrency test

- TBD — see §3 Phase 2 for note versioning and concurrency conflict patterns.

### 6.4 Adding a server-side validation & security test

- TBD — see §3 Phase 3 for input validation and injection defense patterns.

### 6.5 Per-rollout-phase notes

- (Rollout phases will record implementation learnings here as they complete.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future contributors should respect these unless the underlying assumption changes.

- **MUI visual snapshot & styling details** — Testing exact CSS colors, font families, margins, or DOM class hierarchies produces brittle tests with low regression signal. Rely on manual review and standard MUI theme tokens. (Source: Phase 2 interview Q5.)
- **Third-party library internals** — Do not test Supabase client internals or Web Crypto engine standards directly; test our application contracts and boundaries. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-26
- Stack versions last verified: 2026-08-26
- AI-native tool references last verified: 2026-08-26

Refresh when:
- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
