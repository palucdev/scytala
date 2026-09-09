import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  verifyDashboardSession,
  SessionRateLimitError,
} from "@/lib/auth-guard";
import * as sessionModule from "@/lib/session";
import type { VerifiedSessionPayload } from "@/lib/session";
import * as rateLimitModule from "@/lib/rate-limit";
import * as dbClientModule from "@/client/db-client";

const mockCookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
  })),
}));

describe("src/lib/auth-guard.ts", () => {
  describe("SessionRateLimitError", () => {
    it("creates an instance with retryAfterSeconds and descriptive message", () => {
      const error = new SessionRateLimitError(45);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SessionRateLimitError);
      expect(error.name).toBe("SessionRateLimitError");
      expect(error.retryAfterSeconds).toBe(45);
      expect(error.message).toContain("45 seconds");
    });
  });

  describe("verifyDashboardSession", () => {
    const targetHash = "AbCdEfGh12345678";
    const validPayload: VerifiedSessionPayload = {
      dashboard_id: "dash-uuid-1234",
      dashboard_hash: targetHash,
      user_id: "user-uuid-5678",
      user_alias: "Alice",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };

    beforeEach(() => {
      vi.restoreAllMocks();
      mockCookieGet.mockClear();
      rateLimitModule.resetRateLimits();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      rateLimitModule.resetRateLimits();
    });

    it("returns null when dashboardHash is empty or whitespace", async () => {
      expect(await verifyDashboardSession("")).toBeNull();
      expect(await verifyDashboardSession("   ")).toBeNull();
      expect(
        await verifyDashboardSession(undefined as unknown as string),
      ).toBeNull();
    });

    it("returns null when no session cookie is found", async () => {
      mockCookieGet.mockReturnValue(undefined);

      const result = await verifyDashboardSession(targetHash);
      expect(result).toBeNull();
      expect(mockCookieGet).toHaveBeenCalledWith(
        sessionModule.getSessionCookieName(targetHash),
      );
      expect(mockCookieGet).toHaveBeenCalledWith(
        sessionModule.SESSION_COOKIE_NAME,
      );
    });

    it("returns null when token verification fails (e.g. tampered token)", async () => {
      mockCookieGet.mockImplementation((name: string) => {
        if (name === sessionModule.getSessionCookieName(targetHash)) {
          return { value: "invalid.token" };
        }
        return undefined;
      });
      vi.spyOn(sessionModule, "verifySessionToken").mockResolvedValue(null);

      const result = await verifyDashboardSession(targetHash);
      expect(result).toBeNull();
    });

    it("returns null when session token dashboard_hash does not match target hash", async () => {
      mockCookieGet.mockImplementation((name: string) => {
        if (name === sessionModule.getSessionCookieName(targetHash)) {
          return { value: "valid.token" };
        }
        return undefined;
      });
      vi.spyOn(sessionModule, "verifySessionToken").mockResolvedValue({
        ...validPayload,
        dashboard_hash: "different-hash-99",
      });

      const result = await verifyDashboardSession(targetHash);
      expect(result).toBeNull();
    });

    it("returns verified payload when scoped cookie is valid and hash matches", async () => {
      mockCookieGet.mockImplementation((name: string) => {
        if (name === sessionModule.getSessionCookieName(targetHash)) {
          return { value: "valid.scoped.token" };
        }
        return undefined;
      });
      vi.spyOn(sessionModule, "verifySessionToken").mockResolvedValue(
        validPayload,
      );

      const result = await verifyDashboardSession(targetHash);
      expect(result).toEqual(validPayload);
    });

    it("falls back to default session cookie when scoped cookie is not present", async () => {
      mockCookieGet.mockImplementation((name: string) => {
        if (name === sessionModule.SESSION_COOKIE_NAME) {
          return { value: "valid.fallback.token" };
        }
        return undefined;
      });
      vi.spyOn(sessionModule, "verifySessionToken").mockResolvedValue(
        validPayload,
      );

      const result = await verifyDashboardSession(targetHash);
      expect(result).toEqual(validPayload);
    });

    it("handles unexpected errors gracefully and returns null", async () => {
      mockCookieGet.mockImplementation(() => {
        throw new Error("Cookie store failure");
      });

      const result = await verifyDashboardSession(targetHash);
      expect(result).toBeNull();
    });

    it("throws SessionRateLimitError when rate limited and throwOnRateLimit is true", async () => {
      vi.spyOn(rateLimitModule, "checkRateLimit").mockResolvedValue({
        success: false,
        retryAfterSeconds: 45,
      });

      await expect(
        verifyDashboardSession(targetHash, { throwOnRateLimit: true }),
      ).rejects.toThrow(SessionRateLimitError);

      try {
        await verifyDashboardSession(targetHash, { throwOnRateLimit: true });
      } catch (err) {
        expect(err).toBeInstanceOf(SessionRateLimitError);
        expect((err as SessionRateLimitError).retryAfterSeconds).toBe(45);
      }
    });

    it("returns null without throwing when rate limited and throwOnRateLimit is false/undefined", async () => {
      vi.spyOn(rateLimitModule, "checkRateLimit").mockResolvedValue({
        success: false,
        retryAfterSeconds: 30,
      });

      const resultDefault = await verifyDashboardSession(targetHash);
      expect(resultDefault).toBeNull();

      const resultExplicit = await verifyDashboardSession(targetHash, {
        throwOnRateLimit: false,
      });
      expect(resultExplicit).toBeNull();

      // Ensure cookies and crypto were bypassed
      expect(mockCookieGet).not.toHaveBeenCalled();
    });

    it("does not call cookies or verifySessionToken when rate limited", async () => {
      vi.spyOn(rateLimitModule, "checkRateLimit").mockResolvedValue({
        success: false,
        retryAfterSeconds: 60,
      });
      const verifySpy = vi.spyOn(sessionModule, "verifySessionToken");

      await expect(
        verifyDashboardSession(targetHash, { throwOnRateLimit: true }),
      ).rejects.toThrow(SessionRateLimitError);

      expect(mockCookieGet).not.toHaveBeenCalled();
      expect(verifySpy).not.toHaveBeenCalled();
    });

    it("re-throws SessionRateLimitError if caught inside the try block", async () => {
      mockCookieGet.mockImplementation(() => {
        throw new SessionRateLimitError(20);
      });

      await expect(verifyDashboardSession(targetHash)).rejects.toThrow(
        SessionRateLimitError,
      );
    });

    it("guarantees no database calls are made on token verification failure (Resource Inversion defense)", async () => {
      const dbClientSpy = vi.spyOn(dbClientModule, "createDatabaseClient");

      // 1. Missing cookie
      mockCookieGet.mockReturnValue(undefined);
      await verifyDashboardSession(targetHash);
      expect(dbClientSpy).not.toHaveBeenCalled();

      // 2. Tampered token
      mockCookieGet.mockReturnValue({ value: "forged.jwt.token" });
      vi.spyOn(sessionModule, "verifySessionToken").mockResolvedValue(null);
      await verifyDashboardSession(targetHash);
      expect(dbClientSpy).not.toHaveBeenCalled();

      // 3. Hash mismatch
      vi.spyOn(sessionModule, "verifySessionToken").mockResolvedValue({
        ...validPayload,
        dashboard_hash: "attacker-mismatched-hash",
      });
      await verifyDashboardSession(targetHash);
      expect(dbClientSpy).not.toHaveBeenCalled();
    });
  });
});
