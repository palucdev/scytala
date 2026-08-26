import { z } from "zod";
import { ALIAS_REGEX } from "./dashboard";

export const loginDashboardSchema = z.object({
  dashboardHash: z
    .string()
    .trim()
    .min(1, "Dashboard identifier is required"),
  userAlias: z
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
    .min(1, "Password is required")
    .max(128, "Password is too long"),
});

export type LoginDashboardInput = z.infer<typeof loginDashboardSchema>;

export type LoginDashboardActionResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

export type LogoutDashboardActionResult = {
  success: boolean;
  error?: string;
};
