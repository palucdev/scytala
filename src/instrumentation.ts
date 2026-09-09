import { recordDeploymentAudit } from "./actions/audit";
import { getEnv } from "./lib/env";

/**
 * Next.js Instrumentation Hook
 * Executes once on server startup / deployment initialization.
 * Automatically records deployment audit info into the 'info' table.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === "edge"
  ) {
    try {
      getEnv();
    } catch (err) {
      console.error(
        "[Instrumentation] Environment configuration validation failed on startup:",
        err,
      );
      throw err;
    }

    try {
      const result = await recordDeploymentAudit();
      if (result.recorded) {
        console.log(
          `[Instrumentation] Deployment audit recorded: ${result.message}`,
        );
      }
    } catch (err) {
      console.warn(
        "[Instrumentation] Failed to record deployment audit on startup:",
        err,
      );
    }
  }
}
