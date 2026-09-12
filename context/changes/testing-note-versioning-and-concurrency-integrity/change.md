---
change_id: testing-note-versioning-and-concurrency-integrity
title: Note Versioning & Concurrency Integrity
status: implementing
created: 2026-09-12
updated: 2026-09-12
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
