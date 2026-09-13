# Deployment & Build Isolation Architecture

This document describes Scytala v0.5.0's deployment pipeline to Cloudflare Workers via OpenNext (`@opennextjs/cloudflare` + `wrangler`), including the 5-layer build isolation strategy that separates automated tests, mocks, and local development artifacts from production builds and edge assets.

---

## 1. Overview & Architecture

Scytala is built on Next.js 16.3 (App Router) + React 19 and deployed to Cloudflare Workers using OpenNext. The application currently provides authentication, note CRUD with version persistence and history, AES-256-GCM note encryption at rest, a dashboard, dual-layer rate limiting, and a health endpoint.

```
Browser / Client
      │
      ▼
Cloudflare Global Edge Network
      ├── Static Assets (ASSETS binding): /_next/*, *.svg, *.ico, fonts
      └── Worker (V8 isolate, nodejs_compat): SSR, API routes (/api/*),
           Server Actions, CSP nonce injection (src/proxy.ts)
            ├── Rate Limiting (AUTH_IP_LIMITER / SESSION_VERIFY_LIMITER bindings)
            └── Supabase (REST / PostgREST via @supabase/supabase-js)
                 └── PostgreSQL + RPCs (forward-only migrations in supabase/migrations/)
```

Key runtime surface:

