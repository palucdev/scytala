# Security & Architectural Finding: Session Verification Rate Limiting & Resource Inversion Defense

**Date**: 2026-09-09  
**Path**: `context/changes/note-crud-and-version-persistence/reviews`  
**Target Modules**: [`src/lib/auth-guard.ts`](../../../../src/lib/auth-guard.ts), [`src/lib/rate-limit.ts`](../../../../src/lib/rate-limit.ts), [`src/actions/notes.ts`](../../../../src/actions/notes.ts), [`wrangler.jsonc`](../../../../wrangler.jsonc), [`supabase/migrations/20260828000000_create_rate_limits_rpc.sql`](../../../../supabase/migrations/20260828000000_create_rate_limits_rpc.sql)  
**Status**: Confirmed Finding & Architecture Recommendation  
**Severity**: High (Denial of Service & Infrastructure Resource Inversion)

---

## Executive Summary

During security hardening analysis of Slice `S-03` (Note CRUD and Version Persistence), the session verification entry point [`verifyDashboardSession`](../../../../src/lib/auth-guard.ts#L18) was audited for rate-limiting possibilities. 

Two distinct risks and an architectural anti-pattern were evaluated:
1. **Cryptographic DoS / CPU Starvation**: Unauthenticated callers can flood Server Actions (`createNoteAction`, `updateNoteAction`) and protected dashboard routes (`/dashboard/[hash]`), forcing the Cloudflare Worker isolate to repeatedly execute WebCrypto HMAC-SHA256 signature verification and JSON parsing before any mutation rate limit is reached.
2. **The Resource Inversion Anti-Pattern (Secondary DoS)**: Attempting to record failed verification attempts or track session limits via Supabase PostgreSQL RPC ([`check_rate_limit`](../../../../supabase/migrations/20260828000000_create_rate_limits_rpc.sql#L22)) introduces an amplified denial-of-service vulnerability. Because PostgreSQL transactions acquire row-level `FOR UPDATE` locks and consume database connection pool slots, an attacker sending cheap HTTP requests with garbage cookies can weaponize the rate limiter to crash the central database.
3. **Core Architectural Principle**: Defensive controls must never be more computationally or infrastructure-expensive than the operation they defend. Verification throttling must remain strictly **edge-native** within Cloudflare Workers, while database-backed rate limiting must remain reserved solely for **already-authenticated** operations.

---

## Detailed Vulnerability & Risk Analysis

### 1. Cryptographic DoS on `verifyDashboardSession`

[`verifyDashboardSession`](../../../../src/lib/auth-guard.ts#L18) coordinates cookie extraction and calls [`verifySessionToken`](../../../../src/lib/session.ts#L240):
- Executes `crypto.subtle.importKey` for the HMAC secret.
- Performs `crypto.subtle.verify` over the raw token payload.
- Decodes Base64URL and runs `JSON.parse` twice (header and claims).

In Cloudflare Worker isolates, compute time per invocation is strictly budgeted. Because [`createNoteAction`](../../../../src/actions/notes.ts#L72) and [`updateNoteAction`](../../../../src/actions/notes.ts#L131) invoke `verifyDashboardSession` **before** evaluating [`enforceMutationRateLimit`](../../../../src/actions/notes.ts#L22), an attacker can flood thousands of requests with fabricated cookies, consuming isolate CPU cycles without ever triggering the downstream user-scoped rate limits.

---

### 2. The Resource Inversion Anti-Pattern (Database-Side Exhaustion)

An intuitive mitigation might be to track failed verification attempts or rate-limit unauthenticated callers using Scytala's existing database token bucket RPC ([`db.checkRateLimit`](../../../../src/lib/supabase.ts#L224)). **This creates a severe secondary vulnerability.**

Examining [`supabase/migrations/20260828000000_create_rate_limits_rpc.sql`](../../../../supabase/migrations/20260828000000_create_rate_limits_rpc.sql#L41-L46):

```sql
SELECT tokens, last_refill INTO v_tokens, v_last_refill
FROM public.rate_limits
WHERE key = p_key
FOR UPDATE; -- Exclusive row-level transaction lock
```

If unauthenticated traffic or verification failures trigger this database RPC:

```
[ Attacker: Cheap HTTP POST with fake cookie ]
                    │
                    ▼
       [ Cloudflare Worker Isolate ]
                    │  (Outbound HTTPS call to Supabase PostgREST)
                    ▼
          [ Supabase Database ]
         - Connection acquired from pool
         - Explicit transaction started
         - Exclusive `FOR UPDATE` lock on rate_limits row
         - Disk write / WAL entry generated
```

#### Attack Impact:
- **Lock Contention**: When multiple concurrent requests target the same key (e.g. `clientIp` or `dashboardHash`), Postgres transactions queue behind the `FOR UPDATE` lock. Query response times degrade exponentially from ~5ms to 5,000ms+.
- **Connection Pool Starvation**: Cloudflare Workers running across dozens of global points-of-presence (PoPs) rapidly exhaust Supavisor / PgBouncer connection limits.
- **Cascading Outage**: All legitimate dashboard reads ([`getNotesByDashboard`](../../../../src/app/dashboard/%5Bhash%5D/page.tsx#L64)), logins, and mutations fail across the entire system due to connection timeouts (HTTP 504).
- **Economic / Quota DoS**: Supabase compute hours, storage IOPS, and API egress are exhausted by unauthenticated junk traffic.

---

## Comparative Cost Matrix

| Vector | Computation / Latency | Infrastructure Impact | Cost to Attacker | Cost to System |
| :--- | :--- | :--- | :--- | :--- |
| **In-Memory WebCrypto Verify** | ~0.05 ms CPU in isolate | Isolated to single Worker; 0 DB connections | Cheap (1 HTTP req) | Low (microsecond CPU) |
| **Supabase PostgreSQL RPC** | 15–60 ms network + lock | Centralized DB transaction, row lock, connection pool | Cheap (1 HTTP req) | **Catastrophic (DB lockup)** |
| **Cloudflare Native Rate Limiting** | **< 0.5 ms edge memory** | **Zero DB overhead; PoP-local cache** | Cheap (1 HTTP req) | **Negligible (absorbed at edge)** |

---

## Defense-in-Depth Architecture

To harden [`verifyDashboardSession`](../../../../src/lib/auth-guard.ts#L18) without creating a database vulnerability, Scytala must enforce strict tiered isolation:

```
                   [ Incoming Client Request ]
                               │
                               ▼
        ┌──────────────────────────────────────────────┐
        │  Tier 1: Cloudflare Edge Rate Limiting       │
        │  - Binding: SESSION_VERIFY_LIMITER (wrangler)│
        │  - Key: clientIp                             │
        │  - Threshold: 60 req / 60s                   │
        │  - Cost: 0 DB calls, ~0.2ms edge cache       │
        └──────────────────────┬───────────────────────┘
                               │ Allowed
                               ▼
        ┌──────────────────────────────────────────────┐
        │  Tier 2: Isolate WebCrypto Verification      │
        │  - verifySessionToken() HMAC-SHA256          │
        │  - Runs in isolate memory                    │
        │  - Invalid/forged? DROP IMMEDIATELY (null)   │
        │    *NEVER call Supabase on failure!*         │
        └──────────────────────┬───────────────────────┘
                               │ Verified Session
                               ▼
        ┌──────────────────────────────────────────────┐
        │  Tier 3: Authenticated Supabase RPC Limits   │
        │  - checkRateLimit("noteMutation", key)       │
        │  - Key: dashboard_id:user_id                 │
        │  - Safe: identity is cryptographically proven│
        └──────────────────────────────────────────────┘
```

---

## Required Architectural Changes

1. **Cloudflare Worker Binding Configuration**:
   Add a dedicated native rate limiter `SESSION_VERIFY_LIMITER` to [`wrangler.jsonc`](../../../../wrangler.jsonc#L18-L27) with a 60-request/60-second simple limit.
2. **`checkRateLimit` Extension in [`src/lib/rate-limit.ts`](../../../../src/lib/rate-limit.ts)**:
   Add `sessionVerifyIp` to `RateLimiterType` mapped to Cloudflare's native binding, backed by `InMemorySlidingWindowStore` for local development and test environments.
3. **Hardened [`verifyDashboardSession`](../../../../src/lib/auth-guard.ts)**:
   - Perform edge IP rate limiting *before* touching cookies or invoking WebCrypto.
   - On verification failure, **never call Supabase**. Return `null` immediately.
   - Introduce `SessionRateLimitError` or an options flag so Server Actions can distinguish between unauthenticated (401) and throttled (429) requests.
4. **Server Actions Re-ordering in [`src/actions/notes.ts`](../../../../src/actions/notes.ts)**:
   Align `createNoteAction` and `updateNoteAction` with `deleteNoteAction` to handle rate-limiting exceptions cleanly with structured `{ success: false, rateLimited: true, retryAfterSeconds }` responses.
5. **UI Handling in [`src/app/dashboard/[hash]/page.tsx`](../../../../src/app/dashboard/%5Bhash%5D/page.tsx)**:
   Handle rate-limiting explicitly to prevent showing confusing login forms or triggering redirect loops when a user is throttled at the edge.
