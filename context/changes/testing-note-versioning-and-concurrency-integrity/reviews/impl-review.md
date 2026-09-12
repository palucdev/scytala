<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Note Versioning & Concurrency Integrity

- **Plan**: context/changes/testing-note-versioning-and-concurrency-integrity/plan.md
- **Scope**: All 5 phases of 5
- **Date**: 2026-09-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Service-role teardown delete not gated to local env

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: e2e/fixtures/test-base.ts:56-72
- **Detail**: cleanupE2ENotes() runs a service-role delete on `notes` filtered only by title patterns whenever SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set. No guard prevents mass-deleting rows across ALL dashboards if pointed at a non-local database. 'Seed Note %' is a user-plausible title.
- **Fix**: Add a hard gate in cleanupE2ENotes() — refuse to run unless the Supabase URL is localhost/127.0.0.1.
  - Strength: Keeps the clearRateLimits() pattern intact while eliminating the production blast radius entirely.
  - Tradeoff: If anyone ever legitimately runs E2E against a remote staging DB, cleanup silently skips there.
  - Confidence: HIGH — AGENTS.md documents E2E as local-only.
  - Blind spot: None significant.
- **Decision**: FIXED — added `isLocalSupabaseUrl()` gate (localhost / 127.0.0.1 / ::1)

### F2 — PostgREST errors silently swallowed in cleanup

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: e2e/fixtures/test-base.ts:62-72
- **Detail**: supabase-js delete() resolves with `{ error }` rather than throwing, so the try/catch only catches client-construction failures. A real PostgREST error makes teardown "succeed" while E2E notes accumulate — contradicting plan criterion 5.2. Comment "Ignore in mock or offline runs" is inaccurate. Inherited from clearRateLimits() (pre-existing), but larger blast radius.
- **Fix**: Capture `{ error }` and `console.warn("cleanupE2ENotes failed:", error.message)` while keeping mock-run tolerance.
- **Decision**: FIXED — destructured `{ error }` and added console.warn

### F3 — Cleanup patterns omit "Concurrency Note %"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: e2e/fixtures/test-base.ts:65-67
- **Detail**: e2e/note-concurrency.spec.ts:17 creates notes titled `Concurrency Note ${timestamp}`, not in the `.or()` pattern list, so global teardown never deletes them — the new phase's own test output defeats the new phase's cleanup.
- **Fix**: Append `title.like.Concurrency Note %` to the `.or()` string.
- **Decision**: SKIPPED

### F4 — playwright.config.ts rewritten with CRLF line endings

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: playwright.config.ts (whole file)
- **Detail**: File converted LF→CRLF (45 CRLF lines at HEAD vs 0 at c174877^). Every other repo file is LF. Diff rewrites all 54 lines with no logical change, polluting blame and risking autocrlf churn on Linux CI. No .gitattributes exists in the repo.
- **Fix**: Normalize playwright.config.ts back to LF and add a .gitattributes with `* text=auto eol=lf`.
- **Decision**: FIXED — normalized to LF; added .gitattributes (`* text=auto eol=lf`)

### F5 — Bob's browser context leaks on assertion failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: e2e/note-concurrency.spec.ts:68-132
- **Detail**: `bobContext = await browser.newContext()` is closed at line 132 only on the happy path; any expect() failure mid-test skips close(), leaking a context+page for the rest of the run (contained by workers:1, but still noise/flake fuel).
- **Fix**: Wrap the Bob flow in try/finally that closes bobContext on failure.
- **Decision**: FIXED — try/finally wrapping Bob flow; bobContext.close() always runs

### F6 — Undocumented package.json extras (version bump, rolldown pins)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: package.json:4,56-60
- **Detail**: Version bump 0.4.1→0.4.2, exact-pinned @rolldown/binding-* 1.2.4 optionalDependencies, and the AGENTS.md test:integration line are not in the plan nor change.md. All benign; the rolldown pin is a latent breakage risk when vitest upgrades past it.
- **Fix**: Record the extras in change.md Notes (and note the rolldown pin's reason + review trigger).
- **Decision**: SKIPPED

### F7 — passWithNoTests masks broken integration include path

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: vitest.integration.config.ts:19
- **Detail**: `passWithNoTests: true` made Phase 1's empty-suite gate pass, but now that a test exists it could hide a silently broken include glob in CI (suite "passes" with 0 tests).
- **Fix**: Set passWithNoTests: false now that the suite is populated.
- **Decision**: FIXED — set to false; verified integration suite still runs 4/4 tests

## Post-Triage Verification

- `npm run check:type` — pass
- `npm run lint` — pass
- `npm test` — 549/549 passed, coverage 97.31% stmts / 91.84% branches (≥80% floor)
- `npm run test:integration` — 4/4 passed (post-F7 fix)
- `npm run test:e2e` — not re-runnable in this environment (local Supabase down, no Docker); plan records it as passing locally
