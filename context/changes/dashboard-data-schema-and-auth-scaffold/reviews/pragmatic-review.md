# Pragmatic Code Review: `feature/f-01` (Dashboard Data Schema and Auth Scaffold)

> **Change ID**: `dashboard-data-schema-and-auth-scaffold`  
> **Roadmap Slice**: `F-01`  
> **Target Branch**: `feature/f-01`  
> **Scope**: Database schema, PostgreSQL RPCs, Edge cryptographic utilities, signed JWT sessions, DatabaseClient port/adapter, and test suite.  
> **Review Date**: 2026-08-21  

---

## 1. Executive Summary

- **Overall Status**: ✅ **Appropriate & Well-Engineered** (High Pragmatism, Proportional Complexity)
- **Project Scale**: MVP / Early Stage (Solo developer, < 5 users per dashboard, 3-week timeline, serverless deployment on Cloudflare Workers + Supabase).
- **Core Verdict**: The implementation for `F-01` demonstrates strong architectural discipline and pragmatism. Instead of pulling in heavyweight external dependencies (`bcrypt`, `argon2`, `jsonwebtoken`, `jose`, or external auth services like Keycloak/GoTrue), it uses native Web Crypto API primitives (`crypto.subtle`) that execute with zero native binary dependencies and sub-millisecond latency on Cloudflare Workers (V8 isolates). Stored procedures (`RPCs`) are appropriately used to compensate for Supabase's lack of client-side multi-table transactions, ensuring atomic note versioning and optimistic concurrency control without introducing external queue/locking infrastructure.

### Findings Breakdown by Severity

| Severity | Count | Summary |
| :--- | :---: | :--- |
| **Critical** | 0 | No blocking over-engineering or architectural mismatch found |
| **High** | 0 | No high-risk complexity layers detected |
| **Medium** | 1 | `__Host-` cookie prefix behavior in non-HTTPS local preview builds |
| **Low** | 3 | Password generation sampling depth, legacy port coupling, RPC optional title handling |

---

## 2. Complexity Assessment vs Project Scale

| Dimension | Observed Architecture | Appropriateness for MVP | Rating |
| :--- | :--- | :--- | :---: |
| **Data Persistence** | PostgreSQL schema + 3 atomic RPC functions via Supabase client | Avoids complex ORMs (Prisma/TypeORM) while guaranteeing atomic version snapshots and cascade deletions. | ✅ Appropriate |
| **Authentication & Crypto** | Pure Web Crypto (`PBKDF2-SHA256`, 100k rounds) + stateless HMAC-SHA256 JWT | Avoids external auth servers or Node C++ native binary dependencies that fail in Edge isolates. | ✅ Appropriate |
| **Session Model** | Stateless 24h HttpOnly/Secure signed JWT cookies | Eliminates Redis/session database lookup latency on every request. | ✅ Appropriate |
| **Architecture Pattern** | Minimal Port & Adapter (`DatabaseClient` interface + `SupabaseDatabaseClient`) | Single interface file + single adapter file. Enables 100% mock testing without bloated multi-package enterprise abstractions. | ✅ Appropriate |
| **Dependency Footprint** | Zero added npm dependencies for crypto, auth, or session handling | Preserves tiny Cloudflare Worker bundle size and avoids dependency drift. | ✅ Appropriate |

---

## 3. Key Issues Found

