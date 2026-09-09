import { headers } from "next/headers";
import { createDatabaseClient } from "@/client/db-client";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "rate-limit" });

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
    if (timestamps.length === 0) {
      this.hits.delete(key);
    }

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

/**
 * Precomputed valid PBKDF2 hash for constant-time timing equalization on non-existent users.
 */
export const DUMMY_PBKDF2_HASH =
  "$pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";

export type RateLimiterType =
  | "authIp"
  | "authAccount"
  | "dashboardCreate"
  | "noteMutation";

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
  { max: number; windowMs: number; refillRate: number }
> = {
  authIp: { max: 10, windowMs: 60 * 1000, refillRate: 10 / 60 },
  authAccount: { max: 5, windowMs: 15 * 60 * 1000, refillRate: 5 / 900 },
  dashboardCreate: { max: 5, windowMs: 60 * 60 * 1000, refillRate: 5 / 3600 },
  noteMutation: { max: 30, windowMs: 60 * 1000, refillRate: 30 / 60 },
};

/**
 * Check rate limit using Cloudflare native rate limiter for IP limits,
 * Supabase PostgreSQL Token Bucket RPC for account and resource limits,
 * and falling back gracefully to inMemoryStore.
 */
export async function checkRateLimit(
  limiterType: RateLimiterType,
  identifier: string,
): Promise<RateLimitCheckResult> {
  const config = RATE_LIMIT_CONFIGS[limiterType];

  if (limiterType === "authIp") {
    // 1. Attempt Cloudflare native rate limiting binding
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const cfContext = await getCloudflareContext({ async: true });
      const cfEnv = cfContext?.env as
        | {
            AUTH_IP_LIMITER?: {
              limit: (options: { key: string }) => Promise<{ success: boolean }>;
            };
          }
        | undefined;

      if (cfEnv?.AUTH_IP_LIMITER && typeof cfEnv.AUTH_IP_LIMITER.limit === "function") {
        const cfResult = await cfEnv.AUTH_IP_LIMITER.limit({ key: identifier });
        if (!cfResult.success) {
          return { success: false, retryAfterSeconds: 60 };
        }
        return { success: true, retryAfterSeconds: 0 };
      }
    } catch (error) {
      log.debug("Cloudflare rate limiter binding unavailable or failed, falling back to in-memory store", {
        error,
      });
    }

    // Fallback to in-memory store for authIp
    const result = await inMemoryStore.limit(
      `authIp:${identifier}`,
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

  // 2. For authAccount and dashboardCreate: Attempt Supabase RPC
  try {
    const db = createDatabaseClient();
    const rpcResult = await db.checkRateLimit(
      `${limiterType}:${identifier}`,
      config.max,
      config.refillRate,
      1.0,
    );

    if (!rpcResult.success) {
      return {
        success: false,
        retryAfterSeconds: Math.max(1, rpcResult.retry_after_seconds),
      };
    }
    return { success: true, retryAfterSeconds: 0 };
  } catch (error) {
    log.warn("Supabase rate limit RPC failed, falling back to in-memory store", {
      limiterType,
      error,
    });
  }

  // Fallback to in-memory store for account / resource limiters
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
}
