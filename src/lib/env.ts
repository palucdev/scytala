import { z } from "zod";

export const envSchema = z.object({
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters long"),
  DEPLOY_ID: z.string().optional().default("development"),
  APP_VERSION: z.string().optional().default("0.1.5"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).optional().default("info"),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

export function resetEnvCache(): void {
  validatedEnv = null;
}

export function getEnv(customEnv?: Record<string, string | undefined>): Env {
  if (!customEnv && validatedEnv) return validatedEnv;

  const source = customEnv || process.env;

  const result = envSchema.safeParse({
    SUPABASE_URL: source.SUPABASE_URL,
    SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    SESSION_SECRET: source.SESSION_SECRET,
    DEPLOY_ID: source.DEPLOY_ID,
    APP_VERSION: source.APP_VERSION,
    LOG_LEVEL: source.LOG_LEVEL,
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`[Scytala Env Validation Failed]:\n${issues}`);
  }

  if (!customEnv) {
    validatedEnv = result.data;
  }
  return result.data;
}
