import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

const ephemeralCache = new Map<string, number>();

export class InMemorySlidingWindowStore {
  private hits = new Map<string, number[]>();

  async limit(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (this.hits.get(key) || []).filter((t) => t > windowStart);

    if (timestamps.length >= maxRequests) {
      const oldest = timestamps[0] || now;
      const reset = oldest + windowMs;
      return { success: false, limit: maxRequests, remaining: 0, reset };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return {
      success: true,
      limit: maxRequests,
      remaining: maxRequests - timestamps.length,
      reset: now + windowMs,
    };
  }

  reset(): void {
    this.hits.clear();
  }
}

export const inMemoryStore = new InMemorySlidingWindowStore();

function getUpstashRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return new Redis({ url, token });
  }
  return null;
}

export type RateLimiterType = "authIp" | "authAccount" | "dashboardCreate";

export function createRateLimiters(redis: Redis | null = getUpstashRedis()): {
  authIp: Ratelimit | null;
  authAccount: Ratelimit | null;
  dashboardCreate: Ratelimit | null;
} {
  if (!redis) {
    return {
      authIp: null,
      authAccount: null,
      dashboardCreate: null,
    };
  }

  return {
    authIp: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "60 s"),
      ephemeralCache,
      timeout: 1000,
      prefix: "rl:auth:ip",
    }),
    authAccount: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "900 s"),
      ephemeralCache,
      timeout: 1000,
      prefix: "rl:auth:account",
    }),
    dashboardCreate: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "3600 s"),
      ephemeralCache,
      timeout: 1000,
      prefix: "rl:dash:create",
    }),
  };
}

export const rateLimiters: {
  authIp: Ratelimit | null;
  authAccount: Ratelimit | null;
  dashboardCreate: Ratelimit | null;
} = createRateLimiters();

export function getRateLimiters() {
  return createRateLimiters();
}

export async function getClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    const cfIp = headerList.get("cf-connecting-ip");
    if (cfIp && cfIp.trim().length > 0) {
      return cfIp.trim();
    }

    const xForwardedFor = headerList.get("x-forwarded-for");
    if (xForwardedFor && xForwardedFor.trim().length > 0) {
      const firstIp = xForwardedFor.split(",")[0]?.trim();
      if (firstIp && firstIp.length > 0) {
        return firstIp;
      }
    }
  } catch {
    // Return fallback if headers() fails in non-request contexts
  }

  return "127.0.0.1";
}

export interface RateLimitCheckResult {
  success: boolean;
  retryAfterSeconds: number;
}

export const RATE_LIMIT_CONFIGS: Record<
  RateLimiterType,
  { max: number; windowMs: number }
> = {
  authIp: { max: 10, windowMs: 60 * 1000 },
  authAccount: { max: 5, windowMs: 15 * 60 * 1000 },
  dashboardCreate: { max: 5, windowMs: 60 * 60 * 1000 },
};

export async function checkRateLimit(
  limiterType: RateLimiterType,
  identifier: string,
): Promise<RateLimitCheckResult> {
  const limiter = rateLimiters[limiterType];

  if (limiter) {
    const result = await limiter.limit(identifier);
    if (!result.success) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((result.reset - Date.now()) / 1000),
      );
      return { success: false, retryAfterSeconds };
    }
    return { success: true, retryAfterSeconds: 0 };
  }

  const config = RATE_LIMIT_CONFIGS[limiterType];
  const result = await inMemoryStore.limit(
    `${limiterType}:${identifier}`,
    config.max,
    config.windowMs,
  );

  if (!result.success) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.reset - Date.now()) / 1000),
    );
    return { success: false, retryAfterSeconds };
  }

  return { success: true, retryAfterSeconds: 0 };
}

export function resetRateLimits(): void {
  inMemoryStore.reset();
  ephemeralCache.clear();
  rateLimiters.authIp = null;
  rateLimiters.authAccount = null;
  rateLimiters.dashboardCreate = null;
}
