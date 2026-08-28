import { cookies } from "next/headers";
import {
  getSessionCookieName,
  getSessionSecret,
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type VerifiedSessionPayload,
} from "@/lib/session";

/**
 * Verifies the dashboard session from request cookies for a given dashboard hash.
 * Tries the dashboard-scoped cookie first, then falls back to the default session cookie.
 * Ensures the session token is cryptographically valid, unexpired, and matches the dashboard hash.
 *
 * Returns the `VerifiedSessionPayload` containing dashboard_id, dashboard_hash, user_id,
 * and user_alias if valid, or `null` if unauthenticated or mismatched.
 */
export async function verifyDashboardSession(
  dashboardHash: string,
): Promise<VerifiedSessionPayload | null> {
  if (
    !dashboardHash ||
    typeof dashboardHash !== "string" ||
    dashboardHash.trim().length === 0
  ) {
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
  } catch {
    return null;
  }
}