- **`/api/health`** — dynamic health probe (`GET`) returning `status`, `version` (from `APP_VERSION`), worker `uptime_seconds`, and a database latency check (`200` healthy / `503` degraded). `no-store` caching.
- **`/api/auth/logout`** — session cleanup route.
- **Server Actions** — `src/actions/` (`auth.ts`, `dashboard.ts`, `notes.ts`, `audit.ts`).
- **CSP middleware** — `src/proxy.ts` injects a per-request nonce (`x-nonce`) and a strict `Content-Security-Policy` header (`strict-dynamic`, `frame-ancestors 'none'`, Supabase-scoped `connect-src`).
- **Security headers** — `next.config.ts` adds `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and HSTS (`max-age=63072000; includeSubDomains; preload`) to every route.

---

## 2. 5-Layer Build & Test Isolation Strategy

To ensure that automated tests are strictly enforced during local development and CI/CD while remaining 100% transparent and non-interfering for production Cloudflare builds, isolation is implemented across 5 distinct architectural layers:

| Layer | Target Area | Mechanism | Production Impact | Dev & CI Impact |
| :--- | :--- | :--- | :--- | :--- |
| **1. Trigger Layer** | Cloudflare Git Integration | **Build Watch Paths** (`build.watch_dir` in `wrangler.jsonc`, `path_excludes` in dashboard) | Skips Cloudflare builds entirely when only test/doc files change | Zero impact; CI runs full test & coverage suite on every commit/PR |
| **2. TypeScript Compilation** | Next.js Build (`next build`) | `typescript.tsconfigPath` → `tsconfig.build.json` | Next.js compiles and type-checks only production application code | IDE uses root `tsconfig.json` for full IntelliSense; CI runs `npm run check:type` |
| **3. Routing & Bundling** | App Router & bundler | Next.js App Router conventions | Route discovery ignores test files; tree-shaking drops test dependencies | Test files can be co-located or placed in `src/__tests__/` without bundle leakage |
| **4. Node File Tracing (NFT)** | Serverless Packaging (`@vercel/nft`) | `outputFileTracingExcludes` in `next.config.ts` | Test directories, E2E artifacts, and coverage output are excluded from server bundles (`.nft.json`) | Tests and coverage reports remain accessible in local environment and CI artifacts |
| **5. Static Assets Upload** | Cloudflare Assets (`wrangler deploy`) | `public/.assetsignore` copied to `.open-next/assets/` | Sourcemaps, docs, and coverage artifacts are ignored by Wrangler static asset upload | Static edge CDN contains only production client assets |

Current `outputFileTracingExcludes` patterns (next.config.ts:37): `src/**/__tests__/**`, `src/**/*.test.{ts,tsx}`, `coverage/**`, `vitest.config.ts`, `playwright.config.ts`, `e2e/**`, `test-results/**`, `playwright-report/**`.

Current `public/.assetsignore` contents: `**/__tests__/**`, `**/*.test.*`, `**/*.spec.*`, `coverage/**`, `*.md`, `*.map`.

---

## 3. Cloudflare Build Trigger Configuration

Build triggering is configured in two places:

### 3.1 Wrangler build watch directory (`wrangler.jsonc`)

```jsonc
"build": {
  "command": "npm run build:worker",
  "watch_dir": "src"
}
```

Only changes under `src/` trigger rebuilds when using `wrangler dev` / Cloudflare Builds.

### 3.2 Dashboard Build Watch Paths

When connecting the GitHub repository to Cloudflare Workers & Pages Builds, configure **Build watch paths** to suppress redundant builds when non-application code is modified.

Navigate to **Workers & Pages > scytala > Settings > Build > Build watch paths**:

| Setting | Value | Description |
| :--- | :--- | :--- |
| **Include paths (`path_includes`)** | `*` | Matches all repository files by default |
| **Exclude paths (`path_excludes`)** | *(See list below)* | Suppresses build if changes are restricted to excluded paths |

```txt
src/__tests__/*
*.test.ts
*.test.tsx
*.spec.ts
*.spec.tsx
vitest.config.ts
vitest.integration.config.ts
playwright.config.ts
coverage/*
test-results/*
playwright-report/*
docs/*
context/*
AGENTS.md
README.md
.agents/*
.github/*
.vscode/*
.cursor/*
supabase/migrations/*
```

> **Note**: If a commit touches both application source code (e.g. `src/app/page.tsx`) and a test file (e.g. `src/__tests__/app/page.test.tsx`), Cloudflare will proceed with the build because at least one changed file is outside `path_excludes`.

---

## 4. Worker Configuration (`wrangler.jsonc`)

| Setting | Value | Purpose |
| :--- | :--- | :--- |
| `name` | `scytala` | Worker name |
| `main` | `.open-next/worker.js` | OpenNext build output entrypoint |
| `compatibility_date` | `2026-08-28` | Runtime feature gate date |
| `compatibility_flags` | `nodejs_compat` | Node.js API compatibility required by OpenNext |
| `assets.directory` | `.open-next/assets` | Static assets directory |
| `assets.binding` | `ASSETS` | Asset binding consumed by the OpenNext worker |
| `observability.enabled` | `true` | Cloudflare Worker observability (invocation logs, `head_sampling_rate: 1`) |
| `ratelimits` | `AUTH_IP_LIMITER` (ns `1001`, 10 req/60s), `SESSION_VERIFY_LIMITER` (ns `1002`, 60 req/60s) | Cloudflare Workers native rate limiter bindings (layer 1 of the dual-layer rate limiting; Supabase RPC is layer 2) |

The OpenNext adapter itself is configured in `open-next.config.ts` with the default `defineCloudflareConfig()` (no custom cache/R2 overrides).

---

## 5. Environment & Secrets Management

All runtime configuration is validated at startup by `src/lib/env.ts` (Zod schema, cached, fails fast with a `[Scytala Env Validation Failed]` report). Template: `.env.example`.

| Variable | Requirement | Validation | Purpose |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Mandatory | Valid URL | Supabase project API URL |
| `SUPABASE_ANON_KEY` | Mandatory | Non-empty | Client-side queries |
| `SUPABASE_SERVICE_ROLE_KEY` | Mandatory (secret) | Non-empty | Server-side RPC execution |
| `SESSION_SECRET` | Mandatory (secret) | ≥ 32 chars | HMAC-SHA256 JWT session token signing (`openssl rand -base64 32` via `npm run generate-session-secret`) |
| `NOTE_ENCRYPTION_KEY` | Mandatory (secret) | Exactly 64 hex chars (32 bytes) | AES-256-GCM envelope encryption of note titles/contents and version snapshots at rest (`openssl rand -hex 32`) |
| `DEPLOY_ID` | Optional | Defaults to `development` | Deployment tracking identifier |
| `APP_VERSION` | Optional | Injected from `package.json` by `next.config.ts` (`env.APP_VERSION`) | Surfaced by `/api/health` |
| `LOG_LEVEL` | Optional | `debug\|info\|warn\|error\|fatal`, defaults to `info` | Structured logger filter (`src/lib/logger.ts`) |
| `SUPABASE_TIMEOUT_MS` | Optional | Positive number, defaults to `8000` | Global Supabase request timeout |

Secrets handling rules:

- **Never** commit secrets; `.env`, `.env.local`, `.env.ai` are gitignored.
- **Never** expose `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, or `NOTE_ENCRYPTION_KEY` to client components.
- Configure production secrets in the Cloudflare dashboard (**Workers & Pages > scytala > Settings > Variables and Secrets**) as encrypted secret variables, or via `npx wrangler secret put <NAME>`.
- Local preview (`npm run preview`) loads secrets from `.env.local`.

---

## 6. Database Migrations (Supabase)

Schema evolution is **forward-only**: `supabase/migrations/<timestamp>_<name>.sql`, applied via Supabase (`npm run db:reset` locally, `supabase db push` for remote). Rollbacks are handled by additive fix-forward migrations or Point-in-Time Recovery — **never** by `down.sql` / `DROP ... CASCADE` scripts.

Current migrations:

| Migration | Scope |
| :--- | :--- |
| `20260817000000_create_info_table.sql` | Info table |
| `20260819000000_create_dashboard_schema.sql` | Dashboard schema (notes, versions, users) |
| `20260820000000_create_dashboard_rpcs.sql` | Dashboard RPCs |
| `20260828000000_create_rate_limits_rpc.sql` | Rate limiting RPC (layer 2) |
| `20260913000000_create_note_with_version_optional_id.sql` | Atomic note + version creation (optional id) |
| `20260913120000_revoke_public_execute_on_rpcs.sql` | RPC execution hardening (`REVOKE ... PUBLIC`) |
| `20260913130000_update_note_conflict_errcode.sql` | Stale-version conflict error code update |

---

## 7. CI/CD Separation of Responsibilities

Responsibilities are strictly separated between GitHub Actions (Quality Gate, `.github/workflows/test.yml`) and Cloudflare Workers (Deployment):

```
                     ┌─────────────────────────────────────────┐
                     │              Git Push / PR              │
                     └────────────────────┬────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
    ┌───────────────────────────┐                   ┌───────────────────────────┐
    │    GitHub Actions (CI)    │                   │  Cloudflare Builds (CD)   │
    ├───────────────────────────┤                   ├───────────────────────────┤
    │ 1. npm ci                 │                   │ 1. Evaluate Watch Paths   │
    │ 2. npm run check:type     │                   │    • Exclude test/docs    │
    │ 3. npm run lint           │                   │    • If ONLY tests/docs:  │
    │ 4. npm test (Vitest)      │                   │      ⏩ SKIP BUILD        │
    │    • 80% line threshold   │                   │ 2. If app code changed:   │
    │    • 80% branch threshold │                   │    • tsconfig.build.json  │
    │ 5. npm run build:worker   │                   │    • OpenNext packaging   │
    │    (OpenNext build smoke) │                   │    • Deploy Worker+Assets │
    │ 6. Upload coverage (14d)  │                   │                           │
    │ 7. Block merge if failed  │                   │                           │
    └───────────────────────────┘                   └───────────────────────────┘
```

| Check / Action | Local Dev | GitHub Actions CI (`test.yml`) | Cloudflare Deploy |
| :--- | :---: | :---: | :---: |
| **TypeScript Typecheck (`check:type`)** | ✅ Real-time IDE | ✅ Strict blocking step | ⏩ Production code only (`tsconfig.build.json`) |
| **Vitest Tests & Coverage (≥ 80%)** | ✅ Fast (`npm test`) | ✅ Strict blocking step | ❌ Completely omitted |
| **ESLint Linting** | ✅ Real-time IDE | ✅ Strict blocking step | ❌ Omitted |
| **Worker Compilation (`build:worker`)** | ⏩ On demand (`preview`) | ✅ Build smoke verification | ✅ Primary build task |
| **E2E Tests (`test:e2e`)** | ✅ On demand (needs local Supabase) | ❌ | ❌ |
| **Asset & Worker Deploy (`deploy`)** | ❌ (manual) | ❌ | ✅ Primary release task |

Full local pre-submit gate: `npm run check:ready` (lint → typecheck → unit tests → E2E tests → worker build).

Additional test suites:

- `npm run test:integration` — Vitest integration tests against the live local Supabase PostgreSQL (load `.env.ai` first).
- `npm run test:e2e` / `test:e2e:ui` — Playwright suites (`golden-path`, `note-lifecycle`, `note-concurrency`, `seed`, `smoke`); load `.env.ai` first so `clearRateLimits()` can reset the `rate_limits` table between runs.

---

## 8. Deployment Commands & Workflow

### Local Development & Preview

```bash
# Run Next.js local development server
npm run dev

# Run full Vitest test suite with 80% coverage check
npm test

# Run integration tests against local Supabase PostgreSQL (load .env.ai first)
set -a && [ -f .env.ai ] && . ./.env.ai && set +a && npm run test:integration

# Run E2E Playwright tests (load .env.ai first)
set -a && [ -f .env.ai ] && . ./.env.ai && set +a && npm run test:e2e

# Run TypeScript type check across all source and test files
npm run check:type

# Run OpenNext build and launch local Cloudflare Worker environment (Miniflare/workerd)
npm run preview

# Reset local Supabase database (replays all forward migrations)
npm run db:reset
```

### Production Deployment

```bash
# Build worker bundle and deploy to Cloudflare Workers
npm run deploy

# (equivalent to: opennextjs-cloudflare build && opennextjs-cloudflare deploy)
```

Required one-time Cloudflare configuration:

1. Connect the GitHub repository via Cloudflare Workers Builds (build command `npm run build:worker`, watch configuration from section 3).
2. Set mandatory environment variables/secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `NOTE_ENCRYPTION_KEY`) in Worker settings.
3. Generate key material: `npm run generate-session-secret` for `SESSION_SECRET`; `openssl rand -hex 32` for `NOTE_ENCRYPTION_KEY`.

### Rollback Runbook

```bash
# Instant atomic rollback to previous Cloudflare deployment version (< 2s)
npx wrangler versions rollback
```

For database-level incidents, roll forward with an additive migration or restore via Supabase PITR (see section 6).

---

## 9. Post-Deployment Verification

1. **Health probe**: `GET <worker-url>/api/health` → expect `200` with `"status": "healthy"`, correct `version` (`APP_VERSION`, currently `0.5.0`), and `checks.database.status: "up"`.
2. **Security headers**: confirm `Content-Security-Policy` (nonce-based), `X-Frame-Options: DENY`, HSTS on any page response.
3. **Rate limiting**: exceed 10 auth attempts/minute from one IP → expect `429` (AUTH_IP_LIMITER binding).
4. **Observability**: Worker logs visible under **Workers & Pages > scytala > Logs** (invocation logs enabled, 100% sampling).
