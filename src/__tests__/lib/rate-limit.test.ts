import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  InMemorySlidingWindowStore,
  checkRateLimit,
  getClientIp,
  getRateLimiters,
  resetRateLimits,
  RATE_LIMIT_CONFIGS,
} from "@/lib/rate-limit";
import * as nextHeaders from "next/headers";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

describe("src/lib/rate-limit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetRateLimits();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetRateLimits();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
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

  describe("checkRateLimit (in-memory mode)", () => {
    it("enforces authIp limits correctly", async () => {
      const max = RATE_LIMIT_CONFIGS.authIp.max;
      for (let i = 0; i < max; i++) {
        const result = await checkRateLimit("authIp", "1.2.3.4");
        expect(result.success).toBe(true);
        expect(result.retryAfterSeconds).toBe(0);
      }

      const blocked = await checkRateLimit("authIp", "1.2.3.4");
      expect(blocked.success).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("enforces authAccount limits correctly", async () => {
      const max = RATE_LIMIT_CONFIGS.authAccount.max;
      for (let i = 0; i < max; i++) {
        const result = await checkRateLimit("authAccount", "dash123:alice");
        expect(result.success).toBe(true);
        expect(result.retryAfterSeconds).toBe(0);
      }

      const blocked = await checkRateLimit("authAccount", "dash123:alice");
      expect(blocked.success).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("enforces dashboardCreate limits correctly", async () => {
      const max = RATE_LIMIT_CONFIGS.dashboardCreate.max;
      for (let i = 0; i < max; i++) {
        const result = await checkRateLimit("dashboardCreate", "5.6.7.8");
        expect(result.success).toBe(true);
        expect(result.retryAfterSeconds).toBe(0);
      }

      const blocked = await checkRateLimit("dashboardCreate", "5.6.7.8");
      expect(blocked.success).toBe(false);
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("isolates different identifiers", async () => {
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

  describe("Upstash Redis configuration", () => {
    it("returns null limiters when environment variables are absent", () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const limiters = getRateLimiters();
      expect(limiters.authIp).toBeNull();
      expect(limiters.authAccount).toBeNull();
      expect(limiters.dashboardCreate).toBeNull();
    });

    it("instantiates Upstash Ratelimit instances when env vars are present", () => {
      process.env.UPSTASH_REDIS_REST_URL = "https://test-redis.upstash.io";
      process.env.UPSTASH_REDIS_REST_TOKEN = "test-token-123";

      const limiters = getRateLimiters();
      expect(limiters.authIp).not.toBeNull();
      expect(limiters.authAccount).not.toBeNull();
      expect(limiters.dashboardCreate).not.toBeNull();
    });

    it("calculates retryAfterSeconds from reset timestamp when Upstash limit fails", async () => {
      const resetTime = Date.now() + 45000;
      const mockLimit = vi.fn().mockResolvedValue({
        success: false,
        limit: 10,
        remaining: 0,
        reset: resetTime,
        pending: Promise.resolve(),
      });

      const mockLimiter = {
        limit: mockLimit,
      } as unknown as import("@upstash/ratelimit").Ratelimit;

      const { rateLimiters, checkRateLimit } = await import("@/lib/rate-limit");
      rateLimiters.authIp = mockLimiter;

      const result = await checkRateLimit("authIp", "redis-test-ip");
      expect(result.success).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(40);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(46);
      expect(mockLimit).toHaveBeenCalledWith("redis-test-ip");
    });

    it("returns retryAfterSeconds: 0 when Upstash limit succeeds", async () => {
      const mockLimit = vi.fn().mockResolvedValue({
        success: true,
        limit: 10,
        remaining: 9,
        reset: Date.now() + 60000,
        pending: Promise.resolve(),
      });

      const mockLimiter = {
        limit: mockLimit,
      } as unknown as import("@upstash/ratelimit").Ratelimit;

      const { rateLimiters, checkRateLimit } = await import("@/lib/rate-limit");
      rateLimiters.authIp = mockLimiter;

      const result = await checkRateLimit("authIp", "redis-test-ip-success");
      expect(result.success).toBe(true);
      expect(result.retryAfterSeconds).toBe(0);
      expect(mockLimit).toHaveBeenCalledWith("redis-test-ip-success");
    });
  });
});
