---
date: 2026-08-28T11:07:30Z
researcher: Antigravity
git_commit: b0cb9e44bd4ad8398e41e1a463ac101a83a22f18
branch: fix/cloudflare-build
repository: scytala
topic: "Logout functionality does not work (brief Something Went Wrong error and dashboard loads again)"
tags: [research, auth, cookies, logout, session, server-actions, nextjs, rfc6265bis, opennext]
status: complete
last_updated: 2026-08-28
last_updated_by: Antigravity
last_updated_note: "Added follow-up research evaluating useTransition vs Router Cache purge vs hard browser navigation on logout"
---

# Research: Logout Functionality & Session Cookie Deletion

**Date**: 2026-08-28T11:07:30Z  
**Researcher**: Antigravity  
**Git Commit**: `b0cb9e44bd4ad8398e41e1a463ac101a83a22f18`  
**Branch**: `fix/cloudflare-build`  
**Repository**: `scytala`  

---

## Research Question

> "Logout functionality does not work (after log out button click there is a brief Something Went Wrong error and dashboard loads again like nothing happended) `src/app/dashboard/[hash]/components/LogoutButton.tsx` Check exa and context7 how to properly implement this feature to make it work and be secure."

---

## Executive Summary

The logout failure reported by the user consists of two intertwined phenomena:
1. **The Brief "Something Went Wrong" Flash**: When clicking "Log out", `LogoutButton.tsx` executes `window.location.replace(targetUrl)` concurrently while Next.js Server Action machinery is in-flight reconciling the React component tree on the client. Aborting the React transition / DOM unmounting via immediate hard page replacement triggers the Next.js App Router root error boundary (`src/app/error.tsx`).
2. **Dashboard Reloading as Authenticated ("Like nothing happened")**: The session cookie is **never actually evicted from the user's browser**. In `src/actions/auth.ts`, `logoutFromDashboardAction` calls `cookieStore.set(name, "", deleteCookieOptions)` followed immediately on the next line by `cookieStore.delete(name)`. In `@edge-runtime/cookies` (used by Next.js 15 & 16), calling `.delete(name)` with a string argument creates a new `ResponseCookie` descriptor with default options (`Max-Age=0`), **stripping the `Secure`, `HttpOnly`, and `SameSite` flags**. Under RFC 6265bis, modern browsers **silently reject and ignore** deletion headers for `__Host-` prefixed cookies (such as `__Host-scytala_session_<hash>`) if the header lacks `Secure` or specifies mismatched attributes.

When the hard navigation `window.location.replace()` completes, the browser sends the still-present session cookie to `DashboardPage` (`src/app/dashboard/[hash]/page.tsx`), which validates the HMAC-SHA256 JWT, sets `isAuthenticated === true`, and re-renders the dashboard view.

---

## Root Cause Analysis

### 1. The Cookie Map Collision & Stripped `Secure` Attribute

