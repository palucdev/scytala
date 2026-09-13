# Note Versioning & Concurrency Integrity — Plan Brief

> Full plan: `context/changes/testing-note-versioning-and-concurrency-integrity/plan.md`
> Research: `context/changes/testing-note-versioning-and-concurrency-integrity/research.md`

## What & Why

Implement dual-layer integration and end-to-end concurrency verification to prove that Scytala's PostgreSQL row-level locks, PL/pgSQL atomic RPC transactions (`update_note_with_version`), and UI conflict recovery mechanisms defend against concurrent note mutation overwrites and silent version history loss (Risk #3 & #7, Roadmap T-02).

## Starting Point

Scytala enforces optimistic locking at the database boundary via `update_note_with_version` RPC and catches version mismatches in `updateNoteAction` to display a warning alert in `NoteEditor.tsx`. However, all existing tests rely on mocked database errors; neither PostgreSQL transaction rollback nor multi-tab browser conflict recovery has been verified against live concurrent execution.

## Desired End State

- An automated database integration test (`npm run test:integration`) that races two updates on `expected_version: 1` using `Promise.allSettled`, verifying that exactly one commits to version 2, the loser rolls back cleanly, and `note_versions` retains contiguous sequence `[1, 2]`.
- A Playwright E2E spec (`e2e/note-concurrency.spec.ts`) using dual browser contexts for Alice and Bob, verifying that Bob's conflicting save displays a warning banner, preserves his typed draft in the editor, and refreshes to Alice's v2 content upon clicking "Reload".

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Test Runner Strategy | Dedicated `npm run test:integration` with `vitest.integration.config.ts` | Keeps standard `npm test` fast and mocked for CI while providing explicit DB integration runs. | Plan |
| Database Race Simulation | Parallel `Promise.allSettled` on identical `expected_version: 1` | Directly tests in-flight PostgreSQL row locking and atomic transactional rollback. | Plan |
| Multi-User Browser Session | Dual `BrowserContext` instances (Alice & Bob) | Prevents cookie collisions since `scytala_session_${hash}` is shared within a single context. | Plan |
| Conflict UX Assertion | Alert banner + draft preserved in textarea + Reload CTA revalidation | Validates full conflict recovery lifecycle without losing uncommitted user thoughts. | Plan |
| Scope Boundary | No visual diff merging (reserved for `S-05`) | Keeps scope strictly focused on concurrency integrity and current MVP recovery flow. | Research |

## Scope

**In scope:**
- Integration test config `vitest.integration.config.ts` and `npm run test:integration` script.
- `src/__tests__/integration/note-concurrency.integration.test.ts` testing live PostgreSQL RPC race conditions.
- Test fixture extension in `e2e/fixtures/test-base.ts` supporting multi-participant dashboard creation.
- Multi-user Playwright E2E test `e2e/note-concurrency.spec.ts`.
- Updates to `context/foundation/test-plan.md` (§3 Phase 3 & §6.5 Cookbook).

**Out of scope:**
- Visual 3-way character-level diff merging dialogs (deferred to slice `S-05`).
- Modifying production database schema or RPC definitions.
- Running headless browser or DB integration tests in GitHub Actions CI.

## Architecture / Approach

```
[ Alice (Context A) ] ──> Save Note (v1 -> v2) ──> [ Next.js Server Action ] ──> [ PostgreSQL RPC ] ──> Commit v2
                                                                                     │
[ Bob   (Context B) ] ──> Save Note (v1 -> v2) ──> [ Next.js Server Action ] ──> [ Row Lock Failed ] ──> Rollback
                                    ▲                                                │
                                    └── Warning Alert & Unsaved Text ◄───────────────┘
                                    │
                                    └── Click "Reload" ──> router.refresh() ──> Mount fresh v2
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Integration Test Harness & Config | `vitest.integration.config.ts` and `npm run test:integration` | Misconfiguration causing CI `npm test` to fail without Supabase |
| 2. Database Concurrency Integration Suite | `note-concurrency.integration.test.ts` with `Promise.allSettled` race | Non-deterministic race behavior or test database data pollution |
| 3. Playwright Dual-Context E2E Spec | `e2e/note-concurrency.spec.ts` testing Alice & Bob conflict flow | Cookie collisions across users or brittle timing during reload |
| 4. Quality Gate Verification & Docs | Full suite verification & `test-plan.md` cookbook patterns | Regressions in existing unit test coverage thresholds (80% floor) |

**Prerequisites:** Running local Supabase instance (`.env.local` / `.env.ai`).  
**Estimated effort:** ~1 implementation session across 4 phases.

## Open Risks & Assumptions

- Assumes local Supabase instance is running on port 54321 / 54322 during developer test runs.
- Assumes Playwright `workers: 1` will execute the dual-context test without hitting rate limits on local auth endpoints.

## Success Criteria (Summary)

- `npm run test:integration` passes, confirming atomic rollback and version sequencing under concurrent database mutations.
- `npm run test:e2e` passes in Chromium and Firefox, confirming the warning alert and reload recovery work in real browsers.
- `npm test`, `npm run check:type`, and `npm run lint` remain 100% green.
