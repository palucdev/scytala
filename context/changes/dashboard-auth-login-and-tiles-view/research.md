---
date: "2026-08-27T08:35:00Z"
researcher: "Antigravity Assistant"
git_commit: "7169a9cbc1c81398c32ab686d2ab04c309331874"
branch: "feature/s-02"
repository: "palucdev/scytala"
topic: "State-of-the-Art Production Hardening, Observability, Rate Limiting, and Resilience for Next.js 16 on Cloudflare Workers"
tags: [research, production-readiness, observability, rate-limiting, security-headers, nextjs-16, cloudflare-workers, supabase, mui]
status: complete
last_updated: "2026-08-27"
last_updated_by: "Antigravity Assistant"
---

# Research: State-of-the-Art Production Hardening, Observability, Rate Limiting, and Resilience for Next.js 16 on Cloudflare Workers

**Date**: 2026-08-27T08:35:00Z  
**Researcher**: Antigravity Assistant  
**Git Commit**: `7169a9cbc1c81398c32ab686d2ab04c309331874`  
**Branch**: `feature/s-02`  
**Repository**: `palucdev/scytala`  

---

## Research Question

Analyze and establish state-of-the-art, production-grade solutions for all blockers, concerns, and recommendations identified in the production readiness review ([`context/changes/dashboard-auth-login-and-tiles-view/reviews/prod-review.md`](reviews/prod-review.md)). Specifically:
1. **Low-Effort & Free/OSS Observability**: Edge-compatible error tracking, structured JSON logging, and `/api/health` probes for Next.js 16 on Cloudflare Workers (`@opennextjs/cloudflare` / `workerd`).
2. **Edge Rate Limiting**: Distributed brute-force defense for authentication and dashboard creation Server Actions with seamless local development and CI testing.
3. **Security Hardening & Configuration Management**: OWASP HTTP security headers (CSP tailored for MUI Emotion) in `next.config.ts`, `.env.example`, and runtime schema validation with Zod.
4. **Resilience & Reliability**: App Router error/404 boundaries matching Scytala's Papyrus theme, Supabase query timeouts (`AbortSignal.timeout`), and database rollback scripts.

---

## Executive Summary

