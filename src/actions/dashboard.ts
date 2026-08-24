"use server";

import { createDatabaseClient } from "@/client/db-client";
import { generateDashboardSlug, hashPassword } from "@/lib/crypto";
import {
  createDashboardSchema,
  type CreateDashboardActionResult,
  type ParticipantCredential,
} from "@/schemas/dashboard";

export type { CreateDashboardActionResult, ParticipantCredential };

/**
 * Server action for creating a new dashboard along with participant credentials.
 * Hashes all cleartext passwords using PBKDF2 before calling the atomic DB RPC.
 */
export async function createDashboardAction(
  input: unknown,
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
    const slug = generateDashboardSlug(16);
    const hashedUsers = await Promise.all(
      parsed.data.users.map(async (u) => ({
        user_alias: u.user_alias,
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
        user_alias: u.user_alias,
        password: u.password,
      }),
    );

    return {
      success: true,
      dashboard: result.dashboard,
      credentials: cleartextCredentials,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create dashboard";
    return {
      success: false,
      error: errorMessage,
    };
  }
}
