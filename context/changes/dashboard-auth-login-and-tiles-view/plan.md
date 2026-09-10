# Dashboard Auth Login and Tiles View (`S-02`) Implementation Plan

## Overview

The **Dashboard Auth Login and Tiles View** slice (`S-02`) provides secure, authenticated access to isolated Scytala dashboards at `/dashboard/[hash]`. Using Next.js 16 Server Components and React Server Components (RSC) running on Cloudflare Workers, the route evaluates HttpOnly session cookies server-side to eliminate authentication layout shift (CLS = 0) and client-side data waterfalls (LCP < 300ms). Unauthenticated visitors receive a minimalist login card with constant-time password verification to prevent user enumeration. Authenticated participants receive a signed HMAC-SHA256 JWT cookie valid for 24 hours and immediate Server-Side Rendered (SSR) access to the dashboard header (displaying participant identity) and responsive note tiles sorted recently-updated first.

Following the Production Readiness Review (`reviews/prod-review.md`), this plan also incorporates comprehensive operational, security, and observability hardening: health check probing (`/api/health`), Cloudflare native invocation logging with structured JSON sanitization, hybrid dual-engine rate limiting (`@upstash/ratelimit` with in-memory test fallback), OWASP security headers, Papyrus-themed App Router error boundaries, and database rollback procedures.

## Current State Analysis

- **Relational Schema & DB Client:** Database tables (`dashboards`, `dashboard_users`, `notes`, `note_versions`) were delivered in `F-01`. [src/client/db-client.ts](../../../src/client/db-client.ts) and [src/lib/supabase.ts](../../../src/lib/supabase.ts) expose:
  - `getDashboardByHash(hash: string): Promise<Dashboard | null>`
  - `getDashboardUserByAlias(dashboard_id: string, user_alias: string): Promise<DashboardUser | null>`
  - `getNotesByDashboard(dashboard_id: string): Promise<Note[]>`
- **Cryptographic & Session Foundations:**
  - [src/lib/session.ts](../../../src/lib/session.ts) provides stateless Web Crypto HMAC-SHA256 JWT generation (`createSessionToken`) and verification (`verifySessionToken`), cookie name constants (`__Host-scytala_session` / `scytala_session`), and standard TTL defaults (`DEFAULT_SESSION_TTL_SECONDS = 86400` / 24 hours).
  - [src/lib/crypto.ts](../../../src/lib/crypto.ts) provides constant-time PBKDF2 verification (`verifyPassword`).
- **Dashboard Creation Handoff (`S-01`):** [src/app/new/page.tsx](../../../src/app/new/page.tsx) creates dashboards and participant credentials, routing users to `/dashboard/[hash]`.
- **Delivered Elements in S-02 Phases 1–4:**
  - Dynamic route handler and page container `src/app/dashboard/[hash]/page.tsx`.
  - Authentication validation schema `src/schemas/auth.ts`.
  - Server actions `loginToDashboardAction` and `logoutFromDashboardAction` in `src/actions/auth.ts`.
  - UI components: `LoginForm`, `DashboardView`, `DashboardHeader`, `NoteGrid`, `NoteTile`, `EmptyNotesState`, and `LogoutButton`.
  - Unit and integration test suites enforcing $\ge 80\%$ coverage across all lines, functions, branches, and statements.
- **Production Hardening Gaps (Identified in `prod-review.md`):**
  - Missing `/api/health` probe endpoint (Blocker B1).
  - Unstructured logs and missing production log sink integration (Blocker B2, Concern C3).
  - Missing rate limiting on password login and dashboard creation server actions (Blocker B3).
  - Missing `.env.example` and runtime environment validation (Blocker B4).
  - Missing OWASP HTTP security headers in `next.config.ts` (Concern C1).
  - Missing App Router error boundaries `error.tsx`, `global-error.tsx`, `not-found.tsx` (Concern C2).
  - Clarified forward-only database migrations policy avoiding destructive down migrations (Concern C4).
  - Missing query timeouts and read retry policies (Recommendations R1, R2).

## Desired End State

1. Navigating to `/dashboard/<hash>` for an invalid or non-existent hash returns HTTP 404 via Next.js `notFound()`.
2. Navigating to `/dashboard/<hash>` without a valid session cookie renders the minimalist `<LoginForm />` inside a papyrus-styled card. To preserve privacy and prevent metadata leakage, no dashboard title or description is exposed prior to authentication.
3. Submitting `<LoginForm />` with valid credentials invokes `loginToDashboardAction`, verifies PBKDF2 hash, signs an HMAC-SHA256 JWT, sets an HttpOnly `Secure` `SameSite=Lax` session cookie valid for 24 hours (86,400s), and transitions the user directly to the authenticated view with zero client-side waterfall.
4. Submitting `<LoginForm />` with invalid credentials (non-existent alias or incorrect password) runs constant-time dummy hash verification to equalize response timing, returning a generic sanitized error message `"Invalid alias or password."` in an inline MUI Alert.
5. Authenticated participants see `<DashboardView />`:
   - **Header:** Displays dashboard title, optional description, active participant Chip (`user_alias`), a client-side `LogoutButton`, and a placeholder sync button.
   - **Note Tiles Grid:** Displays notes as responsive MUI Cards sorted by `updated_at` descending, showing title, text content, version badge (`v${note.version}`), and formatted timestamp (`YYYY-MM-DD HH:mm`).
   - **Empty State:** If the dashboard has 0 notes, renders an informative empty state card with a disabled `+ New Note` CTA button and tooltip `"Note creation coming in S-03"`.
6. Clicking `LogoutButton` invokes `logoutFromDashboardAction`, deletes the session cookie, and re-renders the login screen.
7. **Production Hardening End State**:
   - `GET /api/health` probes Supabase connectivity with `AbortSignal.timeout(5000)` and returns status `200 OK` (healthy) or `503 Service Unavailable` (degraded) with sanitized metadata.
   - Server Actions use `src/lib/logger.ts` for structured JSON logging with recursive redaction of credentials, hashes, and session secrets.
   - `loginToDashboardAction` is protected by a dual-tier rate limiter (IP throttle: 10/60s, Account throttle: 5/15m) and `createDashboardAction` by an IP throttle (5/1h) using Upstash Redis with zero-dep In-Memory fallback for tests.
   - `next.config.ts` declares OWASP security headers (CSP compatible with MUI Emotion, HSTS, X-Frame-Options, etc.).
   - `src/app/error.tsx`, `src/app/global-error.tsx`, and `src/app/not-found.tsx` provide styled Papyrus fallback screens with "Try Again" / "Return Home" CTAs.
   - `.env.example` documents all required/optional keys, and `src/lib/env.ts` validates configuration at startup via Zod.
   - `supabase/migrations/` maintains strictly forward-only migrations without destructive down migrations to prevent data loss.
