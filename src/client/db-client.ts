/**
 * This is the single umbrella interface the application core depends on.
 * All database operations are declared here as domain-meaningful methods.
 * Swap the adapter in `createDatabaseClient()` without touching any caller.
 */

import { SupabaseDatabaseClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Audit Types (Legacy / Deployment Info)
// ---------------------------------------------------------------------------

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

/** Result of probing database connectivity. */
export interface HealthCheckResult {
  status: "up" | "down";
  latencyMs: number;
  error?: string;
}

/** Result of check_rate_limit PostgreSQL RPC call. */
export interface RateLimitRpcResult {
  success: boolean;
  remaining: number;
  retry_after_seconds: number;
}

// ---------------------------------------------------------------------------
// Domain Models
// ---------------------------------------------------------------------------

/** A collaborative dashboard entity. */
export interface Dashboard {
  id: string;
  hash: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** Participant user belonging to a dashboard. */
export interface DashboardUser {
  id: string;
  dashboard_id: string;
  user_alias: string;
  password_hash: string;
  created_at: string;
}

/** Collaborative note tile belonging to a dashboard. */
export interface Note {
  id: string;
  dashboard_id: string;
  title: string;
  content: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Immutable history snapshot of a note version. */
export interface NoteVersion {
  id: string;
  note_id: string;
  version: number;
  title: string;
  content: string;
  author_id: string | null;
  created_at: string;
}

/**
 * A note row as listed by `getNotesByDashboard`.
 * `undecryptable` rows carry only safe metadata — never ciphertext — so a
 * single corrupt note can be surfaced as a placeholder instead of failing
 * the whole dashboard listing.
 */
export type DashboardNote =
  | { status: "ok"; note: Note }
  | {
      status: "undecryptable";
      id: string;
      version: number;
      updated_at: string;
    };

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

/** Input for creating a new dashboard along with initial participant credentials. */
export interface CreateDashboardInput {
  title: string;
  description?: string | null;
  hash?: string;
  users: Array<{
    user_alias: string;
    password_hash: string;
  }>;
}

/** Input for creating a new note. */
export interface CreateNoteInput {
  dashboard_id: string;
  title?: string;
  content: string;
  author_id?: string | null;
}

/** Input for updating an existing note under optimistic concurrency control. */
export interface UpdateNoteInput {
  note_id: string;
  title?: string;
  content: string;
  expected_version: number;
  author_id?: string | null;
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

  /**
   * Health check probe to verify database connectivity.
   */
  checkHealth(signal?: AbortSignal): Promise<HealthCheckResult>;

  /**
   * Check rate limit token bucket for a given key via PostgreSQL RPC.
   */
  checkRateLimit(
    key: string,
    maxTokens: number,
    refillRate: number,
    cost?: number,
  ): Promise<RateLimitRpcResult>;

  /**
   * Create a new dashboard along with its initial participant users.
   */
  createDashboard(input: CreateDashboardInput): Promise<{
    dashboard: Dashboard;
    users: Omit<DashboardUser, "password_hash">[];
  }>;

  /**
   * Retrieve a dashboard by its unique 16-character sharing hash slug.
   */
  getDashboardByHash(hash: string): Promise<Dashboard | null>;

  /**
   * Retrieve a dashboard by its internal UUID primary key.
   */
  getDashboardById(id: string): Promise<Dashboard | null>;

  /**
   * Atomically delete a dashboard and cascade all associated users, notes, and versions.
   */
  deleteDashboard(id: string): Promise<boolean>;

  /**
   * Retrieve a specific participant user in a dashboard by their alias.
   */
  getDashboardUserByAlias(
    dashboard_id: string,
    user_alias: string,
  ): Promise<DashboardUser | null>;

  /**
   * List all participant users in a dashboard without exposing password hashes.
   */
  listDashboardUsers(
    dashboard_id: string,
  ): Promise<Omit<DashboardUser, "password_hash">[]>;

  /**
   * Create a new note tile and its initial version 1 history snapshot.
   */
  createNote(input: CreateNoteInput): Promise<{
    note: Note;
    initialVersion: NoteVersion;
  }>;

  /**
   * Update a note under optimistic concurrency control, incrementing version and saving history snapshot.
   */
  updateNote(input: UpdateNoteInput): Promise<{
    note: Note;
    newVersion: NoteVersion;
  }>;

  /**
   * Retrieve all notes belonging to a dashboard ordered by creation date.
   * Undecryptable rows (corrupt ciphertext) are returned as `undecryptable`
   * placeholders instead of failing the whole listing.
   */
  getNotesByDashboard(dashboard_id: string): Promise<DashboardNote[]>;

  /**
   * Retrieve a note by its UUID primary key.
   */
  getNoteById(note_id: string): Promise<Note | null>;

  /**
   * Retrieve all version history snapshots for a note ordered by version descending.
   */
  getNoteVersions(note_id: string): Promise<NoteVersion[]>;

  /**
   * Atomically delete a note and cascade its version history snapshots.
   */
  deleteNote(note_id: string): Promise<boolean>;
}

/**
 * Create and return the active `DatabaseClient` adapter.
 */
export function createDatabaseClient(): DatabaseClient {
  return new SupabaseDatabaseClient();
}
