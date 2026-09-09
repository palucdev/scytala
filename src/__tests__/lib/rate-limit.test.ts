import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  InMemorySlidingWindowStore,
  checkRateLimit,
  getClientIp,
  resetRateLimits,
  RATE_LIMIT_CONFIGS,
} from "@/lib/rate-limit";
import * as nextHeaders from "next/headers";
import * as dbClientModule from "@/client/db-client";
import * as opennextModule from "@opennextjs/cloudflare";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

describe("src/lib/rate-limit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetRateLimits();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetRateLimits();
  });

  describe("InMemorySlidingWindowStore", () => {
    it("allows requests within maximum quota", async () => {
      const store = new InMemorySlidingWindowStore();
      const res1 = await store.limit("test-key", 2, 1000);
      expect(res1.success).toBe(true);
      expect(res1.remaining).toBe(1);
      expect(res1.limit).toBe(2);

      const res2 = await store.limit("test-key", 2, 1000);
      expect(res2.success).toBe(true);
      expect(res2.remaining).toBe(0);
    });

    it("blocks requests that exceed maximum quota within window", async () => {
      const store = new InMemorySlidingWindowStore();
      await store.limit("test-key", 2, 1000);
      await store.limit("test-key", 2, 1000);

      const res3 = await store.limit("test-key", 2, 1000);
      expect(res3.success).toBe(false);
      expect(res3.remaining).toBe(0);
      expect(res3.reset).toBeGreaterThan(Date.now());
    });

    it("allows new requests after sliding window expiration", async () => {
      const store = new InMemorySlidingWindowStore();
      const now = 1000000;
      vi.spyOn(Date, "now").mockReturnValue(now);

      await store.limit("test-key", 1, 500);
      const blocked = await store.limit("test-key", 1, 500);
      expect(blocked.success).toBe(false);

      // Advance time beyond window
      vi.spyOn(Date, "now").mockReturnValue(now + 600);
      const allowed = await store.limit("test-key", 1, 500);
      expect(allowed.success).toBe(true);
      expect(allowed.remaining).toBe(0);
    });

    it("resets tracked keys", async () => {
      const store = new InMemorySlidingWindowStore();
      await store.limit("test-key", 1, 1000);
      const blocked = await store.limit("test-key", 1, 1000);
      expect(blocked.success).toBe(false);

      store.reset();
      const afterReset = await store.limit("test-key", 1, 1000);
      expect(afterReset.success).toBe(true);
    });
  });

  describe("getClientIp", () => {
    it("returns cf-connecting-ip header if present", async () => {
      vi.spyOn(nextHeaders, "headers").mockResolvedValue({
        get: vi.fn((name: string) => {
          if (name === "cf-connecting-ip") return " 203.0.113.195 ";
          return null;
        }),
      } as unknown as Headers);

      const ip = await getClientIp();
      expect(ip).toBe("203.0.113.195");
    });

    it("returns first IP from x-forwarded-for if cf-connecting-ip is missing", async () => {
      vi.spyOn(nextHeaders, "headers").mockResolvedValue({
        get: vi.fn((name: string) => {
          if (name === "x-forwarded-for") return "198.51.100.1, 192.0.2.1";
          return null;
        }),
      } as unknown as Headers);

      const ip = await getClientIp();
      expect(ip).toBe("198.51.100.1");
    });

    it("returns fallback 127.0.0.1 when no IP headers are present", async () => {
      vi.spyOn(nextHeaders, "headers").mockResolvedValue({
        get: vi.fn(() => null),
      } as unknown as Headers);

      const ip = await getClientIp();
      expect(ip).toBe("127.0.0.1");
    });

    it("returns fallback 127.0.0.1 when headers() throws an exception", async () => {
      vi.spyOn(nextHeaders, "headers").mockRejectedValue(new Error("Outside request context"));

      const ip = await getClientIp();
      expect(ip).toBe("127.0.0.1");
    });

    it("ignores whitespace-only header values", async () => {
      vi.spyOn(nextHeaders, "headers").mockResolvedValue({
        get: vi.fn((name: string) => {
          if (name === "cf-connecting-ip") return "   ";
          if (name === "x-forwarded-for") return "   ";
          return null;
        }),
      } as unknown as Headers);

      const ip = await getClientIp();
      expect(ip).toBe("127.0.0.1");
    });
  });

  describe("checkRateLimit - Cloudflare native rate limiter (authIp)", () => {
    it("allows request when Cloudflare AUTH_IP_LIMITER binding succeeds", async () => {
      const mockLimit = vi.fn().mockResolvedValue({ success: true });
      vi.spyOn(opennextModule, "getCloudflareContext").mockResolvedValue({
        env: {
          AUTH_IP_LIMITER: { limit: mockLimit },
        },
      } as unknown as Awaited<ReturnType<typeof opennextModule.getCloudflareContext>>);

      const result = await checkRateLimit("authIp", "1.2.3.4");
      expect(result.success).toBe(true);
      expect(result.retryAfterSeconds).toBe(0);
      expect(mockLimit).toHaveBeenCalledWith({ key: "1.2.3.4" });
    });

    it("blocks request and returns 60s retry time when Cloudflare AUTH_IP_LIMITER limits", async () => {
      const mockLimit = vi.fn().mockResolvedValue({ success: false });
      vi.spyOn(opennextModule, "getCloudflareContext").mockResolvedValue({
        env: {
          AUTH_IP_LIMITER: { limit: mockLimit },
        },
      } as unknown as Awaited<ReturnType<typeof opennextModule.getCloudflareContext>>);

      const result = await checkRateLimit("authIp", "1.2.3.4");
      expect(result.success).toBe(false);
      expect(result.retryAfterSeconds).toBe(60);
      expect(mockLimit).toHaveBeenCalledWith({ key: "1.2.3.4" });
    });

    it("falls back to in-memory store when Cloudflare binding throws an error", async () => {
      vi.spyOn(opennextModule, "getCloudflareContext").mockRejectedValue(new Error("No Cloudflare context"));

      const max = RATE_LIMIT_CONFIGS.authIp.max;
      for (let i = 0; i < max; i++) {
        const result = await checkRateLimit("authIp", "fallback-ip-1");
        expect(result.success).toBe(true);
      }

      const blocked = await checkRateLimit("authIp", "fallback-ip-1");
      expect(blocked.success).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("falls back to in-memory store when AUTH_IP_LIMITER binding is not defined in env", async () => {
      vi.spyOn(opennextModule, "getCloudflareContext").mockResolvedValue({
        env: {},
      } as unknown as Awaited<ReturnType<typeof opennextModule.getCloudflareContext>>);

      const result = await checkRateLimit("authIp", "no-binding-ip");
      expect(result.success).toBe(true);
      expect(result.retryAfterSeconds).toBe(0);
    });
  });

  describe("checkRateLimit - Supabase RPC (authAccount & dashboardCreate)", () => {
    it("allows request when Supabase checkRateLimit RPC succeeds", async () => {
      const mockCheckRateLimit = vi.fn().mockResolvedValue({
        success: true,
        remaining: 4,
        retry_after_seconds: 0,
      });

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        checkRateLimit: mockCheckRateLimit,
      } as unknown as dbClientModule.DatabaseClient);

      const result = await checkRateLimit("authAccount", "dash-hash:user");
      expect(result.success).toBe(true);
      expect(result.retryAfterSeconds).toBe(0);
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        "authAccount:dash-hash:user",
        5,
        RATE_LIMIT_CONFIGS.authAccount.refillRate,
        1.0,
      );
    });

    it("blocks request and returns retryAfterSeconds when Supabase checkRateLimit RPC indicates quota exceeded", async () => {
      const mockCheckRateLimit = vi.fn().mockResolvedValue({
        success: false,
        remaining: 0,
        retry_after_seconds: 180,
      });

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        checkRateLimit: mockCheckRateLimit,
      } as unknown as dbClientModule.DatabaseClient);

      const result = await checkRateLimit("dashboardCreate", "client-ip-1");
      expect(result.success).toBe(false);
      expect(result.retryAfterSeconds).toBe(180);
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        "dashboardCreate:client-ip-1",
        5,
        RATE_LIMIT_CONFIGS.dashboardCreate.refillRate,
        1.0,
      );
    });

    it("falls back to in-memory store when Supabase RPC throws an error", async () => {
      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        checkRateLimit: vi.fn().mockRejectedValue(new Error("Database RPC failure")),
      } as unknown as dbClientModule.DatabaseClient);

      const max = RATE_LIMIT_CONFIGS.authAccount.max;
      for (let i = 0; i < max; i++) {
        const result = await checkRateLimit("authAccount", "fallback-account");
        expect(result.success).toBe(true);
      }

      const blocked = await checkRateLimit("authAccount", "fallback-account");
      expect(blocked.success).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe("checkRateLimit - In-memory isolation and limits", () => {
    beforeEach(() => {
      // Force in-memory by having CF and DB throw
      vi.spyOn(opennextModule, "getCloudflareContext").mockRejectedValue(new Error("No CF"));
      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        checkRateLimit: vi.fn().mockRejectedValue(new Error("No DB")),
      } as unknown as dbClientModule.DatabaseClient);
    });

    it("enforces authAccount limits in memory", async () => {
      const max = RATE_LIMIT_CONFIGS.authAccount.max;
      for (let i = 0; i < max; i++) {
        const result = await checkRateLimit("authAccount", "dash123:alice");
        expect(result.success).toBe(true);
      }

      const blocked = await checkRateLimit("authAccount", "dash123:alice");
      expect(blocked.success).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("enforces dashboardCreate limits in memory", async () => {
      const max = RATE_LIMIT_CONFIGS.dashboardCreate.max;
      for (let i = 0; i < max; i++) {
        const result = await checkRateLimit("dashboardCreate", "5.6.7.8");
        expect(result.success).toBe(true);
      }

      const blocked = await checkRateLimit("dashboardCreate", "5.6.7.8");
      expect(blocked.success).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("enforces noteMutation limits in memory", async () => {
      const max = RATE_LIMIT_CONFIGS.noteMutation.max;
      for (let i = 0; i < max; i++) {
        const result = await checkRateLimit("noteMutation", "dash123:user456");
        expect(result.success).toBe(true);
      }

      const blocked = await checkRateLimit("noteMutation", "dash123:user456");
      expect(blocked.success).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("isolates different identifiers in memory", async () => {
      const max = RATE_LIMIT_CONFIGS.authIp.max;
      for (let i = 0; i < max; i++) {
        await checkRateLimit("authIp", "ip-1");
      }

      const blockedIp1 = await checkRateLimit("authIp", "ip-1");
      expect(blockedIp1.success).toBe(false);

      const allowedIp2 = await checkRateLimit("authIp", "ip-2");
      expect(allowedIp2.success).toBe(true);
    });
  });
});