8. Test suite passes all tests and meets or exceeds the 80% coverage threshold enforced by `vitest.config.ts`.

### Key Discoveries:

- [src/lib/session.ts:9-13](../../../src/lib/session.ts#L9-L13): `DEFAULT_SESSION_TTL_SECONDS = 86400` (24 hours) and `SESSION_COOKIE_NAME` selects `__Host-scytala_session` in production and `scytala_session` in development/testing.
- [src/lib/session.ts:176-299](../../../src/lib/session.ts#L176-L299): `verifySessionToken` verifies HMAC-SHA256 signature, validates `exp`/`iat` timestamps, and returns typed `{ dashboard_id, dashboard_hash, user_id, user_alias }`.
- [src/lib/crypto.ts:130-179](../../../src/lib/crypto.ts#L130-L179): `verifyPassword(password, storedHash)` verifies PBKDF2 hashes in constant time.
- [src/client/db-client.ts:149-198](../../../src/client/db-client.ts#L149-L198): Complete domain methods `getDashboardByHash`, `getDashboardUserByAlias`, and `getNotesByDashboard` are ready for direct consumption.
- Next.js 16 App Router requires awaiting `params` (`const { hash } = await params`) and `cookies()` (`const cookieStore = await cookies()`).

## What We're NOT Doing

- **No Note CRUD (Create, Edit, Delete):** Note editing and version persistence are strictly reserved for North Star slice `S-03`. The `+ New Note` button is rendered disabled with an informative tooltip in S-02.
- **No Note Version History Browser:** Version history timeline browsing is reserved for `S-04`. S-02 displays only the active note title, content, version number badge (`v1`), and last-updated timestamp.
- **No Active Remote Sync / Conflict Resolution:** Manual sync diffing is reserved for `S-05`.
- **No Pre-Auth Metadata Preview:** To maximize privacy, the login view does not display the dashboard title or participant count to unauthenticated visitors.
- **No Global Account Auth / Multi-Dashboard Sessions:** Sessions remain strictly isolated per-dashboard token.

## Implementation Approach

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│               GET /dashboard/[hash] (Next.js 16 Server Component: page.tsx)            │
│                                                                                        │
│  1. const { hash } = await params;                                                     │
│  2. db.getDashboardByHash(hash) ──[ null ]──> notFound() (HTTP 404)                   │
│  3. const session = await verifySession(cookies())                                     │
│  4. Session valid & matches dashboard?                                                 │
│        │                                                                               │
│        ├──[ NO ]───> SSR: <LoginForm dashboardHash={hash} />                          │
│        │                  (Minimalist, generic, zero metadata leakage)                 │
│        │                                                                               │
│        └──[ YES ]──> SSR: db.getNotesByDashboard(dashboard.id)                         │
│                           Sort notes: updated_at desc                                  │
│                           Stream: <DashboardView dashboard={dashboard}                │
│                                                  userAlias={session.user_alias}        │
│                                                  notes={notes} />                      │
└───────────────────────────────────────────────┬────────────────────────────────────────┘
                                                │
             ┌──────────────────────────────────┴──────────────────────────────────┐
             ▼                                                                     ▼
┌──────────────────────────────────────────────┐    ┌──────────────────────────────────────────────┐
│  Client Action: loginToDashboardAction       │    │  Client Action: logoutFromDashboardAction    │
│                                              │    │                                              │
│  1. Zod validate (hash, alias, password)     │    │  1. const cookieStore = await cookies();     │
│  2. db.getDashboardUserByAlias()             │    │  2. cookieStore.delete(SESSION_COOKIE_NAME); │
│  3. Constant-time verifyPassword()           │    │  3. Return { success: true }                 │
│     (with dummy PBKDF2 hash on missing user) │    └──────────────────────────────────────────────┘
│  4. createSessionToken() (24h TTL)           │
│  5. cookieStore.set(SESSION_COOKIE_NAME)     │
│  6. Return { success: true }                 │
└──────────────────────────────────────────────┘
```

## Critical Implementation Details

### 1. Zod Validation Schemas (`src/schemas/auth.ts`):

```typescript
import { z } from "zod";
import { ALIAS_REGEX } from "./dashboard";

export const loginDashboardSchema = z.object({
  dashboardHash: z
    .string()
    .trim()
    .min(1, "Dashboard identifier is required"),
  userAlias: z
    .string()
    .trim()
    .min(2, "Alias must be at least 2 characters")
    .max(30, "Alias must be at most 30 characters")
    .regex(ALIAS_REGEX, "Alias contains invalid characters"),
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password is too long"),
});

export type LoginDashboardInput = z.infer<typeof loginDashboardSchema>;

export type LoginDashboardActionResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

export type LogoutDashboardActionResult = {
  success: boolean;
  error?: string;
};
```

### 2. Authentication Server Actions (`src/actions/auth.ts`):

```typescript
"use server";

import { cookies } from "next/headers";
import { createDatabaseClient } from "@/client/db-client";
import { verifyPassword } from "@/lib/crypto";
import {
  createSessionToken,
  DEFAULT_SESSION_TTL_SECONDS,
  getSessionSecret,
  SESSION_COOKIE_NAME,
} from "@/lib/session";
import {
  loginDashboardSchema,
  type LoginDashboardActionResult,
  type LoginDashboardInput,
  type LogoutDashboardActionResult,
} from "@/schemas/auth";

// Precomputed valid PBKDF2 hash for constant-time timing equalization on non-existent users
const DUMMY_PBKDF2_HASH =
  "$pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";

export async function loginToDashboardAction(
  input: LoginDashboardInput,
): Promise<LoginDashboardActionResult> {
  const parsed = loginDashboardSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid credentials format.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { dashboardHash, userAlias, password } = parsed.data;
  const db = createDatabaseClient();

  try {
    const dashboard = await db.getDashboardByHash(dashboardHash);
    if (!dashboard) {
      // Run dummy password check to equalize timing before returning generic error
      await verifyPassword(password, DUMMY_PBKDF2_HASH);
      return {
        success: false,
        error: "Invalid alias or password.",
      };
    }

    const user = await db.getDashboardUserByAlias(dashboard.id, userAlias);
    if (!user) {
      await verifyPassword(password, DUMMY_PBKDF2_HASH);
      return {
        success: false,
        error: "Invalid alias or password.",
      };
    }

    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return {
        success: false,
        error: "Invalid alias or password.",
      };
    }

    const secret = getSessionSecret();
    const token = await createSessionToken(
      {
        dashboard_id: dashboard.id,
        dashboard_hash: dashboard.hash,
        user_id: user.id,
        user_alias: user.user_alias,
      },
      secret,
      DEFAULT_SESSION_TTL_SECONDS,
    );

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DEFAULT_SESSION_TTL_SECONDS,
    });

    return { success: true };
  } catch (error) {
    console.error("[loginToDashboardAction] Error:", error);
    return {
      success: false,
      error: "Authentication service temporarily unavailable. Please try again.",
    };
  }
}

export async function logoutFromDashboardAction(): Promise<LogoutDashboardActionResult> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);
    return { success: true };
  } catch (error) {
    console.error("[logoutFromDashboardAction] Error:", error);
    return { success: false, error: "Failed to log out." };
  }
}
```

### 3. Server Component Route Orchestration (`src/app/dashboard/[hash]/page.tsx`):

```typescript
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createDatabaseClient } from "@/client/db-client";
import {
  getSessionSecret,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import { LoginForm } from "./components/LoginForm";
import { DashboardView } from "./components/DashboardView";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  if (!hash || hash.trim().length === 0) {
    notFound();
  }

  const db = createDatabaseClient();
  const dashboard = await db.getDashboardByHash(hash);
  if (!dashboard) {
    notFound();
  }

  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const secret = getSessionSecret();

  const session = rawToken ? await verifySessionToken(rawToken, secret) : null;
  const isAuthenticated =
    session &&
    session.dashboard_id === dashboard.id &&
    session.dashboard_hash === dashboard.hash;

  if (!isAuthenticated) {
    return <LoginForm dashboardHash={hash} />;
  }

  const rawNotes = await db.getNotesByDashboard(dashboard.id);
  const notes = [...rawNotes].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  return (
    <DashboardView
      dashboard={dashboard}
      userAlias={session.user_alias}
      notes={notes}
    />
  );
}
```

### 4. Zero-Dependency Structured JSON Logger (`src/lib/logger.ts`):

```typescript
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

