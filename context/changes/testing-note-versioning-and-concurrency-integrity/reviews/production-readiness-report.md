# Production Readiness Report

**Date**: 2026-09-12
**Path**: /home/projekty/10xdevs/scytala (repository root, branch `feature/integration_test`)
**Target**: production (full rigor)
**Stack**: Next.js 16 (App Router) → OpenNext → Cloudflare Workers · Supabase (PostgreSQL + RPCs) · MUI

---

## Executive Summary

- **Recommendation**: **GO WITH MITIGATIONS** — Deploy with Caution
- **Overall Readiness**: **81%**
- **Deployment Risk**: **Medium**
- **Blockers**: 1 · **Concerns**: 8 · **Recommendations**: 6

Scytala is a well-hardened application with strong security fundamentals (validated env schema, sanitized structured logging, layered rate limiting, hardened session cookies, timing-equalized auth, strict CSP), comprehensive error handling, and a clean rollback story. The single production blocker is the absence of a dedicated error-tracking service; everything else is deployable with documented mitigations.

## Category Breakdown

| Category      | Score | Status          |
| ------------- | ----- | --------------- |
| Configuration | 90%   | Ready           |
| Monitoring    | 70%   | Not Ready       |
| Resilience    | 80%   | Ready           |
| Performance   | 75%   | With Concerns   |
| Security      | 85%   | Ready           |
| Deployment    | 85%   | Ready           |

---

## Blockers (Must Fix)

### B-1. No dedicated error tracking service (Monitoring)
- **Location**: Project-wide (no Sentry/Bugsnag/Datadog integration found in `src/`, `package.json`)
- **Issue**: Errors are logged as structured JSON to `console.*` and captured by Cloudflare Workers Logs (`wrangler.jsonc` has `observability.enabled: true`, `head_sampling_rate: 1`), but there is no aggregation, alerting, deduplication, or notification when error rates spike. A production incident (e.g., Supabase outage, env validation failure at cold start) would only be discovered manually.
- **Partial mitigation already in place**: 100%-sampled Workers invocation logs + JSON logger with digests (`error.digest` in `error.tsx`/`global-error.tsx`).
- **Fix (fixable: true)**: Enable Cloudflare Workers Logs **alerting/notification** on error-level logs as an immediate stopgap, and integrate Sentry for Cloudflare Workers (or equivalent) before or shortly after launch. Estimated effort: 0.5–1 day.

---

## Concerns (Should Fix — with mitigation plans)

### C-1. Env validation is bypassed in two hot paths (Configuration)
- **Location**: `src/lib/supabase.ts:70-79`, `src/lib/session.ts:416-433`
- **Issue**: Both modules read `process.env` directly instead of using `getEnv()` from `src/lib/env.ts`. The zod schema (which enforces `SESSION_SECRET ≥ 32 chars`, valid `SUPABASE_URL`, timeout coercion) is therefore not applied on these paths; `supabase.ts` also still references a legacy `SUPABASE_KEY` fallback.
- **Mitigation**: Refactor both modules to call `getEnv()`. Until then, the startup instrumentation hook (`src/instrumentation.ts`) does fail fast on invalid env, which limits exposure. Effort: ~2h.

### C-2. Session secret fallback couples signing key to DB credential (Security)
- **Location**: `src/lib/session.ts:416-420` (`SESSION_SECRET || SUPABASE_SERVICE_ROLE_KEY || SUPABASE_KEY`)
- **Issue**: If `SESSION_SECRET` is unset in production, the service-role key signs sessions. Rotating the Supabase key would then invalidate all user sessions, and one secret serves two purposes.
- **Mitigation**: Since `env.ts` requires `SESSION_SECRET` anyway, remove the fallback chain in production (throw if `SESSION_SECRET` missing); keep fallbacks for dev/test only. Effort: ~1h.

