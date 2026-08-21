/**
 * SupabaseDatabaseClient — adapter for the DatabaseClient port.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditInput,
  AuditRecord,
  AuditResult,
  CreateDashboardInput,
  CreateNoteInput,
  Dashboard,
  DashboardUser,
  DatabaseClient,
  Note,
  NoteVersion,
  UpdateNoteInput,
} from "../client/db-client";
import { generateDashboardSlug } from "./crypto";

export class SupabaseDatabaseClient implements DatabaseClient {
  private readonly client: SupabaseClient;

  constructor(customClient?: SupabaseClient) {
    if (customClient) {
      this.client = customClient;
      return;
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error(
        "Missing required environment variables: SUPABASE_URL and/or SUPABASE_KEY. " +
          "Ensure they are declared in .env",
      );
    }
    this.client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Audit / Deployment Info (Legacy Port Methods)
  // ---------------------------------------------------------------------------

  /**
   * Insert one deployment audit record.
   * Idempotent by default: skips insert when a row for this `app_version`
   * already exists.
   */
  async recordDeploymentAudit(input: AuditInput): Promise<AuditResult> {
    const { ...row } = input;

    const existing = await this.getAuditRecordByVersion(row.app_version);
    if (existing) {
      return {
        recorded: false,
        message: `Audit record for version ${row.app_version} already exists (id: ${existing.id}).`,
        record: existing,
      };
    }

    const { data, error } = await this.client
      .from("info")
      .insert({
        app_version: row.app_version,
        init_data: row.init_data ?? null,
      })
      .select()
      .single<AuditRecord>();

    if (error) {
      throw new Error(
        `[SupabaseDatabaseClient] Insert failed: ${error.message}`,
      );
    }

    return {
      recorded: true,
      message: `Deployment audit recorded for version ${row.app_version}.`,
      record: data,
    };
  }

  /**
   * Return the most-recently inserted audit record across all versions,
   * or `null` when the `info` table is empty.
   */
  async getLastAuditRecord(): Promise<AuditRecord | null> {
    const { data, error } = await this.client
      .from("info")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<AuditRecord>();

    if (error) {
      throw new Error(
        `[SupabaseDatabaseClient] getLastAuditRecord failed: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Return all audit records ordered by `created_at` descending.
   */
  async getAuditHistory(): Promise<AuditRecord[]> {
    const { data, error } = await this.client
      .from("info")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<AuditRecord[]>();

    if (error) {
      throw new Error(
        `[SupabaseDatabaseClient] getAuditHistory failed: ${error.message}`,
      );
    }

    return data ?? [];
  }

  private async getAuditRecordByVersion(
    version: string,
  ): Promise<AuditRecord | null> {
    const { data, error } = await this.client
      .from("info")
      .select("*")
      .eq("app_version", version)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<AuditRecord>();

    if (error) {
      throw new Error(
        `[SupabaseDatabaseClient] Version lookup failed: ${error.message}`,
      );
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Dashboard Domain Methods
  // ---------------------------------------------------------------------------

  /**
   * Create a new dashboard and its initial participant users atomically via PostgreSQL RPC.
   */
  async createDashboard(input: CreateDashboardInput): Promise<{
    dashboard: Dashboard;
    users: Omit<DashboardUser, "password_hash">[];
  }> {
    const slug = input.hash || generateDashboardSlug();

    const { data, error } = await this.client.rpc(
      "create_dashboard_with_users",
      {
        p_title: input.title,
        p_description: input.description ?? null,
        p_hash: slug,
        p_users: input.users ?? [],
      },
    );

    if (error || !data) {
      throw new Error(
        `[SupabaseDatabaseClient] Failed to create dashboard: ${error?.message || "Unknown error"}`,
      );
    }

    return data as {
      dashboard: Dashboard;
      users: Omit<DashboardUser, "password_hash">[];
    };
  }

  /**
   * Retrieve a dashboard by its unique 16-character sharing hash slug.
   */
  async getDashboardByHash(hash: string): Promise<Dashboard | null> {
    const { data, error } = await this.client
      .from("dashboards")
      .select("*")
      .eq("hash", hash)
      .maybeSingle<Dashboard>();

    if (error) {
      throw new Error(
        `[SupabaseDatabaseClient] getDashboardByHash failed: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Retrieve a dashboard by its internal UUID primary key.
   */
  async getDashboardById(id: string): Promise<Dashboard | null> {
    const { data, error } = await this.client
      .from("dashboards")
      .select("*")
      .eq("id", id)
      .maybeSingle<Dashboard>();

    if (error) {
      throw new Error(
        `[SupabaseDatabaseClient] getDashboardById failed: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Atomically delete a dashboard and cascade all associated users, notes, and versions.
   */
  async deleteDashboard(id: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("dashboards")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) {
      throw new Error(
        `[SupabaseDatabaseClient] deleteDashboard failed: ${error.message}`,
      );
    }

    return Boolean(data && data.length > 0);
  }

  // ---------------------------------------------------------------------------
  // Dashboard User Domain Methods
  // ---------------------------------------------------------------------------

  /**
   * Retrieve a participant user by dashboard ID and alias.
   */
  async getDashboardUserByAlias(
    dashboard_id: string,
    user_alias: string,
  ): Promise<DashboardUser | null> {
    const { data, error } = await this.client
      .from("dashboard_users")
      .select("*")
      .eq("dashboard_id", dashboard_id)
      .eq("user_alias", user_alias)
      .maybeSingle<DashboardUser>();

    if (error) {
      throw new Error(
        `[SupabaseDatabaseClient] getDashboardUserByAlias failed: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * List all participant users in a dashboard without exposing password hashes.
   */
  async listDashboardUsers(
    dashboard_id: string,
  ): Promise<Omit<DashboardUser, "password_hash">[]> {
    const { data, error } = await this.client
      .from("dashboard_users")
      .select("id, dashboard_id, user_alias, created_at")
      .eq("dashboard_id", dashboard_id)
      .order("created_at", { ascending: true })
      .returns<Omit<DashboardUser, "password_hash">[]>();

    if (error) {
      throw new Error(
        `[SupabaseDatabaseClient] listDashboardUsers failed: ${error.message}`,
      );
    }

    return data ?? [];
  }

  // ---------------------------------------------------------------------------
  // Note Domain Methods
  // ---------------------------------------------------------------------------

  /**
   * Create a new note and its initial version 1 history snapshot atomically via PostgreSQL RPC.
   */
  async createNote(input: CreateNoteInput): Promise<{
    note: Note;
    initialVersion: NoteVersion;
  }> {
    const { data, error } = await this.client.rpc("create_note_with_version", {
      p_dashboard_id: input.dashboard_id,
      p_title: input.title ?? "",
      p_content: input.content,
      p_author_id: input.author_id ?? null,
    });

    if (error || !data) {
      throw new Error(
        `[SupabaseDatabaseClient] createNote failed: ${error?.message || "Unknown error"}`,
      );
    }

    return data as { note: Note; initialVersion: NoteVersion };
  }

  /**
   * Update a note under optimistic concurrency control, incrementing version and saving history snapshot atomically via PostgreSQL RPC.
   */
  async updateNote(input: UpdateNoteInput): Promise<{
    note: Note;
    newVersion: NoteVersion;
  }> {
    const { data, error } = await this.client.rpc("update_note_with_version", {
      p_note_id: input.note_id,
      p_expected_version: input.expected_version,
      p_content: input.content,
      p_title: input.title ?? null,
      p_author_id: input.author_id ?? null,
    });

    if (error || !data) {
      throw new Error(
        `[SupabaseDatabaseClient] updateNote failed: ${error?.message || "Unknown error"}`,
      );
    }

    return data as { note: Note; newVersion: NoteVersion };
  }

  /**
   * Retrieve all notes belonging to a dashboard ordered by creation date ascending.
   */
  async getNotesByDashboard(dashboard_id: string): Promise<Note[]> {
    const { data, error } = await this.client
      .from("notes")
      .select("*")
      .eq("dashboard_id", dashboard_id)
      .order("created_at", { ascending: true })
      .returns<Note[]>();

    if (error) {
      throw new Error(
        `[SupabaseDatabaseClient] getNotesByDashboard failed: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Retrieve a note by its UUID primary key.
   */
  async getNoteById(note_id: string): Promise<Note | null> {
    const { data, error } = await this.client
      .from("notes")
      .select("*")
      .eq("id", note_id)
      .maybeSingle<Note>();

    if (error) {
      throw new Error(
        `[SupabaseDatabaseClient] getNoteById failed: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Retrieve all version history snapshots for a note ordered by version descending.
   */
  async getNoteVersions(note_id: string): Promise<NoteVersion[]> {
    const { data, error } = await this.client
      .from("note_versions")
      .select("*")
      .eq("note_id", note_id)
      .order("version", { ascending: false })
      .returns<NoteVersion[]>();

    if (error) {
      throw new Error(
        `[SupabaseDatabaseClient] getNoteVersions failed: ${error.message}`,
      );
    }

    return data ?? [];
  }

  /**
   * Atomically delete a note and cascade its version history snapshots.
   */
  async deleteNote(note_id: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("notes")
      .delete()
      .eq("id", note_id)
      .select("id");

    if (error) {
      throw new Error(
        `[SupabaseDatabaseClient] deleteNote failed: ${error.message}`,
      );
    }

    return Boolean(data && data.length > 0);
  }
}
