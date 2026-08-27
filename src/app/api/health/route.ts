import { NextResponse } from "next/server";
import { createDatabaseClient } from "@/client/db-client";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const WORKER_START_TIME = Date.now();

export async function GET() {
  const log = logger.child({ endpoint: "/api/health" });
  const probeStart = performance.now();

  try {
    const signal = AbortSignal.timeout(5000);
    const db = createDatabaseClient();
    const dbHealth = await db.checkHealth(signal);
    const isHealthy = dbHealth.status === "up";
    const uptimeSeconds = Math.floor((Date.now() - WORKER_START_TIME) / 1000);

    const payload = {
      status: isHealthy ? ("healthy" as const) : ("unhealthy" as const),
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || "undefined",
      uptime_seconds: uptimeSeconds,
      checks: {
        database: {
          status: dbHealth.status,
          latency_ms: dbHealth.latencyMs,
          ...(dbHealth.error && {
            error: "Database connectivity check failed",
          }),
        },
      },
    };

    if (!isHealthy) {
      log.warn("Health check degraded or database down", { dbHealth });
    }

    return NextResponse.json(payload, {
      status: isHealthy ? 200 : 503,
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - probeStart);
    log.error("Unhandled exception during health check", error);
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        version: process.env.APP_VERSION || "undefined",
        uptime_seconds: Math.floor((Date.now() - WORKER_START_TIME) / 1000),
        checks: {
          database: {
            status: "down",
            latency_ms: elapsedMs,
            error: "Health probe internal error",
          },
        },
      },
      {
        status: 503,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      },
    );
  }
}
