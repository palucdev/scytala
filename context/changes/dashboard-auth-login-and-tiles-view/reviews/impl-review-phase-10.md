<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Dashboard Auth Login and Tiles View (`S-02`)

- **Plan**: context/changes/dashboard-auth-login-and-tiles-view/plan.md
- **Scope**: Phase 10 of 10 (Session Hardening & RSC Boundary Defense)
- **Date**: 2026-08-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS ✅ (Drift resolved in F1) |
| Scope Discipline | PASS ✅ |
| Safety & Quality | PASS ✅ |
| Architecture | PASS ✅ |
| Pattern Consistency | PASS ✅ |
| Success Criteria | PASS ✅ (267 tests passed, 97.4% coverage, linting clean) |

## Findings

### F1 — Soft navigation vs. hard navigation on logout (Plan Drift)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/app/dashboard/[hash]/components/LogoutButton.tsx:32-38`
- **Detail**: Phase 10 plan explicitly called for hard client navigation (`window.location.replace` or `window.location.href`) post-logout to purge Next.js Router Cache and prevent sensitive note exposure in the browser's back-forward cache (bfcache) on shared devices. The implementation in `LogoutButton.tsx` currently invokes `router.refresh()` / `router.push(redirectTo)`.
- **Fix A ⭐ Recommended**: Replace `router.refresh()` and `router.push()` with `window.location.replace(redirectTo || window.location.pathname)` or `window.location.href = redirectTo || window.location.pathname`.
  - Strength: Eliminates bfcache / client-side router cache retention of authenticated note tiles, strictly fulfilling the plan's security requirement.
  - Tradeoff: Triggers a full page reload on logout rather than client-side soft transition (which is the intended security behavior).
  - Confidence: HIGH — standard security pattern for authenticated portal sign-out.
  - Blind spot: Unit tests for `LogoutButton` need updating to assert `window.location` manipulation rather than `router.refresh`.
- **Fix B**: Retain `router.refresh()` / `router.push()` and update the plan documentation to accept soft client navigation.
  - Strength: Preserves smooth client-side transition without full browser reload.
  - Tradeoff: In-memory React Flight cache and bfcache may retain rendered note cards if the browser back button is used on a shared computer.
  - Confidence: MEDIUM — acceptable if bfcache threat model is deemed non-critical.
  - Blind spot: Does not fully address bfcache risk on shared workstations.
- **Decision**: FIXED (Fix A — hard window.location.replace with interruption guard)

### F2 — Defense-in-depth cookie clearance attributes for `__Host-` cookies

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/actions/auth.ts:143-149`
- **Detail**: `logoutFromDashboardAction` clears session cookies using Next.js `cookieStore.delete(...)`. While standard, RFC 6265bis specifies `__Host-` cookies require `Secure; Path=/` on all directives. Some browser engines in HTTPS-only contexts benefit from explicit Set-Cookie expiration options (`maxAge: 0`, `secure: true`, `path: "/"`).
- **Decision**: FIXED (Explicit Set-Cookie clearance attributes applied)

### F3 — Defensive null guard in DTO note mapper

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/app/dashboard/[hash]/page.tsx:35-48`
- **Detail**: `mapNotesToDto` does `[...notes].sort(...)`. While `db.getNotesByDashboard` guarantees an array, adding a fallback default `notes: Note[] = []` defends against potential runtime `TypeError` if `notes` is ever passed as `null` or `undefined` by a future caller.
- **Decision**: FIXED (Defensive null guard and default argument applied)
