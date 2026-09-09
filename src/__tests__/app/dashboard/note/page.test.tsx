import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import NoteEditorPage from "@/app/dashboard/[hash]/note/[noteId]/page";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";
import * as dbClientModule from "@/client/db-client";
import * as authGuardModule from "@/lib/auth-guard";
import type { Dashboard, Note } from "@/client/db-client";
import type { VerifiedSessionPayload } from "@/lib/session";

const mockNotFound = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => {
    mockNotFound();
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("src/app/dashboard/[hash]/note/[noteId]/page.tsx (NoteEditorPage SSR)", () => {
  const mockDashboard: Dashboard = {
    id: "dash-1234-uuid",
    hash: "AbCdEfGh12345678",
    title: "Secret Operations Room",
    description: "Encrypted planning board",
    created_at: "2026-08-26T10:00:00Z",
    updated_at: "2026-08-26T10:00:00Z",
  };

  const validSession: VerifiedSessionPayload = {
    dashboard_id: "dash-1234-uuid",
    dashboard_hash: "AbCdEfGh12345678",
    user_id: "user-1234-uuid",
    user_alias: "Alice_Agent",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };

  const mockNote: Note = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    dashboard_id: "dash-1234-uuid",
    title: "Mission Briefing",
    content: "Proceed with covert surveillance.",
    version: 1,
    created_at: "2026-08-26T10:00:00Z",
    updated_at: "2026-08-26T10:00:00Z",
  };

  let mockGetDashboardByHash: ReturnType<typeof vi.fn>;
  let mockGetNoteById: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockNotFound.mockClear();

    mockGetDashboardByHash = vi.fn();
    mockGetNoteById = vi.fn();

    vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
      getDashboardByHash: mockGetDashboardByHash,
      getNoteById: mockGetNoteById,
    } as unknown as dbClientModule.DatabaseClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Parameter validation & 404 handling", () => {
    it("calls notFound() when hash is empty or whitespace", async () => {
      await expect(
        NoteEditorPage({
          params: Promise.resolve({ hash: "", noteId: "new" }),
        }),
      ).rejects.toThrow("NEXT_NOT_FOUND");

      await expect(
        NoteEditorPage({
          params: Promise.resolve({ hash: "   ", noteId: "new" }),
        }),
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(mockNotFound).toHaveBeenCalledTimes(2);
    });

    it("calls notFound() when noteId is empty or whitespace", async () => {
      await expect(
        NoteEditorPage({
          params: Promise.resolve({ hash: mockDashboard.hash, noteId: "" }),
        }),
      ).rejects.toThrow("NEXT_NOT_FOUND");

      await expect(
        NoteEditorPage({
          params: Promise.resolve({ hash: mockDashboard.hash, noteId: "   " }),
        }),
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(mockNotFound).toHaveBeenCalledTimes(2);
    });

    it("calls notFound() when dashboard does not exist", async () => {
      mockGetDashboardByHash.mockResolvedValue(null);

      await expect(
        NoteEditorPage({
          params: Promise.resolve({
            hash: "nonexistent-hash",
            noteId: "new",
          }),
        }),
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(mockGetDashboardByHash).toHaveBeenCalledWith("nonexistent-hash");
      expect(mockNotFound).toHaveBeenCalledTimes(1);
    });
  });

  describe("Authentication flow", () => {
    beforeEach(() => {
      mockGetDashboardByHash.mockResolvedValue(mockDashboard);
    });

    it("renders LoginForm when user is not authenticated (null session)", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(null);

      const page = await NoteEditorPage({
        params: Promise.resolve({
          hash: mockDashboard.hash,
          noteId: "new",
        }),
      });
      renderWithTheme(page);

      expect(screen.getByText("Scytala Dashboard Login")).toBeInTheDocument();
      expect(screen.getByLabelText("User Alias")).toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toBeInTheDocument();
    });

    it("renders LoginForm when session dashboard_id does not match dashboard", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue({
        ...validSession,
        dashboard_id: "different-dashboard-uuid",
      });

      const page = await NoteEditorPage({
        params: Promise.resolve({
          hash: mockDashboard.hash,
          noteId: "new",
        }),
      });
      renderWithTheme(page);

      expect(screen.getByText("Scytala Dashboard Login")).toBeInTheDocument();
    });
  });

  describe("Create mode (noteId === 'new')", () => {
    beforeEach(() => {
      mockGetDashboardByHash.mockResolvedValue(mockDashboard);
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        validSession,
      );
    });

    it("renders NoteEditor in create mode with empty fields", async () => {
      const page = await NoteEditorPage({
        params: Promise.resolve({
          hash: mockDashboard.hash,
          noteId: "new",
        }),
      });
      renderWithTheme(page);

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Text note",
      );
      expect(screen.getByLabelText("Note title")).toHaveValue("");
      expect(screen.getByLabelText("Note content")).toHaveValue("");
      expect(screen.getByText("Alice_Agent")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Delete note" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Edit mode (noteId is UUID)", () => {
    beforeEach(() => {
      mockGetDashboardByHash.mockResolvedValue(mockDashboard);
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockResolvedValue(
        validSession,
      );
    });

    it("calls notFound() when noteId is neither 'new' nor a valid UUID", async () => {
      await expect(
        NoteEditorPage({
          params: Promise.resolve({
            hash: mockDashboard.hash,
            noteId: "not-a-valid-uuid",
          }),
        }),
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(mockNotFound).toHaveBeenCalledTimes(1);
      expect(mockGetNoteById).not.toHaveBeenCalled();
    });

    it("calls notFound() when note does not exist in database", async () => {
      mockGetNoteById.mockResolvedValue(null);

      await expect(
        NoteEditorPage({
          params: Promise.resolve({
            hash: mockDashboard.hash,
            noteId: mockNote.id,
          }),
        }),
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(mockGetNoteById).toHaveBeenCalledWith(mockNote.id);
      expect(mockNotFound).toHaveBeenCalledTimes(1);
    });

    it("calls notFound() when note belongs to a different dashboard", async () => {
      mockGetNoteById.mockResolvedValue({
        ...mockNote,
        dashboard_id: "different-dash-uuid",
      });

      await expect(
        NoteEditorPage({
          params: Promise.resolve({
            hash: mockDashboard.hash,
            noteId: mockNote.id,
          }),
        }),
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(mockNotFound).toHaveBeenCalledTimes(1);
    });

    it("renders NoteEditor in edit mode populated with note content and version", async () => {
      mockGetNoteById.mockResolvedValue(mockNote);

      const page = await NoteEditorPage({
        params: Promise.resolve({
          hash: mockDashboard.hash,
          noteId: mockNote.id,
        }),
      });
      renderWithTheme(page);

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Text note",
      );
      expect(screen.getByLabelText("Note title")).toHaveValue(mockNote.title);
      expect(screen.getByLabelText("Note content")).toHaveValue(mockNote.content);
      expect(screen.getByText("v1")).toBeInTheDocument();
      expect(screen.getByText("Alice_Agent")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Delete note" }),
      ).toBeInTheDocument();
    });
  });

  describe("Rate limiting (RateLimitNotice SSR)", () => {
    beforeEach(() => {
      mockGetDashboardByHash.mockResolvedValue(mockDashboard);
    });

    it("renders RateLimitNotice when verifyDashboardSession throws SessionRateLimitError", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockRejectedValue(
        new authGuardModule.SessionRateLimitError(55),
      );

      const page = await NoteEditorPage({
        params: Promise.resolve({
          hash: mockDashboard.hash,
          noteId: "new",
        }),
      });
      renderWithTheme(page);

      expect(screen.getByText(/429 — Too Many Requests/i)).toBeInTheDocument();
      expect(screen.getByText(/55 seconds/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /retry now/i }),
      ).toBeInTheDocument();
    });

    it("re-throws unexpected errors that are not SessionRateLimitError", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockRejectedValue(
        new Error("Unexpected failure in note editor"),
      );

      await expect(
        NoteEditorPage({
          params: Promise.resolve({
            hash: mockDashboard.hash,
            noteId: "new",
          }),
        }),
      ).rejects.toThrow("Unexpected failure in note editor");
    });
  });
});