### 5. Health Check Probe Endpoint (`src/app/api/health/route.ts` & DB Client Extension):

```typescript
// src/app/api/health/route.ts
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

### 6. Hybrid Edge Rate Limiter (`src/lib/rate-limit.ts`):

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

const ephemeralCache = new Map<string, number>();

export class InMemorySlidingWindowStore {
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

### 7. Environment Validation & Template (`src/lib/env.ts` & `.env.example`):

```typescript
// src/lib/env.ts
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

### 8. OWASP HTTP Security Headers (`next.config.ts`):

```typescript
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

// In nextConfig.headers:
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
}
```

---

## Implementation Phases

### Phase 1: Authentication Schemas & Server Actions (`src/schemas/auth.ts`, `src/actions/auth.ts`, `src/lib/session.ts`)

- Export `getSessionSecret(): string` from `src/lib/session.ts` with strict production validation (throws if `SESSION_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` is missing in production; falls back to dev key in development/test).
- Implement `src/schemas/auth.ts` with Zod schema `loginDashboardSchema`, input types, and action result interfaces.
- Implement `src/actions/auth.ts` with `"use server"`:
  - `loginToDashboardAction(input: LoginDashboardInput): Promise<LoginDashboardActionResult>`
    - Validates inputs using `loginDashboardSchema.safeParse`.
    - Retrieves dashboard by hash.
    - Implements timing attack mitigation: verifies dummy PBKDF2 hash on missing dashboard or missing user alias before returning sanitized generic error.
    - Verifies password against stored PBKDF2 hash using `verifyPassword`.
    - Signs HMAC-SHA256 JWT using `createSessionToken` with 24-hour TTL (`DEFAULT_SESSION_TTL_SECONDS = 86400`).
    - Writes cookie using `(await cookies()).set(SESSION_COOKIE_NAME, token, { httpOnly: true, secure: ..., sameSite: "lax", path: "/", maxAge: 86400 })`.
    - Handles exceptions and returns sanitized `{ success: false, error: ... }`.
  - `logoutFromDashboardAction(): Promise<LogoutDashboardActionResult>`
    - Clears session cookie via `(await cookies()).delete(SESSION_COOKIE_NAME)`.
- Create unit test suite `src/__tests__/actions/auth.test.ts` testing:
  - Successful login with correct credentials sets cookie and returns `{ success: true }`.
  - Validation failure on empty or malformed inputs returns field errors.
  - Non-existent dashboard hash returns generic `"Invalid alias or password."` error.
  - Non-existent user alias returns generic `"Invalid alias or password."` error.
  - Incorrect password returns generic `"Invalid alias or password."` error.
  - Database or unexpected exception returns sanitized service unavailable error.
  - Successful logout deletes cookie and returns `{ success: true }`.

**Verification:**
```bash
npm run test -- src/__tests__/actions/auth.test.ts
```

---

### Phase 2: Client Authentication UI Component (`src/app/dashboard/[hash]/components/LoginForm.tsx`)

- Create `src/app/dashboard/[hash]/components/LoginForm.tsx` as a Client Component (`"use client"`):
  - Centered responsive layout using `@mui/material/Box`, `Container`, and `Card` styled with Papyrus paper surface (`bgcolor: "background.paper"`, warm border, elevated shadow).
  - Minimalist branding: Scytala logo / cipher title ("Scytala Dashboard Login"), explanatory subtitle ("Enter your participant credentials to access this dashboard"). No pre-auth dashboard title or description displayed.
  - `TextField` for User Alias (`autoFocus`, required, `autoComplete="username"`).
  - `TextField` for Password (`type="password"` with show/hide toggle `IconButton` via `Visibility` / `VisibilityOff` icons, `autoComplete="current-password"`).
  - Submit `Button` ("Sign In") with `CircularProgress` loading spinner during action execution.
  - Inline `Alert` (severity="error") displaying error message when login fails.
  - Form submission handles `useTransition` / `useState` for loading states and calls `router.refresh()` upon successful login to trigger immediate server re-render.
