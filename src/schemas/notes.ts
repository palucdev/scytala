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
    .transform((val) => (val && val.length > 0 ? val : undefined)),
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
    .transform((val) => (val && val.length > 0 ? val : undefined)),
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

export type CreateNoteInput = z.input<typeof createNoteSchema>;
export type CreateNoteInputValues = z.infer<typeof createNoteSchema>;

export type UpdateNoteInput = z.input<typeof updateNoteSchema>;
export type UpdateNoteInputValues = z.infer<typeof updateNoteSchema>;

export type DeleteNoteInput = z.input<typeof deleteNoteSchema>;
export type DeleteNoteInputValues = z.infer<typeof deleteNoteSchema>;

export type CreateNoteActionResult =
  | {
      success: true;
      note: Note;
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
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
    };

export type DeleteNoteActionResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };
