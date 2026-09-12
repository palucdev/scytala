---
date: 2026-09-11T21:28:00Z
researcher: Antigravity
git_commit: 5eb83348fca25ef0485235ac4fdf6a566cd4e28c
branch: feature/e2e
repository: scytala
topic: "Playwright E2E test suite and critical browser flows setup and integration"
tags: [testing, playwright, e2e, critical-flows, nextjs, cloudflare, supabase, app-router]
status: complete
last_updated: 2026-09-11
last_updated_by: Antigravity
---

# Research: Playwright E2E Test Suite & Critical Browser Flows Setup and Integration

**Date**: 2026-09-11T21:28:00Z  
**Researcher**: Antigravity  
**Git Commit**: 5eb83348fca25ef0485235ac4fdf6a566cd4e28c  
**Branch**: feature/e2e  
**Repository**: scytala  

---

## Research Question

How should Playwright E2E testing be set up and integrated into Scytala's current architecture (Next.js 16 App Router on Cloudflare Workers OpenNext, Supabase PostgreSQL with custom Web Crypto PBKDF2/JWT sessions, Vitest with strict 80% coverage gates, and Material-UI) to reliably verify critical browser workflows without violating build isolation or introducing test runner cross-contamination?

---

## Summary

This research establishes the complete architectural blueprint for introducing Playwright E2E browser automation to Scytala as defined in Phase 2 of [context/foundation/test-plan.md](file:///home/projekty/10xdevs/scytala/context/foundation/test-plan.md) (defending Risk #4: "End-to-end browser workflow breakage across client UI, cookie persistence, and Server Action navigation").

Key architectural findings:
1. **Runner & Target Strategy**: Playwright will execute against the local Next.js server (`next dev` on port 3000 via Playwright `webServer`) with dynamic test tenants. Because Server Actions execute on the server and interact directly with PostgreSQL stored procedures, mocking Server Actions in the browser is an anti-pattern. Real transactions against a local Supabase CLI instance (`127.0.0.1:54321`) combined with dynamic tenant creation in each test run provide true end-to-end signal with complete tenant isolation.
2. **5-Layer Build Isolation Defense**: Production Cloudflare Worker builds require test code and configuration to be strictly excluded. Adding Playwright requires updating `tsconfig.build.json` (exclude `playwright.config.ts`, `e2e/**`), `next.config.ts` (`outputFileTracingExcludes`), `eslint.config.mjs`, and `.gitignore`.
3. **Vitest vs. Playwright Separation**: Vitest is constrained to `src/**/*.test.{ts,tsx}` running under `happy-dom` with strict 80% coverage gates. Playwright specs will reside in `e2e/**/*.spec.ts` so Vitest never discovers them or skews coverage metrics.
4. **Browser Permissions & Clipboard Automation**: The Scytala creation wizard copies participant credentials and shareable links via the browser Clipboard API (`navigator.clipboard`). Playwright tests must grant `['clipboard-read', 'clipboard-write']` permissions via `browserContext.grantPermissions()` to assert credential generation and clipboard copy behavior without browser security dialogs.
5. **Session Cookie Dynamics & Edge Runtime Invariants**: Playwright tests must respect the `scytala_session_${safeHash}` (development) and `__Host-scytala_session_${safeHash}` (production) cookie conventions, the `startTransition` + `router.refresh()` Server Component revalidation cycle during login, and the HTTP 303 hard redirect during logout that purges client-side router cache.

---

## Scope & Architectural Alignment

In alignment with the test rollout strategy, three foundational decisions were confirmed:
1. **Server Execution Target**: Next.js development server (`next dev` on port 3000) for local test execution via `webServer.command`, with optional preview build verification for CI.
2. **Database Lifecycle Strategy**: Real local Supabase CLI instance (`supabase start` / `npm run db:reset`) with dynamic test tenants generated through the UI wizard in tests, ensuring zero state pollution across runs without requiring artificial database mocks.
3. **Flow Scope**: Focus on the complete **Golden Path** user journey:
   `Dashboard Wizard Creation (/new)` $\rightarrow$ `Save & Copy Generated Credentials` $\rightarrow$ `Login (/dashboard/[hash])` $\rightarrow$ `Note Creation & Content Editing (/note/[noteId])` $\rightarrow$ `Version History Drawer & Diff Inspection` $\rightarrow$ `Logout & Session Eviction (/api/auth/logout)`.

---

## Detailed Findings

### 1. Playwright Setup & Next.js 16 App Router Integration

#### 1.1 Web Server & Base URL Orchestration
Playwright's `defineConfig` provides native process supervision via the `webServer` property:
```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Maintain serial tenant operations or isolate via unique hashes
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },
});
```
- **Context7 & Official Documentation Reference**: [Playwright TestConfig Docs](https://github.com/microsoft/playwright/blob/main/docs/src/test-api/class-testconfig.md).
- Specifying `url: 'http://127.0.0.1:3000'` causes Playwright to poll until Next.js returns an HTTP 2xx/3xx/4xx status before initiating the test suite.
- Setting `reuseExistingServer: !process.env.CI` enables developers running `npm run dev` in a terminal to execute `npx playwright test` immediately without re-spawning a new server instance.

#### 1.2 Clipboard Permissions Handling
In `StepSuccess` ([src/app/new/components/StepSuccess.tsx:82-124](file:///home/projekty/10xdevs/scytala/src/app/new/components/StepSuccess.tsx#L82-L124)), Scytala provides:
- Copy shareable dashboard URL ([ShareableLinkCard.tsx:62-71](file:///home/projekty/10xdevs/scytala/src/app/new/components/success/ShareableLinkCard.tsx#L62-L71)).
- "Copy All Credentials" ([CredentialsListCard.tsx:62-73](file:///home/projekty/10xdevs/scytala/src/app/new/components/success/CredentialsListCard.tsx#L62-L73)).
- Individual credential copy button ([CredentialRow.tsx:78-94](file:///home/projekty/10xdevs/scytala/src/app/new/components/success/CredentialRow.tsx#L78-L94)).

These UI elements invoke `navigator.clipboard.writeText(...)`. In standard browser security sandboxes, `navigator.clipboard.readText()` and `writeText()` are blocked without explicit user permission. Playwright allows permission overrides at the context level:
```ts
await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
// Verify clipboard content
const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
expect(clipboardText).toContain("Alias: Alice");
```

#### 1.3 Server Actions and Network Boundaries
In Next.js App Router, Server Actions (`"use server"`) communicate via HTTP POST requests returning RSC flight data streams.
- **Industry Research Insight**: Attempting to mock Server Actions via client-side request interception (e.g. `page.route()`) is brittle and prone to RSC stream corruption (`Error: connection closed`).
- **Scytala Implementation**: Since Scytala uses Server Actions to talk directly to Supabase PostgreSQL RPCs (`create_dashboard_with_users`, `create_note_with_version`, `update_note_with_version`), tests must exercise the real server pipeline. Real execution against local Supabase CLI verifies database constraints, PBKDF2 Web Crypto hashing, and token issuance end-to-end.

---

### 2. Golden Path UI Flow & Action Contracts

The critical user flow consists of 5 interconnected stages:

```mermaid
flowchart LR
    A["1. Wizard (/new)"] -->|Submit & View Credentials| B["2. Success Step"]
    B -->|Click 'Enter Dashboard'| C["3. Login (/dashboard/[hash])"]
    C -->|Sign In (Set Session Cookie)| D["4. Dashboard Grid"]
    D -->|Create Note| E["5. Note Editor (/note/[noteId])"]
    E -->|Save / Edit / History| F["6. Version Drawer & Diff"]
    F -->|Return to Dashboard| D
    D -->|Click Logout| G["7. Evict Session (POST /api/auth/logout)"]
    G -->|Redirect 303| C
```

#### Stage 1: Wizard Dashboard Creation (`/new`)
- **Container**: `DashboardCreationWizard` ([src/app/new/page.tsx:17-115](file:///home/projekty/10xdevs/scytala/src/app/new/page.tsx#L17-L115)) driven by `useWizardState` ([src/app/new/hooks/useWizardState.ts:26-283](file:///home/projekty/10xdevs/scytala/src/app/new/hooks/useWizardState.ts#L26-L283)).
- **Step 1 - Details** ([src/app/new/components/StepDetails.tsx:27-73](file:///home/projekty/10xdevs/scytala/src/app/new/components/StepDetails.tsx#L27-L73)):
  - Input `id="dashboard-title-input"` (`aria-label="Dashboard Title"`).
  - Input `id="dashboard-description-input"` (`aria-label="Dashboard Description"`).
  - Navigation: Button `id="wizard-next-btn"` ([WizardNavigation.tsx:49-57](file:///home/projekty/10xdevs/scytala/src/app/new/components/WizardNavigation.tsx#L49-L57)).
- **Step 2 - Participants** ([src/app/new/components/StepParticipants.tsx:46-94](file:///home/projekty/10xdevs/scytala/src/app/new/components/StepParticipants.tsx#L46-L94)):
  - Default initial participant rendered via `<ParticipantCard>` ([ParticipantCard.tsx:30-161](file:///home/projekty/10xdevs/scytala/src/app/new/components/participants/ParticipantCard.tsx#L30-L161)).
  - Alias input: `aria-label="Participant 1 Alias"` (default value provided or editable).
  - Password input: `aria-label="Participant 1 Password"` (pre-generated high-entropy passphrase).
  - Add participant button: `id="add-participant-btn"` (text `"Add Another Participant"`).
  - Navigation: Button `id="wizard-next-btn"`.
- **Step 3 - Review** ([src/app/new/components/StepReview.tsx:27-58](file:///home/projekty/10xdevs/scytala/src/app/new/components/StepReview.tsx#L27-L58)):
  - Card summary displaying title, description, and participants ([ReviewSummaryCard.tsx:55-243](file:///home/projekty/10xdevs/scytala/src/app/new/components/review/ReviewSummaryCard.tsx#L55-L243)).
  - Submission trigger: Button `id="wizard-create-btn"` ([WizardNavigation.tsx:59-73](file:///home/projekty/10xdevs/scytala/src/app/new/components/WizardNavigation.tsx#L59-L73)).
  - Action invoked: `createDashboardAction(input)` ([src/actions/dashboard.ts:30-104](file:///home/projekty/10xdevs/scytala/src/actions/dashboard.ts#L30-L104)).
- **Step 4 - Success & Credential Capture** ([src/app/new/components/StepSuccess.tsx:69-124](file:///home/projekty/10xdevs/scytala/src/app/new/components/StepSuccess.tsx#L69-L124)):
  - Alert `id="wizard-success-alert"`.
  - Shareable URL input: `id="shareable-url-input"`.
  - Copy all credentials button: `id="copy-all-credentials-btn"`.
  - Enter Dashboard button: `id="enter-dashboard-btn"` navigates user via `router.push('/dashboard/' + dashboard.hash)`.

#### Stage 2: Dashboard Authentication (`/dashboard/[hash]`)
- **Server Guard** ([src/app/dashboard/[hash]/page.tsx:56-83](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/page.tsx#L56-L83)):
  - Runs `verifyDashboardSession(normalizedHash)`.
  - If no session cookie matches `dashboard.id`, renders `<LoginForm dashboardHash={normalizedHash} />`.
- **Login Form Elements** ([src/app/dashboard/[hash]/components/LoginForm.tsx:116-225](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/LoginForm.tsx#L116-L225)):
  - Alias input: `id="login-user-alias"`, `name="userAlias"`, `aria-label="User Alias"`.
  - Password input: `id="login-password"`, `name="password"`, `aria-label="Password"`.
  - Submit button: `type="submit"`, text `"Sign In"`.
- **Action & Revalidation** ([src/actions/auth.ts:32-133](file:///home/projekty/10xdevs/scytala/src/actions/auth.ts#L32-L133)):
  - Calls `loginToDashboardAction`.
  - Verifies PBKDF2 hash against `dashboard_users`.
  - Issues signed HMAC-SHA256 JWT cookie (`scytala_session_${safeHash}` in dev / `__Host-scytala_session_${safeHash}` in prod).
  - In `LoginForm.tsx:57-61`, `startTransition` runs `router.refresh()`, triggering Next.js to re-render `page.tsx` on the server and transition from `LoginForm` to `DashboardView` without full page reload.

#### Stage 3: Dashboard Tile Grid View (`/dashboard/[hash]`)
- **Session Header** ([src/components/ScytalaUserHeader.tsx:21-89](file:///home/projekty/10xdevs/scytala/src/components/ScytalaUserHeader.tsx#L21-L89)):
  - Displays authenticated user alias chip: `Chip` with label `{userAlias}`.
  - Displays Logout button component `<LogoutButton dashboardHash={dashboardHash} />`.
- **Actions Toolbar** ([src/app/dashboard/[hash]/components/DashboardActionToolbar.tsx:76-97](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/DashboardActionToolbar.tsx#L76-L97)):
  - Create note button: `id="header-create-note-btn"`, `component={Link}`, `href="/dashboard/${dashboardHash}/note/new"`.
- **Notes Presentation**:
  - Empty state: `<EmptyNotesState>` ([EmptyNotesState.tsx:17-93](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/EmptyNotesState.tsx#L17-L93)) with button `id="empty-state-new-note-btn"`.
  - Populated state: `<NoteGrid>` ([NoteGrid.tsx:13-33](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/NoteGrid.tsx#L13-L33)) rendering `<NoteTile>` items ([NoteTile.tsx:18-138](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/NoteTile.tsx#L18-L138)).
  - Each note card is an accessible link: `aria-label="Open note: <Title>"`, pointing to `/dashboard/${dashboardHash}/note/${note.id}`.

#### Stage 4: Note Editor, Auto-Dirty Tracking & Version History Drawer (`/dashboard/[hash]/note/[noteId]`)
- **Editor Elements** ([src/app/dashboard/[hash]/note/[noteId]/components/](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/)):
  - Title input: `id="note-title-input"`, `aria-label="Note title"` ([NoteTitleInput.tsx:17-57](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteTitleInput.tsx#L17-L57)).
  - Content textarea: `id="note-content-input"`, `aria-label="Note content"` ([NoteContentArea.tsx:74-147](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteContentArea.tsx#L74-L147)).
  - Save button: `aria-label="Save note"`, text `"Save"` in `<EditorToolbar>` ([EditorToolbar.tsx:140-154](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/EditorToolbar.tsx#L140-L154)).
  - Back button: `aria-label="Back to dashboard"` with unsaved changes confirmation dialog ([EditorToolbar.tsx:53-64](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/EditorToolbar.tsx#L53-L64)).
- **Version History Drawer** ([NoteVersionHistoryDrawer.tsx:45-451](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteVersionHistoryDrawer.tsx#L45-L451)):
  - Opened via button `id="note-history-btn"`, text `"Note history"` ([NoteEditorHeader.tsx:32-74](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteEditorHeader.tsx#L32-L74)).
  - Lists current version and immutable historical snapshots with author alias, timestamp, and delta chips.
  - Clicking a past version opens `<NoteVersionPreview>` dialog ([NoteVersionPreview.tsx:45-401](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteVersionPreview.tsx#L45-L401)) displaying inline word diffs (`<ins>` / `<del>`) and character delta badges ([DiffSummaryBadge.tsx:10-35](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/DiffSummaryBadge.tsx#L10-L35)).
  - Restore action: `Button` with `aria-label="Restore this version"` triggers non-destructive append-only version increment ($v_{N+1}$).

#### Stage 5: Logout & Session Purge (`/api/auth/logout`)
- **Trigger**: `<LogoutButton>` ([src/app/dashboard/[hash]/components/LogoutButton.tsx:28-66](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/LogoutButton.tsx#L28-L66)):
  - Native HTML form submitting POST to `/api/auth/logout` with hidden input `name="dashboardHash"`.
  - Button `id="dashboard-logout-btn"`, `aria-label="Log out"`.
- **Endpoint**: `src/app/api/auth/logout/route.ts:14-85`:
  - Sets expired cookie options (`maxAge: 0`, `expires: new Date(0)`).
  - Evicts scoped cookie `scytala_session_${safeHash}` and fallback cookies.
  - Issues HTTP 303 See Other redirect to `/dashboard/${dashboardHash}`.
  - Browser follows redirect; `DashboardPage` verifies session has been purged and renders `<LoginForm>`, completing the cycle.

---

### 3. Build Isolation & Test Engine Segregation

Scytala enforces strict isolation between production Cloudflare Worker builds and test tooling per project rules. Adding Playwright introduces new directories and configuration files that must be protected across 5 distinct system boundaries:

| File / Config | Required Change | Rationale |
|---|---|---|
| `tsconfig.build.json` | Add `"playwright.config.ts"`, `"e2e/**"` to `exclude` array | Excludes E2E files from `next build` type-checking and compilation. |
| `next.config.ts` | Add `'./playwright.config.ts'`, `'./e2e/**'`, `'./test-results/**'`, `'./playwright-report/**'` to `outputFileTracingExcludes['*']` | Prevents `@vercel/nft` and OpenNext from packaging Playwright code into the Cloudflare Worker bundle. |
| `vitest.config.ts` | Add `exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '**/*.spec.{ts,tsx}']` | Ensures Vitest (`npm test`) running under `happy-dom` never attempts to run Playwright tests or skew the 80% coverage threshold. |
| `eslint.config.mjs` | Add `"playwright-report/**"`, `"test-results/**"` to `globalIgnores` | Prevents lint errors on generated Playwright test traces and HTML reports. |
| `.gitignore` | Add `/test-results/`, `/playwright-report/`, `/blob-report/`, `/.playwright/` | Prevents large test artifacts and browser profiles from being tracked in git. |
| `package.json` | Add `"test:e2e": "playwright test"` and `"test:e2e:ui": "playwright test --ui"` | Standard developer script interface. |

---

### 4. Database State & Local Supabase Integration

#### 4.1 Supabase Configuration (`supabase/config.toml`)
- API URL: `http://127.0.0.1:54321` (`port = 54321`).
- PostgreSQL DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Inbucket Test Mail: `http://127.0.0.1:54324`.
- Studio GUI: `http://127.0.0.1:54323`.

#### 4.2 Dynamic Test Tenant Strategy
Rather than maintaining brittle SQL seed files that collide across test runs:
- Each E2E test run starts at `/new`, entering a unique title (e.g., `E2E Test Workspace ${Date.now()}`).
- The wizard creates an isolated dashboard row in `public.dashboards` and participant credentials in `public.dashboard_users`.
- The test extracts the returned credentials and slug, logs in, creates notes, and executes all actions inside its own tenant boundary.
- Multiple tests can run in parallel without data collision, and database resets (`npm run db:reset`) cleanly reset the database before the suite runs.

#### 4.3 Runtime Environment Validation (`src/lib/env.ts` & `src/instrumentation.ts`)
When Next.js starts up (in `next dev`), `src/instrumentation.ts:16` executes `getEnv()`. The following environment variables must be present:
- `SUPABASE_URL`: `http://127.0.0.1:54321`
- `SUPABASE_ANON_KEY`: `sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH` (from `.env.local`)
- `SUPABASE_SERVICE_ROLE_KEY`: `sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz` (from `.env.local`)
- `SESSION_SECRET`: At least 32 characters (e.g. `test-session-secret-at-least-32-characters-long`)

---

### 5. Local Execution vs. CI/CD Architecture

> **Architecture Decision Note (2026-09-12)**: CI/CD pipeline integration for Playwright E2E suites was formally evaluated and deliberately excluded. E2E browser tests are established strictly on the developer side for local verification.
> **Reasons**: Running full browser automation suites with real Supabase database backends is a costly operation (compute, memory, and time), and the project currently operates on a free-tier Supabase plan without a dedicated non-production cloud staging environment.

For local execution on developer workstations:
1. **Developer Setup (`package.json`)**: Developers run `npm run test:e2e:init` (`playwright install --with-deps`) to install required browser binaries and system OS libraries.
2. **Local Database Spin-Up**: The developer boots the local Supabase container via `npx supabase start` (or host port mapping when inside a container).
3. **Local Test Execution**: The developer executes `npm run test:e2e` (headless) or `npm run test:e2e:ui` (interactive trace/timeline mode).
4. **Dev Server Supervision**: Playwright automatically orchestrates the Next.js dev server (`npx next dev --webpack`) on `localhost:3000` via the `webServer` block in `playwright.config.ts`.
5. **Artifact Retention**: Local HTML reports and traces are generated in `playwright-report/` and excluded from git/build bundles.

---

## Code References

### Wizard & Creation Flow
- [src/app/new/page.tsx:17-115](file:///home/projekty/10xdevs/scytala/src/app/new/page.tsx#L17-L115) - Main wizard component and step coordinator
- [src/app/new/hooks/useWizardState.ts:26-283](file:///home/projekty/10xdevs/scytala/src/app/new/hooks/useWizardState.ts#L26-L283) - Wizard state machine, validation, and action dispatcher
- [src/app/new/components/StepDetails.tsx:27-73](file:///home/projekty/10xdevs/scytala/src/app/new/components/StepDetails.tsx#L27-L73) - Title and description inputs (`#dashboard-title-input`, `#dashboard-description-input`)
- [src/app/new/components/StepParticipants.tsx:46-94](file:///home/projekty/10xdevs/scytala/src/app/new/components/StepParticipants.tsx#L46-L94) - Participant management and credential generation
- [src/app/new/components/participants/ParticipantCard.tsx:30-161](file:///home/projekty/10xdevs/scytala/src/app/new/components/participants/ParticipantCard.tsx#L30-L161) - Participant alias and password text fields
- [src/app/new/components/StepReview.tsx:27-58](file:///home/projekty/10xdevs/scytala/src/app/new/components/StepReview.tsx#L27-L58) - Review step container and confirmation
- [src/app/new/components/review/ReviewSummaryCard.tsx:55-243](file:///home/projekty/10xdevs/scytala/src/app/new/components/review/ReviewSummaryCard.tsx#L55-L243) - Credential blur, copy buttons, and parameters summary
- [src/app/new/components/StepSuccess.tsx:69-124](file:///home/projekty/10xdevs/scytala/src/app/new/components/StepSuccess.tsx#L69-L124) - Success display, shareable link, and "Enter Dashboard" CTA
- [src/app/new/components/success/CredentialsListCard.tsx:23-96](file:///home/projekty/10xdevs/scytala/src/app/new/components/success/CredentialsListCard.tsx#L23-L96) - Participant credential list and "Copy All Credentials" button
- [src/app/new/components/WizardNavigation.tsx:37-73](file:///home/projekty/10xdevs/scytala/src/app/new/components/WizardNavigation.tsx#L37-L73) - Back, Next, and Create navigation buttons (`#wizard-create-btn`)
- [src/actions/dashboard.ts:30-104](file:///home/projekty/10xdevs/scytala/src/actions/dashboard.ts#L30-L104) - `createDashboardAction`: Rate limiting, PBKDF2 hashing, and DB insertion

### Authentication & Dashboard
- [src/app/dashboard/[hash]/page.tsx:56-96](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/page.tsx#L56-L96) - Session verification guard and view switching
- [src/app/dashboard/[hash]/components/LoginForm.tsx:116-225](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/LoginForm.tsx#L116-L225) - Login card, alias/password inputs, and submit button
- [src/actions/auth.ts:32-133](file:///home/projekty/10xdevs/scytala/src/actions/auth.ts#L32-L133) - `loginToDashboardAction`: PBKDF2 password verification and JWT cookie issuance
- [src/lib/session.ts:20-77](file:///home/projekty/10xdevs/scytala/src/lib/session.ts#L20-L77) - Cookie name generation (`__Host-` vs dev), cookie options, and eviction helpers
- [src/app/dashboard/[hash]/components/DashboardHeader.tsx:20-95](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/DashboardHeader.tsx#L20-L95) - Header structure, title, and action toolbar
- [src/components/ScytalaUserHeader.tsx:21-89](file:///home/projekty/10xdevs/scytala/src/components/ScytalaUserHeader.tsx#L21-L89) - User alias badge chip and Logout button integration
- [src/app/dashboard/[hash]/components/DashboardActionToolbar.tsx:76-97](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/DashboardActionToolbar.tsx#L76-L97) - "Create note" action button (`#header-create-note-btn`)
- [src/app/dashboard/[hash]/components/NoteGrid.tsx:13-33](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/NoteGrid.tsx#L13-L33) - Note card grid layout
- [src/app/dashboard/[hash]/components/NoteTile.tsx:18-138](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/NoteTile.tsx#L18-L138) - Note preview card link pointing to editor

### Note Editor & Version History
- [src/app/dashboard/[hash]/note/[noteId]/page.tsx:24-93](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/page.tsx#L24-L93) - Editor route handler (`new` vs UUID edit mode)
- [src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:56-180](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx#L56-L180) - Main editor state, save action, and version restore handler
- [src/app/dashboard/[hash]/note/[noteId]/components/NoteTitleInput.tsx:17-57](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteTitleInput.tsx#L17-L57) - Standard text field `#note-title-input`
- [src/app/dashboard/[hash]/note/[noteId]/components/NoteContentArea.tsx:74-147](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteContentArea.tsx#L74-L147) - Plain text textarea `#note-content-input` with line number gutter
- [src/app/dashboard/[hash]/note/[noteId]/components/EditorToolbar.tsx:140-154](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/EditorToolbar.tsx#L140-L154) - Manual "Save note" button and back navigation confirmation
- [src/app/dashboard/[hash]/note/[noteId]/components/NoteEditorHeader.tsx:32-74](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteEditorHeader.tsx#L32-L74) - "Note history" button `#note-history-btn`
- [src/app/dashboard/[hash]/note/[noteId]/components/NoteVersionHistoryDrawer.tsx:45-451](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteVersionHistoryDrawer.tsx#L45-L451) - History drawer, version list, author aliases, and delta indicators
- [src/app/dashboard/[hash]/note/[noteId]/components/NoteVersionPreview.tsx:45-401](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/NoteVersionPreview.tsx#L45-L401) - Inline diff dialog and "Restore this version" confirmation
- [src/app/dashboard/[hash]/note/[noteId]/components/DeleteNoteDialog.tsx:107-183](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/note/[noteId]/components/DeleteNoteDialog.tsx#L107-L183) - Re-authentication password prompt and note deletion confirmation
- [src/actions/notes.ts:32-270](file:///home/projekty/10xdevs/scytala/src/actions/notes.ts#L32-L270) - Note CRUD actions (`createNoteAction`, `updateNoteAction`, `getNoteVersionHistoryAction`)

### Logout & Session Eviction
- [src/app/dashboard/[hash]/components/LogoutButton.tsx:28-66](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/LogoutButton.tsx#L28-L66) - HTML form POST trigger `#dashboard-logout-btn`
- [src/app/api/auth/logout/route.ts:14-85](file:///home/projekty/10xdevs/scytala/src/app/api/auth/logout/route.ts#L14-L85) - Route handler: cookie clearing, open redirect validation, and 303 redirect

### Build Configuration & Hardening
- [tsconfig.build.json:1-12](file:///home/projekty/10xdevs/scytala/tsconfig.build.json#L1-L12) - Production TypeScript compilation exclusions
- [next.config.ts:28-66](file:///home/projekty/10xdevs/scytala/next.config.ts#L28-L66) - `tsconfigPath` and `outputFileTracingExcludes` bundle definitions
- [vitest.config.ts:6-23](file:///home/projekty/10xdevs/scytala/vitest.config.ts#L6-L23) - Vitest `include: ['src/**/*.test.{ts,tsx}']` and 80% coverage configuration
- [.github/workflows/test.yml:14-43](file:///home/projekty/10xdevs/scytala/.github/workflows/test.yml#L14-L43) - Current CI workflow steps

---

## Architecture Insights

1. **No Client-Side Mocking for Server Actions**:
   In Next.js App Router, Server Actions execute server-side within the Next.js runtime. Attempting to mock them at the browser network layer (`page.route()`) disrupts streaming and headers. Executing real actions against local Supabase CLI provides authentic integration testing.
2. **Deterministic Dynamic Tenants**:
   By using the UI wizard to spawn a uniquely named dashboard in each test run, the test suite generates fresh cryptographic credentials and a unique 32-character hash slug. This provides complete tenant isolation without needing per-test database wipes.
3. **Hard Navigation on Logout**:
   Next.js App Router caches Server Component payloads in the client-side router cache. The logout flow deliberately uses an HTTP POST form submission to `/api/auth/logout` that returns an HTTP 303 redirect. This forces the browser to execute a full navigation, ensuring sensitive notes are purged from browser memory.
4. **RFC 6265bis Cookie Prefixes**:
   In production (`NODE_ENV === "production"`), cookies use `__Host-scytala_session_<hash>`. When testing against local development servers (`NODE_ENV !== "production"`), cookies use `scytala_session_<hash>`. Playwright tests running against `next dev` must expect the development cookie naming.
5. **Separation of Test Runners**:
   Vitest runs fast, in-memory unit/integration tests with `happy-dom` and enforces strict 80% coverage. Playwright tests full end-to-end browser journeys in real Chromium/Firefox browsers. Keeping Playwright tests in `e2e/**/*.spec.ts` ensures clean separation where neither runner interferes with the other.

---

## Historical Context (from Prior Changes)

- **[context/foundation/test-plan.md](file:///home/projekty/10xdevs/scytala/context/foundation/test-plan.md)**:
  - Establishes Risk #4 as high impact / high likelihood due to 133 commits in `src/app/` over 30 days and previous absence of real browser automation.
  - Principles mandate cost $\times$ signal (testing user-visible text, accessible roles, and URL state rather than brittle visual pixel snapshots).
- **[context/foundation/lessons.md:18-24](file:///home/projekty/10xdevs/scytala/context/foundation/lessons.md#L18-L24)**:
  - "Run Full Test Suite Only at Implementation End": During iterative development of E2E tests, run targeted test commands (`npx playwright test e2e/golden-path.spec.ts`) rather than triggering the full Vitest coverage suite on each iteration.
- **[context/changes/fix-dashboard-logout/](file:///home/projekty/10xdevs/scytala/context/changes/fix-dashboard-logout/)**:
  - Discovered that `@edge-runtime/cookies` `.delete(name)` stripped `Secure` flags, causing browsers to ignore `__Host-` cookie eviction headers.
  - Standardized on explicit `cookieStore.set(name, "", deleteOptions)` with HTTP 303 redirect.
- **[context/changes/exclude-tests-from-cloudflare-build/](file:///home/projekty/10xdevs/scytala/context/changes/exclude-tests-from-cloudflare-build/)**:
  - Implemented the 5-layer build isolation system to prevent test files from entering Cloudflare Worker edge assets. Playwright config and tests must adhere to these exact exclusions.
- **[context/changes/note-version-history-browser/](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/)**:
  - Verified non-destructive append-only version restoration ($v_{N+1}$) and optimized background character deltas to prevent UI lag.
- **[context/changes/note-crud-and-version-persistence/](file:///home/projekty/10xdevs/scytala/context/changes/note-crud-and-version-persistence/)**:
  - Required user password re-authentication for note deletion to prevent CSRF/session hijack cascades.

---

## Related Research

- [context/changes/exclude-tests-from-cloudflare-build/research.md](file:///home/projekty/10xdevs/scytala/context/changes/exclude-tests-from-cloudflare-build/research.md) - Analysis of Cloudflare Worker bundle tracing and `outputFileTracingExcludes`
- [context/changes/fix-dashboard-logout/research.md](file:///home/projekty/10xdevs/scytala/context/changes/fix-dashboard-logout/research.md) - Deep dive into session cookie headers, RFC 6265bis, and client cache invalidation
- [context/changes/note-version-history-browser/research.md](file:///home/projekty/10xdevs/scytala/context/changes/note-version-history-browser/research.md) - Research on diff computation and version history drawer mechanics

---

## Open Questions & Implementation Recommendations

1. **Playwright Package Selection**:
   - Install `@playwright/test` in `devDependencies` (version `^1.51.0` per Context7 resolution).
2. **Page Object Models vs. Direct Locators**:
   - For the initial Golden Path, create concise helper fixtures (e.g. `e2e/fixtures/dashboard-fixture.ts`) encapsulating wizard creation and login to keep individual spec files clear and readable.
3. **Execution Model (Local-Only Developer Tooling)**:
   - Run E2E suites exclusively on developer machines using `npm run test:e2e` and `npm run test:e2e:ui`. Omit GitHub Actions CI integration due to execution costs and absence of a non-production cloud Supabase environment on the free tier. Provide `npm run test:e2e:init` for automated local environment bootstrapping.
