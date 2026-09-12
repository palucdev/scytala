# Note Versioning & Concurrency Integrity Implementation Plan

## Overview

This implementation plan delivers comprehensive verification for **Note Versioning & Concurrency Integrity (Risk #3 & #7, Roadmap T-02)** in Scytala. It validates that PostgreSQL row-level locks, atomic conditional updates (`WHERE id = p_note_id AND version = p_expected_version`), and stored procedure rollbacks prevent silent data loss, duplicate version IDs, or non-sequential version corruption when multiple users race to update the same note. It spans a fast, isolated database integration test suite (`vitest.integration.config.ts` via `npm run test:integration`) and a dual-browser-context end-to-end Playwright test (`e2e/note-concurrency.spec.ts`).

## Current State Analysis

- **Optimistic Concurrency Control (OCC) Architecture**:
  - The PostgreSQL stored procedure `update_note_with_version` (`supabase/migrations/20260820000000_create_dashboard_rpcs.sql:87-134`) performs an atomic conditional update and version increment within a single transaction. If the expected version does not match, it executes `RAISE EXCEPTION 'Version mismatch or note not found...'`, triggering a complete transactional rollback.
  - The database schema (`supabase/migrations/20260819000000_create_dashboard_schema.sql:42-74`) enforces `CONSTRAINT uq_note_version UNIQUE (note_id, version)` to ensure version identifiers never duplicate.
  - The database client (`src/lib/supabase.ts:437-456`) translates RPC exceptions into error messages, and `updateNoteAction` (`src/actions/notes.ts:162-268`) parses version mismatch errors to return a structured contract `{ success: false, versionConflict: true, error: "..." }`.
  - The UI layer (`src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:107-128,194-213`) renders an MUI warning alert on conflict, maintains dirty draft input in the editor until explicit user action, and provides a "Reload" CTA that triggers `router.refresh()` to unmount the stale editor and mount the fresh server state via `${note.id}-${note.version}` keying.
- **The Gap**:
  - Existing tests (`src/__tests__/actions/notes.test.ts`, `src/__tests__/lib/supabase.test.ts`, `src/__tests__/app/dashboard/note/NoteEditor.test.tsx`) only test mocked errors and synthetic string mapping.
  - No existing test exercises real PostgreSQL row locking, race conditions under in-flight concurrency (`Promise.allSettled`), or browser multi-user simultaneous edit collisions.

## Desired End State

1. **Database Integration Test Suite (`npm run test:integration`)**:
   - A dedicated Vitest integration test config (`vitest.integration.config.ts`) runs against live Supabase PostgreSQL without polluting standard unit test execution (`npm test`).
   - A race condition test executes competing updates simultaneously on `expected_version: 1` via `Promise.allSettled`.
   - Exactly one update commits (`fulfilled`) and advances `notes.version` to 2; exactly one update fails (`rejected`) with `"Version mismatch or note not found"`.
   - `note_versions` contains exactly 2 contiguous snapshots (`[1, 2]`) with no duplicate version records, proving atomic rollback of the losing mutation.
   - Subsequent stale updates are rejected; subsequent valid updates succeed.
2. **Playwright Multi-User Concurrency E2E Test (`npm run test:e2e`)**:
   - Multi-participant dashboard creation is supported in `e2e/fixtures/test-base.ts`.
   - Dual browser contexts in `e2e/note-concurrency.spec.ts` simulate Alice and Bob editing the same note concurrently with isolated session cookies.
   - When Alice saves v2, Bob's save attempt with stale v1 triggers the warning alert without overwriting Alice's content.
   - Bob's typed draft remains preserved in his textarea before reload.
   - Clicking "Reload" revalidates server state, pulling Alice's v2 content into a fresh `NoteEditor` instance.
   - Bob can then make a clean follow-up edit that saves successfully as version 3.

### Key Discoveries:

- `supabase/migrations/20260820000000_create_dashboard_rpcs.sql:87-134`: PL/pgSQL function `update_note_with_version` performs conditional `UPDATE ... WHERE id = p_note_id AND version = p_expected_version` and rolls back all writes on exception.
- `src/actions/notes.ts:248-260`: Server action extracts `"version mismatch"` case-insensitively and maps to `versionConflict: true`.
- `src/app/dashboard/[hash]/note/[noteId]/page.tsx:82-92`: Dynamic `key={`${note.id}-${note.version}`}` forces clean unmount/remount on server version increments.
- `src/lib/session.ts:20-38`: Session cookies are scoped per dashboard hash (`scytala_session_${hash}`), meaning multi-user testing requires separate browser contexts to prevent cookie collisions in Playwright.

## What We're NOT Doing

- We are **not** implementing 3-way visual text diff merging or automatic conflict resolution in the UI (that is explicitly reserved for slice `S-05: manual-sync-and-conflict-diff-resolution`).
- We are **not** modifying the underlying PL/pgSQL RPC logic or table schemas unless a defect is discovered during race testing.
- We are **not** adding headless browser execution or live database containers to GitHub Actions CI (`.github/workflows/test.yml`), respecting the local-only developer testing model documented in `context/foundation/test-plan.md` §7.
- We are **not** breaking or modifying existing unit test coverage thresholds (80% floor in Vitest).

## Implementation Approach

1. **Test Suite Decoupling**: Configure `vitest.integration.config.ts` for integration tests with live database connections in `node` environment, and exclude integration tests from `vitest.config.ts` so `npm test` remains 100% mocked, fast, and stable in CI.
2. **Deterministic Database Race Validation**: In `src/__tests__/integration/note-concurrency.integration.test.ts`, use `createDatabaseClient()` to seed a test dashboard and note, fire two `db.updateNote` calls concurrently with `Promise.allSettled`, and verify database integrity invariants (`notes.version === 2`, `note_versions.length === 2`).
3. **Multi-User Playwright Automation**: Extend `createTestDashboard` in `e2e/fixtures/test-base.ts` to accept `additionalParticipants`, then author `e2e/note-concurrency.spec.ts` using two independent browser contexts (Alice and Bob) to test the end-to-end user experience of conflict alerts and reload recovery.
4. **Documentation & Quality Gates**: Run the full verification suite (lint, typecheck, unit, integration, and E2E) and update `context/foundation/test-plan.md` cookbook patterns.

## Critical Implementation Details

- **Session Isolation in Browser Tests**: In Playwright, `context.newPage()` shares cookies with existing pages. Because `scytala_session_${hash}` is keyed by dashboard hash, logging in as Bob in the same context overwrites Alice's cookie. The E2E test must create a second browser context (`await browser.newContext()`) for Bob to maintain true multi-user isolation.
- **Environment Loading for Integration Tests**: `vitest.integration.config.ts` must load `.env.local` or `.env.ai` via `process.loadEnvFile()` so `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present when initializing `SupabaseDatabaseClient`.
- **Database Cleanup Invariant**: Integration tests must clean up created test dashboards, notes, and version snapshots in an `afterAll` hook to avoid database bloat.

---

## Phase 1: Integration Test Harness & Config Setup

### Overview

Create a dedicated integration test configuration (`vitest.integration.config.ts`), update the primary unit test configuration (`vitest.config.ts`) to exclude integration tests, wire the `npm run test:integration` script in `package.json`, and establish test database helpers for seeding and cleaning up isolated workspaces.

### Changes Required:

#### 1. Integration Vitest Configuration

**File**: `vitest.integration.config.ts`

**Intent**: Configure Vitest to run integration tests against a live Supabase PostgreSQL database in a Node.js environment with environment variables loaded from `.env.local` or `.env.ai`.

**Contract**: Export a Vitest configuration with `environment: 'node'`, `include: ['src/__tests__/integration/**/*.integration.test.ts']`, path alias `@` mapping to `./src`, and env loading.

#### 2. Unit Vitest Configuration Isolation

**File**: `vitest.config.ts`

**Intent**: Exclude integration test files from the standard unit test run so `npm test` runs fast, mocked tests only and passes cleanly in CI without a live database.

**Contract**: Update `exclude` array to include `'**/*.integration.test.ts'` and `'src/__tests__/integration/**'`.

#### 3. Package Script Wiring

**File**: `package.json`

**Intent**: Expose the integration test command to developers and check scripts.

**Contract**: Add `"test:integration": "vitest run --config vitest.integration.config.ts"` to `scripts`.

#### 4. Database Integration Test Helper

**File**: `src/__tests__/integration/test-db-helper.ts`

**Intent**: Provide reusable helper functions for integration tests to create isolated test dashboards with participants and clean them up after execution.

**Contract**: Export `createIntegrationTestDashboard()` and `cleanupIntegrationTestDashboard(dashboardId: string)`.

### Success Criteria:

#### Automated Verification:

- Unit test suite continues to pass without running integration tests: `npm test`
- Integration test config is recognized: `npx vitest --config vitest.integration.config.ts --run` (finds 0 tests or passes empty suite)
- TypeScript check passes: `npm run check:type`
- Lint passes: `npm run lint`

#### Manual Verification:

- Verify `npm test` does not require `SUPABASE_URL` to be present.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Database RPC & Optimistic Concurrency Integration Suite

### Overview

Implement the database-level integration test in `src/__tests__/integration/note-concurrency.integration.test.ts` to directly stress the `update_note_with_version` RPC and PostgreSQL concurrency controls under simultaneous update races using `Promise.allSettled`.

### Changes Required:

#### 1. Note Concurrency Integration Test

**File**: `src/__tests__/integration/note-concurrency.integration.test.ts`

**Intent**: Test live PostgreSQL row-level locks, transaction rollback, and version increments when concurrent updates collide on the same note.

**Contract**:

- Suite: `Note Versioning & Concurrency Integrity Integration`
- Test 1 (Sequential Updates): Create note (v1), update to v2, update to v3; assert sequential version incrementing and snapshot persistence in `note_versions`.
- Test 2 (Concurrent Update Race): Create note (v1); trigger two simultaneous updates with `expected_version: 1` via `Promise.allSettled`; assert exactly one succeeds and one fails with `"Version mismatch or note not found"`; assert `notes.version === 2`; assert `note_versions` has exactly 2 contiguous rows `[1, 2]`; assert losing draft was rolled back completely.
- Test 3 (Stale Version Rejection): Attempt update with `expected_version: 1` on a v2 note; assert rejection without modifying note or adding version snapshot.
- Test 4 (Post-Conflict Recovery Update): Issue update with `expected_version: 2`; assert success advancing note to v3.

### Success Criteria:

#### Automated Verification:

- Integration test suite passes against local Supabase: `npm run test:integration`
- Race test asserts exactly 1 fulfilled and 1 rejected result under `Promise.allSettled`
- Database assertions confirm `notes.version === 2` and `note_versions` length is 2 with sorted versions `[1, 2]`
- Unit test suite remains green: `npm test`
- Type checking passes: `npm run check:type`

#### Manual Verification:

- Inspect Supabase PostgreSQL database to confirm no orphaned `note_versions` rows or broken sequences exist after test execution.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Playwright Dual-Context Multi-User Concurrency E2E Spec

### Overview

Extend Playwright test fixtures to support creating multi-participant workspaces in the dashboard wizard, and implement `e2e/note-concurrency.spec.ts` using two isolated browser contexts (Alice and Bob) to test real-world concurrent editing, warning alert rendering, draft preservation, and reload recovery.

### Changes Required:

#### 1. Multi-Participant E2E Fixture Support

**File**: `e2e/fixtures/test-base.ts`

**Intent**: Extend `createTestDashboard` options to support adding additional participants during wizard creation and returning their credentials.

**Contract**:

- Add `additionalParticipants?: { alias: string; password?: string }[]` to `CreateTestDashboardOptions`.
- In `createTestDashboard`, click `#add-participant-btn`, fill alias and password for each additional participant, and collect credentials from `#shareable-url-input` and credential cards.
- Add `participants: { alias: string; password: string }[]` to `TestDashboardInfo`.

#### 2. Multi-User Note Concurrency Spec

**File**: `e2e/note-concurrency.spec.ts`

**Intent**: Verify that when two distinct users concurrently edit the same note, the second save is rejected with a warning alert, the user's unsaved draft is not destroyed, and clicking Reload refreshes the editor with the latest server state.

**Contract**:

- Create dashboard with Alice and Bob.
- Context A (Alice): Log in, create note (v1), navigate to note editor.
- Context B (Bob via `browser.newContext()`): Log in, navigate to note editor.
- Alice edits content to `"Alice version 2"` and saves; assert `"v2"` badge appears.
- Bob edits content to `"Bob conflicting draft"` and clicks `"Save note"`.
- Assert Bob receives warning `Alert`: `"This note has been modified by someone else. Please reload and try again."`.
- Assert Bob's textarea still contains `"Bob conflicting draft"` (draft preservation before user reload).
- Bob clicks `"Reload"` button inside the warning alert.
- Assert Bob's editor refreshes via `router.refresh()`: version displays `"v2"` and content contains `"Alice version 2"`.
- Bob edits content to `"Bob follow-up version 3"` and clicks `"Save note"`.
- Assert save succeeds and version displays `"v3"`.

### Success Criteria:

#### Automated Verification:

- Playwright concurrency test passes in Chromium: `npx playwright test e2e/note-concurrency.spec.ts --project=chromium`
- Playwright concurrency test passes in Firefox: `npx playwright test e2e/note-concurrency.spec.ts --project=firefox`
- Full E2E suite passes: `npm run test:e2e`
- Unit tests remain green with >= 80% coverage: `npm test`
- Type checking passes: `npm run check:type`
- Lint passes: `npm run lint`

#### Manual Verification:

- Run interactive UI mode (`npm run test:e2e:ui`) to visually observe the conflict banner rendering and reload transition.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Quality Gate Verification & Test Plan Documentation

### Overview

Execute the complete verification matrix across all project quality gates, update the Test Plan (`context/foundation/test-plan.md`) with the Phase 3 delivery status and cookbook recipe for multi-user concurrency testing, and update the change tracking metadata.

### Changes Required:

#### 1. Test Plan Documentation Update

**File**: `context/foundation/test-plan.md`

**Intent**: Update §3 Phased Rollout table, fill in §6.5 Cookbook with the concurrency test pattern, and record verification in §8 Freshness Ledger.

**Contract**:

- Update §3 Phase 3 row: Change folder `context/changes/testing-note-versioning-and-concurrency-integrity/`.
- Fill §6.5 with guidelines on writing database integration tests with `Promise.allSettled` and Playwright dual-context specs.
- Update §8 Freshness Ledger with current date.

#### 2. Change Tracking Update

**File**: `context/changes/testing-note-versioning-and-concurrency-integrity/change.md`

**Intent**: Update change status to `planned` and record implementation notes.

**Contract**: Frontmatter `status: planned`, `updated: 2026-09-12`.

### Success Criteria:

#### Automated Verification:

- Full quality check command succeeds: `npm run check:ready` (or equivalent chain: lint, check:type, test, test:e2e, build:worker)
- Integration test suite passes: `npm run test:integration`
- All unit, integration, and E2E tests pass with zero failures.

#### Manual Verification:

- Review `context/foundation/test-plan.md` to confirm documentation is clear and accurate.

---

## Phase 5: E2E Test Note Cleanup

### Overview

Add automatic cleanup of notes created by E2E test runs so that repeated executions do not leave orphaned artifacts titled `"Initial E2E Note <number>"` (from `e2e/golden-path.spec.ts`), `"Seed Note <number>"` (from `e2e/seed.spec.ts`), and `"Lifecycle Deletion Note <number>"` (from `e2e/note-lifecycle.spec.ts`) bloating the local database and test dashboards. The cleanup runs once after the full Playwright suite completes, mirroring the existing `clearRateLimits()` service-role pattern in `e2e/fixtures/test-base.ts:36-47`.

### Changes Required:

#### 1. E2E Note Cleanup Helper

**File**: `e2e/fixtures/test-base.ts`

**Intent**: Provide a reusable service-role cleanup helper that deletes E2E-generated notes (and their cascade-removed `note_versions` snapshots, per `ON DELETE CASCADE` in `supabase/migrations/20260819000000_create_dashboard_schema.sql:62`) without touching production data.

**Contract**:

- Export `cleanupE2ENotes(): Promise<void>` following the `clearRateLimits()` pattern:
  - Read `process.env.SUPABASE_URL` and `process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY`; return without action when either is missing (mock/offline runs).
  - Create a `@supabase/supabase-js` client (service role bypasses RLS enabled on `public.notes`).
  - Delete rows from `notes` where `title` matches the E2E note title patterns: `like('title', 'Initial E2E Note %')`, `like('title', 'Seed Note %')`, and `like('title', 'Lifecycle Deletion Note %')` (delete call must OR these conditions so one pass removes all three).
  - Wrap in `try/catch` and ignore failures in mock or offline runs, same as `clearRateLimits()`.

#### 2. Global Teardown Wiring

**File**: `playwright.config.ts` + `e2e/global-teardown.ts`

**Intent**: Run the note cleanup exactly once after the entire Playwright suite (all projects) finishes, so cleanup works for both `npm run test:e2e` and single-project runs like `npx playwright test e2e/note-concurrency.spec.ts --project=chromium`.

**Contract**:

- Add `e2e/global-teardown.ts` exporting a default async function that calls `cleanupE2ENotes()`.
- Register `globalTeardown: './e2e/global-teardown.ts'` in `playwright.config.ts` (env is already loaded at config level via `process.loadEnvFile('.env.local')`, so teardown sees `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`).

### Success Criteria:

#### Automated Verification:

- Playwright suite completes and teardown executes without errors: `npm run test:e2e`
- No notes matching the cleanup patterns remain in the database after a run: query `notes` via Supabase client and assert zero rows with titles like `Initial E2E Note %`, `Seed Note %`, or `Lifecycle Deletion Note %`
- Type checking passes: `npm run check:type`
- Lint passes: `npm run lint`
- Unit test suite remains green with >= 80% coverage: `npm test`

#### Manual Verification:

- Inspect the local Supabase dashboard after `npm run test:e2e` and confirm the E2E workspaces contain no leftover E2E notes (only notes created interactively by a human, if any).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Existing unit tests in `src/__tests__/actions/notes.test.ts` and `src/__tests__/lib/supabase.test.ts` continue to verify mocked error mapping and Zod validation schemas.
- Vitest coverage remains >= 80% across statements, branches, functions, and lines.

### Integration Tests:

- `src/__tests__/integration/note-concurrency.integration.test.ts`:
  - Sequential version advancement ($v1 \rightarrow v2 \rightarrow v3$).
  - Simultaneous race condition on expected version 1 with `Promise.allSettled`.
  - Stale version rejection.
  - Recovery update on latest version.

### Manual Testing Steps:

1. Start local Supabase and Next.js dev server.
2. Run `npm run test:integration` and inspect terminal output for clean transaction rollback assertions.
3. Run `npx playwright test e2e/note-concurrency.spec.ts --ui` to step through the dual-context browser race.
4. Verify that neither test leaves dangling database rows that affect subsequent test runs.

## Performance Considerations

- The integration test executes directly against PostgreSQL RPCs via `@supabase/supabase-js`, completing the entire race assertion in <100ms without browser overhead.
- Dual browser contexts in Playwright add ~2-3 seconds per run. Running `workers: 1` prevents database connection pool exhaustion and rate limit throttling.

## Migration Notes

- No database schema migrations or production runtime code changes are required.
- Integration tests are isolated from CI unit tests to guarantee zero impact on existing GitHub Actions pipelines.

## References

- Research Document: `context/changes/testing-note-versioning-and-concurrency-integrity/research.md`
- Test Plan: `context/foundation/test-plan.md`
- Schema & RPC Migrations:
  - `supabase/migrations/20260819000000_create_dashboard_schema.sql`
  - `supabase/migrations/20260820000000_create_dashboard_rpcs.sql`
- Server Action: `src/actions/notes.ts:162-268`
- UI Component: `src/app/dashboard/[hash]/note/[noteId]/components/NoteEditor.tsx:107-128,194-213`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Integration Test Harness & Config Setup

#### Automated

- [x] 1.1 Unit test suite continues to pass without running integration tests: `npm test` — b2577f7
- [x] 1.2 Integration test config is recognized: `npx vitest --config vitest.integration.config.ts --run` — b2577f7
- [x] 1.3 TypeScript check passes: `npm run check:type` — b2577f7
- [x] 1.4 Lint passes: `npm run lint` — b2577f7

#### Manual

- [x] 1.5 Verify `npm test` does not require `SUPABASE_URL` to be present

### Phase 2: Database RPC & Optimistic Concurrency Integration Suite

#### Automated

- [x] 2.1 Integration test suite passes against local Supabase: `npm run test:integration`
- [x] 2.2 Race test asserts exactly 1 fulfilled and 1 rejected result under `Promise.allSettled`
- [x] 2.3 Database assertions confirm `notes.version === 2` and `note_versions` length is 2 with sorted versions `[1, 2]`
- [x] 2.4 Unit test suite remains green: `npm test`
- [x] 2.5 Type checking passes: `npm run check:type`

#### Manual

- [x] 2.6 Inspect Supabase PostgreSQL database to confirm no orphaned `note_versions` rows or broken sequences exist after test execution

### Phase 3: Playwright Dual-Context Multi-User Concurrency E2E Spec

#### Automated

- [ ] 3.1 Playwright concurrency test passes in Chromium: `npx playwright test e2e/note-concurrency.spec.ts --project=chromium`
- [ ] 3.2 Playwright concurrency test passes in Firefox: `npx playwright test e2e/note-concurrency.spec.ts --project=firefox`
- [ ] 3.3 Full E2E suite passes: `npm run test:e2e`
- [ ] 3.4 Unit tests remain green with >= 80% coverage: `npm test`
- [ ] 3.5 Type checking passes: `npm run check:type`
- [ ] 3.6 Lint passes: `npm run lint`

#### Manual

- [ ] 3.7 Run interactive UI mode (`npm run test:e2e:ui`) to visually observe the conflict banner rendering and reload transition

### Phase 4: Quality Gate Verification & Test Plan Documentation

#### Automated

- [ ] 4.1 Full quality check command succeeds: `npm run check:ready`
- [ ] 4.2 Integration test suite passes: `npm run test:integration`
- [ ] 4.3 All unit, integration, and E2E tests pass with zero failures

#### Manual

- [ ] 4.4 Review `context/foundation/test-plan.md` to confirm documentation is clear and accurate

### Phase 5: E2E Test Note Cleanup

#### Automated

- [ ] 5.1 Playwright suite completes and teardown executes without errors: `npm run test:e2e`
- [ ] 5.2 No notes matching the cleanup patterns remain in the database after a run (zero rows for `Initial E2E Note %`, `Seed Note %`, `Lifecycle Deletion Note %`)
- [ ] 5.3 Type checking passes: `npm run check:type`
- [ ] 5.4 Lint passes: `npm run lint`
- [ ] 5.5 Unit test suite remains green with >= 80% coverage: `npm test`

#### Manual

- [ ] 5.6 Inspect the local Supabase dashboard after `npm run test:e2e` and confirm the E2E workspaces contain no leftover E2E notes
