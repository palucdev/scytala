<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Fix Dashboard Logout Functionality

- **Plan**: `context/changes/fix-dashboard-logout/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-28
- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 0 observations (3 triaged & fixed)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding
Grounding: 7/7 paths ✓, 5/5 symbols ✓, brief↔plan ✓

## Findings

### F1 — Client Logout Navigation Mechanism (window.location.replace vs Route Handler Redirect)

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 3 (`LogoutButton.tsx`) & "What We're NOT Doing"
- **Detail**: Synchronously invoking `window.location.replace` while Next.js Server Action machinery is reconciling the client React tree causes aborted render cancellations that trigger `src/app/error.tsx`. Soft navigation alone also fails to purge confidential dashboard payloads from the Router Cache.
- **Fix ⭐ Recommended**: Introduce a dedicated `POST /api/auth/logout` Route Handler returning HTTP 303 redirect with a semantic HTML form submission in `LogoutButton.tsx`. This enables native browser navigation with zero React collision and complete memory/cache purge.
- **Decision**: FIXED (via dedicated Route Handler POST /api/auth/logout with HTTP 303 redirect)

### F2 — Malformed Progress Section Contract

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: `## Progress` section
- **Detail**: The `## Progress` section lacked `### Phase N` headings and `#### Automated` subsections with `- [ ] N.M` step numbers, violating the mechanical contract required for automated plan execution.
- **Fix**: Reformat `## Progress` to strictly adhere to `references/progress-format.md`.
- **Decision**: FIXED (reformatted with mechanical contract)

### F3 — Inconsistent Cookie Options in loginToDashboardAction

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — `src/actions/auth.ts`
- **Detail**: Hardcoded cookie options in `loginToDashboardAction` risked drifting from `getDeleteSessionCookieOptions()`.
- **Fix**: Update `loginToDashboardAction` to use `getSessionCookieOptions(DEFAULT_SESSION_TTL_SECONDS)`.
- **Decision**: FIXED (added to Phase 2)
