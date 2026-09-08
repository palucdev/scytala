"use server";

import { createDatabaseClient } from "@/client/db-client";
import { verifyDashboardSession } from "@/lib/auth-guard";
import { verifyPassword } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import {
  checkRateLimit,
  DUMMY_PBKDF2_HASH,
  getClientIp,
} from "@/lib/rate-limit";
import {
  createNoteSchema,
  deleteNoteSchema,
  updateNoteSchema,
  type CreateNoteActionResult,
  type CreateNoteInput,
  type DeleteNoteActionResult,
  type DeleteNoteInput,
  type UpdateNoteActionResult,
  type UpdateNoteInput,
} from "@/schemas/notes";

const log = logger.child({ module: "notes" });

export type {
  CreateNoteActionResult,
  CreateNoteInput,
  DeleteNoteActionResult,
  DeleteNoteInput,
  UpdateNoteActionResult,
  UpdateNoteInput,
};

/**
 * Creates a new note and its initial version 1 history snapshot.
 * Verifies session belonging to the given dashboardHash before proceeding.
 */
export async function createNoteAction(
  input: CreateNoteInput,
): Promise<CreateNoteActionResult> {
  const parsed = createNoteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid note input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { dashboardHash, title, content } = parsed.data;

  try {
    const session = await verifyDashboardSession(dashboardHash);
    if (!session) {
      log.warn("Unauthorized attempt to create note", { dashboardHash });
      return {
        success: false,
        error: "Unauthorized. Please log in to this dashboard.",
      };
    }

    const db = createDatabaseClient();
    const result = await db.createNote({
      dashboard_id: session.dashboard_id,
      title,
      content,
      author_id: session.user_id,
    });

    return {
      success: true,
      note: result.note,
    };
  } catch (error) {
    log.error("createNoteAction failed", error, { dashboardHash });
    return {
      success: false,
      error: "Failed to create note. Please try again.",
    };
  }
}

/**
 * Updates an existing note under optimistic concurrency control.
 * Catches version mismatch errors and returns typed versionConflict discriminant.
 * Verifies note ownership against the session's dashboard.
 */
export async function updateNoteAction(
  input: UpdateNoteInput,
): Promise<UpdateNoteActionResult> {
  const parsed = updateNoteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid note input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { dashboardHash, noteId, title, content, expectedVersion } = parsed.data;

  try {
    const session = await verifyDashboardSession(dashboardHash);
    if (!session) {
      log.warn("Unauthorized attempt to update note", { dashboardHash, noteId });
      return {
        success: false,
        error: "Unauthorized. Please log in to this dashboard.",
      };
    }

    const db = createDatabaseClient();
    const note = await db.getNoteById(noteId);
    if (!note || note.dashboard_id !== session.dashboard_id) {
      log.warn("Note not found or does not belong to dashboard", {
        noteId,
        dashboardId: session.dashboard_id,
      });
      return {
        success: false,
        error: "Note not found.",
      };
    }

    const result = await db.updateNote({
      note_id: noteId,
      title,
      content,
      expected_version: expectedVersion,
      author_id: session.user_id,
    });

    return {
      success: true,
      note: result.note,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.toLowerCase().includes("version mismatch")) {
      log.warn("Note update version conflict", {
        noteId,
        expectedVersion,
      });
      return {
        success: false,
        versionConflict: true,
        error:
          "This note has been modified by someone else. Please reload and try again.",
      };
    }

    log.error("updateNoteAction failed", error, { noteId, dashboardHash });
    return {
      success: false,
      error: "Failed to update note. Please try again.",
    };
  }
}

/**
 * Deletes an existing note and cascades its version history snapshots.
 * Requires user's password re-authentication before deletion.
 * Verifies note ownership against the session's dashboard.
 */
export async function deleteNoteAction(
  input: DeleteNoteInput,
): Promise<DeleteNoteActionResult> {
  const parsed = deleteNoteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { dashboardHash, noteId, password } = parsed.data;

  try {
    const clientIp = await getClientIp();
    const ipCheck = await checkRateLimit("authIp", clientIp);
    if (!ipCheck.success) {
      log.warn("Delete note request throttled by IP rate limit", {
        clientIp,
        retryAfterSeconds: ipCheck.retryAfterSeconds,
      });
      return {
        success: false,
        error: `Too many attempts. Please try again in ${ipCheck.retryAfterSeconds} seconds.`,
        rateLimited: true,
        retryAfterSeconds: ipCheck.retryAfterSeconds,
      };
    }

    const session = await verifyDashboardSession(dashboardHash);
    if (!session) {
      log.warn("Unauthorized attempt to delete note", { dashboardHash, noteId });
      return {
        success: false,
        error: "Unauthorized. Please log in to this dashboard.",
      };
    }

    const handleFailedPasswordAttempt = async (): Promise<DeleteNoteActionResult> => {
      const accountIdentifier = `${dashboardHash}:${session.user_alias.toLowerCase()}`;
      const accountCheck = await checkRateLimit("authAccount", accountIdentifier);
      if (!accountCheck.success) {
        log.warn("Delete note request throttled by account rate limit", {
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
        error: "Invalid password.",
      };
    };

    const db = createDatabaseClient();
    const user = await db.getDashboardUserByAlias(
      session.dashboard_id,
      session.user_alias,
    );
    if (!user || user.id !== session.user_id) {
      log.warn("User not found or user ID mismatch during note deletion", {
        dashboardId: session.dashboard_id,
        userAlias: session.user_alias,
      });
      await verifyPassword(password, DUMMY_PBKDF2_HASH);
      return handleFailedPasswordAttempt();
    }

    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      log.warn("Invalid password during note deletion", {
        noteId,
        userAlias: session.user_alias,
      });
      return handleFailedPasswordAttempt();
    }

    const note = await db.getNoteById(noteId);
    if (!note || note.dashboard_id !== session.dashboard_id) {
      log.warn("Note not found or does not belong to dashboard", {
        noteId,
        dashboardId: session.dashboard_id,
      });
      return {
        success: false,
        error: "Note not found.",
      };
    }

    const deleted = await db.deleteNote(noteId);
    if (!deleted) {
      log.error("deleteNote returned false", undefined, { noteId });
      return {
        success: false,
        error: "Failed to delete note. Please try again.",
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    log.error("deleteNoteAction failed", error, { noteId, dashboardHash });
    return {
      success: false,
      error: "Failed to delete note. Please try again.",
    };
  }
}
