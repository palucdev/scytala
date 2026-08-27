"use server";

import { cookies } from "next/headers";
import { createDatabaseClient } from "@/client/db-client";
import { verifyPassword } from "@/lib/crypto";
import {
  createSessionToken,
  DEFAULT_SESSION_TTL_SECONDS,
  getSessionCookieName,
  getSessionSecret,
  SESSION_COOKIE_NAME,
} from "@/lib/session";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  loginDashboardSchema,
  type LoginDashboardActionResult,
  type LoginDashboardInput,
  type LogoutDashboardActionResult,
} from "@/schemas/auth";

const log = logger.child({ module: "auth" });

export type {
  LoginDashboardActionResult,
  LoginDashboardInput,
  LogoutDashboardActionResult,
};

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

  try {
    const clientIp = await getClientIp();
    const ipCheck = await checkRateLimit("authIp", clientIp);
    if (!ipCheck.success) {
      log.warn("Login request throttled by IP rate limit", {
        clientIp,
        retryAfterSeconds: ipCheck.retryAfterSeconds,
      });
      return {
        success: false,
        error: `Too many login attempts. Please try again in ${ipCheck.retryAfterSeconds} seconds.`,
        rateLimited: true,
        retryAfterSeconds: ipCheck.retryAfterSeconds,
      };
    }

    const handleFailedAttempt = async (): Promise<LoginDashboardActionResult> => {
      const accountIdentifier = `${dashboardHash}:${userAlias.toLowerCase()}`;
      const accountCheck = await checkRateLimit("authAccount", accountIdentifier);
      if (!accountCheck.success) {
        log.warn("Login request throttled by account rate limit", {
          accountIdentifier,
          retryAfterSeconds: accountCheck.retryAfterSeconds,
        });
        return {
          success: false,
          error: `Too many failed attempts for this account. Please try again in ${accountCheck.retryAfterSeconds} seconds.`,
          rateLimited: true,
          retryAfterSeconds: accountCheck.retryAfterSeconds,
        };
      }
      return {
        success: false,
        error: "Invalid alias or password.",
      };
    };

    const db = createDatabaseClient();
    const dashboard = await db.getDashboardByHash(dashboardHash);
    if (!dashboard) {
      // Run dummy password check to equalize timing before returning generic error
      await verifyPassword(password, DUMMY_PBKDF2_HASH);
      return handleFailedAttempt();
    }

    const user = await db.getDashboardUserByAlias(dashboard.id, userAlias);
    if (!user) {
      await verifyPassword(password, DUMMY_PBKDF2_HASH);
      return handleFailedAttempt();
    }

    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return handleFailedAttempt();
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

    const cookieName = getSessionCookieName(dashboard.hash);
    const cookieStore = await cookies();
    cookieStore.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: DEFAULT_SESSION_TTL_SECONDS,
    });

    return { success: true };
  } catch (error) {
    log.error("loginToDashboardAction failed", error, {
      dashboardHash,
      userAlias,
    });
    return {
      success: false,
      error: "Authentication service temporarily unavailable. Please try again.",
    };
  }
}

export async function logoutFromDashboardAction(
  input?: { dashboardHash?: string },
): Promise<LogoutDashboardActionResult> {
  try {
    const cookieStore = await cookies();
    if (input?.dashboardHash) {
      const scopedCookieName = getSessionCookieName(input.dashboardHash);
      cookieStore.delete(scopedCookieName);
    }
    cookieStore.delete(SESSION_COOKIE_NAME);
    return { success: true };
  } catch (error) {
    log.error("logoutFromDashboardAction failed", error);
    return { success: false, error: "Failed to log out." };
  }
}