### Issue 1: `__Host-` Cookie Security Prefix in Local HTTP Preview Builds
- **Severity**: Medium
- **Location**: [`src/lib/session.ts:10-13`](../../../../src/lib/session.ts#L10-L13)
- **Evidence**:
  ```ts
  export const SESSION_COOKIE_NAME =
    process.env.NODE_ENV === "production"
      ? "__Host-scytala_session"
      : "scytala_session";
  ```
- **Problem**: Per RFC 6265bis, modern browsers will reject `__Host-` cookies if served over plain HTTP without TLS. When developers test production builds locally (`NODE_ENV=production`) on `http://localhost:3000`, session cookies will be silently dropped by the browser.
- **Impact**: Developer confusion and non-obvious authentication failures during local production verification or CI staging preview runs.
- **Recommendation**: Document this requirement in deployment/setup docs, or add a development helper for testing preview builds over HTTPS or localhost bypass.

---

### Issue 2: Custom Rejection Sampling & Fisher-Yates Shuffle for Password Generation
- **Severity**: Low
- **Location**: [`src/lib/crypto.ts:200-251`](../../../../src/lib/crypto.ts#L200-L251)
- **Evidence**:
  ```ts
  function getUniformRandomInt(max: number): number { ... }
  export function generateRandomPassword(length: number = 16): string { ... }
  ```
- **Problem**: Implements a full rejection-sampling uniform random integer generator and a 4-character-class Fisher-Yates shuffle supporting passwords up to 1024 characters.
- **Impact**: Adds ~50 lines of code. While mathematically sound, fully covered by tests, and bug-free, a 15-line random string sampler is sufficient for a 16-character MVP dashboard password.
- **Recommendation**: Keep as-is since it is already implemented and verified with 100% test coverage, but avoid expanding custom random sampling infrastructure in future slices.

---

### Issue 3: Legacy Deployment Audit Methods Mixed into Domain Port Interface
- **Severity**: Low
- **Location**: [`src/client/db-client.ts:121-139`](../../../../src/client/db-client.ts#L121-L139), [`src/lib/supabase.ts:50-150`](../../../../src/lib/supabase.ts#L50-L150)
- **Evidence**:
  ```ts
  export interface DatabaseClient {
    recordDeploymentAudit(input: AuditInput): Promise<AuditResult>;
    getLastAuditRecord(): Promise<AuditRecord | null>;
    getAuditHistory(): Promise<AuditRecord[]>;
    // ... domain methods
  }
  ```
- **Problem**: The deployment audit logging methods for table `info` are colocated inside the main domain database client umbrella interface alongside `dashboards` and `notes`.
- **Impact**: Slight interface pollution. As subsequent feature slices (`S-01` through `S-06`) add further methods, the single interface will grow.
- **Recommendation**: Keep as-is for MVP simplicity (following the project's pragmatic port/adapter decision). If the interface grows beyond 20 methods post-MVP, consider segregating infrastructure audit methods from domain repository methods.

---

### Issue 4: Optional Title Semantics in `updateNote` RPC
- **Severity**: Low
- **Location**: [`src/lib/supabase.ts:327-333`](../../../../src/lib/supabase.ts#L327-L333), [`supabase/migrations/20260820000000_create_dashboard_rpcs.sql:102-119`](../../../../supabase/migrations/20260820000000_create_dashboard_rpcs.sql#L102-L119)
- **Evidence**:
  ```sql
  IF p_title IS NOT NULL THEN
      UPDATE public.notes SET title = p_title, content = p_content, ...
  ELSE
      UPDATE public.notes SET content = p_content, ...
  ```
- **Problem**: Passing `null` retains the existing title rather than setting it to empty. If a caller intends to explicitly clear a note's title, sending `null` will be treated as "do not update title".
- **Impact**: Minor semantic nuance. For notes where title is optional, callers should pass `""` to clear the title.
- **Recommendation**: Note this convention in the method docstring in [`src/client/db-client.ts`](../../../../src/client/db-client.ts).

---

## 4. Developer Experience (DX) Assessment

- **Fast Feedback Loop**: Unit tests execute in under 1 second across 98 test cases. Vitest v8 code coverage is 99.63% across statements, lines, functions, and branches.
- **Self-Contained Mocking**: The `SupabaseDatabaseClient` accepts an optional `customClient` in its constructor, allowing lightweight query builder mocks in [`src/__tests__/lib/supabase.test.ts`](../../../../src/__tests__/lib/supabase.test.ts) without spinning up Docker or local Supabase containers for CI unit tests.
- **Explicit Error Messages**: All database operations include formatted context tags (e.g. `[SupabaseDatabaseClient] getDashboardByHash failed: <message>`), making debugging on Cloudflare Workers logs straightforward.
- **No Complex Setup**: Developers only require standard Node.js and npm to run tests, lint, and build.

---

## 5. Requirements Alignment

| PRD / Roadmap Requirement | Status | Implementation Evidence |
| :--- | :---: | :--- |
| **FR-001 (Dashboard Model & 16-char Slug)** | ✅ Aligned | Table `dashboards` + [`generateDashboardSlug()`](../../../../src/lib/crypto.ts#L181-L197) |
| **FR-002 (Per-Dashboard Credentials & PBKDF2)** | ✅ Aligned | Table `dashboard_users` + [`hashPassword()`](../../../../src/lib/crypto.ts#L107-L122) / [`verifyPassword()`](../../../../src/lib/crypto.ts#L127-L176) |
| **FR-004 (Note CRUD & Version History Snapshotting)** | ✅ Aligned | Tables `notes` & `note_versions` + [`createNote()`](../../../../src/lib/supabase.ts#L300-L318) / [`updateNote()`](../../../../src/lib/supabase.ts#L323-L342) |
| **FR-011 (Optimistic Concurrency Versioning)** | ✅ Aligned | Monotonic `version` check in RPC `update_note_with_version` |
| **Non-Goals Preserved** | ✅ Aligned | No global user accounts, no complex RBAC, no rich-text parsers, no external auth servers |

---

## 6. Context Consistency & Dead Code Audit

- **Dead Code / Unused Helpers**: 0 unused exports. All utility functions in [`src/lib/crypto.ts`](../../../../src/lib/crypto.ts) and [`src/lib/session.ts`](../../../../src/lib/session.ts) are directly utilized or exercised by test suites.
- **Pattern Consistency**: Consistent use of `async/await`, TypeScript `strict` typing, and uniform error wrapping across all adapter methods.

---

## 7. Recommended Simplifications & Priority Actions

### Priority 1: Retain Pure Web Crypto as the Foundation Pattern
- **Rationale**: Zero external binary dependencies is the single biggest contributor to reliable Cloudflare Workers deployment. Continue this standard across all upcoming slices (`S-01` through `S-06`).

### Priority 2: Document HTTPS Requirement for Session Cookies
- **Rationale**: Prevent developer friction when running preview builds locally by documenting the `__Host-` cookie HTTPS constraint in project documentation.

### Priority 3: Keep RPCs Focused on Atomic Multi-Table Operations
- **Rationale**: The 3 RPC functions (`create_dashboard_with_users`, `create_note_with_version`, `update_note_with_version`) cleanly handle transactionality in PostgreSQL. Avoid adding RPCs for simple single-table read queries where standard Supabase `.from()` queries remain simpler.

---

## 8. Summary Statistics

| Metric | Current Value | Target / Baseline | Status |
| :--- | :---: | :---: | :---: |
| **Total Test Count** | 98 passing | >= 80 | ✅ Exceeds target |
| **Statement Coverage** | 99.63% | >= 80.0% | ✅ Exceeds target |
| **Branch Coverage** | 98.63% | >= 80.0% | ✅ Exceeds target |
| **Function Coverage** | 100.0% | >= 80.0% | ✅ Exceeds target |
| **Line Coverage** | 99.62% | >= 80.0% | ✅ Exceeds target |
| **External Auth Dependencies** | 0 | 0 | ✅ Zero overhead |
| **ESLint Warnings / Errors** | 0 | 0 | ✅ Clean |

---

## 9. Conclusion

The code introduced in `feature/f-01` is **exceptionally pragmatic, clean, and directly aligned with the project's MVP requirements and Cloudflare Workers runtime constraints**. It avoids premature infrastructure over-engineering while providing solid cryptographic safety and data integrity guarantees.
