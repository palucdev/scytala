import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDashboardAction } from "@/actions/dashboard";
import {
  createDashboardSchema,
  participantUserSchema,
  formatCredentialsText,
  ALIAS_REGEX,
} from "@/schemas/dashboard";
import * as dbClientModule from "@/client/db-client";
import * as cryptoModule from "@/lib/crypto";

describe("src/actions/dashboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ALIAS_REGEX", () => {
    it("accepts valid alphanumeric, hyphen, and underscore characters", () => {
      expect(ALIAS_REGEX.test("alice")).toBe(true);
      expect(ALIAS_REGEX.test("Bob_123")).toBe(true);
      expect(ALIAS_REGEX.test("charlie-dev_99")).toBe(true);
    });

    it("rejects spaces and special characters", () => {
      expect(ALIAS_REGEX.test("alice smith")).toBe(false);
      expect(ALIAS_REGEX.test("alice@work")).toBe(false);
      expect(ALIAS_REGEX.test("bob!")).toBe(false);
      expect(ALIAS_REGEX.test("user#1")).toBe(false);
    });
  });

  describe("participantUserSchema", () => {
    it("validates a correct participant input", () => {
      const result = participantUserSchema.safeParse({
        id: "temp-1",
        userAlias: "Alice_01",
        password: "securePassword123!",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userAlias).toBe("Alice_01");
        expect(result.data.id).toBe("temp-1");
      }
    });

    it("fails when alias is too short or too long", () => {
      const shortResult = participantUserSchema.safeParse({
        userAlias: "a",
        password: "password123",
      });
      expect(shortResult.success).toBe(false);

      const longResult = participantUserSchema.safeParse({
        userAlias: "a".repeat(31),
        password: "password123",
      });
      expect(longResult.success).toBe(false);
    });

    it("fails when password is too short or too long", () => {
      const shortPw = participantUserSchema.safeParse({
        userAlias: "alice",
        password: "12345",
      });
      expect(shortPw.success).toBe(false);

      const longPw = participantUserSchema.safeParse({
        userAlias: "alice",
        password: "a".repeat(129),
      });
      expect(longPw.success).toBe(false);
    });
  });

  describe("createDashboardSchema", () => {
    it("validates a complete dashboard payload", () => {
      const result = createDashboardSchema.safeParse({
        title: "Team Alpha Dashboard",
        description: "Project Apollo coordination space",
        users: [
          { userAlias: "alice", password: "password123" },
          { userAlias: "bob", password: "password456" },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Team Alpha Dashboard");
        expect(result.data.description).toBe("Project Apollo coordination space");
        expect(result.data.users).toHaveLength(2);
      }
    });

    it("transforms empty or blank description to null", () => {
      const result = createDashboardSchema.safeParse({
        title: "Dashboard",
        description: "",
        users: [{ userAlias: "alice", password: "password123" }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBeNull();
      }
    });

    it("allows optional description when omitted", () => {
      const result = createDashboardSchema.safeParse({
        title: "Dashboard",
        users: [{ userAlias: "alice", password: "password123" }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBeNull();
      }
    });

    it("rejects empty title or title exceeding 80 characters", () => {
      const emptyTitle = createDashboardSchema.safeParse({
        title: "   ",
        users: [{ userAlias: "alice", password: "password123" }],
      });
      expect(emptyTitle.success).toBe(false);

      const longTitle = createDashboardSchema.safeParse({
        title: "A".repeat(81),
        users: [{ userAlias: "alice", password: "password123" }],
      });
      expect(longTitle.success).toBe(false);
    });

    it("rejects description exceeding 300 characters", () => {
      const longDesc = createDashboardSchema.safeParse({
        title: "Dashboard",
        description: "A".repeat(301),
        users: [{ userAlias: "alice", password: "password123" }],
      });
      expect(longDesc.success).toBe(false);
    });

    it("rejects empty users list", () => {
      const emptyUsers = createDashboardSchema.safeParse({
        title: "Dashboard",
        users: [],
      });
      expect(emptyUsers.success).toBe(false);
    });

    it("rejects case-insensitive duplicate user aliases", () => {
      const duplicates = createDashboardSchema.safeParse({
        title: "Dashboard",
        users: [
          { userAlias: "Alice", password: "password123" },
          { userAlias: "alice", password: "password456" },
        ],
      });
      expect(duplicates.success).toBe(false);
      if (!duplicates.success) {
        expect(duplicates.error.issues[0]?.message).toContain(
          "Participant aliases must be unique",
        );
      }
    });
  });

  describe("createDashboardAction", () => {
    it("successfully creates a dashboard and returns cleartext credentials", async () => {
      const mockDashboard = {
        id: "dash-uuid-1",
        hash: "AbCdEfGh12345678",
        title: "Test Board",
        description: "Test Desc",
        created_at: "2026-08-24T20:00:00Z",
        updated_at: "2026-08-24T20:00:00Z",
      };

      const mockCreateDashboard = vi.fn().mockResolvedValue({
        dashboard: mockDashboard,
        users: [
          {
            id: "user-1",
            dashboard_id: "dash-uuid-1",
            user_alias: "alice",
            created_at: "2026-08-24T20:00:00Z",
          },
          {
            id: "user-2",
            dashboard_id: "dash-uuid-1",
            user_alias: "bob",
            created_at: "2026-08-24T20:00:00Z",
          },
        ],
      });

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        createDashboard: mockCreateDashboard,
      } as unknown as dbClientModule.DatabaseClient);

      const slugSpy = vi.spyOn(cryptoModule, "generateDashboardSlug").mockReturnValue(
        "AbCdEfGh12345678",
      );
      vi.spyOn(cryptoModule, "hashPassword").mockImplementation(
        async (pw) => `hashed_${pw}`,
      );

      const input = {
        title: "Test Board",
        description: "Test Desc",
        users: [
          { userAlias: "alice", password: "secretPassword1" },
          { userAlias: "bob", password: "secretPassword2" },
        ],
      };

      const result = await createDashboardAction(input);

      expect(result.success).toBe(true);
      expect(slugSpy).toHaveBeenCalledWith(cryptoModule.DEFAULT_DASHBOARD_SLUG_LENGTH);
      if (result.success) {
        expect(result.dashboard).toEqual(mockDashboard);
        expect(result.credentials).toEqual([
          { userAlias: "alice", password: "secretPassword1" },
          { userAlias: "bob", password: "secretPassword2" },
        ]);
      }

      expect(mockCreateDashboard).toHaveBeenCalledWith({
        title: "Test Board",
        description: "Test Desc",
        hash: "AbCdEfGh12345678",
        users: [
          { user_alias: "alice", password_hash: "hashed_secretPassword1" },
          { user_alias: "bob", password_hash: "hashed_secretPassword2" },
        ],
      });
    });

    it("returns validation error when payload is invalid", async () => {
      const invalidInput = {
        title: "",
        users: [],
      };

      const result = await createDashboardAction(invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
        expect(result.fieldErrors).toBeDefined();
      }
    });

    it("returns sanitized error message when database unique constraint violation occurs", async () => {
      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        createDashboard: vi
          .fn()
          .mockRejectedValue(new Error("Database unique constraint violation")),
      } as unknown as dbClientModule.DatabaseClient);

      const input = {
        title: "Valid Title",
        users: [{ userAlias: "alice", password: "password123" }],
      };

      const result = await createDashboardAction(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(
          "A dashboard with this identifier already exists. Please try again.",
        );
      }
    });

    it("returns error message when database client throws a generic Error", async () => {
      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        createDashboard: vi
          .fn()
          .mockRejectedValue(new Error("Database connection timeout")),
      } as unknown as dbClientModule.DatabaseClient);

      const input = {
        title: "Valid Title",
        users: [{ userAlias: "alice", password: "password123" }],
      };

      const result = await createDashboardAction(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(
          "Failed to create dashboard. Please try again later.",
        );
      }
    });

    it("returns fallback error message when thrown error is not an Error instance", async () => {
      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        createDashboard: vi
          .fn()
          .mockRejectedValue("string exception"),
      } as unknown as dbClientModule.DatabaseClient);

      const input = {
        title: "Valid Title",
        users: [{ userAlias: "alice", password: "password123" }],
      };

      const result = await createDashboardAction(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Failed to create dashboard");
      }
    });
  });

  describe("formatCredentialsText", () => {
    it("formats title, URL, and credentials correctly", () => {
      const formatted = formatCredentialsText(
        "Project Apollo",
        "https://scytala.app/dashboard/AbCdEfGh12345678",
        [
          { userAlias: "alice", password: "pwd1" },
          { userAlias: "bob", password: "pwd2" },
        ],
      );

      const expected = [
        "Dashboard: Project Apollo",
        "URL: https://scytala.app/dashboard/AbCdEfGh12345678",
        "",
        "Participant Credentials:",
        "• alice: pwd1",
        "• bob: pwd2",
      ].join("\n");

      expect(formatted).toBe(expected);
    });

    it("handles a single participant credential", () => {
      const formatted = formatCredentialsText(
        "Solo Board",
        "https://scytala.app/dashboard/xyz123",
        [{ userAlias: "creator", password: "myPassword" }],
      );

      expect(formatted).toContain("Dashboard: Solo Board");
      expect(formatted).toContain("URL: https://scytala.app/dashboard/xyz123");
      expect(formatted).toContain("• creator: myPassword");
    });
  });
});
