import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getDeleteSessionCookieOptions,
  getSessionCookieName,
  SESSION_COOKIE_NAME,
} from "@/lib/session";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = logger.child({ module: "logout-route" });

export async function POST(request: NextRequest) {
  try {
    let dashboardHash: string | undefined;
    let redirectTo: string | undefined;

    const contentType = request.headers.get("content-type") || "";
    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const formData = await request.formData();
      const rawHash = formData.get("dashboardHash");
      const rawRedirect = formData.get("redirectTo");
      dashboardHash =
        typeof rawHash === "string" && rawHash.trim().length > 0
          ? rawHash.trim()
          : undefined;
      redirectTo =
        typeof rawRedirect === "string" && rawRedirect.trim().length > 0
          ? rawRedirect.trim()
          : undefined;
    } else if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      const rawHash = body?.dashboardHash;
      const rawRedirect = body?.redirectTo;
      dashboardHash =
        typeof rawHash === "string" && rawHash.trim().length > 0
          ? rawHash.trim()
          : undefined;
      redirectTo =
        typeof rawRedirect === "string" && rawRedirect.trim().length > 0
          ? rawRedirect.trim()
          : undefined;
    }

    const cookieStore = await cookies();
    const deleteOptions = getDeleteSessionCookieOptions();

    if (dashboardHash) {
      const scopedCookieName = getSessionCookieName(dashboardHash);
      cookieStore.set(scopedCookieName, "", deleteOptions);
    }
    const defaultCookieName = getSessionCookieName();
    cookieStore.set(defaultCookieName, "", deleteOptions);
    if (defaultCookieName !== SESSION_COOKIE_NAME) {
      cookieStore.set(SESSION_COOKIE_NAME, "", deleteOptions);
    }

    const defaultTarget = dashboardHash ? `/dashboard/${dashboardHash}` : "/";
    let redirectUrl: URL;
    try {
      const candidate = new URL(redirectTo || defaultTarget, request.url);
      const requestUrl = new URL(request.url);
      if (
        candidate.origin === requestUrl.origin &&
        !redirectTo?.startsWith("//") &&
        !redirectTo?.startsWith("/\\")
      ) {
        redirectUrl = candidate;
      } else {
        redirectUrl = new URL(defaultTarget, request.url);
      }
    } catch {
      redirectUrl = new URL(defaultTarget, request.url);
    }

    return NextResponse.redirect(redirectUrl, { status: 303 });
  } catch (error) {
    log.error("POST /api/auth/logout failed", error);
    return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  }
}
