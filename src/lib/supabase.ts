/**
 * SupabaseDatabaseClient — adapter for the DatabaseClient port.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditInput,
  AuditRecord,
  AuditResult,
  DatabaseClient,
} from "../client/db-client";

export class SupabaseDatabaseClient implements DatabaseClient {
  private readonly client: SupabaseClient;

  constructor() {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error(
        "Missing required environment variables: SUPABASE_URL and/or SUPABASE_KEY. " +
          "Ensure they are declared in .env",
      );
    }
    this.client = createClient(SUPABASE_URL, SUPABASE_KEY);
  }

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
}
