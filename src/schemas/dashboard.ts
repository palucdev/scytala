import { z } from "zod";
import { type Dashboard } from "@/client/db-client";

export const ALIAS_REGEX = /^[a-zA-Z0-9_-]+$/;

export const participantUserSchema = z.object({
  id: z.string().optional(),
  user_alias: z
    .string()
    .trim()
    .min(2, "Alias must be at least 2 characters")
    .max(30, "Alias must be at most 30 characters")
    .regex(
      ALIAS_REGEX,
      "Alias can only contain letters, numbers, hyphens, and underscores",
    ),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128, "Password must be at most 128 characters"),
});

export const createDashboardSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Dashboard title is required")
    .max(80, "Dashboard title must not exceed 80 characters"),
  description: z
    .string()
    .trim()
    .max(300, "Description must not exceed 300 characters")
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
  users: z
    .array(participantUserSchema)
    .min(1, "At least one participant user is required")
    .refine((users) => {
      const aliases = users.map((u) => u.user_alias.toLowerCase());
      return new Set(aliases).size === aliases.length;
    }, "Participant aliases must be unique"),
});

export type ParticipantUserInput = z.infer<typeof participantUserSchema>;
export type CreateDashboardInputValues = z.infer<typeof createDashboardSchema>;

export interface ParticipantCredential {
  user_alias: string;
  password: string;
}

export type CreateDashboardActionResult =
  | {
      success: true;
      dashboard: Dashboard;
      credentials: ParticipantCredential[];
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

/**
 * Formats created dashboard details and participant credentials into a clean text block
 * suitable for clipboard copying and out-of-band distribution.
 */
export function formatCredentialsText(
  dashboardTitle: string,
  dashboardUrl: string,
  credentials: ParticipantCredential[],
): string {
  const lines = [
    `Dashboard: ${dashboardTitle}`,
    `URL: ${dashboardUrl}`,
    "",
    "Participant Credentials:",
    ...credentials.map((c) => `• ${c.user_alias}: ${c.password}`),
  ];
  return lines.join("\n");
}