- Create unit test suite `src/__tests__/app/dashboard/components/LoginForm.test.tsx` verifying:
  - Form renders inputs and submit button.
  - Password visibility toggle changes input type between password and text.
  - Submitting invalid values displays validation error alert.
  - Submitting valid credentials calls `loginToDashboardAction` and refreshes router on success.
  - Displays server error alert when login action returns failure.

**Verification:**
```bash
npm run test -- src/__tests__/app/dashboard/components/LoginForm.test.tsx
```

---

### Phase 3: Server Component Dashboard Tiles View & Subcomponents (`src/app/dashboard/[hash]/components/`)

- Create `src/app/dashboard/[hash]/components/LogoutButton.tsx` (`"use client"`):
  - Renders MUI `Button` or `IconButton` with `Logout` icon.
  - Calls `logoutFromDashboardAction()` in a transition, setting pending state, and calls `router.refresh()` on completion.
- Create `src/app/dashboard/[hash]/components/DashboardHeader.tsx` (Server Component):
  - Top navigation and metadata bar with dashboard title (`Typography variant="h1"` / `h4` in `IM Fell English` serif font).
  - Optional dashboard description.
  - Current participant identity badge: `Chip` with avatar/icon showing `user_alias`.
  - Action buttons cluster: `LogoutButton` and a placeholder disabled `SyncButton` ("Sync (Up to date)").
- Create `src/app/dashboard/[hash]/components/NoteTile.tsx` (Server Component):
  - Renders note as an elevated MUI `Card` with papyrus paper texture styling.
  - Note title with fallback to `"Untitled Note"`.
  - Plain text note content preview with multi-line clamping (`Typography` with `sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}`).
  - Footer bar with version chip (`Chip label={`v${note.version || 1}`} size="small" variant="outlined"`) and formatted last updated date (`dayjs(note.updated_at).format("YYYY-MM-DD HH:mm")`).
- Create `src/app/dashboard/[hash]/components/NoteGrid.tsx` (Server Component):
  - Responsive CSS Grid / Flexbox container layout (`display: "grid"`, `gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))"`, `gap: 2.5`).
  - Iterates over `notes` array and renders `<NoteTile />` for each note.
- Create `src/app/dashboard/[hash]/components/EmptyNotesState.tsx` (Server Component):
  - Centered papyrus `Card` displaying an empty document icon (`DescriptionOutlined`), title `"No notes yet"`, and description `"Notes created by participants on this dashboard will appear here as tiles."`.
  - Disabled `Button` (`+ New Note`) with `Tooltip title="Note creation coming in S-03"`.
- Create `src/app/dashboard/[hash]/components/DashboardView.tsx` (Server Component):
  - Main container layout assembling `<DashboardHeader />` and either `<NoteGrid notes={notes} />` (if notes exist) or `<EmptyNotesState />` (if notes array is empty).
  - Export all components from `src/app/dashboard/[hash]/components/index.ts`.
- Create unit test suite `src/__tests__/app/dashboard/components/DashboardComponents.test.tsx` verifying:
  - `DashboardHeader` renders title, description, and participant alias chip.
  - `NoteTile` renders title, content, version badge, and formatted date.
  - `NoteGrid` renders all note items in grid layout.
  - `EmptyNotesState` renders prompt and disabled CTA with tooltip.
  - `LogoutButton` triggers `logoutFromDashboardAction` on click.

**Verification:**
```bash
npm run test -- src/__tests__/app/dashboard/components/
```

---

### Phase 4: Route SSR Orchestration & Integration Verification (`src/app/dashboard/[hash]/page.tsx`)

- Implement `src/app/dashboard/[hash]/page.tsx` as an asynchronous Server Component:
  - Extracts and validates `hash` from `await params`.
  - Invokes `db.getDashboardByHash(hash)`; if not found, calls Next.js `notFound()`.
  - Reads session cookie `SESSION_COOKIE_NAME` from `await cookies()`.
  - Verifies token with `verifySessionToken(token, secret)`.
  - If unauthenticated or token dashboard ID does not match current dashboard ID, renders `<LoginForm dashboardHash={hash} />`.
  - If authenticated, queries `db.getNotesByDashboard(dashboard.id)`, sorts notes by `updated_at` descending, and returns `<DashboardView dashboard={dashboard} userAlias={session.user_alias} notes={notes} />`.
- Implement integration test suite `src/__tests__/app/dashboard/page.test.tsx`:
  - Non-existent dashboard hash triggers `notFound()`.
  - Unauthenticated visitor (no cookie) renders `LoginForm`.
  - Visitor with expired or invalid JWT token renders `LoginForm`.
  - Visitor with valid JWT token for a different dashboard ID renders `LoginForm`.
  - Authenticated user with valid matching JWT renders `DashboardView` with sorted note tiles.
  - Authenticated user on empty dashboard renders `EmptyNotesState`.
- Run full test suite with coverage enforcement to verify $\ge 80\%$ coverage across all lines, functions, branches, and statements.

**Verification:**
```bash
npm run test
npm run lint
```

---

### Phase 5: Configuration Management, Environment Validation & Structured Logging (`src/lib/logger.ts`, `src/lib/env.ts`, `.env.example`)

- Implement `src/lib/logger.ts`:
  - Zero-dependency, edge-compatible structured JSON logger.
  - Implements recursive credential/hash/token sanitization (`password`, `password_hash`, `jwt`, `token`, `secret`, `authorization`, `cookie`, `key`, `$pbkdf2$...`, `Bearer ...`).
  - Circular reference protection via `WeakSet`.
  - Child logger factory (`logger.child({ action, dashboardId })`) to preserve request and action context.
  - Pretty-printed colored console output in `development`; single-line `ndjson` in `production` for Cloudflare Workers Logs.
- Implement `src/lib/env.ts`:
  - Runtime environment schema validation using Zod.
  - Validates `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` ($\ge 32$ chars), `DEPLOY_ID`, `APP_VERSION`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `LOG_LEVEL`.
  - Fails fast with descriptive error messages on missing or invalid configuration.
- Create `.env.example` in the project root:
  - Document all mandatory and optional environment variables with descriptions, clarifying `SUPABASE_SERVICE_ROLE_KEY` requirements and local vs production values.
