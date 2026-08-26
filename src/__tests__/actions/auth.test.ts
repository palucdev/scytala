import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loginToDashboardAction, logoutFromDashboardAction } from "@/actions/auth";
import { loginDashboardSchema } from "@/schemas/auth";
import * as dbClientModule from "@/client/db-client";
import * as cryptoModule from "@/lib/crypto";
import * as sessionModule from "@/lib/session";

const mockCookieSet = vi.fn();
const mockCookieDelete = vi.fn();
const mockCookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: mockCookieSet,
    delete: mockCookieDelete,
    get: mockCookieGet,
  })),
}));

describe("src/actions/auth", () => {
  const mockDashboard = {
    id: "dash-1234-uuid",
    hash: "AbCdEfGh12345678",
    title: "Secret Strategy Space",
    description: "Confidential roadmap",
    created_at: "2026-08-26T20:00:00Z",
    updated_at: "2026-08-26T20:00:00Z",
  };

  const mockUser = {
    id: "user-1234-uuid",
    dashboard_id: "dash-1234-uuid",
    user_alias: "alice_agent",
    password_hash: "$pbkdf2$100000$saltsaltsaltsalt$hashhashhash",
    created_at: "2026-08-26T20:00:00Z",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockCookieSet.mockClear();
    mockCookieDelete.mockClear();
    mockCookieGet.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loginDashboardSchema", () => {
    it("validates valid input payload", () => {
      const result = loginDashboardSchema.safeParse({
        dashboardHash: "AbCdEfGh12345678",
        userAlias: "alice_agent",
        password: "securePassword123!",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dashboardHash).toBe("AbCdEfGh12345678");
        expect(result.data.userAlias).toBe("alice_agent");
        expect(result.data.password).toBe("securePassword123!");
      }
    });

    it("rejects empty or whitespace-only dashboardHash", () => {
      const result = loginDashboardSchema.safeParse({
        dashboardHash: "   ",
        userAlias: "alice_agent",
        password: "password123",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Dashboard identifier is required");
      }
    });

    it("rejects invalid alias lengths and characters", () => {
      const shortAlias = loginDashboardSchema.safeParse({
        dashboardHash: "hash1234",
        userAlias: "a",
        password: "password123",
      });
      expect(shortAlias.success).toBe(false);

      const longAlias = loginDashboardSchema.safeParse({
        dashboardHash: "hash1234",
        userAlias: "a".repeat(31),
        password: "password123",
      });
      expect(longAlias.success).toBe(false);

      const invalidChars = loginDashboardSchema.safeParse({
        dashboardHash: "hash1234",
        userAlias: "alice@work!",
        password: "password123",
      });
      expect(invalidChars.success).toBe(false);
    });

    it("rejects empty or excessively long password", () => {
      const emptyPw = loginDashboardSchema.safeParse({
        dashboardHash: "hash1234",
        userAlias: "alice",
        password: "",
      });
      expect(emptyPw.success).toBe(false);

      const longPw = loginDashboardSchema.safeParse({
        dashboardHash: "hash1234",
        userAlias: "alice",
        password: "a".repeat(129),
      });
      expect(longPw.success).toBe(false);
    });
  });

  describe("loginToDashboardAction", () => {
    it("successfully logs in with valid credentials and sets session cookie", async () => {
      const mockGetDashboardByHash = vi.fn().mockResolvedValue(mockDashboard);
      const mockGetDashboardUserByAlias = vi.fn().mockResolvedValue(mockUser);

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getDashboardByHash: mockGetDashboardByHash,
        getDashboardUserByAlias: mockGetDashboardUserByAlias,
      } as unknown as dbClientModule.DatabaseClient);

      const verifyPasswordSpy = vi
        .spyOn(cryptoModule, "verifyPassword")
        .mockResolvedValue(true);

      const createTokenSpy = vi
        .spyOn(sessionModule, "createSessionToken")
        .mockResolvedValue("mocked.jwt.token");

      vi.spyOn(sessionModule, "getSessionSecret").mockReturnValue("test-session-secret");

      const result = await loginToDashboardAction({
        dashboardHash: "AbCdEfGh12345678",
        userAlias: "alice_agent",
        password: "correct-password",
      });

      expect(result.success).toBe(true);
      expect(mockGetDashboardByHash).toHaveBeenCalledWith("AbCdEfGh12345678");
      expect(mockGetDashboardUserByAlias).toHaveBeenCalledWith("dash-1234-uuid", "alice_agent");
      expect(verifyPasswordSpy).toHaveBeenCalledWith("correct-password", mockUser.password_hash);
      expect(createTokenSpy).toHaveBeenCalledWith(
        {
          dashboard_id: mockDashboard.id,
          dashboard_hash: mockDashboard.hash,
          user_id: mockUser.id,
          user_alias: mockUser.user_alias,
        },
        "test-session-secret",
        sessionModule.DEFAULT_SESSION_TTL_SECONDS,
      );

      expect(mockCookieSet).toHaveBeenCalledWith(
        sessionModule.SESSION_COOKIE_NAME,
        "mocked.jwt.token",
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: sessionModule.DEFAULT_SESSION_TTL_SECONDS,
        }),
      );
    });

    it("returns validation error on invalid input schema", async () => {
      const result = await loginToDashboardAction({
        dashboardHash: "",
        userAlias: "",
        password: "",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
        expect(result.fieldErrors).toBeDefined();
      }
      expect(mockCookieSet).not.toHaveBeenCalled();
    });

    it("mitigates timing attack and returns generic error when dashboard is not found", async () => {
      const mockGetDashboardByHash = vi.fn().mockResolvedValue(null);

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getDashboardByHash: mockGetDashboardByHash,
      } as unknown as dbClientModule.DatabaseClient);

      const verifyPasswordSpy = vi
        .spyOn(cryptoModule, "verifyPassword")
        .mockResolvedValue(false);

      const result = await loginToDashboardAction({
        dashboardHash: "NonExistentHash12",
        userAlias: "alice_agent",
        password: "some-password",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid alias or password.");
      }
      expect(verifyPasswordSpy).toHaveBeenCalled();
      expect(mockCookieSet).not.toHaveBeenCalled();
    });

    it("mitigates timing attack and returns generic error when user alias is not found", async () => {
      const mockGetDashboardByHash = vi.fn().mockResolvedValue(mockDashboard);
      const mockGetDashboardUserByAlias = vi.fn().mockResolvedValue(null);

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getDashboardByHash: mockGetDashboardByHash,
        getDashboardUserByAlias: mockGetDashboardUserByAlias,
      } as unknown as dbClientModule.DatabaseClient);

      const verifyPasswordSpy = vi
        .spyOn(cryptoModule, "verifyPassword")
        .mockResolvedValue(false);

      const result = await loginToDashboardAction({
        dashboardHash: "AbCdEfGh12345678",
        userAlias: "non_existent_user",
        password: "some-password",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid alias or password.");
      }
      expect(verifyPasswordSpy).toHaveBeenCalled();
      expect(mockCookieSet).not.toHaveBeenCalled();
    });

    it("returns generic error when password verification fails", async () => {
      const mockGetDashboardByHash = vi.fn().mockResolvedValue(mockDashboard);
      const mockGetDashboardUserByAlias = vi.fn().mockResolvedValue(mockUser);

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getDashboardByHash: mockGetDashboardByHash,
        getDashboardUserByAlias: mockGetDashboardUserByAlias,
      } as unknown as dbClientModule.DatabaseClient);

      vi.spyOn(cryptoModule, "verifyPassword").mockResolvedValue(false);

      const result = await loginToDashboardAction({
        dashboardHash: "AbCdEfGh12345678",
        userAlias: "alice_agent",
        password: "wrong-password",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid alias or password.");
      }
      expect(mockCookieSet).not.toHaveBeenCalled();
    });

    it("catches exceptions and returns sanitized error message", async () => {
      vi.spyOn(dbClientModule, "createDatabaseClient").mockImplementation(() => {
        throw new Error("Database network failure");
      });

      const result = await loginToDashboardAction({
        dashboardHash: "AbCdEfGh12345678",
        userAlias: "alice_agent",
        password: "some-password",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(
          "Authentication service temporarily unavailable. Please try again.",
        );
      }
      expect(mockCookieSet).not.toHaveBeenCalled();
    });
  });

  describe("logoutFromDashboardAction", () => {
    it("deletes session cookie and returns success", async () => {
      const result = await logoutFromDashboardAction();

      expect(result.success).toBe(true);
      expect(mockCookieDelete).toHaveBeenCalledWith(sessionModule.SESSION_COOKIE_NAME);
    });

    it("returns error when cookie deletion throws an unexpected exception", async () => {
      mockCookieDelete.mockImplementation(() => {
        throw new Error("Cookie deletion failed");
      });

      const result = await logoutFromDashboardAction();

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to log out.");
    });
  });
});
