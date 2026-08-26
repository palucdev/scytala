"use server";

import { createDatabaseClient } from "@/client/db-client";
import {
  DEFAULT_DASHBOARD_SLUG_LENGTH,
  generateDashboardSlug,
  hashPassword,
} from "@/lib/crypto";
import {
  createDashboardSchema,
  type CreateDashboardActionResult,
  type CreateDashboardInput,
  type ParticipantCredential,
} from "@/schemas/dashboard";

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
    console.error("[createDashboardAction] Error:", error);
    const errorMessage =
      error instanceof Error
        ? error.message.includes("unique constraint") ||
          error.message.includes("duplicate key")
          ? "A dashboard with this identifier already exists. Please try again."
          : error.message
        : "Failed to create dashboard";
    return {
      success: false,
      error: errorMessage,
    };
  }
}
