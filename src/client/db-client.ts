/**
 * This is the single umbrella interface the application core depends on.
 * All database operations are declared here as domain-meaningful methods.
 * Swap the adapter in `createDatabaseClient()` without touching any caller.
 */

import { SupabaseDatabaseClient } from "@/lib/supabase";

/** Input for a deployment audit entry. */
export interface AuditInput {
  /** Semantic version of the deployed application (e.g. "0.1.0"). */
  app_version: string;
  /** Optional free-form JSON metadata attached to this deployment. */
  init_data?: string | null;
}

/** A fully-hydrated audit row as stored in the database. */
export interface AuditRecord extends Required<AuditInput> {
  id: number;
  created_at: string;
}

/** Outcome returned by `recordDeploymentAudit`. */
export interface AuditResult {
  /** Whether a new record was actually inserted. */
  recorded: boolean;
  message: string;
  record?: AuditRecord;
}

// ---------------------------------------------------------------------------
// Port
// ---------------------------------------------------------------------------

/**
 * Umbrella database client interface.
 * Every feature area adds its own methods here; the adapter in
 * `src/lib/supabase.ts` provides the concrete implementation.
 */
export interface DatabaseClient {
  // ------------------------------------------------------------------
  // Audit — `info` table
  // ------------------------------------------------------------------

  /**
   * Insert a deployment audit entry into the `info` table.
   * Idempotent by default: skips insert when a record for the same
   * `app_version` already exists.
   */
  recordDeploymentAudit(input: AuditInput): Promise<AuditResult>;

  /**
   * Return the most-recently created audit record, or `null` when the
   * table is empty.
   */
  getLastAuditRecord(): Promise<AuditRecord | null>;

  /**
   * Return all audit records ordered by `created_at` descending.
   */
  getAuditHistory(): Promise<AuditRecord[]>;
}

/**
 * Create and return the active `DatabaseClient` adapter.
 */
export function createDatabaseClient(): DatabaseClient {
  return new SupabaseDatabaseClient();
}
