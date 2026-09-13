import { z } from "zod";
import { type Note } from "@/client/db-client";

export const createNoteSchema = z.object({
  dashboardHash: z
    .string()
    .trim()
    .min(1, "Dashboard identifier is required"),
  title: z
    .string()
    .trim()
    .max(200, "Title must not exceed 200 characters")
    .optional()
    .nullable()
    // On creation, empty titles normalize to the literal default so an empty title never
    // persists — the database always stores a non-empty title.
    .transform((val) => (val && val.length > 0 ? val : "Untitled Note")),
  content: z
    .string()
    .min(1, "Note content cannot be empty")
    .max(10000, "Note content must not exceed 10,000 characters")
    .refine((val) => val.trim().length > 0, "Note content cannot be empty"),
});

export const updateNoteSchema = z.object({
  dashboardHash: z
    .string()
    .trim()
    .min(1, "Dashboard identifier is required"),
  noteId: z.string().uuid("Invalid note ID format"),
  title: z
    .string()
    .trim()
    .max(200, "Title must not exceed 200 characters")
    .optional()
    .nullable()
    // In update_note_with_version RPC, NULL (kept for undefined/absent input) signifies "keep
    // existing title"; an explicit empty title now resets to the default instead of clearing.
    .transform((val) =>
      val === undefined ? undefined : val && val.length > 0 ? val : "Untitled Note"
    ),
  content: z
    .string()
    .min(1, "Note content cannot be empty")
    .max(10000, "Note content must not exceed 10,000 characters")
    .refine((val) => val.trim().length > 0, "Note content cannot be empty"),
  expectedVersion: z
    .number()
    .int("Version must be an integer")
    .positive("Version must be a positive integer"),
});

export const deleteNoteSchema = z.object({
  dashboardHash: z
    .string()
    .trim()
    .min(1, "Dashboard identifier is required"),
  noteId: z.string().uuid("Invalid note ID format"),
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password is too long"),
});

export const getNoteVersionHistorySchema = z.object({
  dashboardHash: z
    .string()
    .trim()
    .min(1, "Dashboard identifier is required"),
  noteId: z.string().uuid("Invalid note ID format"),
});

export interface HydratedNoteVersion {
  id: string;
  note_id: string;
  version: number;
  title: string;
  content: string;
  author_id: string | null;
  author_alias: string;
  created_at: string;
}

export type CreateNoteInput = z.input<typeof createNoteSchema>;
export type CreateNoteInputValues = z.infer<typeof createNoteSchema>;

export type UpdateNoteInput = z.input<typeof updateNoteSchema>;
export type UpdateNoteInputValues = z.infer<typeof updateNoteSchema>;

export type DeleteNoteInput = z.input<typeof deleteNoteSchema>;
export type DeleteNoteInputValues = z.infer<typeof deleteNoteSchema>;

export type GetNoteVersionHistoryInput = z.input<typeof getNoteVersionHistorySchema>;
export type GetNoteVersionHistoryInputValues = z.infer<typeof getNoteVersionHistorySchema>;

export type CreateNoteActionResult =
  | {
      success: true;
      note: Note;
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      rateLimited?: boolean;
      retryAfterSeconds?: number;
    };

export type UpdateNoteActionResult =
  | {
      success: true;
      note: Note;
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      versionConflict?: boolean;
      rateLimited?: boolean;
      retryAfterSeconds?: number;
    };

export type DeleteNoteActionResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      rateLimited?: boolean;
      retryAfterSeconds?: number;
    };

export type GetNoteVersionHistoryActionResult =
  | {
      success: true;
      versions: HydratedNoteVersion[];
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      rateLimited?: boolean;
      retryAfterSeconds?: number;
    };
