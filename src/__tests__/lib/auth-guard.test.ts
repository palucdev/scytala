import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyDashboardSession } from "@/lib/auth-guard";
import * as sessionModule from "@/lib/session";
import type { VerifiedSessionPayload } from "@/lib/session";

const mockCookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
  })),
}));

describe("src/lib/auth-guard.ts (verifyDashboardSession)", () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when dashboardHash is empty or whitespace", async () => {
    expect(await verifyDashboardSession("")).toBeNull();
    expect(await verifyDashboardSession("   ")).toBeNull();
    expect(await verifyDashboardSession(undefined as unknown as string)).toBeNull();
  });

  it("returns null when no session cookie is found", async () => {
    mockCookieGet.mockReturnValue(undefined);

    const result = await verifyDashboardSession(targetHash);
    expect(result).toBeNull();
    expect(mockCookieGet).toHaveBeenCalledWith(sessionModule.getSessionCookieName(targetHash));
    expect(mockCookieGet).toHaveBeenCalledWith(sessionModule.SESSION_COOKIE_NAME);
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
    vi.spyOn(sessionModule, "verifySessionToken").mockResolvedValue(validPayload);

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
    vi.spyOn(sessionModule, "verifySessionToken").mockResolvedValue(validPayload);

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
});
