<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Dashboard Auth Login and Tiles View

- **Plan**: `context/changes/dashboard-auth-login-and-tiles-view/plan.md`
- **Scope**: Phase 7 of 8
- **Date**: 2026-08-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 3 warnings (all resolved), 1 observation (resolved)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Account Lockout / DoS Vector in authAccount Limiter

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/actions/auth.ts:63-76`
- **Detail**: `loginToDashboardAction` unconditionally evaluated and incremented `checkRateLimit("authAccount", accountIdentifier)` before credential verification. This created an account lockout DoS vector: an attacker could intentionally lock out a legitimate participant by sending 5 invalid requests. Additionally, a valid participant logging in 5 times within 15 minutes would be locked out despite supplying valid credentials.
- **Fix A ⭐ Recommended**: Check `authIp` pre-auth; evaluate & increment `authAccount` only on failed password verification
  - Strength: Prevents account lockout DoS against valid users and stops valid logins from consuming the brute-force attempt quota.
  - Tradeoff: An attacker with infinite IP addresses could still attempt 5 guesses per targeted account before hitting the failure limit.
  - Confidence: HIGH — standard industry pattern for targeted account brute-force protection.
  - Blind spot: Requires checking rate limit on the failure path inside the action.
- **Fix B**: Check `authAccount` pre-auth but reset the counter on successful login
  - Strength: Retains pre-auth check while unblocking legitimate users upon success.
  - Tradeoff: Attacker can still lock out a legitimate user before they get a chance to log in.
  - Confidence: MEDIUM — does not solve malicious third-party lockout DoS.
  - Blind spot: Redis sliding window does not natively support easy decrement across window buckets.
- **Decision**: FIXED (Fixed via Fix A)

### F2 — Missing Exception Handling on Upstash Redis Outage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/lib/rate-limit.ts:148-158`
- **Detail**: `checkRateLimit` called `limiter.limit(identifier)` without a `try/catch` block. If Upstash Redis experienced a network partition, timeout, or outage, the thrown exception bubbled up to the caller action and returned a 500 error instead of gracefully falling back to `inMemoryStore`.
- **Fix**: Wrap `limiter.limit` in a `try/catch` block and fallback to `inMemoryStore` on error.
  - Strength: Guarantees high availability for login and dashboard creation even during external Redis outages.
  - Tradeoff: During Redis outages, rate limit state falls back to isolate-local memory.
  - Confidence: HIGH — standard fallback pattern matching the hybrid design intent.
  - Blind spot: None significant.
- **Decision**: FIXED

### F3 — resetRateLimits Permanently Disables Redis Limiters

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/rate-limit.ts:178-184`
- **Detail**: `resetRateLimits()` set `rateLimiters.authIp = null` (and other properties to null). Subsequent calls to `checkRateLimit` permanently used `inMemoryStore` rather than reinitializing limiters from `createRateLimiters()`.
- **Fix**: Reinitialize `rateLimiters` using `Object.assign(rateLimiters, createRateLimiters())` in `resetRateLimits()`.
- **Decision**: FIXED

### F4 — Unbounded Key Growth in InMemorySlidingWindowStore

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/rate-limit.ts:22-38`
- **Detail**: `InMemorySlidingWindowStore` filtered expired timestamps but kept keys in `this.hits` Map even when `timestamps.length === 0`, allowing inactive keys to accumulate in long-running processes.
- **Fix**: Delete key from `this.hits` if `timestamps.length === 0`.
- **Decision**: FIXED
