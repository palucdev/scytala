import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/health/route";
import * as dbClientModule from "@/client/db-client";
import { Logger } from "@/lib/logger";

describe("GET /api/health", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns HTTP 200 with healthy payload and cache-control headers when database is healthy", async () => {
    const mockCheckHealth = vi.fn().mockResolvedValue({
      status: "up",
      latencyMs: 14,
    });

    vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
      checkHealth: mockCheckHealth,
    } as unknown as dbClientModule.DatabaseClient);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );

    const data = await response.json();
    expect(data.status).toBe("healthy");
    expect(data.version).toBe(process.env.APP_VERSION || "0.1.5");
    expect(typeof data.uptime_seconds).toBe("number");
    expect(typeof data.timestamp).toBe("string");
    expect(data.checks).toEqual({
      database: {
        status: "up",
        latency_ms: 14,
      },
    });
    expect(mockCheckHealth).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("returns HTTP 503 with unhealthy payload and logs warning when database is down", async () => {
    const mockCheckHealth = vi.fn().mockResolvedValue({
      status: "down",
      latencyMs: 45,
      error: "Connection terminated unexpectedly",
    });

    vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
      checkHealth: mockCheckHealth,
    } as unknown as dbClientModule.DatabaseClient);

    const warnSpy = vi.spyOn(Logger.prototype, "warn");

    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );

    const data = await response.json();
    expect(data.status).toBe("unhealthy");
    expect(data.checks).toEqual({
      database: {
        status: "down",
        latency_ms: 45,
        error: "Database connectivity check failed",
      },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "Health check degraded or database down",
      expect.anything(),
    );
  });

  it("returns HTTP 503 when health check throws an unhandled exception", async () => {
    vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
      checkHealth: vi.fn().mockRejectedValue(new Error("Timeout during probe")),
    } as unknown as dbClientModule.DatabaseClient);

    const errorSpy = vi.spyOn(Logger.prototype, "error");

    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );

    const data = await response.json();
    expect(data.status).toBe("unhealthy");
    expect(data.checks).toEqual({
      database: {
        status: "down",
        latency_ms: expect.any(Number),
        error: "Health probe internal error",
      },
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "Unhandled exception during health check",
      expect.anything(),
    );
  });

  it("uses custom APP_VERSION environment variable when present", async () => {
    vi.stubEnv("APP_VERSION", "2.0.0");

    vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
      checkHealth: vi.fn().mockResolvedValue({
        status: "up",
        latencyMs: 8,
      }),
    } as unknown as dbClientModule.DatabaseClient);

    const response = await GET();
    const data = await response.json();
    expect(data.version).toBe("2.0.0");
  });
});
