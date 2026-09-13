import { createDatabaseClient } from "@/client/db-client";
import type { DatabaseClient } from "@/client/db-client";
import { hashPassword } from "@/lib/crypto";

export interface IntegrationTestUser {
  id: string;
  alias: string;
  password: string;
}

export interface IntegrationTestDashboard {
  dashboardId: string;
  hash: string;
  title: string;
  users: IntegrationTestUser[];
  db: DatabaseClient;
}

export interface CreateIntegrationTestDashboardOptions {
  title?: string;
  description?: string;
  users?: Array<{ alias: string; password?: string }>;
}

export async function createIntegrationTestDashboard(
  options: CreateIntegrationTestDashboardOptions = {},
): Promise<IntegrationTestDashboard> {
  const db = createDatabaseClient();

  const title = options.title ?? `Integration Test Workspace ${Date.now()}`;
  const description =
    options.description ?? "Integration automated test workspace";
  const requestedUsers =
    options.users ?? [{ alias: "Alice", password: "Integration-Pass-1" }];

  const users: Array<{ alias: string; password: string }> = [];
  for (const [index, user] of requestedUsers.entries()) {
    users.push({
      alias: user.alias,
      password: user.password ?? `Integration-Pass-${index + 1}`,
    });
  }

  const passwordHashes = await Promise.all(
    users.map((user) => hashPassword(user.password)),
  );

  const { dashboard, users: createdUsers } = await db.createDashboard({
    title,
    description,
    users: users.map((user, index) => ({
      user_alias: user.alias,
      password_hash: passwordHashes[index],
    })),
  });

  return {
    dashboardId: dashboard.id,
    hash: dashboard.hash,
    title,
    users: users.map((user, index) => ({
      id: createdUsers[index]?.id ?? "",
      alias: user.alias,
      password: user.password,
    })),
    db,
  };
}

export async function cleanupIntegrationTestDashboard(
  dashboardId: string,
): Promise<void> {
  const db = createDatabaseClient();
  try {
    await db.deleteDashboard(dashboardId);
  } catch {
    // Best-effort cleanup; cascading delete may already have removed the row.
  }
}