| Review Finding | Area | State-of-the-Art Recommendation | Complexity / Cost |
| :--- | :--- | :--- | :--- |
| **B1: Health Check Endpoint** | Observability | Edge-native Route Handler (`/api/health`) with `AbortSignal.timeout(5000)` probing Supabase connectivity. Returns structured JSON (healthy/unhealthy, latency, version, uptime) without leaking credentials or database internals. | Low / $0 |
| **B2: Production Error Tracking** | Observability | **Server**: Cloudflare Native Workers Logs & Tail Workers ($0, 0 KB bundle, zero isolate runtime hazards, auto-indexed into Dashboard Query Builder).<br>**Client**: Optional `@sentry/browser` or self-hosted GlitchTip (OSS). | Low / $0 (Free Tier / OSS) |
| **B3: Rate Limiting on Server Actions** | Security & Auth | **Hybrid Dual-Engine**: Production via Upstash Redis (`@upstash/ratelimit`, 10k req/day free, HTTP REST) with `ephemeralCache` L1 fast-reject. In-memory sliding window fallback for local dev (`npm run dev`) and Vitest test suite (`npm test`). | Low / $0 |
| **B4: Config Management & `.env.example`** | Configuration | Standardized `.env.example` + Startup runtime schema validation via Zod in `src/lib/env.ts` (fails fast on missing keys before serving requests). | Low / $0 |
| **C1: HTTP Security Headers** | Security | Declarative OWASP headers in `next.config.ts` (HSTS, CSP tailored for Next.js 16 + Emotion CSS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`). | Low / $0 |
| **C2: Error & Not-Found Boundaries** | Resilience & UX | `src/app/error.tsx`, `src/app/global-error.tsx`, and `src/app/not-found.tsx` styled with MUI components and Papyrus theme (`PapyrusThemeLight`). Includes "Try Again" / "Return to Home" actions. | Medium / $0 |
| **C3: Unstructured String Logging** | Observability | Zero-dependency, edge-compatible `Logger` utility with recursive credential/JWT/hash sanitization, child context scopes, and newline-delimited JSON (`ndjson`) production output. | Low / $0 |
| **C4: DB Down Migrations & Rollback** | Database | Dedicated `supabase/migrations/down/` reversible SQL scripts + documented rollback runbook. | Low / $0 |
| **R1–R3: Timeouts, Retries & Sessions** | Reliability | `AbortSignal.timeout(5000)` on all DB queries; exponential backoff retries with jitter for idempotent reads (`getDashboardByHash`, `getNotesByDashboard`). | Low / $0 |

---

## Detailed Findings & State-of-the-Art Solutions

### 1. Monitoring & Observability (Low-Effort & Free/OSS Solutions)

#### A. Production Error Tracking in Cloudflare Workers V8 Isolates
Cloudflare Workers execute on `workerd` (V8 isolates), not traditional Node.js servers. Traditional APM SDKs that use dynamic monkey-patching (`@sentry/node`, `require-in-the-middle`, OpenTelemetry Node SDKs) introduce severe bundle size bloat (exceeding Workers' 3MB free tier limit) and runtime crashes (`Dynamic require of "fs" is not supported`).

**State-of-the-Art Server Strategy: Cloudflare Native Workers Logs & Tail Workers**
- **Zero Bundle Bloat**: 0 KB added to the application bundle.
- **Zero Latency Overhead**: Logs and exceptions are buffered by the Cloudflare hypervisor without blocking response streams.
- **Structured Querying**: Cloudflare’s Dashboard Query Builder (powered by the Baselime ClickHouse engine) automatically parses and indexes single-line JSON logs emitted via `console.log(JSON.stringify(entry))`.
- **Alerting & Export**: Tail Workers can be attached asynchronously to pipe error events to Discord, Slack, Axiom (500 GB/mo free), or Sentry webhooks.

**Enabling in `wrangler.jsonc`**:
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "scytala",
  "main": ".open-next/worker.js",
  "compatibility_date": "2025-08-16",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true,
    "logs": {
      "invocation_logs": true,
      "head_sampling_rate": 1
    }
  }
}
```

**Client-Side Strategy**:
- For browser-side React 19 rendering exceptions, `@sentry/browser` or a lightweight `window.onerror` handler can be initialized in `app/layout.tsx` pointing to Sentry's Free Developer Tier (5,000 events/month) or self-hosted GlitchTip (100% free OSS).

---

#### B. Zero-Dependency Structured JSON Logger (`src/lib/logger.ts`)
To satisfy Concern **C3**, logs in Server Actions and Route Handlers must be structured, searchable, and strictly sanitized against credential leakage.

**Key Features**:
1. **Recursive Redaction**: Redacts keys (`password`, `password_hash`, `token`, `sessionToken`, `secret`, `authorization`, `cookie`, `key`, `jwt`, `apiKey`) and regex value signatures (`$pbkdf2$...`, `Bearer ...`, `eyJ...`).
2. **Circular Reference Protection**: Uses `WeakSet` to prevent infinite loops on complex objects.
3. **Child Loggers**: `logger.child({ action: "loginToDashboardAction", dashboardId })` retains context across execution steps.
4. **Environment Adaptation**: Pretty-printed colored output during development; single-line `ndjson` in production for log aggregators.

**Implementation Blueprint**:
```typescript
/**
 * Edge-compatible structured JSON logger for Next.js & Cloudflare Workers.
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "passwordhash",
  "token",
  "sessiontoken",
  "secret",
  "session_secret",
  "authorization",
  "cookie",
  "set-cookie",
  "key",
  "apikey",
  "servicerolekey",
  "credentials",
  "jwt",
]);

const SENSITIVE_PATTERNS = [
  /^bearer\s+[a-zA-Z0-9_\-\.]+/i,
  /^\$pbkdf2\$\d+\$[a-f0-9]+\$[a-f0-9]+/i,
  /^eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/,
];

function sanitizeValue(value: unknown, seen = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(value)) return "[REDACTED]";
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause ? sanitizeValue(value.cause, seen) : undefined,
    };
  }

  if (typeof value === "object") {
    if (seen.has(value as object)) return "[CIRCULAR]";
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, seen));
    }

    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (SENSITIVE_KEYS.has(normalizedKey) || key.toLowerCase().includes("password")) {
        sanitizedObj[key] = "[REDACTED]";
      } else {
        sanitizedObj[key] = sanitizeValue(val, seen);
      }
    }
    return sanitizedObj;
  }

  return String(value);
}

export class Logger {
  private readonly context: Record<string, unknown>;
  private readonly minLevel: LogLevel;

  constructor(context: Record<string, unknown> = {}, minLevel?: LogLevel) {
    this.context = context;
    const envLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || "info";
    this.minLevel = minLevel || (process.env.NODE_ENV === "development" ? "debug" : envLevel);
  }

  child(additionalContext: Record<string, unknown>): Logger {
    return new Logger({ ...this.context, ...additionalContext }, this.minLevel);
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_SEVERITY[level] >= (LOG_LEVEL_SEVERITY[this.minLevel] ?? 1);
  }

  private emit(level: LogLevel, message: string, meta?: Record<string, unknown>, error?: unknown): void {
    if (!this.shouldLog(level)) return;

    const mergedContext = { ...this.context, ...meta };
    const sanitizedContext = Object.keys(mergedContext).length > 0
      ? (sanitizeValue(mergedContext) as Record<string, unknown>)
      : undefined;
    const sanitizedError = error ? sanitizeValue(error) : undefined;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: "scytala",
      environment: process.env.NODE_ENV || "development",
      version: process.env.APP_VERSION || "0.1.5",
      ...(sanitizedContext && { context: sanitizedContext }),
      ...(sanitizedError && { error: sanitizedError }),
    };

    if (process.env.NODE_ENV === "development") {
      const color = level === "error" || level === "fatal" ? "\x1b[31m" : level === "warn" ? "\x1b[33m" : "\x1b[36m";
      console.log(`${color}[${entry.timestamp}] [${level.toUpperCase()}]\x1b[0m ${message}`, {
        ...(entry.context && { context: entry.context }),
        ...(entry.error && { error: entry.error }),
      });
    } else {
      const json = JSON.stringify(entry);
      if (level === "error" || level === "fatal") console.error(json);
      else if (level === "warn") console.warn(json);
      else console.log(json);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void { this.emit("debug", message, meta); }
  info(message: string, meta?: Record<string, unknown>): void { this.emit("info", message, meta); }
  warn(message: string, meta?: Record<string, unknown>, error?: unknown): void { this.emit("warn", message, meta, error); }
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void { this.emit("error", message, meta, error); }
  fatal(message: string, error?: unknown, meta?: Record<string, unknown>): void { this.emit("fatal", message, meta, error); }
}

export const logger = new Logger();
```

---

#### C. Health Check Probe Endpoint (`src/app/api/health/route.ts`)
To satisfy Blocker **B1**, a dedicated probe endpoint must verify worker availability and database connectivity.

**Implementation**:
1. **Extend `DatabaseClient`** in `src/client/db-client.ts`:
   ```typescript
   export interface HealthCheckResult {
     status: "up" | "down";
     latencyMs: number;
     error?: string;
   }

   export interface DatabaseClient {
     // ...
     checkHealth(signal?: AbortSignal): Promise<HealthCheckResult>;
   }
   ```

2. **Implement in `src/lib/supabase.ts`**:
   ```typescript
   async checkHealth(signal?: AbortSignal): Promise<HealthCheckResult> {
     const start = performance.now();
     try {
       let query = this.client.from("info").select("app_version").limit(1);
       if (signal) {
         query = query.abortSignal(signal);
       }
       const { error } = await query;
       const latencyMs = Math.round(performance.now() - start);

       if (error) {
         return { status: "down", latencyMs, error: "Database query failed" };
       }
       return { status: "up", latencyMs };
     } catch (err: unknown) {
       const latencyMs = Math.round(performance.now() - start);
       const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
       return {
         status: "down",
         latencyMs,
         error: isTimeout ? "Database request timed out" : "Database connection failed",
       };
     }
   }
   ```

3. **Route Handler in `src/app/api/health/route.ts`**:
   ```typescript
   import { NextResponse } from "next/server";
   import { createDatabaseClient } from "@/client/db-client";
   import { logger } from "@/lib/logger";

   export const dynamic = "force-dynamic";

   const WORKER_START_TIME = Date.now();

   export async function GET() {
     const log = logger.child({ endpoint: "/api/health" });
     const signal = AbortSignal.timeout(5000);

     try {
       const db = createDatabaseClient();
       const dbHealth = await db.checkHealth(signal);
       const isHealthy = dbHealth.status === "up";
       const uptimeSeconds = Math.floor((Date.now() - WORKER_START_TIME) / 1000);

       const payload = {
         status: isHealthy ? ("healthy" as const) : ("unhealthy" as const),
         timestamp: new Date().toISOString(),
         version: process.env.APP_VERSION || "0.1.5",
         uptime_seconds: uptimeSeconds,
         checks: {
           database: {
             status: dbHealth.status,
             latency_ms: dbHealth.latencyMs,
             ...(dbHealth.error && { error: dbHealth.error }),
           },
         },
       };

       if (!isHealthy) {
         log.warn("Health check degraded or database down", { dbHealth });
       }

       return NextResponse.json(payload, {
         status: isHealthy ? 200 : 503,
         headers: {
           "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
         },
       });
     } catch (error) {
       log.error("Unhandled exception during health check", error);
       return NextResponse.json(
         {
           status: "unhealthy",
           timestamp: new Date().toISOString(),
           version: process.env.APP_VERSION || "0.1.5",
           uptime_seconds: Math.floor((Date.now() - WORKER_START_TIME) / 1000),
           checks: {
             database: { status: "down", latency_ms: 5000, error: "Health probe internal error" },
           },
         },
         {
           status: 503,
           headers: {
             "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
           },
         },
       );
     }
   }
   ```

---

### 2. Edge Rate Limiting & Auth Hardening (Blocker B3)

#### A. Architectural Evaluation
Because Cloudflare Workers isolates are distributed across 300+ PoPs, local memory rate limiting cannot prevent distributed bot attacks across multiple isolate instances. Conversely, Cloudflare's native Workers rate limiter binding is constrained to fixed 10-second or 60-second windows (preventing 15-minute account lockouts).

**Recommended Architecture: Hybrid Dual-Engine**
1. **Production Engine**: Upstash Redis (`@upstash/ratelimit` + `@upstash/redis` via HTTP REST).
   - Operates globally with no TCP connection overhead.
   - Uses `Ratelimit.slidingWindow` to prevent boundary burst attacks.
   - Utilizes `ephemeralCache: new Map()` to reject repeat abusers locally in 0.1ms without Redis command costs.
2. **Local & CI Test Fallback Engine**: Pure In-Memory Sliding Window Store.
   - Activates automatically when `UPSTASH_REDIS_REST_URL` is absent.
   - Guarantees fast, deterministic Vitest runs (`npm test`) without network dependencies or flakiness.

#### B. Identifier & Multi-Tier Rate Limiting Strategy
1. **Client IP Extraction**: On Cloudflare Workers, extract `await headers().get("cf-connecting-ip")` (validated and unforgeable behind Cloudflare CDN).
2. **Multi-Tier Policies**:
   - **IP Defense (DoS / CPU Exhaustion)**: `auth:ip:${clientIp}` → Max 10 attempts per 60 seconds.
   - **Target Account Defense (Password Brute-Force)**: `auth:target:${dashboardHash}:${userAlias}` → Max 5 attempts per 15 minutes.
   - **Dashboard Creation Spam**: `dash:create:${clientIp}` → Max 5 dashboards per 1 hour.

#### C. Implementation Blueprint (`src/lib/rate-limit.ts`)
```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

const ephemeralCache = new Map<string, number>();

class InMemorySlidingWindowStore {
  private hits = new Map<string, number[]>();

  async limit(key: string, maxRequests: number, windowMs: number) {
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (this.hits.get(key) || []).filter((t) => t > windowStart);

    if (timestamps.length >= maxRequests) {
      const oldest = timestamps[0] || now;
      const reset = oldest + windowMs;
      return { success: false, limit: maxRequests, remaining: 0, reset };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - timestamps.length,
      reset: now + windowMs,
    };
  }

  reset() { this.hits.clear(); }
}

export const inMemoryStore = new InMemorySlidingWindowStore();

function getUpstashRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new Redis({ url, token });
  return null;
}

const redisInstance = getUpstashRedis();

export const rateLimiters = {
  authIp: redisInstance
    ? new Ratelimit({
        redis: redisInstance,
        limiter: Ratelimit.slidingWindow(10, "60 s"),
        ephemeralCache,
        timeout: 1000,
        prefix: "rl:auth:ip",
      })
    : null,

  authAccount: redisInstance
    ? new Ratelimit({
        redis: redisInstance,
        limiter: Ratelimit.slidingWindow(5, "900 s"),
        ephemeralCache,
        timeout: 1000,
        prefix: "rl:auth:account",
      })
    : null,

  dashboardCreate: redisInstance
    ? new Ratelimit({
        redis: redisInstance,
        limiter: Ratelimit.slidingWindow(5, "3600 s"),
        ephemeralCache,
        timeout: 1000,
        prefix: "rl:dash:create",
      })
    : null,
};

export async function getClientIp(): Promise<string> {
  const headerList = await headers();
  const cfIp = headerList.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const xForwardedFor = headerList.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  return "127.0.0.1";
}

export interface RateLimitCheckResult {
  success: boolean;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  limiterType: "authIp" | "authAccount" | "dashboardCreate",
  identifier: string,
): Promise<RateLimitCheckResult> {
  const limiter = rateLimiters[limiterType];

  if (limiter) {
    const result = await limiter.limit(identifier);
    if (!result.success) {
      const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
      return { success: false, retryAfterSeconds };
    }
    return { success: true, retryAfterSeconds: 0 };
  }

  const config = {
    authIp: { max: 10, windowMs: 60 * 1000 },
    authAccount: { max: 5, windowMs: 15 * 60 * 1000 },
    dashboardCreate: { max: 5, windowMs: 60 * 60 * 1000 },
  }[limiterType];

  const result = await inMemoryStore.limit(`${limiterType}:${identifier}`, config.max, config.windowMs);

  if (!result.success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    return { success: false, retryAfterSeconds };
  }

  return { success: true, retryAfterSeconds: 0 };
}
```

---

### 3. Configuration Management & Validation (Blocker B4)

#### A. Standardized `.env.example`
```env
# ==============================================================================
# Scytala Configuration Template
# ==============================================================================

# Supabase Database Configuration
# In production, use your hosted Supabase instance.
# In local development, run `npx supabase start` and use local values.
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Authentication & Session Security
# Generate a secure 32+ character string (e.g. `openssl rand -hex 32`)
SESSION_SECRET=your-random-32-byte-hex-or-base64-secret

# Optional: Upstash Redis (Distributed Rate Limiting)
# If left empty, an in-memory rate limiter is used (suitable for local dev / tests).
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Optional: Application & Logging Metadata
DEPLOY_ID=local-dev
LOG_LEVEL=info
```

#### B. Runtime Validation via Zod (`src/lib/env.ts`)
```typescript
import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters long"),
  DEPLOY_ID: z.string().optional().default("development"),
  APP_VERSION: z.string().optional().default("0.1.5"),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).optional().default("info"),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

export function getEnv(): Env {
  if (validatedEnv) return validatedEnv;

  const result = envSchema.safeParse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SESSION_SECRET: process.env.SESSION_SECRET,
    DEPLOY_ID: process.env.DEPLOY_ID,
    APP_VERSION: process.env.APP_VERSION,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    LOG_LEVEL: process.env.LOG_LEVEL,
  });

  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`[Scytala Env Validation Failed]:\n${issues}`);
  }

  validatedEnv = result.data;
  return validatedEnv;
}
```

---

### 4. HTTP Security Headers in Next.js (`next.config.ts`) (Concern C1)

In Next.js 16 with Material-UI (Emotion), Emotion dynamically inserts `<style>` tags during SSR and client navigation. Setting `style-src 'self' 'unsafe-inline'` ensures full compatibility with Emotion without breaking styles, while strictly hardening script execution, frames, and object embedding.

```typescript
import type { NextConfig } from "next";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  font-src 'self' data: https://fonts.gstatic.com;
  connect-src 'self' https://*.supabase.co https://*.upstash.io http://127.0.0.1:* http://localhost:*;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, " ").trim();

const nextConfig: NextConfig = {
  env: {
    APP_VERSION: pkg.version,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
  outputFileTracingExcludes: {
    "*": [
      "./src/**/__tests__/**",
      "./src/**/*.test.{ts,tsx}",
      "./coverage/**",
      "./vitest.config.ts",
    ],
  },
};

export default nextConfig;
```

---

### 5. App Router Error & Not-Found Boundaries (Concern C2)

#### A. `src/app/error.tsx` (Route-Level Error Boundary)
```tsx
"use client";

import { useEffect } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import HomeIcon from "@mui/icons-material/Home";
import Link from "next/link";
import { logger } from "@/lib/logger";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Route error caught by boundary", error, { digest: error.digest });
  }, [error]);

  return (
    <Box
      sx={{
        minHeight: "80vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
      }}
    >
      <Card
        sx={{
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
          p: { xs: 2, sm: 3 },
          boxShadow: "0 8px 24px rgba(35, 24, 13, 0.12)",
          border: "1px solid #cfbe97",
        }}
      >
        <CardContent>
          <ErrorOutlineIcon sx={{ fontSize: 56, color: "error.main", mb: 2 }} />
          <Typography variant="h1" sx={{ fontSize: "1.75rem", mb: 1 }}>
            Something went awry
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            An unexpected error occurred while loading this page. The system has logged this incident.
          </Typography>
          <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<RefreshIcon />}
              onClick={() => reset()}
            >
              Try Again
            </Button>
            <Button
              variant="outlined"
              color="primary"
              component={Link}
              href="/"
              startIcon={<HomeIcon />}
            >
              Return Home
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
```

#### B. `src/app/not-found.tsx` (404 Page)
```tsx
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import AddIcon from "@mui/icons-material/Add";
import Link from "next/link";

export default function NotFound() {
  return (
    <Box
      sx={{
        minHeight: "80vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
      }}
    >
      <Card
        sx={{
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
          p: { xs: 2, sm: 3 },
          boxShadow: "0 8px 24px rgba(35, 24, 13, 0.12)",
          border: "1px solid #cfbe97",
        }}
      >
        <CardContent>
          <SearchOffIcon sx={{ fontSize: 56, color: "secondary.main", mb: 2 }} />
          <Typography variant="h1" sx={{ fontSize: "2rem", mb: 1 }}>
            Dashboard Not Found
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            The dashboard link you followed may be invalid, expired, or removed.
          </Typography>
          <Box sx={{ display: "flex", gap: 2, justifyContent: "center", flexWrap: "wrap" }}>
            <Button
              variant="contained"
              color="primary"
              component={Link}
              href="/new"
              startIcon={<AddIcon />}
            >
              Create New Dashboard
            </Button>
            <Button variant="outlined" color="primary" component={Link} href="/">
              Return Home
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
```

---

### 6. Database Reliability, Timeouts & Rollback Plan (Concern C4 & Recommendations)

#### A. Database Query Timeout Wrapper
Wrap all database queries with `AbortSignal.timeout(5000)`:
```typescript
export async function withTimeout<T>(
  promiseFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 5000,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  return promiseFactory(signal);
}
```

#### B. Transient Network Retries for Idempotent Reads
```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 200,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      attempt++;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 50;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
```

#### C. Database Migration Strategy: Forward-Only Policy
All database schema evolution is strictly forward-only (`supabase/migrations/<timestamp>_<name>.sql`).
- Do not maintain destructive `down.sql` scripts (`DROP TABLE ... CASCADE`) to prevent irrecoverable production data loss.
- Rollbacks must be executed via forward-only additive schema changes or Supabase Point-in-Time Recovery (PITR) / database snapshots.

---

## Code References

- [`src/actions/auth.ts:29-101`](../../../src/actions/auth.ts#L29-L101) - Login server action requiring rate limiting and structured logger.
- [`src/actions/dashboard.ts:26-83`](../../../src/actions/dashboard.ts#L26-L83) - Dashboard creation server action requiring rate limiting and structured logger.
- [`src/client/db-client.ts:121-214`](../../../src/client/db-client.ts#L121-L214) - Port definition where `checkHealth` should be declared.
- [`src/lib/supabase.ts:40-47`](../../../src/lib/supabase.ts#L40-L47) - Supabase client initialization.
- [`next.config.ts:1-24`](../../../next.config.ts#L1-L24) - Configuration file where OWASP security headers will be added.
- [`src/theme/papyrus-theme-light.ts:22-73`](../../../src/theme/papyrus-theme-light.ts#L22-L73) - Palette definitions for error/warning/papyrus colors.

---

## Historical Context (from prior changes)

- `context/changes/dashboard-data-schema-and-auth-scaffold/plan.md` - Established schema, WebCrypto hashing, and JWT session handling.
- `context/changes/dashboard-creation-wizard/plan.md` - Implemented wizard UI and participant credential generation.
- `context/changes/dashboard-auth-login-and-tiles-view/reviews/prod-review.md` - The review flagging the 4 blockers and 4 concerns analyzed here.

---

## Implementation Roadmap & Action Plan

1. **Step 1 (B4 & C3)**: Create `.env.example`, `src/lib/env.ts` (Zod validation), and `src/lib/logger.ts` (Structured JSON logger).
2. **Step 2 (B1 & R1)**: Add `checkHealth` to `DatabaseClient` and `SupabaseDatabaseClient`; implement `src/app/api/health/route.ts`.
3. **Step 3 (B3)**: Install `@upstash/ratelimit` `@upstash/redis` and implement `src/lib/rate-limit.ts`; wire into `loginToDashboardAction` and `createDashboardAction`.
4. **Step 4 (C1)**: Configure OWASP security headers & CSP in `next.config.ts`.
5. **Step 5 (C2)**: Create `src/app/error.tsx`, `src/app/global-error.tsx`, and `src/app/not-found.tsx`.
6. **Step 6 (B2)**: Update `wrangler.jsonc` with `"observability": { "enabled": true, "logs": { "invocation_logs": true } }`.
7. **Step 7 (C4)**: Standardize forward-only database migration policy across all schema evolution.
8. **Step 8 (Testing)**: Add unit tests for logger, rate limiting, health check route, env validation, and error boundaries ensuring ≥ 80% coverage.
