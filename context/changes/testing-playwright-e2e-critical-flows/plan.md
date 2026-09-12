# Playwright E2E Test Suite and Critical Browser Flows Implementation Plan

## Overview

Introduce Playwright end-to-end browser automation into Scytala to verify critical browser workflows as defined in Phase 2 of [context/foundation/test-plan.md](file:///home/projekty/10xdevs/scytala/context/foundation/test-plan.md) (defending Risk #4: "End-to-end browser workflow breakage across client UI, cookie persistence, and Server Action navigation"). This implementation establishes `@playwright/test`, enforces 5-layer production build isolation for Cloudflare Workers, configures custom test fixtures (`test.extend`), delivers full coverage of the Golden Path user journey (Wizard creation $\rightarrow$ Credential copy $\rightarrow$ Dashboard login $\rightarrow$ Note CRUD & Version History $\rightarrow$ Logout), and integrates browser testing into GitHub Actions CI without impacting Vitest's 80% coverage gate.

## Current State Analysis

- **Test Base**: 42 test files and 549 unit/integration tests running under Vitest with `happy-dom` ([vitest.config.ts:6-23](file:///home/projekty/10xdevs/scytala/vitest.config.ts#L6-L23)) and strict 80% threshold enforcement across lines, functions, branches, and statements.
- **Missing Layer**: No automated browser testing exists. Multi-page transitions, client-side cookie preservation across navigations, App Router `startTransition` + `router.refresh()` Server Component revalidations, clipboard copying, and logout HTTP 303 hard redirects are only verifiable manually.
- **Production Build Constraints**: Production Cloudflare Worker builds use `tsconfig.build.json` and `outputFileTracingExcludes` in `next.config.ts` ([next.config.ts:28-66](file:///home/projekty/10xdevs/scytala/next.config.ts#L28-L66)) to ensure test utilities, test configs, and spec files are strictly excluded from edge bundles.
- **Database & Auth Stack**: Next.js Server Actions execute transactions directly via Supabase PostgreSQL RPCs (`create_dashboard_with_users`, `create_note_with_version`, `update_note_with_version`), with custom Web Crypto PBKDF2 hashing and HMAC-SHA256 JWT session cookies (`scytala_session_${safeHash}`).

## Desired End State

1. `@playwright/test` is installed and configured in `playwright.config.ts` targeting the Next.js development server (`http://127.0.0.1:3000`) via `webServer`.
2. 5-layer build isolation strictly shields production Cloudflare builds (`tsconfig.build.json`, `next.config.ts`, `eslint.config.mjs`, `.gitignore`, `vitest.config.ts`) from Playwright files, output reports, and traces.
3. Vitest test execution (`npm test`) ignores `e2e/**` specs entirely, keeping the 80% coverage threshold unaffected.
4. Custom Playwright fixtures in `e2e/fixtures/test-base.ts` provide reusable helpers for browser clipboard permissions, dynamic dashboard tenant creation, and authentication.
5. The complete Golden Path suite in `e2e/golden-path.spec.ts` passes reliably in headless Chromium and Firefox.
6. Note deletion and password re-authentication are tested in `e2e/note-lifecycle.spec.ts`.
7. A dedicated `e2e` job in `.github/workflows/test.yml` caches browser binaries, boots local Supabase CLI, executes tests, and uploads HTML reports.

### Key Discoveries:

- [src/app/new/components/StepSuccess.tsx:82-124](file:///home/projekty/10xdevs/scytala/src/app/new/components/StepSuccess.tsx#L82-L124): Credential and link copying relies on `navigator.clipboard.writeText`, requiring `permissions: ['clipboard-read', 'clipboard-write']` in the browser context.
- [src/app/dashboard/[hash]/components/LoginForm.tsx:49-66](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/LoginForm.tsx#L49-L66): Login triggers `router.refresh()` inside `startTransition`, switching from `<LoginForm>` to `<DashboardView>` without full page reload.
- [src/app/dashboard/[hash]/components/LogoutButton.tsx:28-66](file:///home/projekty/10xdevs/scytala/src/app/dashboard/[hash]/components/LogoutButton.tsx#L28-L66) & [src/app/api/auth/logout/route.ts:14-85](file:///home/projekty/10xdevs/scytala/src/app/api/auth/logout/route.ts#L14-L85): Logout submits an HTML POST form returning an HTTP 303 redirect, forcing a full navigation to purge the client-side router cache.
- [context/changes/exclude-tests-from-cloudflare-build/plan.md:5-28](file:///home/projekty/10xdevs/scytala/context/changes/exclude-tests-from-cloudflare-build/plan.md#L5-L28): Production builds will fail or bundle bloat if `playwright.config.ts` and `e2e/**` are omitted from `tsconfig.build.json` and `outputFileTracingExcludes`.
- [context/foundation/lessons.md:18-24](file:///home/projekty/10xdevs/scytala/context/foundation/lessons.md#L18-L24): Full test suites must only be executed at phase completion; intermediate verification must run targeted commands.

## What We're NOT Doing

- **MUI Visual Regression / Pixel Snapshots**: Not testing exact CSS colors, margins, or pixel diffs, as agreed in [context/foundation/test-plan.md:147-155](file:///home/projekty/10xdevs/scytala/context/foundation/test-plan.md#L147-L155). Assertions focus on accessible roles (`getByRole`), visible text content, and URL state changes.
- **Server Action Mocking**: Not intercepting Server Action POST requests or using MSW proxies. Tests run against the real application backend using dynamic test tenants.
- **Multi-user Concurrency & Three-Way Diff Conflicts**: Concurrent multi-user conflict resolution is reserved for Phase 3 of the test rollout plan ([context/foundation/test-plan.md:72](file:///home/projekty/10xdevs/scytala/context/foundation/test-plan.md#L72)).
- **Modifying Production Runtime Code**: No production code changes under `src/app/` or `src/actions/` are required; all additions are strictly test configuration, test fixtures, test specs, and npm scripts.
- **Automated CI/CD Integration**: Not integrating Playwright into `.github/workflows/test.yml` or GitHub Actions. E2E tests are run strictly locally by the developer on demand. Reasons: Full browser automation against database containers is compute/cost-heavy, and currently there are no means to have a non-production Supabase setup on the free usage plan.

## Implementation Approach

The implementation follows a 4-phase progression:

1. **Phase 1: Dependencies & 5-Layer Build Isolation Hardening** — Install `@playwright/test`, lock all exclusion configurations across TypeScript, Next.js NFT, Vitest, ESLint, and Git, and verify that production worker builds and unit tests remain green.
2. **Phase 2: Playwright Configuration & Custom Test Fixtures** — Author `playwright.config.ts` with `webServer` orchestration and construct type-safe `test.extend` fixtures in `e2e/fixtures/test-base.ts` for clipboard access, dynamic tenant creation, and login.
3. **Phase 3: Critical Golden Path & Note Lifecycle E2E Test Suite** — Implement comprehensive browser tests in `e2e/golden-path.spec.ts` and `e2e/note-lifecycle.spec.ts` covering wizard creation, clipboard assertion, login, note authoring, version history diffs, version restore, note deletion, and logout across Chromium and Firefox.
4. **Phase 4: Local Developer Tooling & Documentation Hardening** — Add developer setup script (`test:e2e:init`) to `package.json`, update cookbook documentation and quality gates in `context/foundation/test-plan.md`, formalize the local-only developer execution model (free-tier Supabase constraints), and verify all local quality gates pass.

## Critical Implementation Details

- **Timing & Lifecycle**: In `LoginForm.tsx`, `router.refresh()` executes asynchronously within React's `startTransition`. Playwright assertions must await the disappearance of the login form or the appearance of `DashboardHeader` / `aria-label="Notes Grid"` rather than arbitrary sleep timers.
- **Browser Permissions**: Clipboard operations require explicit context permissions. All tests interacting with wizard credential copies must use browser contexts granted `['clipboard-read', 'clipboard-write']`.
- **Dynamic Tenant Isolation**: Every test run creates a unique dashboard via the wizard with a timestamped title (`E2E Workspace ${Date.now()}`), preventing any cross-test collisions in the local database.

---

## Phase 1: Dependencies & 5-Layer Build Isolation Hardening

### Overview

Install `@playwright/test` and harden the 5 build and test boundaries to guarantee that Playwright tests and config files are completely isolated from Cloudflare Worker production bundles and Vitest's `happy-dom` unit runner.

### Changes Required:

#### 1. Package Dependencies & Scripts

**File**: `package.json`

**Intent**: Install `@playwright/test` as a dev dependency and register standard npm scripts for running E2E tests and launching the Playwright UI mode.

**Contract**: Add `"@playwright/test": "^1.51.0"` to `devDependencies`. Add `"test:e2e": "playwright test"` and `"test:e2e:ui": "playwright test --ui"` to `scripts`.

#### 2. TypeScript Production Build Isolation

**File**: `tsconfig.build.json`

**Intent**: Prevent `next build` from type-checking or compiling Playwright configuration, fixtures, and specs during production builds.

**Contract**: Add `"playwright.config.ts"` and `"e2e/**"` to the `exclude` array.

#### 3. Cloudflare Worker Asset Tracing Exclusions

**File**: `next.config.ts`

**Intent**: Ensure `@opennextjs/cloudflare` and `@vercel/nft` do not trace or bundle Playwright configs, specs, test reports, or execution traces into the serverless worker bundle.

**Contract**: Append `'./playwright.config.ts'`, `'./e2e/**'`, `'./test-results/**'`, and `'./playwright-report/**'` to `outputFileTracingExcludes['*']`.

#### 4. Vitest Runner Exclusion

**File**: `vitest.config.ts`

**Intent**: Explicitly instruct Vitest to ignore the `e2e/` folder and `*.spec.ts` files so `npm test` does not attempt to execute browser tests or distort the 80% coverage threshold.

**Contract**: Add `exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', '**/*.spec.{ts,tsx}']` to the `test` configuration block.

#### 5. ESLint & Git Exclusions

**Files**: `eslint.config.mjs`, `.gitignore`

**Intent**: Prevent ESLint from linting generated Playwright HTML reports and traces, and prevent git from tracking test artifacts.

**Contract**: Add `"playwright-report/**"` and `"test-results/**"` to `globalIgnores` in `eslint.config.mjs`. Add `/test-results/`, `/playwright-report/`, `/blob-report/`, and `/.playwright/` to `.gitignore`.

### Success Criteria:

#### Automated Verification:

- Dependencies install cleanly: `npm install`
- Type checking passes without errors: `npm run check:type`
- ESLint passes without errors: `npm run lint`
- Vitest passes with $\ge 80\%$ coverage across all metrics: `npm test`
- Production Cloudflare Worker build compiles successfully: `npm run build:worker`

#### Manual Verification:

- Verify that `dist/` or `.open-next/` bundle contains no references to Playwright or `e2e/`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Playwright Configuration & Custom Test Fixtures

### Overview

Create the root Playwright configuration file and author type-safe test fixtures (`test.extend`) encapsulating clipboard permissions, dynamic dashboard tenant creation, and session authentication.

### Changes Required:

#### 1. Playwright Configuration File

**File**: `playwright.config.ts`

**Intent**: Configure Playwright test discovery, browser projects, timeout boundaries, output directories, and local web server supervision.

**Contract**: Export default `defineConfig` specifying:

- `testDir: './e2e'`
- `testMatch: '**/*.spec.ts'`
- `fullyParallel: false`
- `retries: process.env.CI ? 2 : 0`
- `reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]`
- `use: { baseURL: 'http://127.0.0.1:3000', permissions: ['clipboard-read', 'clipboard-write'], trace: 'on-first-retry', screenshot: 'only-on-failure' }`
- Projects: Chromium (enabled locally and in CI), Firefox (enabled in CI or when specified).
- `webServer: { command: 'npm run dev', url: 'http://127.0.0.1:3000', timeout: 120000, reuseExistingServer: !process.env.CI }`.

#### 2. Custom Playwright Fixtures

**File**: `e2e/fixtures/test-base.ts`

**Intent**: Provide a strongly-typed test extension wrapping common Scytala user journeys to eliminate boilerplate in individual spec files.

**Contract**: Export an extended `test` object and `expect` with fixtures:

- `clipboard`: Helper methods `readText()` and `writeText()` operating through `page.evaluate(() => navigator.clipboard.readText())`.
- `createTestDashboard`: Helper function that navigates to `/new`, completes the 3-step wizard (title, description, participant alias), captures the created credentials and hash from `StepSuccess`, and returns `{ hash, title, alias, password, shareableUrl }`.
- `loginToDashboard`: Helper function that navigates to `/dashboard/${hash}`, fills `#login-user-alias` and `#login-password`, submits the form, and waits for `router.refresh()` to transition to `<DashboardView>`.

#### 3. Smoke Test Spec

**File**: `e2e/smoke.spec.ts`

**Intent**: Provide a minimal smoke test validating that Playwright successfully boots the local web server and renders the Scytala home page or `/new` wizard.

**Contract**: Verify `page.goto('/')` or `page.goto('/new')` renders with HTTP 200 and expected title.

### Success Criteria:

#### Automated Verification:

- Playwright CLI executes and discovers the smoke spec: `npx playwright test e2e/smoke.spec.ts --project=chromium`
- Type checking passes: `npm run check:type`
- ESLint passes: `npm run lint`
- Vitest coverage remains unaffected: `npm test`

#### Manual Verification:

- Inspect the generated HTML report via `npx playwright show-report` to confirm reporters work properly.

**Implementation Note**: Pause here for confirmation before proceeding to Phase 3.

---

## Phase 3: Critical Golden Path & Note Lifecycle E2E Test Suite

### Overview

Implement the core Golden Path test suite verifying the complete browser lifecycle of a Scytala workspace, followed by targeted verification of the note deletion and password re-authentication modal.

### Changes Required:

#### 1. Critical Golden Path Test Suite

**File**: `e2e/golden-path.spec.ts`

**Intent**: Verify the entire end-to-end user workflow across creation, credential copy, login, note authoring, version inspection, restoration, and logout.

**Contract**: Single cohesive spec with structured steps:

1. **Wizard Creation**:
   - Navigate to `/new`.
   - Fill `#dashboard-title-input` with `"E2E Test Workspace <timestamp>"` and `#dashboard-description-input`.
   - Click `#wizard-next-btn`.
   - On Step 2, edit or verify participant alias (`"Alice"`) and pre-generated password.
   - Click `#wizard-next-btn`.
   - On Step 3 Review, verify summary card displays entered title, description, and participant alias.
   - Click `#wizard-create-btn`.
2. **Success & Clipboard Copy**:
   - Await `#wizard-success-alert` on Step 4.
   - Extract `shareableUrl` from `#shareable-url-input`.
   - Click `#copy-all-credentials-btn`, read clipboard via `clipboard.readText()`, assert clipboard contains alias and passphrase.
   - Click `#enter-dashboard-btn`, verify navigation to `/dashboard/<hash>`.
3. **Authentication**:
   - Verify `<LoginForm>` renders with `#login-user-alias` and `#login-password`.
   - Fill captured alias and password, click submit button (`"Sign In"`).
   - Verify transition to `<DashboardView>` displaying user chip `"Alice"` in `ScytalaUserHeader` and empty state `"No notes yet"`.
4. **Note Authoring & Save**:
   - Click `#header-create-note-btn` (or `#empty-state-new-note-btn`), verify URL `/dashboard/<hash>/note/new`.
   - Fill `#note-title-input` with `"Initial E2E Note"` and `#note-content-input` with `"Line 1: Initial content"`.
   - Click `"Save note"` button in `EditorToolbar`.
   - Verify URL updates to `/dashboard/<hash>/note/<noteId>`.
   - Click `"Back to dashboard"`, verify note tile appears in `NoteGrid` with title `"Initial E2E Note"` and version chip `"v1"`.
5. **Note Editing & Version History Drawer**:
   - Click the note tile to re-open editor.
   - Update content in `#note-content-input` to `"Line 1: Initial content\nLine 2: Appended update"`.
   - Click `"Save note"`, verify version chip updates to `"v2"`.
   - Click `#note-history-btn` in header to open `NoteVersionHistoryDrawer`.
   - Verify drawer displays active version `"v2"` and historical version `"v1"`.
   - Click version `"v1"` in drawer to open `<NoteVersionPreview>` dialog.
   - Assert diff view displays word changes and diff summary badge.
   - Click `"Restore this version"` button, confirm restore dialog.
   - Verify editor reloads with `"v1"` content and incremented version `"v3"`.
6. **Logout & Session Eviction**:
   - Click `"Back to dashboard"`.
   - Click `#dashboard-logout-btn`.
   - Await HTTP 303 redirect to `/dashboard/<hash>`.
   - Verify `<LoginForm>` is rendered and note grid is no longer visible.
   - Attempt direct navigation to `/dashboard/<hash>/note/<noteId>`, verify redirect/presentation of login form.

#### 2. Note Lifecycle & Re-Authentication Test Spec

**File**: `e2e/note-lifecycle.spec.ts`

**Intent**: Verify note deletion and password re-authentication security flow.

**Contract**: Spec verifying:

1. Authenticates into a test dashboard and creates a note.
2. Clicks `"Delete note"` button in `EditorToolbar`, opening `DeleteNoteDialog`.
3. Submits invalid password: verifies error alert displays and note is NOT deleted.
4. Submits correct user password: verifies note is deleted, dialog closes, user is redirected to dashboard, and empty state is rendered.

### Success Criteria:

#### Automated Verification:

- Golden Path suite passes in Chromium: `npx playwright test e2e/golden-path.spec.ts --project=chromium`
- Note Lifecycle suite passes in Chromium: `npx playwright test e2e/note-lifecycle.spec.ts --project=chromium`
- Cross-browser execution passes in Firefox: `npx playwright test --project=firefox`
- Type checking passes: `npm run check:type`
- ESLint passes: `npm run lint`
- Vitest coverage remains $\ge 80\%$: `npm test`

#### Manual Verification:

- Inspect video/trace recording of the Golden Path test to verify clean animations and transitions.

**Implementation Note**: Pause here for confirmation before proceeding to Phase 4.

---

## Phase 4: Local Developer Tooling & Documentation Hardening

### Overview

Finalize local developer tooling by registering the browser installation script (`test:e2e:init`) in `package.json`, updating project test documentation in `context/foundation/test-plan.md`, and documenting the decision that E2E tests are strictly developer-side with no CI/CD integration planned due to costs and free-tier Supabase constraints.

### Changes Required:

#### 1. Developer Setup Script (`package.json`)

**File**: `package.json`

**Intent**: Provide a single command for developers to initialize the Playwright environment by downloading required browser binaries and OS dependencies.

**Contract**: Add `"test:e2e:init": "playwright install --with-deps"` to `scripts`.

#### 2. Test Plan Freshness & Cookbook Update (`context/foundation/test-plan.md`)

**File**: `context/foundation/test-plan.md`

**Intent**: Advance Phase 2 status to `complete`, document the local Playwright cookbook patterns, and record the explicit negative-space exclusion of automated CI/CD for E2E suites.

**Contract**:
- In §3 Phased Rollout table, set Phase 2 status from `change opened` to `complete`.
- In §4 Stack table, reflect `@playwright/test` ^1.63.0.
- In §5 Quality Gates, update the `e2e on critical flows` gate to `local only (developer side)`, noting that no CI/CD integration is planned.
- In §6.4 "Adding an E2E browser test in Playwright", document:
  - Spec location: `e2e/*.spec.ts`.
  - Setup script: `npm run test:e2e:init`.
  - Fixture imports: `import { test, expect } from './fixtures/test-base'`.
  - How to run locally: `npm run test:e2e` (headless), `npm run test:e2e:ui` (interactive).
  - Prerequisites: Local Supabase running and environment variables sourced.
  - Build isolation reminders (`tsconfig.build.json` and `outputFileTracingExcludes`).
- In §7 "What We Deliberately Don't Test", document that E2E execution is excluded from GitHub Actions CI because browser automation is costly and the project operates on a free-tier Supabase plan without a dedicated non-production cloud environment.

### Success Criteria:

#### Automated Verification:

- `test:e2e:init` script registered: `npm run test:e2e:init` available in `package.json`
- Full E2E suite passes locally on Chromium and Firefox: `npm run test:e2e`
- Type checking passes: `npx tsc --noEmit`
- ESLint passes: `npm run lint`
- Vitest coverage remains >= 80%: `npm test`

#### Manual Verification:

- Review `context/foundation/test-plan.md` to ensure local developer workflow and cost/free-plan rationale are thoroughly documented.

---

## Testing Strategy

### Unit Tests:

- Vitest unit suite in `src/__tests__/` remains untouched and continues to verify individual utility, schema, action, and component logic in `happy-dom`.
- Enforce strict 80% coverage threshold across lines, functions, branches, and statements (`vitest.config.ts`).

### E2E Tests:

- `e2e/smoke.spec.ts`: Rapid verification of server connectivity and initial page load.
- `e2e/golden-path.spec.ts`: Full sequential user journey from workspace creation to logout.
- `e2e/note-lifecycle.spec.ts`: Note deletion with password re-authentication and cascade verification.

### Manual Testing Steps:

1. Start local Supabase: `npx supabase start`.
2. Start dev server: `npm run dev`.
3. Launch Playwright interactive UI: `npm run test:e2e:ui`.
4. Step through `golden-path.spec.ts` visually in the Playwright trace viewer.
5. Verify that `npm run build:worker` completes without referencing any files in `e2e/`.

## Performance Considerations

- **Server Startup Reuse**: In local development, `reuseExistingServer: !process.env.CI` avoids restarting `next dev` if the developer already has it running on port 3000, reducing test execution time from 15s to under 3s.
- **Browser Binary Caching**: In CI, caching `~/.cache/ms-playwright` saves 40–60 seconds of download time per workflow run.
- **Dynamic Tenants**: Dynamic workspace creation eliminates the need to execute expensive `npx supabase db reset` commands between individual test specs.

## Migration Notes

- **Forward-Only**: No database migrations or schema adjustments are introduced by this plan.
- **Zero Production Code Impact**: All changes are confined to devDependencies, build configs, test specs, and CI workflows.

## References

- Implementation Plan: `context/changes/testing-playwright-e2e-critical-flows/plan.md`
- Research Document: `context/changes/testing-playwright-e2e-critical-flows/research.md`
- Phased Rollout Plan: `context/foundation/test-plan.md`
- Build Isolation Historical Plan: `context/changes/exclude-tests-from-cloudflare-build/plan.md`
- Lessons Learned: `context/foundation/lessons.md`

## Addendum: Operational Adaptations

During execution of Phase 1 and Phase 2, two targeted adaptations were introduced to stabilize Next.js App Router local execution during Playwright runs:
1. **`allowedDevOrigins` in `next.config.ts`**: Set to `["127.0.0.1", "localhost"]` to permit Next.js Server Actions execution when browser requests originate across local loopback hosts (`localhost` vs `127.0.0.1`). This is a dev-only setting ignored in production.
2. **`--webpack` dev flag in `playwright.config.ts`**: Configured `command: "npx next dev --webpack"` to ensure fast and deterministic bundling for Playwright's local `webServer`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dependencies & 5-Layer Build Isolation Hardening

#### Automated

- [x] 1.1 Dependencies install cleanly
- [x] 1.2 Type checking passes without errors
- [x] 1.3 ESLint passes without errors
- [x] 1.4 Vitest passes with >= 80% coverage across all metrics
- [x] 1.5 Production Cloudflare Worker build compiles successfully

#### Manual

- [x] 1.6 Verify that production bundle contains no references to Playwright or e2e

### Phase 2: Playwright Configuration & Custom Test Fixtures

#### Automated

- [x] 2.1 Playwright CLI discovers and executes smoke spec
- [x] 2.2 Type checking passes
- [x] 2.3 ESLint passes
- [x] 2.4 Vitest coverage remains unaffected

#### Manual

- [x] 2.5 Inspect generated HTML report via Playwright show-report

### Phase 3: Critical Golden Path & Note Lifecycle E2E Test Suite

#### Automated

- [x] 3.1 Golden Path suite passes in Chromium
- [x] 3.2 Note Lifecycle suite passes in Chromium
- [x] 3.3 Cross-browser execution passes in Firefox
- [x] 3.4 Type checking passes
- [x] 3.5 ESLint passes
- [x] 3.6 Vitest coverage remains >= 80%

#### Manual

- [x] 3.7 Inspect video/trace recording of Golden Path test execution

### Phase 4: Local Developer Tooling & Documentation Hardening

#### Automated

- [x] 4.1 test:e2e:init script registered in package.json
- [x] 4.2 Full E2E suite passes locally on Chromium and Firefox
- [x] 4.3 Type checking passes (tsc --noEmit)
- [x] 4.4 ESLint passes (npm run lint)
- [x] 4.5 Vitest coverage remains >= 80% (npm test)

#### Manual

- [x] 4.6 Review test-plan.md to confirm local-only developer workflow and cost/free-plan rationale
