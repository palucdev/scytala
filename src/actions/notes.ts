"use server";

import { revalidatePath } from "next/cache";
import { createDatabaseClient } from "@/client/db-client";
import {
  verifyDashboardSession,
  SessionRateLimitError,
} from "@/lib/auth-guard";
import { verifyPassword } from "@/lib/crypto";
import { VersionConflictError } from "@/lib/db-errors";
import { NoteCryptoError } from "@/lib/note-crypto";
import { logger } from "@/lib/logger";
import {
  checkRateLimit,
  DUMMY_PBKDF2_HASH,
  getClientIp,
} from "@/lib/rate-limit";
import type { Note } from "@/client/db-client";
import {
  createNoteSchema,
  deleteNoteSchema,
  getNoteVersionHistorySchema,
  updateNoteSchema,
  type CreateNoteActionResult,
  type CreateNoteInput,
  type DeleteNoteActionResult,
  type DeleteNoteInput,
  type GetNoteVersionHistoryActionResult,
  type GetNoteVersionHistoryInput,
  type HydratedNoteVersion,
  type UpdateNoteActionResult,
  type UpdateNoteInput,
} from "@/schemas/notes";

const log = logger.child({ module: "notes" });

export type MutationRateLimitResult =
  | { success: true }
  | {
      success: false;
      error: string;
      rateLimited: true;
      retryAfterSeconds: number;
    };

async function enforceMutationRateLimit(
  session: { dashboard_id: string; user_id: string },
  actionName: string,
  extraContext?: Record<string, unknown>,
): Promise<MutationRateLimitResult> {
  const rateLimitKey = `${session.dashboard_id}:${session.user_id}`;
  const rateCheck = await checkRateLimit("noteMutation", rateLimitKey);
  if (!rateCheck.success) {
    log.warn(`${actionName} throttled by rate limit`, {
      dashboardId: session.dashboard_id,
      userId: session.user_id,
      retryAfterSeconds: rateCheck.retryAfterSeconds,
      ...extraContext,
    });
    return {
      success: false,
      error: `Too many note operations. Please try again in ${rateCheck.retryAfterSeconds} seconds.`,
      rateLimited: true,
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    };
  }
  return { success: true };
}

