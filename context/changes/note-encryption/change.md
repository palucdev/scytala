---
change_id: note-encryption
title: Note encryption at rest (title + content)
status: impl_reviewed
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- Phase 3 (2026-09-13): E2E note cleanup contract overridden during implementation — delete-all `.neq("id", "")` was rejected in favor of a run-scoped registry (`registerCreatedDashboard` + dashboard-hash set) so pre-existing local notes are preserved. Plan Phase 3 step 1 contract updated to match.
- Phase 3 (2026-09-13), cleanup hardening after verification: (1) golden-path spec drives the wizard manually — added a per-test route-hook registration from `/dashboard/<hash>` URLs; (2) Playwright teardown runs in a separate process from test workers, so the registry mirrors to an NDJSON file (`test-results/e2e-created-dashboards.jsonl`); (3) `isLocalSupabaseUrl` now accepts `host.docker.internal` — the local-only guard had silently disabled cleanup for the Docker `.env.ai` URL. Verified: full suite run leaves 0 new notes, pre-existing dashboards untouched; stale leftovers from the broken runs were swept once through the same dashboard_id-scoped mechanism.
- Full impl review (2026-09-13, `reviews/impl-review-full.md`): package version bump 0.4.2 → 0.5.0 riding along with this change is intentional (release bump), documented here since no plan step covers it.