### C-3. No retry logic on transient database failures (Resilience)
- **Location**: All `SupabaseDatabaseClient` methods (`src/lib/supabase.ts`)
- **Issue**: Single-shot fetch to Supabase REST; a transient network blip or PostgREST 503 surfaces directly as a user-facing "temporarily unavailable" error. Timeout protection exists (`createTimeoutFetch`, default 8s) but no retry/backoff.
- **Mitigation**: Add a small retry wrapper (2 retries, exponential backoff + jitter) for idempotent reads (`getDashboardByHash`, `getNotesByDashboard`, `checkHealth`). Do **not** auto-retry mutations (`createNote`, `updateNote`, `deleteNote`) without idempotency keys. Effort: ~0.5 day.

### C-4. In-memory rate-limit fallback is per-isolate (Performance/Security)
- **Location**: `src/lib/rate-limit.ts:7-48, 140-163, 183-203`
- **Issue**: When the Cloudflare binding is unavailable (IP limiters) or the Supabase RPC fails (account/resource limiters), limits fall back to an in-memory sliding window that is per-V8-isolate. Under high traffic across many isolates, effective limits are multiplied and brute-force protection weakens precisely when the primary limiter is degraded.
- **Mitigation**: Acceptable short-term (fail-open beats fail-closed for availability). Add a Workers Log alert on the `Supabase rate limit RPC failed` warning so fallback operation is visible. Longer term, consider Cloudflare KV/Durable Object-based limiter. Effort: alert ~1h; DO limiter ~1–2 days.

### C-5. No explicit request body size limit (Performance)
- **Location**: `next.config.ts` (no `serverActions.bodySizeLimit` configured)
- **Issue**: Next.js Server Actions default to a 1MB body limit, which is reasonable but implicit. Note content is user-supplied and stored per version — large payloads increase DB cost and DoS surface.
- **Mitigation**: Set `experimental.serverActions.bodySizeLimit` explicitly (e.g., `256kb`) and enforce max content length in `createNoteSchema`/`updateNoteSchema` (zod `.max()`). Effort: ~1h.

### C-6. No caching layer for reads (Performance)
- **Location**: Dashboard/note server pages (`src/app/dashboard/[hash]/page.tsx`, note page)
- **Issue**: Every dashboard view and note fetch hits Supabase REST directly; no `unstable_cache`/`revalidate`/`use cache` anywhere in `src/`. Fine at MVP scale; a latency and cost risk as usage grows.
- **Mitigation**: Acceptable for launch. Post-launch, cache dashboard metadata (low churn) with short TTL + revalidate-on-mutation. Effort: ~1 day.

### C-7. CSP uses `script-src 'unsafe-inline'` in production (Security)
- **Location**: `next.config.ts:7-9`
- **Issue**: `'unsafe-inline'` substantially weakens XSS protection afforded by CSP. Likely present to accommodate Next.js inline bootstrap/hydration scripts.
- **Mitigation**: Move to nonce- or hash-based CSP (Next.js supports nonce propagation via middleware) in a follow-up hardening pass. Do not block launch on this — other headers (frame-ancestors, nosniff, HSTS) are solid. Effort: ~1 day.

### C-8. 3 high-severity vulnerabilities in dev toolchain (Security)
- **Location**: `wrangler → miniflare → sharp <0.35.4` (libheif GHSA-g89c-p67h-r497, GHSA-2jg2-4ch7-h545)
- **Issue**: **Production dependencies audit is clean (`npm audit --omit=dev`: 0 vulnerabilities)**. The 3 high findings exist only in dev tooling (local preview/build), not in the deployed worker bundle.
- **Mitigation**: Run `npm audit fix` (fix available) on a dev branch and verify `npm run preview` still works. Not deployment-blocking. Effort: ~30min.

---

## Recommendations (Nice to Have)

