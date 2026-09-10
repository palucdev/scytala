# Fix Dashboard Logout Functionality Implementation Plan

## Overview

When clicking the "Log out" button on an authenticated dashboard (`/dashboard/[hash]`), the application encounters two failures:
1. A brief "Something Went Wrong" error card flashes.
2. The browser immediately reloads the dashboard back in an authenticated state as if logout never took place.

This plan addresses both root causes by:
- Correcting cookie eviction in `@edge-runtime/cookies` to comply with RFC 6265bis `__Host-` cookie specifications.
- Eliminating React lifecycle collisions and race conditions during logout by introducing a dedicated Route Handler (`POST /api/auth/logout`) with HTTP 303 redirect. This guarantees clean native browser navigation, zero rendering collisions, zero error boundary flashes, and complete destruction of client-side React state and in-memory Router Cache.

---

## Current State Analysis

1. **Cookie Map Overwrite in `@edge-runtime/cookies`**: In [`src/actions/auth.ts:151-158`](../../../src/actions/auth.ts#L151-L158), `logoutFromDashboardAction` calls `cookieStore.set(scopedCookieName, "", deleteCookieOptions)` immediately followed by `cookieStore.delete(scopedCookieName)`. In Next.js / Edge Runtime, `.delete(name)` overrides the response cookie descriptor with default options (`{ path: "/", maxAge: 0, expires: 1970-01-01 }`), stripping the `secure`, `httpOnly`, and `sameSite` flags.
2. **Browser RFC 6265bis Invariant**: Production session cookies use the `__Host-` prefix (`__Host-scytala_session_<hash>`). Under RFC 6265bis §5.4, browsers silently reject `Set-Cookie` eviction headers for `__Host-` cookies if the `Secure` flag is omitted. The cookie remains alive in browser storage.
3. **Server Action vs. Client Navigation Collision**: Invoking logout via a Server Action causes Next.js to stream back a re-evaluated Server Component tree for the current page. Calling `window.location.replace()` while this React commit is in-flight abruptly cancels the render, causing the root error boundary (`src/app/error.tsx`) to catch the unmount cancellation and display the `"Something Went Wrong"` card.
4. **Data Cache Retention**: Soft SPA transitions retain client-side component state and Router Cache payloads in memory. A clean HTTP POST -> HTTP 303 -> HTTP GET navigation completely resets JavaScript heap memory, destroying cached sensitive dashboard notes.

---

## Desired End State

1. Submitting logout from `/dashboard/[hash]` sends an HTTP POST request to `/api/auth/logout`.
2. The route handler sets RFC 6265bis compliant `Set-Cookie` headers containing `Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=Lax` for both the scoped dashboard cookie (`__Host-scytala_session_<hash>`) and the default fallback cookie (`__Host-scytala_session`).
3. The route handler responds with an HTTP 303 (See Other) redirect to the target URL (`/dashboard/[hash]` or custom `redirectTo`).
4. The browser evicts the session cookies and initiates a fresh, unauthenticated HTTP GET request to `/dashboard/[hash]`.
5. `DashboardPage` ([`src/app/dashboard/[hash]/page.tsx`](../../../src/app/dashboard/%5Bhash%5D/page.tsx)) evaluates the request without cookies and renders `<LoginForm dashboardHash={hash} />`.
6. Zero React reconciliation collisions, zero race conditions, and zero error flashes occur.
7. Zero sensitive dashboard data remains cached in browser memory or Router Cache.
8. 100% test passing rate with >=80% coverage across lines, functions, branches, and statements.

### Key Discoveries:
- [`src/actions/auth.ts:151-158`](../../../src/actions/auth.ts#L151-L158): Double-call `.set()` + `.delete()` strips `Secure` attribute.
- [`src/lib/session.ts:10-38`](../../../src/lib/session.ts#L10-L38): Cookie naming with `__Host-` prefix in production.
- [`src/app/dashboard/[hash]/components/LogoutButton.tsx:25-48`](../../../src/app/dashboard/%5Bhash%5D/components/LogoutButton.tsx#L25-L48): Logout button component.
- [`src/app/dashboard/[hash]/page.tsx:62-77`](../../../src/app/dashboard/%5Bhash%5D/page.tsx#L62-L77): Dashboard SSR session gate.

---

## What We're NOT Doing

- Not altering JWT token signing or verification mechanisms (`createSessionToken`, `verifySessionToken`).
- Not altering the dashboard layout or Material-UI theme styling.
- Not altering database schemas or migrations.

---

## Implementation Approach

1. **Centralize Cookie Descriptors**: Add `getSessionCookieOptions` and `getDeleteSessionCookieOptions` helper functions in [`src/lib/session.ts`](../../../src/lib/session.ts) to guarantee strict symmetry between cookie generation and deletion attributes.
2. **Standardize Auth Server Actions**: Update [`src/actions/auth.ts`](../../../src/actions/auth.ts) so `loginToDashboardAction` uses `getSessionCookieOptions()` and `logoutFromDashboardAction` uses `getDeleteSessionCookieOptions()`, eliminating `.delete()` map collisions.
3. **Create Dedicated Logout Route Handler**: Implement `POST /api/auth/logout` in [`src/app/api/auth/logout/route.ts`](../../../src/app/api/auth/logout/route.ts) that clears session cookies and returns an HTTP 303 redirect.
4. **Refactor `LogoutButton.tsx`**: Update [`src/app/dashboard/[hash]/components/LogoutButton.tsx`](../../../src/app/dashboard/%5Bhash%5D/components/LogoutButton.tsx) to submit to `/api/auth/logout` via a semantic form POST.
5. **Update Unit Tests**: Update test suites across `src/__tests__/lib/session.test.ts`, `src/__tests__/actions/auth.test.ts`, `src/__tests__/app/api/auth/logout/route.test.ts`, and `src/__tests__/app/dashboard/components/DashboardComponents.test.tsx` to maintain >=80% coverage.

---

## Critical Implementation Rules & Invariants

- **RFC 6265bis Invariant**: For `__Host-` cookies, `Path` must be `/`, `Secure` must be `true` in production, `HttpOnly` must be `true`, and `Domain` must be omitted.
- **Edge Runtime Cookie Deletion**: In Next.js `cookies()`, cookie deletion must be executed via `cookieStore.set(name, "", options)` where `options` contains `maxAge: 0`, `expires: new Date(0)`, `path: "/"`, `secure: boolean`, `httpOnly: true`, and `sameSite: "lax"`.
- **No TailwindCSS**: Strictly use Material-UI (`@mui/material`) for all UI styling.
- **Coverage Threshold**: Vitest enforces 80% minimum coverage for lines, functions, branches, and statements.

---

## Phase 1: Session Cookie Helpers Standardization

### Goals
Export unified cookie option helpers in `src/lib/session.ts` and verify them with unit tests.

### Changes Required
1. In [`src/lib/session.ts`](../../../src/lib/session.ts):
   - Define `SessionCookieOptions` interface.
   - Export `getSessionCookieOptions(maxAgeSeconds?: number): SessionCookieOptions`.
   - Export `getDeleteSessionCookieOptions(): SessionCookieOptions`.
2. In [`src/__tests__/lib/session.test.ts`](../../../src/__tests__/lib/session.test.ts):
   - Add test suite for `getSessionCookieOptions` and `getDeleteSessionCookieOptions` verifying all attributes (`path`, `httpOnly`, `sameSite`, `secure`, `maxAge`, `expires`).
   - Test production vs development environment flags using `vi.stubEnv`.

### Code Implementation Reference
```typescript
export interface SessionCookieOptions {
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "lax" | "strict" | "none";
  maxAge?: number;
  expires?: Date;
}

export function getSessionCookieOptions(
  maxAgeSeconds = DEFAULT_SESSION_TTL_SECONDS,
): SessionCookieOptions {
  return {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: maxAgeSeconds,
  };
}

export function getDeleteSessionCookieOptions(): SessionCookieOptions {
  return {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    expires: new Date(0),
  };
}
```

---

## Phase 2: Standardize Cookie Handling in Auth Server Actions

### Goals
Refactor `loginToDashboardAction` and `logoutFromDashboardAction` in `src/actions/auth.ts` to use standardized cookie option helpers and eliminate the `.delete()` collision bug.

### Changes Required
1. In [`src/actions/auth.ts`](../../../src/actions/auth.ts):
   - Import `getDeleteSessionCookieOptions` and `getSessionCookieOptions` from `@/lib/session`.
   - In `loginToDashboardAction`:
     ```typescript
     cookieStore.set(
       cookieName,
       token,
       getSessionCookieOptions(DEFAULT_SESSION_TTL_SECONDS),
     );
     ```
   - In `logoutFromDashboardAction`:
     ```typescript
     export async function logoutFromDashboardAction(
       input?: { dashboardHash?: string },
     ): Promise<LogoutDashboardActionResult> {
       try {
         const cookieStore = await cookies();
         const deleteOptions = getDeleteSessionCookieOptions();

         if (input?.dashboardHash) {
           const scopedCookieName = getSessionCookieName(input.dashboardHash);
           cookieStore.set(scopedCookieName, "", deleteOptions);
         }
         cookieStore.set(SESSION_COOKIE_NAME, "", deleteOptions);

         return { success: true };
       } catch (error) {
         log.error("logoutFromDashboardAction failed", error);
         return { success: false, error: "Failed to log out." };
       }
     }
     ```
2. In [`src/__tests__/actions/auth.test.ts`](../../../src/__tests__/actions/auth.test.ts):
   - Update assertions for `loginToDashboardAction` and `logoutFromDashboardAction` to verify `mockCookieSet` is called with the expected cookie options.

---

## Phase 3: Dedicated Logout Route Handler

### Goals
Implement a robust, edge-compatible `POST /api/auth/logout` route handler that evicts session cookies and returns an HTTP 303 redirect.

### Changes Required
1. Create [`src/app/api/auth/logout/route.ts`](../../../src/app/api/auth/logout/route.ts):
   ```typescript
   import { NextRequest, NextResponse } from "next/server";
   import { cookies } from "next/headers";
   import {
     getDeleteSessionCookieOptions,
     getSessionCookieName,
     SESSION_COOKIE_NAME,
   } from "@/lib/session";
   import { logger } from "@/lib/logger";

   const log = logger.child({ module: "logout-route" });

   export async function POST(request: NextRequest) {
     try {
       let dashboardHash: string | undefined;
       let redirectTo: string | undefined;

       const contentType = request.headers.get("content-type") || "";
       if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
         const formData = await request.formData();
         dashboardHash = formData.get("dashboardHash")?.toString() || undefined;
         redirectTo = formData.get("redirectTo")?.toString() || undefined;
       } else if (contentType.includes("application/json")) {
         const body = await request.json().catch(() => ({}));
         dashboardHash = body?.dashboardHash || undefined;
         redirectTo = body?.redirectTo || undefined;
       }

       const cookieStore = await cookies();
       const deleteOptions = getDeleteSessionCookieOptions();

       if (dashboardHash) {
         const scopedCookieName = getSessionCookieName(dashboardHash);
         cookieStore.set(scopedCookieName, "", deleteOptions);
       }
       cookieStore.set(SESSION_COOKIE_NAME, "", deleteOptions);

       const targetPath = redirectTo || (dashboardHash ? `/dashboard/${dashboardHash}` : "/");
       const redirectUrl = new URL(targetPath, request.url);

       return NextResponse.redirect(redirectUrl, { status: 303 });
     } catch (error) {
       log.error("POST /api/auth/logout failed", error);
       return NextResponse.redirect(new URL("/", request.url), { status: 303 });
     }
   }
   ```
2. Create [`src/__tests__/app/api/auth/logout/route.test.ts`](../../../src/__tests__/app/api/auth/logout/route.test.ts):
   - Test form POST with `dashboardHash` and `redirectTo`.
   - Test JSON POST.
   - Test cookie eviction headers and HTTP 303 status.
   - Test error fallback.

---

## Phase 4: Client Logout Form Component & Navigation

### Goals
Refactor `LogoutButton.tsx` to use form POST navigation for zero React collision and complete memory/cache purge.

### Changes Required
1. In [`src/app/dashboard/[hash]/components/LogoutButton.tsx`](../../../src/app/dashboard/%5Bhash%5D/components/LogoutButton.tsx):
   - Render a native form POST pointing to `/api/auth/logout` with hidden fields for `dashboardHash` and `redirectTo`.
   - Maintain MUI Button appearance and loading state.
   ```typescript
   "use client";

   import { useState } from "react";
   import Box from "@mui/material/Box";
   import Button from "@mui/material/Button";
   import CircularProgress from "@mui/material/CircularProgress";
   import LogoutIcon from "@mui/icons-material/Logout";

   export interface LogoutButtonProps {
     variant?: "text" | "outlined" | "contained";
     size?: "small" | "medium" | "large";
     dashboardHash?: string;
     redirectTo?: string;
   }

   export function LogoutButton({
     variant = "outlined",
     size = "small",
     dashboardHash,
     redirectTo,
   }: LogoutButtonProps) {
     const [isSubmitting, setIsSubmitting] = useState(false);

     return (
       <Box
         component="form"
         action="/api/auth/logout"
         method="POST"
         onSubmit={() => setIsSubmitting(true)}
         sx={{ display: "inline-block" }}
       >
         {dashboardHash && (
           <input type="hidden" name="dashboardHash" value={dashboardHash} />
         )}
         {redirectTo && (
           <input type="hidden" name="redirectTo" value={redirectTo} />
         )}
         <Button
           type="submit"
           variant={variant}
           size={size}
           color="primary"
           disabled={isSubmitting}
           startIcon={
             isSubmitting ? (
               <CircularProgress size={16} color="inherit" />
             ) : (
               <LogoutIcon fontSize="small" />
             )
           }
           aria-label="Log out"
           id="dashboard-logout-btn"
           sx={{
             textTransform: "none",
             minWidth: 90,
           }}
         >
           {isSubmitting ? "Logging out..." : "Log out"}
         </Button>
       </Box>
     );
   }

   export default LogoutButton;
   ```
2. In [`src/__tests__/app/dashboard/components/DashboardComponents.test.tsx`](../../../src/__tests__/app/dashboard/components/DashboardComponents.test.tsx):
   - Update `LogoutButton` tests to verify form attributes (`action="/api/auth/logout"`, `method="POST"`), hidden input presence, and submission handling.

---

## Phase 5: Full Quality & Coverage Verification

### Goals
Verify the complete codebase against all quality gates, TypeScript checks, and test coverage thresholds.

### Verification Steps
1. Run TypeScript type check: `npm run typecheck`
2. Run ESLint: `npm run lint`
3. Run Vitest test suite with coverage: `npm run test`
4. Confirm coverage meets or exceeds 80% for lines, functions, branches, and statements.

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Session Cookie Helpers Standardization

#### Automated

- [x] 1.1 Export getSessionCookieOptions and getDeleteSessionCookieOptions in src/lib/session.ts
- [x] 1.2 Add unit tests for cookie option helpers in src/__tests__/lib/session.test.ts

### Phase 2: Standardize Cookie Handling in Auth Server Actions

#### Automated

- [x] 2.1 Update loginToDashboardAction and logoutFromDashboardAction in src/actions/auth.ts
- [x] 2.2 Update unit tests in src/__tests__/actions/auth.test.ts

### Phase 3: Dedicated Logout Route Handler

#### Automated

- [x] 3.1 Implement POST /api/auth/logout route handler in src/app/api/auth/logout/route.ts
- [x] 3.2 Add unit tests for logout route handler in src/__tests__/app/api/auth/logout/route.test.ts

### Phase 4: Client Logout Form Component & Navigation

#### Automated

- [x] 4.1 Update LogoutButton component in src/app/dashboard/[hash]/components/LogoutButton.tsx
- [x] 4.2 Update component unit tests in src/__tests__/app/dashboard/components/DashboardComponents.test.tsx

### Phase 5: Full Quality & Coverage Verification

#### Automated

- [x] 5.1 Run typecheck, lint, and test coverage verification across all suites