- Refactor `src/actions/auth.ts` and `src/actions/dashboard.ts`:
  - Replace raw `console.error` calls with scoped `logger.child({ action: ... })`.
- Create unit test suites:
  - `src/__tests__/lib/logger.test.ts`: Test log levels, recursive sanitization of passwords and JWT tokens, circular reference handling, and JSON formatting.
  - `src/__tests__/lib/env.test.ts`: Test valid env parsing, missing mandatory key rejection, and short secret length rejection.

**Verification:**
```bash
npm run test -- src/__tests__/lib/logger.test.ts src/__tests__/lib/env.test.ts
```

---

### Phase 6: Health Check Probe & Database Reliability (`src/app/api/health/route.ts`, `src/client/db-client.ts`, `src/lib/supabase.ts`)

- Extend `DatabaseClient` interface in `src/client/db-client.ts`:
  - Add `checkHealth(signal?: AbortSignal): Promise<HealthCheckResult>`.
  - Define `HealthCheckResult` interface (`status: "up" | "down"`, `latencyMs: number`, `error?: string`).
- Implement `checkHealth` in `src/lib/supabase.ts`:
  - Executes a lightweight query against `info` table with `.abortSignal(signal)`.
  - Measures execution latency using `performance.now()`.
  - Catches timeouts (`AbortError` / `TimeoutError`) and returns clean `{ status: "down", latencyMs, error }`.
- Implement `src/app/api/health/route.ts` (Next.js App Router Route Handler):
  - `export const dynamic = "force-dynamic"`.
  - Sets `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`.
  - Passes `AbortSignal.timeout(5000)` to `db.checkHealth`.
  - Returns HTTP 200 with `{ status: "healthy", timestamp, version, uptime_seconds, checks: { database: { status: "up", latency_ms } } }` when database is healthy.
  - Returns HTTP 503 with `{ status: "unhealthy", ... }` when database is degraded or probe times out without leaking connection strings or schema details.
- Standardize forward-only database migrations in `supabase/migrations/` (avoiding destructive `down.sql` / `DROP TABLE CASCADE` scripts to prevent data loss).
- Create unit test suite `src/__tests__/app/api/health.test.ts`:
  - Tests HTTP 200 OK response with healthy payload and headers.
  - Tests HTTP 503 Service Unavailable when DB is down.
  - Tests timeout handling and structured logging on probe failure.

**Verification:**
```bash
npm run test -- src/__tests__/app/api/health.test.ts
```

---

### Phase 7: Hybrid Edge Rate Limiting & Auth Hardening (`src/lib/rate-limit.ts`, `src/actions/auth.ts`, `src/actions/dashboard.ts`)

- Install `@upstash/ratelimit` and `@upstash/redis`:
  ```bash
  npm install @upstash/ratelimit @upstash/redis
  ```
- Implement `src/lib/rate-limit.ts`:
  - **Hybrid Dual-Engine**:
    - Production: `@upstash/ratelimit` with `slidingWindow` and `ephemeralCache` (in-memory L1 isolate cache).
    - Local Dev / Vitest Fallback: `InMemorySlidingWindowStore` when Upstash environment variables are absent.
  - Client IP extraction helper `getClientIp()` using `await headers().get("cf-connecting-ip")` with `x-forwarded-for` and fallback.
  - Multi-tier limiters:
    - `authIp`: Max 10 requests / 60s per client IP.
    - `authAccount`: Max 5 failed attempts / 15m per `${dashboardHash}:${userAlias}`.
    - `dashboardCreate`: Max 5 dashboards / 1h per client IP.
- Integrate into `src/actions/auth.ts` (`loginToDashboardAction`):
  - Check IP rate limit and Account rate limit before running PBKDF2 verification.
  - Return `{ success: false, error: "...", rateLimited: true, retryAfterSeconds }` when throttled.
- Integrate into `src/actions/dashboard.ts` (`createDashboardAction`):
  - Check dashboard creation IP rate limit before hashing passwords and invoking DB RPC.
- Create unit test suite `src/__tests__/lib/rate-limit.test.ts` and update `src/__tests__/actions/auth.test.ts` & `src/__tests__/actions/dashboard.test.ts`:
  - Mock `next/headers` to return simulated `cf-connecting-ip`.
  - Test that exceeding thresholds blocks action execution and returns structured retry time.
  - Verify in-memory reset between test runs.

**Verification:**
```bash
npm run test -- src/__tests__/lib/rate-limit.test.ts src/__tests__/actions/
```

---

### Phase 8: Security Hardening, App Router Error Boundaries & Observability Activation (`next.config.ts`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `wrangler.jsonc`)

