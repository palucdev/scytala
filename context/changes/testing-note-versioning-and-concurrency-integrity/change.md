---
change_id: testing-note-versioning-and-concurrency-integrity
title: Note Versioning & Concurrency Integrity
status: impl_reviewed
created: 2026-09-12
updated: 2026-09-13
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 / Roadmap T-02: "Note Versioning & Concurrency Integrity" (Risk #3 & #7 in context/foundation/test-plan.md).
Defend atomic note updates, immutable version history snapshots, and conflict detection under concurrent mutations.

## Implementation Notes

- Phase 1 shipped the isolated integration harness: `vitest.integration.config.ts` (node env, `.env.local`/`.env.ai` loading), exclusion of `*.integration.test.ts` from `vitest.config.ts`, `npm run test:integration` script, and `src/__tests__/integration/test-db-helper.ts` seeding/cleanup helpers.
- Phase 2 shipped `src/__tests__/integration/note-concurrency.integration.test.ts` verifying sequential version advancement, `Promise.allSettled` race (exactly 1 fulfilled / 1 rejected), stale-version rejection, and post-conflict recovery against the live `update_note_with_version` RPC.
- Phase 3 shipped multi-participant support in `e2e/fixtures/test-base.ts` (`additionalParticipants`) and the dual-context spec `e2e/note-concurrency.spec.ts` covering conflict alert, draft preservation, reload recovery, and v3 follow-up save.
- Phase 4 records full quality-gate verification (`check:ready`, `test:integration`) and fills the test-plan cookbook (§6.5).
- Phase 5 shipped E2E note cleanup: `cleanupE2ENotes()` service-role helper in `e2e/fixtures/test-base.ts` (OR-matched title patterns `Initial E2E Note %`, `Seed Note %`, `Lifecycle Deletion Note %`), `e2e/global-teardown.ts` running it once after the full Playwright suite, and `globalTeardown` registration in `playwright.config.ts`.
- Follow-up (2026-09-13): E2E rate-limit cooldown removed. The in-memory `sessionVerifyIp`/`authIp` sliding windows (60 req/60s, keyed on IP) live in the dev-server process and see every test as `127.0.0.1`, so all tests drained one shared bucket and each run previously paid a 65s sleep (`_rateLimitCooldown` fixture + a `rate-limit-cooldown` setup project between chromium → firefox), making the suite 13+ min. Replacement: auto fixture `_rateLimitIpIsolation` in `e2e/fixtures/test-base.ts` assigns a unique synthetic IP per test (`10.240.x.y` via `nextTestIp()`) and rewrites `x-forwarded-for` on all outgoing requests through `context.route()`, giving each test a private rate-limit bucket. No production code changes; safe in prod because Cloudflare's `cf-connecting-ip` takes precedence over client-supplied `x-forwarded-for`. `cooldown.setup.ts` deleted, `playwright.config.ts` projects reduced to `chromium` + `firefox` with no dependency chain. Verified: 12 passed in ~1.3 min (was 13+ min), `check:type` and lint clean. DB-backed limiters (`authAccount`, `dashboardCreate`, `noteMutation`) still reset per test via `_rateLimitReset` / `clearRateLimits()`.
