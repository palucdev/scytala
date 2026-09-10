<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Dashboard Data Schema and Auth Scaffold

- **Plan**: context/changes/dashboard-data-schema-and-auth-scaffold/plan.md
- **Scope**: Phase 4 of 5
- **Date**: 2026-08-20
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Supabase client initialized without disabling session persistence and auto-refresh for stateless edge runtime

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase.ts:40
- **Detail**: `createClient(SUPABASE_URL, SUPABASE_KEY)` is initialized without disabling session persistence and auto token refresh. In stateless Edge environments (Cloudflare Workers / OpenNext), `@supabase/supabase-js` default client settings attempt to manage session state in memory or schedule background token refresh intervals. Background timers cannot outlive request contexts in V8 isolates and may trigger isolate warnings or memory retention. Supabase official server guidance explicitly mandates passing `auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }` for server and edge clients.
- **Fix**: Pass explicit auth configuration options in the client factory:
  ```ts
  this.client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  ```
- **Decision**: FIXED (Configured stateless auth options persistSession: false, autoRefreshToken: false, detectSessionInUrl: false on createClient)

### F2 — Multi-step entity creation without transactional atomicity or compensating cleanup

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase.ts:160
- **Detail**: Multi-step operations (`createDashboard` inserting dashboard then users; `createNote` inserting note then version snapshot; `updateNote` updating note then version snapshot) issue sequential PostgREST HTTP calls. If step 2 fails (e.g. constraint error or network disconnect), partial state remains (e.g. an empty orphaned dashboard or a note without a version history row).
- **Fix A ⭐ Recommended**: Add defensive compensating cleanup in application layer (e.g. deleting orphaned dashboard in `createDashboard` if user creation fails) and document PostgreSQL RPC/trigger migration for Phase/Slice S-01.
  - Strength: Protects against partial state immediately in application layer without modifying existing SQL schema migrations.
  - Tradeoff: Compensating delete is best-effort (network crash during compensating delete could still leave partial row).
  - Confidence: HIGH — standard application-level saga pattern for REST APIs.
  - Blind spot: None significant.
- **Fix B**: Introduce PostgreSQL database triggers/RPC functions (`create_dashboard_with_users`, `insert_note_version_trigger`) in an SQL migration.
  - Strength: True ACID transaction atomicity inside PostgreSQL engine.
  - Tradeoff: Requires schema changes and Supabase RPC wiring in downstream slice.
  - Confidence: MEDIUM — architectural change exceeding Phase 4 scope.
  - Blind spot: Increases migration complexity for foundational scaffold.
- **Decision**: FIXED (Fixed via Fix B: Created atomic PostgreSQL RPC migration 20260820000000_create_dashboard_rpcs.sql and wired supabase.rpc calls in adapter)

### F3 — `createDashboard` returns `password_hash` in users array while `listDashboardUsers` strips it

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/client/db-client.ts:143
- **Detail**: In `createDashboard`, the returned `users: DashboardUser[]` contains `password_hash` from the inserted database rows. Downstream callers (e.g. Server Actions) might inadvertently serialize the returned object to the client. In contrast, `listDashboardUsers` returns `Omit<DashboardUser, "password_hash">[]`.
- **Fix**: Update `createDashboard` return type and implementation to return `users: Omit<DashboardUser, "password_hash">[]` by omitting `password_hash` from returned participant objects.
- **Decision**: FIXED (Updated createDashboard return type and RPC implementation to omit password_hash)