1. **Circuit breaker** around Supabase calls (nice-to-have per rubric) — currently graceful degradation exists only for rate limiting.
2. **Metrics instrumentation** — Workers Analytics/Logpush or a lightweight counter for login success/failure, rate-limit trips, and note mutations; feeds capacity and abuse dashboards.
3. **PBKDF2 iteration count** — 100,000 SHA-256 rounds (`src/lib/crypto.ts`) is functional but below current OWASP guidance (~600k). Raise on next schema-touching release (verification enforces min 1000 / max 1M, so old hashes remain verifiable during migration).
4. **Feature flags** — none present; not required today, but a simple env-gated flag mechanism would de-risk future risky changes.
5. **Staging environment** — only local Miniflare preview exists (`npm run preview`); a `staging` wrangler environment against a Supabase staging project would close the last deployment gap.
6. **`import type` hygiene** — `src/app/new/components/StepSuccess.tsx:13` uses a value-style import of the `Dashboard` **type** from `@/client/db-client` inside a `"use client"` file. SWC strips it (verified: no runtime server modules reach client bundles, no secrets inlined), but it should be `import type { Dashboard }` to make the boundary explicit and future-proof.

---

## Verified Strengths (evidence-based)

| Check | Evidence |
| --- | --- |
| Env vars documented | `.env.example` lists all 8 vars incl. generation instructions |
| Secrets externalized & untracked | `.gitignore` covers `.env*`; `git ls-files` shows no env/secret files tracked |
| Startup config validation | `src/lib/env.ts` (zod) + `src/instrumentation.ts` throws on boot failure |
| No secrets in client bundles | No `NEXT_PUBLIC_*` usage; no client component imports server lib values; logger is secret-safe |
| Structured logging + redaction | `src/lib/logger.ts`: JSON logs, key/pattern-based redaction (JWT, PBKDF2, bearer, cookies) |
| Health check + dependency probe | `/api/health` → DB `info` table probe, 5s abort, 200/503, no-store |
| Error boundaries | `error.tsx` + `global-error.tsx` both log with digest |
| Graceful degradation | Rate limiting: CF binding → Supabase RPC → in-memory, with warnings logged |
| Timeouts on external calls | `createTimeoutFetch` (8s, env-tunable), health probe `AbortSignal.timeout(5000)` |
| Layered rate limiting | CF native limiters (`AUTH_IP_LIMITER`, `SESSION_VERIFY_LIMITER` in `wrangler.jsonc`) + PG token-bucket RPC (atomic, `FOR UPDATE`, RLS on, service_role-only) + per-action configs |
| Auth hardening | PBKDF2 100k, constant-time verify, dummy-hash timing equalization, generic errors, account + IP throttles |
| Session hardening | HMAC-SHA256 JWT, alg-pinned verification, `__Host-` prefixed HttpOnly Secure SameSite=Lax cookies, 24h TTL |
| Security headers | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS preload |
| HTTPS | Cloudflare TLS termination + `upgrade-insecure-requests` in prod CSP |
| Dependency audit (prod) | `npm audit --omit=dev` → 0 vulnerabilities |
| Forward-only migrations | 4 additive migrations in `supabase/migrations/`; no down scripts (per repo policy) |
| Rollback plan | `npx wrangler versions rollback` documented in `docs/deployment.md` (<2s atomic); DB via PITR policy |
| CI quality gate | `.github/workflows/test.yml`: typecheck + lint + vitest with 80% thresholds on PRs to main |
| Build isolation | `tsconfig.build.json`, `outputFileTracingExcludes`, `public/.assetsignore` — test code excluded from worker bundles |

**Not applicable on Cloudflare Workers**: traditional SIGTERM graceful shutdown (stateless isolates, platform-managed draining) and DB connection pooling (Supabase accessed statelessly over HTTPS/fetch — no persistent connection pool to configure).

---

## Risk Assessment

