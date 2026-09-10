<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Dashboard Data Schema and Auth Scaffold

- **Plan**: `context/changes/dashboard-data-schema-and-auth-scaffold/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-19
- **Verdict**: REVISE
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding
Grounding: 6/6 paths ✓, 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — SUPABASE_SERVICE_ROLE_KEY fallback in adapter constructor

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 4 — Domain Type Definitions & Database Client Port/Adapter Extension
- **Detail**: Phase 1 enables strict RLS denying direct anon access and granting permissions only to `service_role`. In "Key Discoveries", the plan notes that server operations require `SUPABASE_SERVICE_ROLE_KEY`. However, the `SupabaseDatabaseClient` constructor currently only reads `process.env.SUPABASE_KEY`. Phase 4 does not explicitly specify updating the constructor to prioritize `SUPABASE_SERVICE_ROLE_KEY`, which would cause operations against a live Supabase instance enforcing strict RLS to be denied if `SUPABASE_KEY` is an anon key.
- **Fix**: Update `SupabaseDatabaseClient` constructor in Phase 4 to read `const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;`.
  - Strength: Seamless compatibility with strict RLS and local dev fallback.
  - Tradeoff: None.
  - Confidence: HIGH — standard Supabase pattern for server-side Next.js clients.
  - Blind spot: None significant.
- **Decision**: FIXED (added SUPABASE_SERVICE_ROLE_KEY handling to Phase 4 adapter constructor)

### F2 — Session cookie helper lacks Next.js Server Action options

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 3 — Edge Session Token & Cookie Utilities
- **Detail**: Phase 3 specifies `buildSessionCookieHeader` returning a raw `Set-Cookie` header string. Next.js 16 Server Actions (which Scytala uses across S-01, S-02) manage cookies via `(await cookies()).set(name, value, options)` from `next/headers`, not raw `Set-Cookie` header strings. Downstream Server Actions will have to re-parse or duplicate cookie options unless structured options are exported.
- **Fix**: Export `SESSION_COOKIE_NAME` and `getSessionCookieOptions(maxAge?: number)` in `src/lib/session.ts` alongside `buildSessionCookieHeader`.
  - Strength: Allows Server Actions and Route Handlers to share identical cookie attributes.
  - Tradeoff: Small addition to session module contract.
  - Confidence: HIGH — matches Next.js 16 App Router conventions.
  - Blind spot: None significant.
- **Decision**: PENDING

### F3 — Missing centralized getAuthSecret() helper

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 — Edge Session Token & Cookie Utilities
- **Detail**: The plan states auth signing will fall back to `SUPABASE_KEY` if `AUTH_SECRET` is omitted, but `createSessionToken` and `verifySessionToken` accept secret as a parameter. Without a shared `getAuthSecret()` utility, downstream callers will duplicate the fallback logic.
- **Fix**: Export `getAuthSecret(): string` helper from `src/lib/session.ts`.
- **Decision**: PENDING

### F4 — Text discrepancy in Phase 1 Success Criterion 1.2

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Database Migration & Schema Design
- **Detail**: Phase 1 body mentions "(when local Supabase is running) or passes SQL syntax linter", whereas Progress 1.2 omits the parenthetical note.
- **Fix**: Align Phase 1 body bullet with Progress 1.2 wording.
- **Decision**: PENDING