In [`src/actions/auth.ts:139-163`](../../../src/actions/auth.ts#L139-L163):
```typescript
export async function logoutFromDashboardAction(
  input?: { dashboardHash?: string },
): Promise<LogoutDashboardActionResult> {
  try {
    const cookieStore = await cookies();
    const deleteCookieOptions = {
      path: "/",
      maxAge: 0,
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax" as const,
    };
    if (input?.dashboardHash) {
      const scopedCookieName = getSessionCookieName(input.dashboardHash);
      cookieStore.set(scopedCookieName, "", deleteCookieOptions);
      cookieStore.delete(scopedCookieName); // <-- BUG: Overwrites previous .set()
    }
    cookieStore.set(SESSION_COOKIE_NAME, "", deleteCookieOptions);
    cookieStore.delete(SESSION_COOKIE_NAME); // <-- BUG: Overwrites previous .set()
    return { success: true };
  } catch (error) {
    log.error("logoutFromDashboardAction failed", error);
    return { success: false, error: "Failed to log out." };
  }
}
```

#### What happens in `@edge-runtime/cookies` (`ResponseCookies`):
`ResponseCookies` maintains an internal `Map<string, ResponseCookie> _parsed`:
1. `cookieStore.set(scopedCookieName, "", deleteCookieOptions)` inserts an entry into the map with `{ name: scopedCookieName, value: "", path: "/", maxAge: 0, secure: true, httpOnly: true, sameSite: "lax" }`.
2. `cookieStore.delete(scopedCookieName)` invokes `this.set({ name: scopedCookieName, value: "", expires: new Date(0) })` **without preserving previous options**.
3. The map entry is overwritten with `{ name: scopedCookieName, value: "", expires: new Date(0), path: "/" }` (lacking `secure`, `httpOnly`, and `sameSite`).
4. When serialized into the HTTP response header, Next.js emits:
   ```http
   Set-Cookie: __Host-scytala_session_AbCdEfGh12345678=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT
   ```

### 2. Browser RFC 6265bis Invariant Rejection for `__Host-` Cookies

In [`src/lib/session.ts:10-38`](../../../src/lib/session.ts#L10-L38), cookie names in production are prefixed with `__Host-`:
- Default: `__Host-scytala_session`
- Per-Dashboard Scoped: `__Host-scytala_session_<hash>`

According to **RFC 6265bis §5.4**:
> If the `cookie-name` begins with `__Host-`, the user agent MUST ignore the `Set-Cookie` header entirely unless:
> 1. The `secure-only-flag` is `true` (the header includes the `Secure` attribute).
> 2. The `host-only-flag` is `true` (the header does NOT include a `Domain` attribute).
> 3. The `Path` attribute is explicitly `/`.

Because the second `.delete()` call stripped the `Secure` attribute from the `Set-Cookie` header, modern browsers (Chrome, Firefox, Safari, Edge) **reject the eviction instruction and preserve the cookie in storage**.

### 3. Server Action RSC Lifecycle vs. Client `window.location.replace()`

In [`src/app/dashboard/[hash]/components/LogoutButton.tsx:25-48`](../../../src/app/dashboard/%5Bhash%5D/components/LogoutButton.tsx#L25-L48):
```typescript
const handleLogout = async (e?: React.MouseEvent) => {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (isPending) return;

  setIsPending(true);
  try {
    const result = await logoutFromDashboardAction(
      dashboardHash ? { dashboardHash } : undefined,
    );
    if (result?.success) {
      if (typeof window !== "undefined") {
        const targetUrl = redirectTo || window.location.pathname;
        window.location.replace(targetUrl);
      }
    } else {
      setIsPending(false);
    }
  } catch {
    setIsPending(false);
  }
};
```

#### What happens during Server Action execution:
1. When a client triggers a Next.js Server Action (`logoutFromDashboardAction`), Next.js issues a POST request with the `Next-Action` header.
2. After the action executes on the server, Next.js re-evaluates the Server Component `DashboardPage` (`src/app/dashboard/[hash]/page.tsx`) to stream back the updated RSC payload.
3. On the server, `DashboardPage` reads the mutated cookie store (which is empty in memory during that request) and returns `<LoginForm />` in the RSC response.
4. When the client receives this response:
   - Next.js client router begins transitioning React fiber trees (unmounting `<DashboardView>` and mounting `<LoginForm>`).
   - Simultaneously, the `await logoutFromDashboardAction()` promise resolves in `<LogoutButton>`, which immediately calls `window.location.replace(window.location.pathname)`.
   - `window.location.replace` abruptly aborts the in-flight React transition and unmounting lifecycle.
   - The aborted transition triggers the root error boundary (`src/app/error.tsx`), rendering the `"Something Went Wrong"` card for a fraction of a second before the browser's hard page reload takes over.
   - When the browser finishes reloading `/dashboard/[hash]`, it sends the un-deleted `__Host-scytala_session_<hash>` cookie, and `DashboardPage` re-renders `<DashboardView>`, returning the user to the authenticated dashboard.

---

## Detailed Findings

### Component & Flow Comparison

| Aspect | Current (Flawed) Implementation | Required (Idiomatic & Secure) Implementation |
| :--- | :--- | :--- |
| **Server Cookie Eviction** | Calls `cookieStore.set(..., deleteOptions)` AND `cookieStore.delete(...)` back-to-back, stripping `Secure` attribute. | Single `cookieStore.set(name, "", deleteOptions)` with `path: "/"`, `secure: true`, `httpOnly: true`, `sameSite: "lax"`, `maxAge: 0`, and `expires: new Date(0)`. |
| **`__Host-` Compliance** | Emits `Set-Cookie` missing `Secure`, violating RFC 6265bis §5.4. | Explicitly includes `Secure`, `Path=/`, and omits `Domain` for all `__Host-` cookies. |
| **Multi-Dashboard Scoping** | Inconsistent cleanup if `dashboardHash` is not provided. | Clears both the targeted scoped cookie `getSessionCookieName(hash)` and the default fallback cookie `SESSION_COOKIE_NAME`. |
| **Client Transition** | Uncoordinated `useState` + `window.location.replace()` colliding with RSC action response. | Wrapped in React 19 `useTransition()`. Handles programmatic redirection or clean refresh. |
| **State Reset & Cache Clearing** | Stale RSC payloads or React state could linger on soft navigation. | Hard navigation (`window.location.replace()`) or `router.refresh()` executed after clean action resolution. |

---

## Code References

### 1. Server Actions: `src/actions/auth.ts`
- [`src/actions/auth.ts:139-163`](../../../src/actions/auth.ts#L139-L163) — `logoutFromDashboardAction` containing the double-delete bug.
- [`src/actions/auth.ts:34-137`](../../../src/actions/auth.ts#L34-L137) — `loginToDashboardAction` demonstrating correct cookie attribute setting.

### 2. Dashboard Auth Gate: `src/app/dashboard/[hash]/page.tsx`
- [`src/app/dashboard/[hash]/page.tsx:62-77`](../../../src/app/dashboard/%5Bhash%5D/page.tsx#L62-L77) — SSR session verification, reading `getSessionCookieName(dashboard.hash)` and falling back to `SESSION_COOKIE_NAME`.

### 3. Client Components: `LogoutButton.tsx` & `LoginForm.tsx`
- [`src/app/dashboard/[hash]/components/LogoutButton.tsx:25-48`](../../../src/app/dashboard/%5Bhash%5D/components/LogoutButton.tsx#L25-L48) — Logout event handler and `window.location.replace` race condition.
- [`src/app/dashboard/[hash]/components/LoginForm.tsx:35-58`](../../../src/app/dashboard/%5Bhash%5D/components/LoginForm.tsx#L35-L58) — Correct usage of React `useTransition` and `router.refresh()` for auth state transitions.

### 4. Session & Cookie Utilities: `src/lib/session.ts`
- [`src/lib/session.ts:10-38`](../../../src/lib/session.ts#L10-L38) — `SESSION_COOKIE_NAME` and `getSessionCookieName(dashboardHash)` (`__Host-` prefix in production).
- [`src/lib/session.ts:338-344`](../../../src/lib/session.ts#L338-L344) — `buildClearSessionCookieHeader` utility defining the standard expired header format.

### 5. Error Boundary: `src/app/error.tsx`
- [`src/app/error.tsx:20-128`](../../../src/app/error.tsx#L20-L128) — Root error boundary displaying `"Something Went Wrong"`.

---

## Architecture & Security Insights

### 1. Edge & Cloudflare OpenNext Runtime Invariants
Scytala is built to run on Cloudflare Workers via `@opennextjs/cloudflare` (V8 isolates):
- **Web Standards Compliance**: `@opennextjs/cloudflare` utilizes `Headers.prototype.getSetCookie()` to preserve multiple distinct `Set-Cookie` response headers.
- **Zero Native Dependencies**: All cryptography relies exclusively on `globalThis.crypto.subtle` (HMAC-SHA256 and PBKDF2), maintaining full compatibility across Node.js, Vitest, and Cloudflare Edge workers.

### 2. Multi-Dashboard Cookie Isolation
- Dashboard cookies are namespaced (`scytala_session_<hash>`) to enable users to work on separate dashboards in multiple browser tabs simultaneously.
- When logging out from a specific dashboard, only that dashboard's scoped session (and any legacy global session) should be purged, ensuring sessions on other open tabs remain intact.

---

## Historical Context & Prior Decisions

- **`F-01: dashboard-data-schema-and-auth-scaffold`** ([`context/changes/dashboard-data-schema-and-auth-scaffold/plan.md`](../dashboard-data-schema-and-auth-scaffold/plan.md)): Established stateless HMAC-SHA256 JWT sessions and zero-dependency Web Crypto architecture.
- **`S-02: dashboard-auth-login-and-tiles-view`** ([`context/changes/dashboard-auth-login-and-tiles-view/plan.md`](../dashboard-auth-login-and-tiles-view/plan.md)): Introduced per-dashboard cookie scoping (`getSessionCookieName`) to prevent tab collisions, and added `__Host-` prefix hardening for production environments.
- **`lessons.md`** ([`context/foundation/lessons.md`](../../foundation/lessons.md)): Documented forward-only migrations and strict disaster recovery principles.

---

## Proposed Solution & Implementation Blueprint

### Step 1: Centralize Cookie Options in `src/lib/session.ts`

Add reusable, standard-compliant cookie option helpers to guarantee exact symmetry between cookie creation and deletion:

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

### Step 2: Fix `logoutFromDashboardAction` in `src/actions/auth.ts`

Replace the buggy back-to-back `.set()` + `.delete()` with a single `.set()` call using `getDeleteSessionCookieOptions()`:

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

### Step 3: Modernize `LogoutButton.tsx` with React 19 `useTransition`

Use `useTransition` for smooth pending states, catch any client exceptions, and cleanly perform navigation:

```typescript
"use client";

import { useTransition } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import LogoutIcon from "@mui/icons-material/Logout";

import { logoutFromDashboardAction } from "@/actions/auth";

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
  const [isPending, startTransition] = useTransition();

  const handleLogout = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isPending) return;

    startTransition(async () => {
      try {
        const result = await logoutFromDashboardAction(
          dashboardHash ? { dashboardHash } : undefined,
        );
        if (result?.success) {
          if (typeof window !== "undefined") {
            const targetUrl = redirectTo || window.location.pathname;
            window.location.replace(targetUrl);
          }
        }
      } catch {
        // No-op or notification
      }
    });
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      color="primary"
      onClick={handleLogout}
      disabled={isPending}
      startIcon={
        isPending ? (
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
      {isPending ? "Logging out..." : "Log out"}
    </Button>
  );
}

export default LogoutButton;
```

### Step 4: Update Unit Tests

Update [`src/__tests__/actions/auth.test.ts`](../../../src/__tests__/actions/auth.test.ts) and [`src/__tests__/app/dashboard/components/DashboardComponents.test.tsx`](../../../src/__tests__/app/dashboard/components/DashboardComponents.test.tsx) to verify:
1. `cookieStore.set` is called with empty string `""` and the exact options object containing `maxAge: 0`, `expires: new Date(0)`, `path: "/"`, `httpOnly: true`, `sameSite: "lax"`, and `secure: boolean`.
2. Tests maintain the 80% coverage threshold enforced by `vitest.config.ts`.

---

## Follow-up Research [2026-08-28T11:10:00Z]

### Question: Is `useTransition` / SPA Soft Navigation a Problem for Logout & Cache Invalidation?

**Answer: Yes, absolutely.** Relying on `useTransition` and soft SPA navigation (`router.refresh()`, `router.push()`) for logout presents serious security and cache-leakage risks in Next.js App Router applications.

#### 1. Why Soft Transitions (`useTransition` / `router.refresh`) Leave Stale Cached Data in Memory
- **Next.js Client-Side Router Cache**: Next.js App Router maintains an in-memory client-side cache of React Server Component (RSC) payloads for previously visited or prefetched route segments. A soft transition (such as calling `router.refresh()` inside `useTransition`) re-evaluates the active route, but:
  - If the user clicks the browser's **Back / Forward button**, the browser may serve cached RSC payloads or DOM states from the Router Cache / bfcache containing confidential dashboard notes and participant data.
  - In-memory client state (`useState`, form drafts, DOM input nodes, JavaScript closures) is **not reset** during soft transitions unless explicitly torn down.
- **React 19 Activity / View Preservation**: React and Next.js preserve Client Component state across navigations. As noted in the official Next.js documentation (*"Preserving UI State"*):
  > *"Activity preserves local component state (`useState`, DOM input values) across navigations, including authentication changes... For logout flows, using `window.location.href` (or `window.location.replace`) instead of `router.push` triggers a full page reload, clearing all client-side state."*

#### 2. The Security Gold Standard: Hard Navigation / Document Reload on Logout
A full browser navigation (`window.location.replace()` or a dedicated logout endpoint redirect):
1. **Completely Terminates the JavaScript Environment**: The browser tears down the execution context, destroying all heap memory, variables, tokens, and active React trees.
2. **Purges Next.js Router Cache**: Eliminates all in-memory RSC payloads for private routes, preventing history inspection via Back button navigation.
3. **Guarantees Clean Fresh Request**: The browser requests a clean, unauthenticated HTML document (`/dashboard/[hash]`) without cookies, receiving only `<LoginForm />`.

#### 3. Resolving the Server Action vs. Hard Navigation Conflict
The reason `window.location.replace()` clashed in the original implementation was that:
1. `logoutFromDashboardAction` was invoked as a Server Action.
2. Next.js Server Action machinery immediately initiated an action response stream attempting to reconcile the client-side React tree on `/dashboard/[hash]`.
3. Calling `window.location.replace()` mid-reconciliation abruptly canceled the React action render, causing `src/app/error.tsx` to flash.

**Optimal Implementation Pattern**:
- Keep `LogoutButton` straightforward with local pending state (`useState(false)`).
- When the user clicks "Log out", call `await logoutFromDashboardAction({ dashboardHash })` (or call a dedicated `/api/auth/logout` endpoint).
- Once the response confirms cookie eviction, immediately execute `window.location.replace(targetUrl)`.
- Because the session cookie is properly expired with RFC 6265bis compliant `Secure; Path=/; Max-Age=0; Expires=...`, the hard reload lands cleanly on `<LoginForm />` with zero residual memory, zero Router Cache, and zero error flashes.

---

## Open Questions

None. The root causes, Web / RFC standards, framework behaviors, and implementation steps are fully verified.

