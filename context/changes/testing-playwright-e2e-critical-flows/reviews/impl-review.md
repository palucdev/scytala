<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Playwright E2E Test Suite and Critical Browser Flows

- **Plan**: context/changes/testing-playwright-e2e-critical-flows/plan.md
- **Scope**: All Phases (1 to 4)
- **Date**: 2026-09-12
- **Verdict**: APPROVED (All 10 findings triaged and resolved)
- **Findings**: 0 critical, 6 warnings, 4 observations (10 fixed)

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS ✅ |
| Scope Discipline | PASS ✅ (Addendum recorded) |
| Safety & Quality | PASS ✅ (CSP, race condition, timeouts fixed) |
| Architecture | PASS ✅ |
| Pattern Consistency | PASS ✅ (Accessible locators & AGENTS.md updated) |
| Success Criteria | PASS ✅ (Next.js 16 page export types resolved) |

## Findings

### F1 — Production CSP includes unconditioned localhost and 127.0.0.1

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: next.config.ts:17
- **Detail**: In next.config.ts:17, connect-src includes http://127.0.0.1:* and http://localhost:* unconditionally in production bundles, while WebSockets (ws://...) are properly gated behind !isProd. Exposing loopback HTTP ports in production CSP allows scripts executing in the user's browser to initiate requests to local machine services.
- **Fix**: Wrap `http://127.0.0.1:* http://localhost:*` inside the `${!isProd ? ... : ""}` expression.
- **Decision**: FIXED (scoped loopback HTTP origins in connect-src to !isProd)

### F2 — False synchronization on saveBtn disabled state causes race conditions

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: e2e/golden-path.spec.ts:143-150
- **Detail**: The test asserts `await expect(saveBtn).toBeDisabled()` immediately following `saveBtn.click()`. Because EditorToolbar.tsx disables the button during in-flight saves (isSaving=true), this assertion resolves true before the Server Action completes. The test then immediately clicks "Back", triggering the "Unsaved Changes" ConfirmationDialog because the editor is still dirty. To bypass this, a defensive 1500ms timeout check (leaveBtn.isVisible({ timeout: 1500 })) was added, adding ~12 seconds of artificial delays across test suites and introducing flakiness under system load.
- **Fix A ⭐ Recommended**: Synchronize on version chip appearance/update (e.g. `await expect(page.getByText(/v[1-3]/)).toBeVisible()`) or URL change before clicking Back, removing the 1500ms leaveBtn fallback entirely.
  - Strength: Guarantees the Server Action and state revalidation have settled; eliminates up to 12s of idle test wait time.
  - Tradeoff: Requires updating the navigation step across 4 test files.
  - Confidence: HIGH — mirrors how real users know save has finished.
  - Blind spot: None significant.
- **Fix B**: Keep the leaveBtn catch-all but reduce its timeout from 1500ms to 200ms.
  - Strength: Minimal code edit; leaves existing test flow intact.
  - Tradeoff: Preserves the underlying race condition; does not fix the root synchronization flaw.
  - Confidence: MEDIUM — may still cause intermittent failures under CI load.
- **Decision**: FIXED (via Fix A ⭐ — synchronized on note URL and version chip across 4 test specs)

### F3 — Hardcoded page.waitForTimeout(3000) and logout form race

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: e2e/golden-path.spec.ts:247
- **Detail**: e2e/golden-path.spec.ts races page.waitForResponse against page.waitForTimeout(3000), falling back to manual form.requestSubmit(). This directly violates Rule #4 of e2e/README.md ("Never use page.waitForTimeout()").
- **Fix**: Use `await Promise.all([page.waitForResponse(resp => resp.url().includes('/api/auth/logout')), logoutBtn.click()])` and await `#login-user-alias` appearance.
- **Decision**: FIXED (replaced waitForTimeout race with clean Promise.all)

### F4 — Fragile internal MUI class selector in golden path

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: e2e/golden-path.spec.ts:190
- **Detail**: Locates version 1 via `page.locator(".MuiListItemButton-root").filter({ hasText: /v1/ })`. This breaks Rule #2 of e2e/README.md ("Never use fragile CSS selectors, XPath, or arbitrary DOM structure").
- **Fix**: Replace with `page.getByRole("button", { name: /v1/ })` or `page.getByRole("listitem").filter({ hasText: /v1/ })`.
- **Decision**: FIXED (replaced fragile class selector with accessible role button query)

### F5 — Seed test silently bypasses UI interaction on missing button

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: e2e/seed.spec.ts:27-32
- **Detail**: e2e/seed.spec.ts checks `if (await createNoteBtn.isVisible()) { await createNoteBtn.click(); } else { await page.goto(...) }`. Silently falling back to direct URL navigation masks UI rendering regressions in an E2E test.
- **Fix**: Make button interaction deterministic with `await expect(createNoteBtn).toBeVisible()` followed by `await createNoteBtn.click()`.
- **Decision**: FIXED (made button interaction deterministic with expect(createNoteBtn).toBeVisible())

### F6 — Unplanned allowedDevOrigins and dev webpack flag

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: next.config.ts:28, playwright.config.ts:33
- **Detail**: allowedDevOrigins: ["127.0.0.1", "localhost"] was added to next.config.ts and --webpack was added to webServer.command in playwright.config.ts. Both were needed to avoid Next.js Server Action origin mismatches and ensure dev server stability, but neither was documented in plan.md.
- **Fix**: Add a short addendum to plan.md documenting these two operational adaptations.
- **Decision**: FIXED (added Operational Adaptations addendum to plan.md)

### F7 — AGENTS.md missing E2E test commands

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: AGENTS.md:21-28
- **Detail**: New scripts npm run test:e2e, test:e2e:ui, and test:e2e:init are documented in test-plan.md but missing from ## Build & Test Commands in AGENTS.md.
- **Fix**: Add the three Playwright commands to ## Build & Test Commands in AGENTS.md.
- **Decision**: FIXED (added Playwright E2E commands to AGENTS.md)

### F8 — Debug console listeners left in test suite

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: e2e/golden-path.spec.ts:17-18
- **Detail**: page.on("console", ...) and page.on("pageerror", ...) unconditionally dump all browser console traffic to stdout during test runs.
- **Fix**: Remove debug listeners or gate behind process.env.DEBUG.
- **Decision**: FIXED (removed leftover debug listeners from golden-path.spec.ts)

### F9 — Legacy Playwright wait methods in fixture

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: e2e/fixtures/test-base.ts:119,149
- **Detail**: Uses legacy page.waitForSelector("#wizard-success-alert") and .waitFor({ state: "detached" }) instead of web-first assertions.
- **Fix**: Replace with `await expect(page.locator("#wizard-success-alert")).toBeVisible()` and `await expect(page.locator("#login-user-alias")).toBeHidden()`.
- **Decision**: FIXED (replaced legacy waitFor methods with web-first expect assertions in test-base.ts)

### F10 — Pre-existing page exports fail Next.js 16 route type checks

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/app/dashboard/[hash]/page.tsx:26, src/app/new/page.tsx:21
- **Detail**: When next dev boots (e.g. during Playwright test runs), it generates .next/dev/types/. Running tsc --noEmit then fails with TS2344 because Next.js 16 App Router disallows custom named exports (mapDashboardToDto, DashboardCreationWizard) from page.tsx files.
- **Fix**: Relocate exported helper functions/components into dedicated dto.ts/components modules.
- **Decision**: FIXED (moved mapper functions to dedicated dto.ts and cleaned page exports)