- Update `next.config.ts`:
  - Declare OWASP security headers via `async headers()`:
    - `Content-Security-Policy`: Tailored for Next.js App Router + Emotion styles (`style-src 'self' 'unsafe-inline'`, `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, `img-src 'self' data: blob: https:`, `font-src 'self' data: https://fonts.gstatic.com`, `connect-src 'self' https://*.supabase.co https://*.upstash.io http://127.0.0.1:* http://localhost:*`).
    - `X-Frame-Options: DENY`.
    - `X-Content-Type-Options: nosniff`.
    - `Referrer-Policy: strict-origin-when-cross-origin`.
    - `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`.
    - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
- Create Papyrus MUI themed error boundaries:
  - `src/app/error.tsx`: Route-level error boundary with `PapyrusThemeLight` card, terracotta warning icon, error explanation, "Try Again" (`reset()`), and "Return Home" buttons.
  - `src/app/global-error.tsx`: Root layout error boundary providing fallback HTML and restart button if `app/layout.tsx` fails.
  - `src/app/not-found.tsx`: 404 page with Papyrus styling, "Create New Dashboard" CTA, and "Return Home" CTA.
- Update `wrangler.jsonc`:
  - Set `"compatibility_date": "2025-08-16"`.
  - Add `"observability": { "enabled": true, "logs": { "invocation_logs": true, "head_sampling_rate": 1 } }`.
- Create unit test suites:
  - `src/__tests__/app/error.test.tsx`: Tests rendering of error UI, logging of caught error, and reset invocation.
  - `src/__tests__/app/not-found.test.tsx`: Tests rendering of 404 UI and navigation links.
- Run full test suite with coverage enforcement, linting, and OpenNext worker build:
  ```bash
  npm run test
  npm run lint
  npm run build:worker
  ```

---

### Phase 9: Native Stack Rate Limiting Migration: Upstash Removal & Cloudflare + Supabase Implementation (`wrangler.jsonc`, `supabase/migrations/`, `src/lib/rate-limit.ts`, `package.json`, `.env.example`, `next.config.ts`)

- **Uninstall Upstash Dependencies & Configuration Cleanup**:
  - Remove `@upstash/ratelimit` and `@upstash/redis` from `package.json` and `package-lock.json`.
  - Remove `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from `src/lib/env.ts` and `.env.example`.
  - Remove `https://*.upstash.io` from the `connect-src` CSP directive in `next.config.ts`.
- **Database Rate Limiting Schema & Atomic Stored Procedure**:
  - Add SQL migration `supabase/migrations/20260828000000_create_rate_limits_rpc.sql`:
    - Create `rate_limits` table (`key TEXT PRIMARY KEY, tokens DOUBLE PRECISION, last_refill TIMESTAMPTZ`).
    - Enable RLS, revoke permissions from `PUBLIC`/`anon`/`authenticated`, and grant full access to `service_role`.
    - Create `SECURITY DEFINER` atomic RPC function `check_rate_limit(p_key TEXT, p_max_tokens DOUBLE PRECISION, p_refill_rate DOUBLE PRECISION)` implementing Token Bucket algorithm with lazy refill via `INSERT ... ON CONFLICT DO UPDATE`.
- **Configure Native Cloudflare Rate Limiting Binding**:
  - Update `wrangler.jsonc` to declare the native `"ratelimits"` binding:
    - `"name": "AUTH_IP_LIMITER"`, `"namespace_id": "1001"`, `"simple": { "limit": 10, "period": 60 }`.
- **Refactor Rate Limiting Engine (`src/lib/rate-limit.ts`)**:
  - Re-architect `checkRateLimit` to use:
    1. **`authIp` (10 req / 60s)**: Native Cloudflare Rate Limiter (`getCloudflareContext().env.AUTH_IP_LIMITER.limit({ key: clientIp })`) in edge runtime, gracefully falling back to `inMemoryStore` in local test/dev environments.
    2. **`authAccount` (5 req / 15m) & `dashboardCreate` (5 req / 1h)**: Supabase RPC `check_rate_limit` via `createServerClient()`, gracefully falling back to `inMemoryStore` on network or database failure.
    3. **`inMemoryStore`**: Retained as pure TypeScript sliding-window fallback for Vitest and offline development.
- **Update Test Suites & CI Verification**:
  - Update `src/__tests__/lib/rate-limit.test.ts` to test:
    - Cloudflare binding rate limit path and quota exhaustion.
    - Supabase RPC rate limit path and quota exhaustion.
    - Automatic in-memory fallback when Cloudflare binding or Supabase RPC fails.
    - Window expiration and reset mechanisms.
  - Update `src/__tests__/lib/env.test.ts` to verify env validation without Upstash keys.
  - Run full test suite with coverage enforcement (`npm run test`), linting (`npm run lint`), and OpenNext worker build (`npm run build:worker`).

**Verification:**
```bash
npm run test
npm run lint
npm run build:worker
```

---

### Phase 10: Session Hardening & RSC Boundary Defense (`src/app/dashboard/[hash]/page.tsx`, `src/lib/session.ts`, `src/app/dashboard/[hash]/components/LogoutButton.tsx`, `src/__tests__/app/dashboard/page.test.tsx`)

- **DTO Sanitization & RSC Flight Payload Boundary Pruning (`src/app/dashboard/[hash]/page.tsx`)**:
  - Implement explicit Data Transfer Object (DTO) mapping functions for `dashboard` and `notes` before passing them across the Server-to-Client component boundary to `<DashboardView />`.
  - Ensure only strictly required presentation attributes (`title`, `description`, `notes: { id, title, content, version, updated_at }`) are serialized into the React Flight wire format payload, mitigating over-fetching and accidental database attribute leakage (CWE-200 / CWE-201).
- **Multi-Tab & Multi-Dashboard Session Isolation (`src/lib/session.ts`, `src/actions/auth.ts`)**:
  - Update session cookie handling to support concurrent dashboard sessions across multiple browser tabs without overwriting active credentials (e.g. cookie name namespacing with hash prefix or multi-dashboard session claim container).
- **Client Cache Purge & Hard Navigation on Logout (`src/app/dashboard/[hash]/components/LogoutButton.tsx`)**:
  - Update `LogoutButton.tsx` post-logout handling to trigger a hard client-side navigation (`window.location.replace("/")` or `window.location.href`) instead of soft `router.refresh()`, purging Next.js in-memory Router Cache and preventing back-forward cache (bfcache) note exposure on shared devices.
- **SSR Authentication Test Expansion (`src/__tests__/app/dashboard/page.test.tsx`)**:
  - Add explicit unit and integration tests covering:
    - Expired JWT session token handling (verifying clean fallback to `LoginForm` without unhandled exceptions).
    - Database error resilience when `db.getNotesByDashboard` fails (verifying error boundary / fallback behavior).
    - DTO props validation ensuring no unrendered database properties leak across the RSC boundary.

**Verification:**
```bash
npm run test -- src/__tests__/app/dashboard/
npm run lint
```

---

## Testing Strategy

| Test File | Target | Key Test Cases |
|---|---|---|
| `src/__tests__/actions/auth.test.ts` | `loginToDashboardAction`, `logoutFromDashboardAction`, `loginDashboardSchema` | - Schema validation rejects empty hash, empty password, invalid alias characters.<br>- Successful login sets HttpOnly session cookie and returns `{ success: true }`.<br>- Missing dashboard, missing user, and incorrect password return constant-time generic error `"Invalid alias or password."`<br>- Exceeding IP or account rate limit returns throttled error.<br>- Logout deletes cookie and returns `{ success: true }`. |
| `src/__tests__/actions/dashboard.test.ts` | `createDashboardAction`, `createDashboardSchema` | - Schema validation rejects invalid title/alias.<br>- Successful creation returns dashboard and credentials.<br>- Exceeding creation rate limit returns throttled error. |
| `src/__tests__/lib/logger.test.ts` | `Logger` in `src/lib/logger.ts` | - Formats single-line JSON with timestamp, level, service, context.<br>- Recursively redacts passwords, JWTs, bearer tokens, hashes, session secrets.<br>- Handles circular references cleanly without crashing.<br>- Child loggers inherit and extend context. |
| `src/__tests__/lib/env.test.ts` | `getEnv` in `src/lib/env.ts` | - Validates required Supabase and session secret keys.<br>- Throws descriptive error on missing required keys or short session secrets.<br>- Validates cleanly without Upstash environment variables. |
| `src/__tests__/lib/rate-limit.test.ts` | `checkRateLimit`, Cloudflare binding, Supabase RPC, `InMemorySlidingWindowStore` | - Enforces sliding window / token bucket limits across consecutive calls.<br>- Tests Cloudflare `AUTH_IP_LIMITER` binding and Supabase `check_rate_limit` RPC paths.<br>- Tests graceful fallback to `inMemoryStore` on failure or unconfigured environments.<br>- Returns remaining quota and accurate `retryAfterSeconds` on exhaustion. |
| `src/__tests__/app/api/health.test.ts` | `GET /api/health` | - Returns HTTP 200 with healthy DB status and latency.<br>- Returns HTTP 503 when DB check throws or times out.<br>- Sets `no-store` cache headers. |
| `src/__tests__/app/dashboard/components/LoginForm.test.tsx` | `LoginForm.tsx` | - Form renders alias, password, and submit button.<br>- Password visibility toggle switches input type between password and text.<br>- Form submit calls `loginToDashboardAction` and refreshes router on success.<br>- Form submit displays error Alert on action failure. |
| `src/__tests__/app/dashboard/components/DashboardComponents.test.tsx` | `DashboardHeader`, `NoteTile`, `NoteGrid`, `EmptyNotesState`, `LogoutButton` | - Header renders dashboard title, description, and participant chip.<br>- NoteTile renders note title, content preview, version badge (`v1`), and formatted date.<br>- EmptyNotesState renders placeholder prompt and disabled `+ New Note` button with tooltip.<br>- LogoutButton calls `logoutFromDashboardAction`. |
| `src/__tests__/app/dashboard/page.test.tsx` | `src/app/dashboard/[hash]/page.tsx` | - Route returns 404 (`notFound()`) for non-existent dashboard.<br>- Unauthenticated request renders `LoginForm`.<br>- Authenticated request renders `DashboardView` with notes sorted `updated_at` descending.<br>- Dashboard with 0 notes renders `EmptyNotesState`.<br>- Expired JWT session token gracefully falls back to `LoginForm`.<br>- Database query errors are handled gracefully.<br>- DTO props boundary prevents unrendered DB attributes from leaking into RSC flight payload. |
| `src/__tests__/app/error.test.tsx` | `src/app/error.tsx` | - Renders Papyrus error card with action buttons.<br>- Clicking "Try Again" triggers `reset()`.<br>- Logs error to structured logger. |
| `src/__tests__/app/not-found.test.tsx` | `src/app/not-found.tsx` | - Renders 404 card with navigation links to `/` and `/new`. |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **User / Dashboard Enumeration via Auth Timing** | Attacker probes dashboard URLs or participant aliases by measuring response latency differences. | `loginToDashboardAction` computes a dummy PBKDF2 hash verification on missing dashboards and non-existent aliases, equalizing execution time to ~50ms across all invalid attempts. |
| **PBKDF2 Password Brute-Force / DoS** | High-throughput automated attacks exhaust Cloudflare Worker isolate CPU with PBKDF2 hashing (100,000 iterations). | Dual-tier sliding window rate limiting throttles IP requests (10/min) and targeted accounts (5/15m). `ephemeralCache` rejects repeat abusers locally in 0.1ms. |
| **Third-Party Dependency Failure & External Latency** | Upstash outages or network hops add latency to auth checks and introduce external failure modes. | Phase 9 migrates to Cloudflare Workers native rate limiter (0ms latency, local PoP) and Supabase Postgres RPC (strong consistency, no new vendors), completely eliminating Upstash. |
| **Pre-Auth Metadata Privacy Leak** | Anyone with the 16-character link learns sensitive dashboard details before logging in. | `LoginForm` renders a generic login UI without displaying the dashboard title, description, or participant list until authentication succeeds. |
| **XSS Token Exfiltration** | Malicious scripts attempt to read session tokens from browser storage. | Session tokens are stored strictly in `HttpOnly`, `Secure`, `SameSite=Lax` cookies with `__Host-` prefix in production, inaccessible to client JavaScript. Strict CSP headers in `next.config.ts` restrict unauthorized scripts and framing. |
| **Cross-Dashboard Session Hijacking** | Valid session token from Dashboard A is sent to Dashboard B. | `page.tsx` and Server Actions strictly enforce that `token.dashboard_id === dashboard.id` and `token.dashboard_hash === dashboard.hash`. |
| **RSC Flight Payload Over-Fetching / Field Leakage (CWE-200)** | Unrendered database columns or sensitive internal properties leak across the RSC boundary into client Flight payloads. | Phase 10 implements strict DTO mappers before passing data from Server Components to Client Components. |
| **Multi-Dashboard Session Collisions / Cookie Overwrite** | Users operating multiple dashboards in different tabs experience session overwriting and unexpected logouts. | Phase 10 introduces scoped session cookie namespacing or multi-session claim payload containers. |
| **Client Cache / bfcache Note Retention Post-Logout** | Soft client transitions retain sensitive note tiles in the browser's Back-Forward Cache after logout. | `LogoutButton` triggers a hard navigation (`window.location.replace`) to clear in-memory RSC caches and history DOM state. |
| **Credential Leakage in Logs** | Sensitive passwords, tokens, or hashes appear in Cloudflare log sinks. | `src/lib/logger.ts` recursively sanitizes all log arguments, redacting sensitive keys and regex value patterns. |
| **Isolate APM Runtime Incompatibility** | Heavy APM agents (`@sentry/node`, OTel) break V8 isolate bundling or exceed 3MB script size limit. | Server-side observability utilizes Cloudflare Native Workers Logs ($0, 0 KB bundle) and structured JSON logging. |

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Authentication Schemas & Server Actions (`src/schemas/auth.ts`, `src/actions/auth.ts`, `src/lib/session.ts`)

#### Automated

- [x] 1.1 Implement Zod validation schema and action contracts in src/schemas/auth.ts
- [x] 1.2 Implement loginToDashboardAction with constant-time dummy PBKDF2 hash and session cookie setting in src/actions/auth.ts
- [x] 1.3 Implement logoutFromDashboardAction with session cookie deletion in src/actions/auth.ts
- [x] 1.4 Implement unit test suite in src/__tests__/actions/auth.test.ts

### Phase 2: Client Authentication UI Component (`src/app/dashboard/[hash]/components/LoginForm.tsx`)

#### Automated

- [x] 2.1 Implement LoginForm client component with minimalist branding and password visibility toggle
- [x] 2.2 Implement unit test suite in src/__tests__/app/dashboard/components/LoginForm.test.tsx

### Phase 3: Server Component Dashboard Tiles View & Subcomponents (`src/app/dashboard/[hash]/components/`)

#### Automated

- [x] 3.1 Implement LogoutButton client component
- [x] 3.2 Implement DashboardHeader server component with participant chip and sync button
- [x] 3.3 Implement NoteTile and NoteGrid server components with version badge and formatted date
- [x] 3.4 Implement EmptyNotesState server component with disabled CTA and tooltip
- [x] 3.5 Implement DashboardView container component and component index
- [x] 3.6 Implement unit test suite in src/__tests__/app/dashboard/components/DashboardComponents.test.tsx

### Phase 4: Route SSR Orchestration & Integration Verification (`src/app/dashboard/[hash]/page.tsx`)

#### Automated

- [x] 4.1 Implement src/app/dashboard/[hash]/page.tsx with Next.js 16 async params, cookies, and SSR branching
- [x] 4.2 Implement integration test suite in src/__tests__/app/dashboard/page.test.tsx
- [x] 4.3 Run test suite with coverage enforcement to verify >= 80% coverage and linting

### Phase 5: Configuration Management, Environment Validation & Structured Logging (`src/lib/logger.ts`, `src/lib/env.ts`, `.env.example`)

#### Automated

- [x] 5.1 Implement zero-dependency structured JSON logger with recursive redaction in src/lib/logger.ts
- [x] 5.2 Implement runtime environment schema validation with Zod in src/lib/env.ts
- [x] 5.3 Create comprehensive .env.example with documentation for all required and optional keys
- [x] 5.4 Refactor server actions (auth.ts, dashboard.ts) to use structured logger
- [x] 5.5 Implement unit test suites in src/__tests__/lib/logger.test.ts and src/__tests__/lib/env.test.ts

### Phase 6: Health Check Probe & Database Reliability (`src/app/api/health/route.ts`, `src/client/db-client.ts`, `src/lib/supabase.ts`)

#### Automated

- [x] 6.1 Extend DatabaseClient interface and SupabaseDatabaseClient adapter with checkHealth method using AbortSignal.timeout(5000)
- [x] 6.2 Implement GET /api/health Route Handler with 200/503 status and sanitized operational metrics
- [x] 6.3 Standardize forward-only database migrations in supabase/migrations/ (rejecting destructive down migrations)
- [x] 6.4 Implement unit test suite in src/__tests__/app/api/health.test.ts

### Phase 7: Hybrid Edge Rate Limiting & Auth Hardening (`src/lib/rate-limit.ts`, `src/actions/auth.ts`, `src/actions/dashboard.ts`)

#### Automated

- [x] 7.1 Install @upstash/ratelimit and @upstash/redis dependencies
- [x] 7.2 Implement hybrid rate limiter in src/lib/rate-limit.ts with Upstash Redis, in-memory test fallback, and cf-connecting-ip extraction
- [x] 7.3 Integrate IP and account rate limiting into loginToDashboardAction and createDashboardAction
- [x] 7.4 Implement unit test suite in src/__tests__/lib/rate-limit.test.ts and update action tests with rate limiting coverage

### Phase 8: Security Hardening, App Router Error Boundaries & Observability Activation (`next.config.ts`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `wrangler.jsonc`)

#### Automated

- [x] 8.1 Configure OWASP HTTP security headers and Emotion-compatible CSP in next.config.ts
- [x] 8.2 Implement Papyrus-themed error boundaries in src/app/error.tsx and src/app/global-error.tsx
- [x] 8.3 Implement Papyrus-themed 404 page in src/app/not-found.tsx
- [x] 8.4 Enable Cloudflare Workers invocation logging in wrangler.jsonc and bump compatibility_date
- [x] 8.5 Implement unit test suites in src/__tests__/app/error.test.tsx and not-found.test.tsx, and run full test suite with >= 80% coverage check

### Phase 9: Native Stack Rate Limiting Migration: Upstash Removal & Cloudflare + Supabase Implementation (`wrangler.jsonc`, `supabase/migrations/`, `src/lib/rate-limit.ts`, `package.json`, `.env.example`, `next.config.ts`)

#### Automated

- [x] 9.1 Uninstall @upstash/ratelimit and @upstash/redis, clean up .env.example, src/lib/env.ts, and CSP connect-src in next.config.ts
- [x] 9.2 Add Supabase migration for atomic Token Bucket RPC function check_rate_limit
- [x] 9.3 Configure Cloudflare Workers native ratelimits binding in wrangler.jsonc
- [x] 9.4 Refactor src/lib/rate-limit.ts to use Cloudflare native rate limiter for IP limits, Supabase RPC for account/resource limits, and in-memory store as fallback
- [x] 9.5 Update test suites (rate-limit.test.ts, env.test.ts, auth.test.ts, dashboard.test.ts) and verify full test coverage (>= 80%), linting, and build:worker

### Phase 10: Session Hardening & RSC Boundary Defense (`src/app/dashboard/[hash]/page.tsx`, `src/lib/session.ts`, `src/app/dashboard/[hash]/components/LogoutButton.tsx`, `src/__tests__/app/dashboard/page.test.tsx`)

#### Automated

- [x] 10.1 Implement DTO mappers in src/app/dashboard/[hash]/page.tsx to sanitize dashboard and note props before RSC boundary serialization
- [x] 10.2 Implement multi-tab / multi-dashboard session cookie isolation in src/lib/session.ts and src/actions/auth.ts
- [x] 10.3 Update LogoutButton in src/app/dashboard/[hash]/components/LogoutButton.tsx to enforce hard cache-purging navigation on logout
- [x] 10.4 Expand integration test suite in src/__tests__/app/dashboard/page.test.tsx with expired token, database error resilience, and DTO boundary assertions
- [x] 10.5 Verify full test suite passes with >= 80% coverage check and linting



