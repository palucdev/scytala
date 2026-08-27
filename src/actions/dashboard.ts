"use server";

import { createDatabaseClient } from "@/client/db-client";
import {
  DEFAULT_DASHBOARD_SLUG_LENGTH,
  generateDashboardSlug,
  hashPassword,
} from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  createDashboardSchema,
  type CreateDashboardActionResult,
  type CreateDashboardInput,
  type ParticipantCredential,
} from "@/schemas/dashboard";

const log = logger.child({ module: "dashboard" });

export type {
  CreateDashboardActionResult,
  CreateDashboardInput,
  ParticipantCredential,
};

/**
 * Server action for creating a new dashboard along with participant credentials.
 * Hashes all cleartext passwords using PBKDF2 before calling the atomic DB RPC.
 */
export async function createDashboardAction(
  input: CreateDashboardInput,
): Promise<CreateDashboardActionResult> {
  const parsed = createDashboardSchema.safeParse(input);

  if (!parsed.success) {
    const primaryError = parsed.error.issues[0].message;
    return {
      success: false,
      error: primaryError,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const clientIp = await getClientIp();
    const ipCheck = await checkRateLimit("dashboardCreate", clientIp);
    if (!ipCheck.success) {
      log.warn("Dashboard creation throttled by IP rate limit", {
        clientIp,
        retryAfterSeconds: ipCheck.retryAfterSeconds,
      });
      return {
        success: false,
        error: `Too many dashboard creation requests. Please try again in ${ipCheck.retryAfterSeconds} seconds.`,
        rateLimited: true,
        retryAfterSeconds: ipCheck.retryAfterSeconds,
      };
    }
    const slug = generateDashboardSlug(DEFAULT_DASHBOARD_SLUG_LENGTH);
    const hashedUsers = await Promise.all(
      parsed.data.users.map(async (u) => ({
        user_alias: u.userAlias,
        password_hash: await hashPassword(u.password),
      })),
    );

    const db = createDatabaseClient();
    const result = await db.createDashboard({
      title: parsed.data.title,
      description: parsed.data.description,
      hash: slug,
      users: hashedUsers,
    });

    const cleartextCredentials: ParticipantCredential[] = parsed.data.users.map(
      (u) => ({
        userAlias: u.userAlias,
        password: u.password,
      }),
    );

    return {
      success: true,
      dashboard: result.dashboard,
      credentials: cleartextCredentials,
    };
  } catch (error) {
    log.error("createDashboardAction failed", error, {
      title: parsed.data?.title,
      userCount: parsed.data?.users?.length,
    });
    const errorMessage =
      error instanceof Error
        ? error.message.includes("unique constraint") ||
          error.message.includes("duplicate key")
          ? "A dashboard with this identifier already exists. Please try again."
          : "Failed to create dashboard. Please try again later."
        : "Failed to create dashboard";
    return {
      success: false,
      error: errorMessage,
    };
  }
}