| Risk | Likelihood | Impact | Status |
| --- | --- | --- | --- |
| Silent incident (no error alerting) | Medium | High | **Blocker B-1** — mitigate pre/at launch |
| Rate-limit fallback weakened under isolate fan-out | Low | Medium | Concern C-4 — add alerting |
| Transient Supabase blips → user-facing errors | Medium | Low–Med | Concern C-3 — retry reads post-launch |
| Session secret rotation coupling | Low | Medium | Concern C-2 — remove fallback |
| Dev-toolchain CVEs | High | None (runtime) | Concern C-8 — `npm audit fix` |
| DB drift (migrations not auto-applied on deploy) | Medium | Medium | See deployment checklist step 3 |

## Rollback Criteria

Trigger an immediate `npx wrangler versions rollback` if, within 30 minutes of deployment:

1. `/api/health` returns 503 for > 3 consecutive checks from an external monitor.
2. Error-level log rate (Workers Logs) exceeds ~5% of invocations.
3. Login success rate drops below 50% of pre-deploy baseline (indicates session/secret or DB regression).
4. Any report of data loss or note-version corruption (optimistic concurrency regression).
5. Env validation failure appears at cold start (`[Scytala Env Validation Failed]` in logs).

Database rollback is **fix-forward only** (additive migration) or Supabase PITR — never down-migrations, per repository policy.

## Post-Deployment Verification Checklist

1. [ ] `GET /api/health` returns `200` with `checks.database.status === "up"` and plausible `latency_ms`.
2. [ ] `[Instrumentation] Deployment audit recorded` appears in Workers Logs with correct `DEPLOY_ID`/`APP_VERSION`; a new row exists in the `info` table.
3. [ ] **Migrations applied**: confirm `supabase/migrations/*` (esp. `rate_limits` RPC) were run against the production Supabase project before/with deploy — Cloudflare build watch paths *exclude* `supabase/migrations/*`, so this is a manual gate.
4. [ ] Secrets configured on the Worker: `wrangler secret list` shows `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (≥32 chars, independent value — not reusing the service key).
5. [ ] Rate limiter bindings active: log in and confirm no `Cloudflare rate limiter binding unavailable` debug/warn entries.
6. [ ] Security headers present on a production response: CSP (prod variant, no `unsafe-eval`), HSTS, X-Frame-Options, nosniff.
7. [ ] Golden path E2E: create dashboard → log in → create note → edit (version increments) → version history renders → delete note.
8. [ ] Auth negative path: wrong password shows generic error; 6th failure on one account triggers account throttle message.
9. [ ] Cookie inspection: session cookie is `__Host-scytala_session[_<hash>]`, HttpOnly, Secure, SameSite=Lax.
10. [ ] Error tracking (B-1 mitigation) active: trigger a test error and confirm it is captured/alerted.
11. [ ] Rollback rehearsal: verify `npx wrangler versions rollback` target version is the current known-good.

## Next Steps (prioritized)

1. **Before deploy**: stand up error alerting (Workers Logs alert on `error` level minimum; Sentry preferred) — closes B-1.
2. **Before deploy**: verify production secrets set on the Worker and `SESSION_SECRET` is set independently (C-2 exposure window).
3. **Before deploy**: run migrations against production Supabase; confirm via checklist step 3.
4. **Week 1**: refactor `supabase.ts`/`session.ts` onto `getEnv()` (C-1, C-2); add rate-limit fallback alert (C-4); `npm audit fix` for dev toolchain (C-8).
5. **Week 2+**: retry-with-backoff for idempotent reads (C-3); explicit body size limits (C-5); nonce-based CSP (C-7); consider staging environment and read caching (C-6).

---

## Structured Result

```yaml
status: "with_concerns"
recommendation: "GO_WITH_MITIGATIONS"
report_path: "/home/projekty/10xdevs/scytala/production-readiness-report.md"
overall_readiness: 81
deployment_risk: "medium"
categories:
  configuration: { score: 90, status: "ready" }
  monitoring: { score: 70, status: "not_ready" }
  resilience: { score: 80, status: "ready" }
  performance: { score: 75, status: "with_concerns" }
  security: { score: 85, status: "ready" }
  deployment: { score: 85, status: "ready" }
issue_counts:
  critical: 1
  warning: 8
  info: 6
```
