# Playwright E2E Test Suite and Critical Browser Flows — Plan Brief

> Full plan: `context/changes/testing-playwright-e2e-critical-flows/plan.md`  
> Research: `context/changes/testing-playwright-e2e-critical-flows/research.md`  

## What & Why

We are introducing Playwright end-to-end browser automation to Scytala as defined in Phase 2 of `context/foundation/test-plan.md` (defending Risk #4). Until now, critical user journeys across the wizard, authentication cookies, Server Action revalidations, and logout redirects were only tested via in-memory DOM mocks (`happy-dom`). Real browser automation provides definitive proof that cookies persist across page transitions and that confidential notes cannot leak after logout.

## Starting Point

Scytala has 42 Vitest test files (549 tests) running under `happy-dom` with strict 80% coverage enforcement and a 5-layer build isolation system ensuring test files are excluded from production Cloudflare Worker bundles. Playwright is not yet installed or configured.

## Desired End State

A robust, isolated Playwright E2E test suite running against the local Next.js dev server with real local Supabase persistence. The complete Golden Path journey (Wizard $\rightarrow$ Credential Copy $\rightarrow$ Login $\rightarrow$ Note Authoring $\rightarrow$ Version History Diff $\rightarrow$ Restore $\rightarrow$ Logout) passes in headless Chromium and Firefox, isolated from production Cloudflare builds, with tests automated in GitHub Actions CI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Server Target | Next.js dev server (`next dev` on port 3000) | Provides rapid test execution and seamless Server Action execution with zero bundle overhead. | Research / Plan |
| Database Strategy | Local Supabase CLI with dynamic test tenants | Spawning a unique workspace per test provides true integration testing and tenant isolation without requiring brittle database wipes. | Research / Plan |
| Test Helper Pattern | Playwright Fixtures (`test.extend`) | Idiomatic Playwright approach that cleanly encapsulates clipboard access, tenant creation, and login helpers without boilerplate. | Plan |
| Browser Matrix | Chromium local, Chromium + Firefox in CI | Delivers sub-3-second local test turnaround while guaranteeing cross-engine Gecko compatibility in CI. | Plan |
| CI Execution | Dedicated parallel `e2e` job | Keeps the fast Vitest coverage job independent and prevents E2E timing flakiness from masking unit regressions. | Plan |
| Build Isolation | 5-Layer hardening (`tsconfig.build.json`, `next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `.gitignore`) | Strictly prevents Playwright specs, reports, and traces from entering Cloudflare Worker edge bundles or affecting Vitest coverage gates. | Research / Plan |

## Scope

**In scope:**
- Install `@playwright/test` and configure `playwright.config.ts`.
- 5-layer build isolation defense across TypeScript, Next.js NFT, Vitest, ESLint, and Git.
- Custom test fixtures for clipboard access, dynamic tenant creation, and login in `e2e/fixtures/test-base.ts`.
- Golden Path test spec (`e2e/golden-path.spec.ts`) and Note Lifecycle test spec (`e2e/note-lifecycle.spec.ts`).
- Dedicated `e2e` job in `.github/workflows/test.yml` with browser caching and Supabase integration.
- Updating `context/foundation/test-plan.md` with Playwright cookbook patterns.

**Out of scope:**
- MUI visual pixel regression testing (prohibited by test plan principles).
- Server Action request mocking or client-side HTTP interception.
- Multi-user concurrent edit conflict resolution (reserved for Rollout Phase 3).
- Any modifications to production runtime code in `src/`.

## Architecture / Approach

Playwright supervises the local Next.js process via `webServer`. Tests run against real Server Actions and real Supabase PostgreSQL tables. Each test journey generates an isolated dashboard via `/new`, receives cleartext credentials, signs in via `/dashboard/[hash]`, authors notes, inspects immutable versions in the drawer, and logs out via HTTP 303 redirect.

```
[Playwright Test Runner]
    │
    ├── (Chromium / Firefox)
    │        │ (HTTP / RSC)
    ▼        ▼
[Next.js App Router (localhost:3000)]
    │
    ├── (Server Actions / Web Crypto)
    ▼
[Local Supabase PostgreSQL (127.0.0.1:54321)]
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Dependencies & Build Isolation Hardening | `@playwright/test` installed and excluded from production Cloudflare builds and Vitest | Test files or config leaking into `npm run build:worker` or breaking the 80% coverage threshold. |
| 2. Playwright Config & Custom Fixtures | `playwright.config.ts`, smoke test, and reusable `test-base.ts` fixtures | Web server port binding timing or clipboard permission issues in headless browsers. |
| 3. Critical Golden Path & Note Lifecycle E2E Suite | `golden-path.spec.ts` and `note-lifecycle.spec.ts` passing in Chromium and Firefox | Flaky assertions during asynchronous `router.refresh()` Server Component transitions. |
| 4. CI/CD Pipeline & Documentation Hardening | GitHub Actions `e2e` workflow job with caching and updated test plan cookbook | Missing Linux container libraries or slow browser downloads in CI runners. |

**Prerequisites:** Local Supabase running (`supabase start` or local docker), Node 20.  
**Estimated effort:** ~1-2 focused implementation sessions across 4 phases.

## Open Risks & Assumptions

- **Local Port Availability**: Assumes port 3000 and local Supabase port 54321 are available during test runs.
- **Clipboard API in Headless**: Assumes Chromium/Firefox headless modes properly honor `['clipboard-read', 'clipboard-write']` permissions via Playwright context.

## Success Criteria (Summary)

- `npm run test:e2e` runs the Golden Path suite end-to-end and passes in headless Chromium and Firefox.
- `npm run check:ready` (`npm run lint && npm run check:type && npm run test && npm run build:worker`) passes with zero warnings or regressions.
- No Playwright files or artifacts are traced into `.open-next/` production Cloudflare bundles.
- GitHub Actions CI workflow runs both Vitest (with 80% coverage) and Playwright E2E tests in parallel.
