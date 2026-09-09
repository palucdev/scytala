import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { revalidatePath } from "next/cache";
import {
  createNoteAction,
  updateNoteAction,
  deleteNoteAction,
} from "@/actions/notes";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
import * as authGuardModule from "@/lib/auth-guard";
import * as dbClientModule from "@/client/db-client";
import * as cryptoModule from "@/lib/crypto";
import * as rateLimitModule from "@/lib/rate-limit";
import { resetRateLimits } from "@/lib/rate-limit";
import { type Note, type NoteVersion, type DashboardUser } from "@/client/db-client";
import { type VerifiedSessionPayload } from "@/lib/session";

describe("src/actions/notes", () => {
  const validHash = "AbCdEfGh12345678";
  const validDashboardId = "dash-1234-uuid-5678";
  const validUserId = "user-1234-uuid-5678";
  const validNoteId = "123e4567-e89b-12d3-a456-426614174000";

  const mockSession: VerifiedSessionPayload = {
    dashboard_id: validDashboardId,
    dashboard_hash: validHash,
    user_id: validUserId,
    user_alias: "alice_agent",
    exp: 1724886400,
    iat: 1724800000,
  };

  const mockNote: Note = {
    id: validNoteId,
    dashboard_id: validDashboardId,
    title: "Test Note",
    content: "Initial content",
    version: 1,
    created_at: "2026-08-28T12:00:00Z",
    updated_at: "2026-08-28T12:00:00Z",
  };

  const mockVersion: NoteVersion = {
    id: "ver-1234-uuid",
    note_id: validNoteId,
    version: 1,
    title: "Test Note",
    content: "Initial content",
    author_id: validUserId,
    created_at: "2026-08-28T12:00:00Z",
  };

  const mockUser: DashboardUser = {
    id: validUserId,
    dashboard_id: validDashboardId,
    user_alias: "alice_agent",
    password_hash: "$pbkdf2$100000$saltsaltsalt$hashhashhash",
    created_at: "2026-08-28T12:00:00Z",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    resetRateLimits();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetRateLimits();
  });

  describe("createNoteAction", () => {
    it("returns validation error for empty content", async () => {
      const result = await createNoteAction({
        dashboardHash: validHash,
        content: "",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Note content cannot be empty");
        expect(result.fieldErrors?.content).toBeDefined();
      }
    });

    it("returns validation error for missing dashboardHash", async () => {
      const result = await createNoteAction({
        dashboardHash: "",
        content: "Some valid content",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Dashboard identifier is required");
        expect(result.fieldErrors?.dashboardHash).toBeDefined();
      }
    });

    it("returns unauthorized when session verification fails", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(null);

      const result = await createNoteAction({
        dashboardHash: validHash,
        content: "Some valid content",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(
          "Unauthorized. Please log in to this dashboard.",
        );
      }
    });

    it("returns rate-limited response when note creation limit is exceeded", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );
      vi.spyOn(rateLimitModule, "checkRateLimit").mockResolvedValue({
        success: false,
        retryAfterSeconds: 45,
      });

      const result = await createNoteAction({
        dashboardHash: validHash,
        title: "Throttled Note",
        content: "Some content",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.rateLimited).toBe(true);
        expect(result.retryAfterSeconds).toBe(45);
        expect(result.error).toContain("Too many note operations");
      }
    });

    it("returns rate-limited response when session verification rate limit is exceeded", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockRejectedValue(
        new authGuardModule.SessionRateLimitError(45),
      );

      const result = await createNoteAction({
        dashboardHash: validHash,
        title: "Throttled Session Note",
        content: "Some content",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.rateLimited).toBe(true);
        expect(result.retryAfterSeconds).toBe(45);
        expect(result.error).toContain("Too many session attempts");
      }
    });

    it("creates a note successfully with valid session and input", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      const mockCreateNote = vi.fn().mockResolvedValue({
        note: mockNote,
        initialVersion: mockVersion,
      });

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        createNote: mockCreateNote,
      } as unknown as dbClientModule.DatabaseClient);

      const result = await createNoteAction({
        dashboardHash: validHash,
        title: "Test Note",
        content: "Initial content",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.note).toEqual(mockNote);
      }
      expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/${validHash}`);
      expect(mockCreateNote).toHaveBeenCalledWith({
        dashboard_id: validDashboardId,
        title: "Test Note",
        content: "Initial content",
        author_id: validUserId,
      });
    });

    it("handles database exceptions and returns sanitized error", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        createNote: vi.fn().mockRejectedValue(new Error("DB connection failure")),
      } as unknown as dbClientModule.DatabaseClient);

      const result = await createNoteAction({
        dashboardHash: validHash,
        content: "Initial content",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Failed to create note. Please try again.");
      }
    });
  });

  describe("updateNoteAction", () => {
    it("returns validation error for invalid UUID", async () => {
      const result = await updateNoteAction({
        dashboardHash: validHash,
        noteId: "invalid-uuid",
        content: "Updated content",
        expectedVersion: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid note ID format");
      }
    });

    it("returns validation error for non-positive expectedVersion", async () => {
      const result = await updateNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        content: "Updated content",
        expectedVersion: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Version must be a positive integer");
      }
    });

    it("returns unauthorized when session verification fails", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(null);

      const result = await updateNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        content: "Updated content",
        expectedVersion: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(
          "Unauthorized. Please log in to this dashboard.",
        );
      }
    });

    it("returns rate-limited response when note update limit is exceeded", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );
      vi.spyOn(rateLimitModule, "checkRateLimit").mockResolvedValue({
        success: false,
        retryAfterSeconds: 30,
      });

      const result = await updateNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        content: "Throttled update content",
        expectedVersion: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.rateLimited).toBe(true);
        expect(result.retryAfterSeconds).toBe(30);
        expect(result.error).toContain("Too many note operations");
      }
    });

    it("returns rate-limited response when session verification rate limit is exceeded", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockRejectedValue(
        new authGuardModule.SessionRateLimitError(30),
      );

      const result = await updateNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        content: "Updated content",
        expectedVersion: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.rateLimited).toBe(true);
        expect(result.retryAfterSeconds).toBe(30);
        expect(result.error).toContain("Too many session attempts");
      }
    });

    it("returns error when note is not found", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getNoteById: vi.fn().mockResolvedValue(null),
      } as unknown as dbClientModule.DatabaseClient);

      const result = await updateNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        content: "Updated content",
        expectedVersion: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Note not found.");
      }
    });

    it("rejects cross-dashboard note update", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      const noteFromOtherDashboard: Note = {
        ...mockNote,
        dashboard_id: "other-dashboard-uuid",
      };

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getNoteById: vi.fn().mockResolvedValue(noteFromOtherDashboard),
      } as unknown as dbClientModule.DatabaseClient);

      const result = await updateNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        content: "Updated content",
        expectedVersion: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Note not found.");
      }
    });

    it("updates note successfully under optimistic concurrency", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      const updatedNote: Note = {
        ...mockNote,
        title: "Updated Title",
        content: "Updated content",
        version: 2,
        updated_at: "2026-08-28T13:00:00Z",
      };

      const mockUpdateNote = vi.fn().mockResolvedValue({
        note: updatedNote,
        newVersion: {
          ...mockVersion,
          version: 2,
          title: "Updated Title",
          content: "Updated content",
        },
      });

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getNoteById: vi.fn().mockResolvedValue(mockNote),
        updateNote: mockUpdateNote,
      } as unknown as dbClientModule.DatabaseClient);

      const result = await updateNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        title: "Updated Title",
        content: "Updated content",
        expectedVersion: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.note).toEqual(updatedNote);
      }
      expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/${validHash}`);
      expect(revalidatePath).toHaveBeenCalledWith(
        `/dashboard/${validHash}/note/${validNoteId}`,
      );
      expect(mockUpdateNote).toHaveBeenCalledWith({
        note_id: validNoteId,
        title: "Updated Title",
        content: "Updated content",
        expected_version: 1,
        author_id: validUserId,
      });
    });

    it("detects optimistic concurrency version conflict and returns typed flag", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getNoteById: vi.fn().mockResolvedValue(mockNote),
        updateNote: vi
          .fn()
          .mockRejectedValue(
            new Error(
              "[SupabaseDatabaseClient] updateNote failed: Version mismatch or note not found (expected version 1)",
            ),
          ),
      } as unknown as dbClientModule.DatabaseClient);

      const result = await updateNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        content: "Updated content",
        expectedVersion: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.versionConflict).toBe(true);
        expect(result.error).toBe(
          "This note has been modified by someone else. Please reload and try again.",
        );
      }
    });

    it("updates note and clears title when empty string is provided", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      const mockUpdateNote = vi.fn().mockResolvedValue({
        note: { ...mockNote, title: "", version: 2 },
        newVersion: { ...mockVersion, title: "", version: 2 },
      });

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getNoteById: vi.fn().mockResolvedValue(mockNote),
        updateNote: mockUpdateNote,
      } as unknown as dbClientModule.DatabaseClient);

      const result = await updateNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        title: "",
        content: "Updated content",
        expectedVersion: 1,
      });

      expect(result.success).toBe(true);
      expect(mockUpdateNote).toHaveBeenCalledWith({
        note_id: validNoteId,
        title: "",
        content: "Updated content",
        expected_version: 1,
        author_id: validUserId,
      });
    });

    it("handles generic database exceptions and returns sanitized error", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getNoteById: vi.fn().mockResolvedValue(mockNote),
        updateNote: vi.fn().mockRejectedValue(new Error("Network timeout")),
      } as unknown as dbClientModule.DatabaseClient);

      const result = await updateNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        content: "Updated content",
        expectedVersion: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.versionConflict).toBeUndefined();
        expect(result.error).toBe("Failed to update note. Please try again.");
      }
    });

    it("handles non-Error thrown objects in updateNoteAction", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getNoteById: vi.fn().mockResolvedValue(mockNote),
        updateNote: vi.fn().mockRejectedValue("Plain string error"),
      } as unknown as dbClientModule.DatabaseClient);

      const result = await updateNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        content: "Updated content",
        expectedVersion: 1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Failed to update note. Please try again.");
      }
    });
  });

  describe("deleteNoteAction", () => {
    it("returns validation error for missing password", async () => {
      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Password is required");
      }
    });

    it("returns validation error for invalid UUID", async () => {
      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: "bad-uuid",
        password: "secretPassword",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid note ID format");
      }
    });

    it("returns unauthorized when session verification fails", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(null);

      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "secretPassword",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(
          "Unauthorized. Please log in to this dashboard.",
        );
      }
    });

    it("throttles request when client IP rate limit is exceeded", async () => {
      vi.spyOn(rateLimitModule, "checkRateLimit").mockImplementation(
        async (limiterType: string) => {
          if (limiterType === "authIp") {
            return { success: false, retryAfterSeconds: 60 };
          }
          return { success: true, retryAfterSeconds: 0 };
        },
      );

      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "secretPassword",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.rateLimited).toBe(true);
        expect(result.retryAfterSeconds).toBe(60);
        expect(result.error).toContain("Too many attempts");
      }
    });

    it("throttles request when session verification rate limit is exceeded", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockRejectedValue(
        new authGuardModule.SessionRateLimitError(50),
      );

      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "secretPassword",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.rateLimited).toBe(true);
        expect(result.retryAfterSeconds).toBe(50);
        expect(result.error).toContain("Too many session attempts");
      }
    });

    it("throttles request when user noteMutation rate limit is exceeded", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      vi.spyOn(rateLimitModule, "checkRateLimit").mockImplementation(
        async (limiterType: string) => {
          if (limiterType === "noteMutation") {
            return { success: false, retryAfterSeconds: 30 };
          }
          return { success: true, retryAfterSeconds: 0 };
        },
      );

      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "secretPassword",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.rateLimited).toBe(true);
        expect(result.retryAfterSeconds).toBe(30);
        expect(result.error).toContain("Too many note operations");
      }
    });

    it("throttles request when account rate limit is exceeded on failed password", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getNoteById: vi.fn().mockResolvedValue(mockNote),
        getDashboardUserByAlias: vi.fn().mockResolvedValue(mockUser),
      } as unknown as dbClientModule.DatabaseClient);

      vi.spyOn(cryptoModule, "verifyPassword").mockResolvedValue(false);

      vi.spyOn(rateLimitModule, "checkRateLimit").mockImplementation(
        async (limiterType: string) => {
          if (limiterType === "authAccount") {
            return { success: false, retryAfterSeconds: 900 };
          }
          return { success: true, retryAfterSeconds: 0 };
        },
      );

      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "wrongPassword",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.rateLimited).toBe(true);
        expect(result.retryAfterSeconds).toBe(900);
        expect(result.error).toContain("Too many failed attempts for this account");
      }
    });

    it("mitigates timing attack when user is not found in dashboard", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getNoteById: vi.fn().mockResolvedValue(mockNote),
        getDashboardUserByAlias: vi.fn().mockResolvedValue(null),
      } as unknown as dbClientModule.DatabaseClient);

      const verifyPasswordSpy = vi
        .spyOn(cryptoModule, "verifyPassword")
        .mockResolvedValue(false);

      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "secretPassword",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid password.");
      }
      expect(verifyPasswordSpy).toHaveBeenCalledWith(
        "secretPassword",
        rateLimitModule.DUMMY_PBKDF2_HASH,
      );
    });

    it("mitigates timing attack and returns error when user ID does not match session", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      const mismatchedUser: DashboardUser = {
        ...mockUser,
        id: "different-user-uuid",
      };

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getNoteById: vi.fn().mockResolvedValue(mockNote),
        getDashboardUserByAlias: vi.fn().mockResolvedValue(mismatchedUser),
      } as unknown as dbClientModule.DatabaseClient);

      const verifyPasswordSpy = vi
        .spyOn(cryptoModule, "verifyPassword")
        .mockResolvedValue(false);

      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "secretPassword",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid password.");
      }
      expect(verifyPasswordSpy).toHaveBeenCalledWith(
        "secretPassword",
        rateLimitModule.DUMMY_PBKDF2_HASH,
      );
    });

    it("returns error when password verification fails", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getNoteById: vi.fn().mockResolvedValue(mockNote),
        getDashboardUserByAlias: vi.fn().mockResolvedValue(mockUser),
      } as unknown as dbClientModule.DatabaseClient);

      vi.spyOn(cryptoModule, "verifyPassword").mockResolvedValue(false);

      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "wrongPassword",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid password.");
      }
    });

    it("returns error when note to delete is not found", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getDashboardUserByAlias: vi.fn().mockResolvedValue(mockUser),
        getNoteById: vi.fn().mockResolvedValue(null),
      } as unknown as dbClientModule.DatabaseClient);

      vi.spyOn(cryptoModule, "verifyPassword").mockResolvedValue(true);

      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "correctPassword",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Note not found.");
      }
    });

    it("rejects cross-dashboard note deletion", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      const noteFromOtherDashboard: Note = {
        ...mockNote,
        dashboard_id: "other-dashboard-uuid",
      };

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getDashboardUserByAlias: vi.fn().mockResolvedValue(mockUser),
        getNoteById: vi.fn().mockResolvedValue(noteFromOtherDashboard),
      } as unknown as dbClientModule.DatabaseClient);

      vi.spyOn(cryptoModule, "verifyPassword").mockResolvedValue(true);

      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "correctPassword",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Note not found.");
      }
    });

    it("handles db.deleteNote returning false", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getDashboardUserByAlias: vi.fn().mockResolvedValue(mockUser),
        getNoteById: vi.fn().mockResolvedValue(mockNote),
        deleteNote: vi.fn().mockResolvedValue(false),
      } as unknown as dbClientModule.DatabaseClient);

      vi.spyOn(cryptoModule, "verifyPassword").mockResolvedValue(true);

      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "correctPassword",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Failed to delete note. Please try again.");
      }
    });

    it("successfully deletes note when password and ownership match", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      const mockDeleteNote = vi.fn().mockResolvedValue(true);

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getDashboardUserByAlias: vi.fn().mockResolvedValue(mockUser),
        getNoteById: vi.fn().mockResolvedValue(mockNote),
        deleteNote: mockDeleteNote,
      } as unknown as dbClientModule.DatabaseClient);

      vi.spyOn(cryptoModule, "verifyPassword").mockResolvedValue(true);

      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "correctPassword",
      });

      expect(result.success).toBe(true);
      expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/${validHash}`);
      expect(mockDeleteNote).toHaveBeenCalledWith(validNoteId);
    });

    it("catches exceptions and returns sanitized error", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        mockSession,
      );

      vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
        getDashboardUserByAlias: vi.fn().mockResolvedValue(mockUser),
        getNoteById: vi.fn().mockResolvedValue(mockNote),
        deleteNote: vi.fn().mockRejectedValue(new Error("RPC failed")),
      } as unknown as dbClientModule.DatabaseClient);

      vi.spyOn(cryptoModule, "verifyPassword").mockResolvedValue(true);

      const result = await deleteNoteAction({
        dashboardHash: validHash,
        noteId: validNoteId,
        password: "correctPassword",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Failed to delete note. Please try again.");
      }
    });
  });
});