export type {
  CreateNoteActionResult,
  CreateNoteInput,
  DeleteNoteActionResult,
  DeleteNoteInput,
  GetNoteVersionHistoryActionResult,
  GetNoteVersionHistoryInput,
  HydratedNoteVersion,
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
    const session = await verifyDashboardSession(dashboardHash, {
      throwOnRateLimit: true,
    });
    if (!session) {
      log.warn("Unauthorized attempt to create note", { dashboardHash });
      return {
        success: false,
        error: "Unauthorized. Please log in to this dashboard.",
      };
    }

    const rateCheck = await enforceMutationRateLimit(
      session,
      "createNoteAction",
    );
    if (!rateCheck.success) {
      return rateCheck;
    }

    const db = createDatabaseClient();
    const result = await db.createNote({
      dashboard_id: session.dashboard_id,
      title,
      content,
      author_id: session.user_id,
    });

    revalidatePath(`/dashboard/${dashboardHash}`);
    return {
      success: true,
      note: result.note,
      decryptionFailed: result.decryptionFailed === true,
    };
  } catch (error) {
    if (error instanceof SessionRateLimitError) {
      const clientIp = await getClientIp();
      log.warn(
        "createNoteAction throttled by session verification rate limit",
        {
          clientIp,
          retryAfterSeconds: error.retryAfterSeconds,
          dashboardHash,
        },
      );
      return {
        success: false,
        error: `Too many session attempts. Please try again in ${error.retryAfterSeconds} seconds.`,
        rateLimited: true,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }

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

  const { dashboardHash, noteId, title, content, expectedVersion } =
    parsed.data;

  try {
    const session = await verifyDashboardSession(dashboardHash, {
      throwOnRateLimit: true,
    });
    if (!session) {
      log.warn("Unauthorized attempt to update note", {
        dashboardHash,
        noteId,
      });
      return {
        success: false,
        error: "Unauthorized. Please log in to this dashboard.",
      };
    }

    const rateCheck = await enforceMutationRateLimit(
      session,
      "updateNoteAction",
      { noteId },
    );
    if (!rateCheck.success) {
      return rateCheck;
    }

    const db = createDatabaseClient();
    let note: Note | null = null;
    try {
      note = await db.getNoteById(noteId);
    } catch (error) {
      if (error instanceof NoteCryptoError) {
        log.warn("Update blocked: note decryption failed", {
          noteId,
          dashboardId: session.dashboard_id,
        });
        return {
          success: false,
          error:
            "This note is unavailable due to an encryption problem and cannot be edited.",
        };
      }
      throw error;
    }
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

    revalidatePath(`/dashboard/${dashboardHash}`);
    revalidatePath(`/dashboard/${dashboardHash}/note/${noteId}`);
    return {
      success: true,
      note: result.note,
      decryptionFailed: result.decryptionFailed === true,
    };
  } catch (error) {
    if (error instanceof SessionRateLimitError) {
      const clientIp = await getClientIp();
      log.warn(
        "updateNoteAction throttled by session verification rate limit",
        {
          clientIp,
          retryAfterSeconds: error.retryAfterSeconds,
          dashboardHash,
          noteId,
        },
      );
      return {
        success: false,
        error: `Too many session attempts. Please try again in ${error.retryAfterSeconds} seconds.`,
        rateLimited: true,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      error instanceof VersionConflictError ||
      errorMessage.toLowerCase().includes("version mismatch")
    ) {
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

    const session = await verifyDashboardSession(dashboardHash, {
      throwOnRateLimit: true,
    });
    if (!session) {
      log.warn("Unauthorized attempt to delete note", {
        dashboardHash,
        noteId,
      });
      return {
        success: false,
        error: "Unauthorized. Please log in to this dashboard.",
      };
    }

    const rateCheck = await enforceMutationRateLimit(
      session,
      "deleteNoteAction",
      { noteId },
    );
    if (!rateCheck.success) {
      return rateCheck;
    }

    const db = createDatabaseClient();
    // Deletion needs no plaintext, so the ownership precheck reads metadata
    // only — an undecryptable note can still be deleted to unstick the user.
    const note = await db.getNoteById(noteId, { metadataOnly: true });
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

    const handleFailedPasswordAttempt =
      async (): Promise<DeleteNoteActionResult> => {
        const accountIdentifier = `${dashboardHash}:${session.user_alias.toLowerCase()}`;
        const accountCheck = await checkRateLimit(
          "authAccount",
          accountIdentifier,
        );
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

    const deleted = await db.deleteNote(noteId);
    if (!deleted) {
      log.error("deleteNote returned false", undefined, { noteId });
      return {
        success: false,
        error: "Failed to delete note. Please try again.",
      };
    }

    revalidatePath(`/dashboard/${dashboardHash}`);
    revalidatePath(`/dashboard/${dashboardHash}/note/${noteId}`);
    return {
      success: true,
    };
  } catch (error) {
    if (error instanceof SessionRateLimitError) {
      const clientIp = await getClientIp();
      log.warn(
        "deleteNoteAction throttled by session verification rate limit",
        {
          clientIp,
          retryAfterSeconds: error.retryAfterSeconds,
          dashboardHash,
          noteId,
        },
      );
      return {
        success: false,
        error: `Too many session attempts. Please try again in ${error.retryAfterSeconds} seconds.`,
        rateLimited: true,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }

    log.error("deleteNoteAction failed", error, { noteId, dashboardHash });
    return {
      success: false,
      error: "Failed to delete note. Please try again.",
    };
  }
}

/**
 * Retrieves immutable version history snapshots for a note with resolved author aliases.
 * Enforces session authentication and cross-tenant dashboard boundary verification.
 */
export async function getNoteVersionHistoryAction(
  input: GetNoteVersionHistoryInput,
): Promise<GetNoteVersionHistoryActionResult> {
  const parsed = getNoteVersionHistorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { dashboardHash, noteId } = parsed.data;

  try {
    const session = await verifyDashboardSession(dashboardHash, {
      throwOnRateLimit: true,
    });
    if (!session) {
      log.warn("Unauthorized attempt to retrieve note version history", {
        dashboardHash,
        noteId,
      });
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

    const [rawVersions, users] = await Promise.all([
      db.getNoteVersions(noteId),
      db.listDashboardUsers(session.dashboard_id),
    ]);

    const userMap = new Map<string, string>();
    for (const u of users) {
      userMap.set(u.id, u.user_alias);
    }

    const versions: HydratedNoteVersion[] = rawVersions.map((v) => ({
      id: v.id,
      note_id: v.note_id,
      version: v.version,
      title: v.title,
      content: v.content,
      author_id: v.author_id,
      author_alias:
        (v.author_id ? userMap.get(v.author_id) : undefined) ||
        "Unnamed collaborator",
      created_at: v.created_at,
    }));

    return {
      success: true,
      versions,
    };
  } catch (error) {
    if (error instanceof SessionRateLimitError) {
      const clientIp = await getClientIp();
      log.warn(
        "getNoteVersionHistoryAction throttled by session verification rate limit",
        {
          clientIp,
          retryAfterSeconds: error.retryAfterSeconds,
          dashboardHash,
          noteId,
        },
      );
      return {
        success: false,
        error: `Too many session attempts. Please try again in ${error.retryAfterSeconds} seconds.`,
        rateLimited: true,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }

    log.error("getNoteVersionHistoryAction failed", error, {
      noteId,
      dashboardHash,
    });
    return {
      success: false,
      error: "Failed to retrieve note version history. Please try again.",
    };
  }
}

