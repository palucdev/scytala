import { cookies } from "next/headers";
import {
  getSessionCookieName,
  getSessionSecret,
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type VerifiedSessionPayload,
} from "@/lib/session";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export class SessionRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      `Session verification rate limited. Retry after ${retryAfterSeconds} seconds.`,
    );
    this.name = "SessionRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
    Object.setPrototypeOf(this, SessionRateLimitError.prototype);
  }
}

export interface VerifyDashboardSessionOptions {
  throwOnRateLimit?: boolean;
}

/**
 * Verifies the dashboard session from request cookies for a given dashboard hash.
 * Tries the dashboard-scoped cookie first, then falls back to the default session cookie.
 * Ensures the session token is cryptographically valid, unexpired, and matches the dashboard hash.
 *
 * Performs pre-verification edge rate limiting on client IP before reading cookies or executing WebCrypto.
 *
 * Returns the `VerifiedSessionPayload` containing dashboard_id, dashboard_hash, user_id,
 * and user_alias if valid, or `null` if unauthenticated or mismatched.
 */
export async function verifyDashboardSession(
  dashboardHash: string,
  options?: VerifyDashboardSessionOptions,
): Promise<VerifiedSessionPayload | null> {
  if (
    !dashboardHash ||
    typeof dashboardHash !== "string" ||
    dashboardHash.trim().length === 0
  ) {
    return null;
  }

  const clientIp = await getClientIp();
  const rateCheck = await checkRateLimit("sessionVerifyIp", clientIp);
  if (!rateCheck.success) {
    if (options?.throwOnRateLimit) {
      throw new SessionRateLimitError(rateCheck.retryAfterSeconds);
    }
    return null;
  }

  const normalizedHash = dashboardHash.trim();

  try {
    const cookieStore = await cookies();
    const scopedCookieName = getSessionCookieName(normalizedHash);
    const rawToken =
      cookieStore.get(scopedCookieName)?.value ||
      cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!rawToken) {
      return null;
    }

    const secret = getSessionSecret();
    const session = await verifySessionToken(rawToken, secret);

    if (!session) {
      return null;
    }

    if (session.dashboard_hash !== normalizedHash) {
      return null;
    }

    return session;
  } catch (error) {
    if (error instanceof SessionRateLimitError) {
      throw error;
    }
    return null;
  }
}
