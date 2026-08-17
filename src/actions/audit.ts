"use server";

import { createDatabaseClient } from "../client/db-client";
import type { AuditResult, AuditRecord } from "../client/db-client";

/**
 * Record a deployment audit entry once per deployment.
 *
 * Reads `app_version` from `package.json` (injected at build time via
 * `process.env.npm_package_version`) and an optional `DEPLOY_ID` env var
 * for the `init_data` payload.
 *
 * Called automatically from `src/instrumentation.ts` on server startup.
 *
 * @param options.appVersion  Override the version string (defaults to npm_package_version).
 * @param options.initData    Override the init_data payload.
 */
export async function recordDeploymentAudit(options?: {
  appVersion?: string;
  initData?: string | Record<string, unknown>;
}): Promise<AuditResult> {
  const db = createDatabaseClient();

  const appVersion =
    options?.appVersion ??
    process.env.npm_package_version ??
    process.env.APP_VERSION ??
    "unknown";

  const rawInitData = options?.initData ?? {
    deploy_id: process.env.DEPLOY_ID ?? null,
    node_env: process.env.NODE_ENV ?? null,
    recorded_at: new Date().toISOString(),
  };

  const init_data =
    typeof rawInitData === "string" ? rawInitData : JSON.stringify(rawInitData);

  return db.recordDeploymentAudit({
    app_version: appVersion,
    init_data,
  });
}

/**
 * Fetch the most-recently recorded audit entry.
 * Returns `null` when no audit records exist yet.
 */
export async function getLatestDeploymentInfo(): Promise<AuditRecord | null> {
  const db = createDatabaseClient();
  return db.getLastAuditRecord();
}

/**
 * Fetch all audit records ordered newest-first.
 */
export async function getDeploymentAuditHistory(): Promise<AuditRecord[]> {
  const db = createDatabaseClient();
  return db.getAuditHistory();
}
