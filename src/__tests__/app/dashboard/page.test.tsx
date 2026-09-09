import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import DashboardPage from "@/app/dashboard/[hash]/page";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";
import * as dbClientModule from "@/client/db-client";
import * as sessionModule from "@/lib/session";
import * as authGuardModule from "@/lib/auth-guard";
import type { Dashboard, Note } from "@/client/db-client";

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

const mockCookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
  })),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("src/app/dashboard/[hash]/page.tsx (DashboardPage SSR)", () => {
  const mockDashboard: Dashboard = {
    id: "dash-1234-uuid",
    hash: "AbCdEfGh12345678",
    title: "Secret Operations Room",
    description: "Encrypted planning board",
    created_at: "2026-08-26T10:00:00Z",
    updated_at: "2026-08-26T10:00:00Z",
  };

  const mockNotes: Note[] = [
    {
      id: "note-older",
      dashboard_id: "dash-1234-uuid",
      title: "Older Note",
      content: "Created first, updated earlier",
      version: 1,
      created_at: "2026-08-26T08:00:00Z",
      updated_at: "2026-08-26T09:00:00Z",
    },
    {
      id: "note-newer",
      dashboard_id: "dash-1234-uuid",
      title: "Newer Note",
      content: "Created later, updated recently",
      version: 2,
      created_at: "2026-08-26T08:30:00Z",
      updated_at: "2026-08-26T11:00:00Z",
    },
  ];

  let mockGetDashboardByHash: ReturnType<typeof vi.fn>;
  let mockGetNotesByDashboard: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockNotFound.mockClear();
    mockCookieGet.mockClear();

    mockGetDashboardByHash = vi.fn();
    mockGetNotesByDashboard = vi.fn();

    vi.spyOn(dbClientModule, "createDatabaseClient").mockReturnValue({
      getDashboardByHash: mockGetDashboardByHash,
      getNotesByDashboard: mockGetNotesByDashboard,
    } as unknown as dbClientModule.DatabaseClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Routing & 404 validation", () => {
    it("calls notFound() when hash is empty string", async () => {
      await expect(
        DashboardPage({ params: Promise.resolve({ hash: "" }) }),
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(mockNotFound).toHaveBeenCalledTimes(1);
    });

    it("calls notFound() when hash is whitespace only", async () => {
      await expect(
        DashboardPage({ params: Promise.resolve({ hash: "   " }) }),
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(mockNotFound).toHaveBeenCalledTimes(1);
    });

    it("calls notFound() when dashboard is not found in database", async () => {
      mockGetDashboardByHash.mockResolvedValue(null);

      await expect(
        DashboardPage({
          params: Promise.resolve({ hash: "nonexistent-hash" }),
        }),
      ).rejects.toThrow("NEXT_NOT_FOUND");

      expect(mockGetDashboardByHash).toHaveBeenCalledWith("nonexistent-hash");
      expect(mockNotFound).toHaveBeenCalledTimes(1);
    });
  });

  describe("Unauthenticated access (LoginForm SSR)", () => {
    beforeEach(() => {
      mockGetDashboardByHash.mockResolvedValue(mockDashboard);
    });

    it("renders LoginForm when no session cookie is present", async () => {
      mockCookieGet.mockReturnValue(undefined);

      const page = await DashboardPage({
        params: Promise.resolve({ hash: mockDashboard.hash }),
      });
      renderWithTheme(page);

      expect(
        screen.getByText("Scytala Dashboard Login"),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("User Alias")).toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /sign in/i }),
      ).toBeInTheDocument();

      // Ensure no pre-auth dashboard title leakage
      expect(
        screen.queryByText("Secret Operations Room"),
      ).not.toBeInTheDocument();
    });

    it("renders LoginForm when session cookie is present but token verification fails", async () => {
      mockCookieGet.mockReturnValue({ value: "tampered.jwt.token" });
      vi.spyOn(sessionModule, "verifySessionToken").mockResolvedValue(null);

      const page = await DashboardPage({
        params: Promise.resolve({ hash: mockDashboard.hash }),
      });
      renderWithTheme(page);

      expect(
        screen.getByText("Scytala Dashboard Login"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Secret Operations Room"),
      ).not.toBeInTheDocument();
    });

    it("renders LoginForm when token is valid but dashboard_id does not match", async () => {
      mockCookieGet.mockReturnValue({ value: "other-dashboard.jwt.token" });
      vi.spyOn(sessionModule, "verifySessionToken").mockResolvedValue({
        dashboard_id: "other-dashboard-id-999",
        dashboard_hash: mockDashboard.hash,
        user_id: "user-123",
        user_alias: "rogue_agent",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      });

      const page = await DashboardPage({
        params: Promise.resolve({ hash: mockDashboard.hash }),
      });
      renderWithTheme(page);

      expect(
        screen.getByText("Scytala Dashboard Login"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Secret Operations Room"),
      ).not.toBeInTheDocument();
    });

    it("renders LoginForm when token is valid but dashboard_hash does not match", async () => {
      mockCookieGet.mockReturnValue({ value: "other-hash.jwt.token" });
      vi.spyOn(sessionModule, "verifySessionToken").mockResolvedValue({
        dashboard_id: mockDashboard.id,
        dashboard_hash: "different-hash-16c",
        user_id: "user-123",
        user_alias: "rogue_agent",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      });

      const page = await DashboardPage({
        params: Promise.resolve({ hash: mockDashboard.hash }),
      });
      renderWithTheme(page);

      expect(
        screen.getByText("Scytala Dashboard Login"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Secret Operations Room"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Authenticated access (DashboardView SSR)", () => {
    beforeEach(() => {
      mockGetDashboardByHash.mockResolvedValue(mockDashboard);
      mockCookieGet.mockReturnValue({ value: "valid.jwt.token" });
      vi.spyOn(sessionModule, "verifySessionToken").mockResolvedValue({
        dashboard_id: mockDashboard.id,
        dashboard_hash: mockDashboard.hash,
        user_id: "user-123",
        user_alias: "Commander_Shepard",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      });
    });

    it("renders DashboardView with header, participant chip, and note tiles", async () => {
      // Mock returns notes ordered by updated_at desc
      mockGetNotesByDashboard.mockResolvedValue([mockNotes[1], mockNotes[0]]);

      const page = await DashboardPage({
        params: Promise.resolve({ hash: mockDashboard.hash }),
      });
      renderWithTheme(page);

      expect(mockGetNotesByDashboard).toHaveBeenCalledWith(mockDashboard.id);

      expect(
        screen.getByRole("heading", { level: 1 }),
      ).toHaveTextContent("Secret Operations Room");
      expect(
        screen.getByText("Encrypted planning board"),
      ).toBeInTheDocument();
      expect(screen.getByText("Commander_Shepard")).toBeInTheDocument();

      const noteArticles = screen.getAllByRole("article");
      expect(noteArticles).toHaveLength(2);

      // Verify sorting: "Newer Note" (updated at 11:00) should come before "Older Note" (updated at 09:00)
      expect(noteArticles[0]).toHaveTextContent("Newer Note");
      expect(noteArticles[1]).toHaveTextContent("Older Note");
    });

    it("renders EmptyNotesState when dashboard has no notes", async () => {
      mockGetNotesByDashboard.mockResolvedValue([]);

      const page = await DashboardPage({
        params: Promise.resolve({ hash: mockDashboard.hash }),
      });
      renderWithTheme(page);

      expect(
        screen.getByRole("heading", { level: 1 }),
      ).toHaveTextContent("Secret Operations Room");
      expect(screen.getByText("Commander_Shepard")).toBeInTheDocument();
      expect(screen.getByText("No notes yet")).toBeInTheDocument();
      const createNoteLink = screen.getByRole("link", { name: /create note/i });
      expect(createNoteLink).toHaveAttribute(
        "href",
        `/dashboard/${mockDashboard.hash}/note/new`,
      );
      const newNoteLink = screen.getByRole("link", { name: /new note/i });
      expect(newNoteLink).toHaveAttribute(
        "href",
        `/dashboard/${mockDashboard.hash}/note/new`,
      );
    });

    it("resolves session token from scoped cookie name", async () => {
      const scopedCookieName = sessionModule.getSessionCookieName(mockDashboard.hash);
      mockCookieGet.mockImplementation((name: string) => {
        if (name === scopedCookieName) {
          return { value: "scoped.jwt.token" };
        }
        return undefined;
      });

      mockGetNotesByDashboard.mockResolvedValue([]);

      const page = await DashboardPage({
        params: Promise.resolve({ hash: mockDashboard.hash }),
      });
      renderWithTheme(page);

      expect(screen.getByText("Commander_Shepard")).toBeInTheDocument();
      expect(mockCookieGet).toHaveBeenCalledWith(scopedCookieName);
    });

    it("propagates database error when getNotesByDashboard fails for error boundary", async () => {
      mockGetNotesByDashboard.mockRejectedValue(new Error("Database connection lost"));

      await expect(
        DashboardPage({
          params: Promise.resolve({ hash: mockDashboard.hash }),
        }),
      ).rejects.toThrow("Database connection lost");
    });
  });

  describe("DTO Mappers & RSC Boundary Defense", () => {
    it("mapDashboardToDto strips internal database properties", async () => {
      const { mapDashboardToDto } = await import("@/app/dashboard/[hash]/page");
      const dto = mapDashboardToDto(mockDashboard);

      expect(dto).toEqual({
        title: "Secret Operations Room",
        description: "Encrypted planning board",
      });

      // Explicitly verify sensitive / internal database fields are omitted
      expect((dto as unknown as Record<string, unknown>).id).toBeUndefined();
      expect((dto as unknown as Record<string, unknown>).hash).toBeUndefined();
      expect((dto as unknown as Record<string, unknown>).created_at).toBeUndefined();
    });

    it("mapNotesToDto strips note internals and sorts by updated_at desc", async () => {
      const { mapNotesToDto } = await import("@/app/dashboard/[hash]/page");
      const unorderedNotes: Note[] = [
        {
          id: "note-1",
          dashboard_id: "dash-1234-uuid",
          title: "First Note",
          content: "Content 1",
          version: 1,
          created_at: "2026-08-26T08:00:00Z",
          updated_at: "2026-08-26T09:00:00Z",
        },
        {
          id: "note-2",
          dashboard_id: "dash-1234-uuid",
          title: "Second Note",
          content: "Content 2",
          version: 2,
          created_at: "2026-08-26T08:30:00Z",
          updated_at: "2026-08-26T12:00:00Z",
        },
      ];

      const dtos = mapNotesToDto(unorderedNotes);

      expect(dtos).toHaveLength(2);
      // Note 2 (updated at 12:00) should be first
      expect(dtos[0].id).toBe("note-2");
      expect(dtos[1].id).toBe("note-1");

      // Verify omitted properties
      expect((dtos[0] as unknown as Record<string, unknown>).dashboard_id).toBeUndefined();
      expect((dtos[0] as unknown as Record<string, unknown>).created_at).toBeUndefined();

      // Verify preserved properties
      expect(dtos[0]).toEqual({
        id: "note-2",
        title: "Second Note",
        content: "Content 2",
        version: 2,
        updated_at: "2026-08-26T12:00:00Z",
      });
    });

    it("truncates note content exceeding 300 characters in preview DTO", async () => {
      const { mapNotesToDto } = await import("@/app/dashboard/[hash]/page");
      const longContent = "A".repeat(500);
      const notes: Note[] = [
        {
          id: "note-long",
          dashboard_id: "dash-1234-uuid",
          title: "Long Note",
          content: longContent,
          version: 1,
          created_at: "2026-08-26T08:00:00Z",
          updated_at: "2026-08-26T09:00:00Z",
        },
      ];

      const dtos = mapNotesToDto(notes);
      expect(dtos[0].content).toHaveLength(300);
      expect(dtos[0].content).toBe("A".repeat(300));
    });
  });

  describe("Rate limiting (RateLimitNotice SSR)", () => {
    beforeEach(() => {
      mockGetDashboardByHash.mockResolvedValue(mockDashboard);
    });

    it("renders RateLimitNotice when verifyDashboardSession throws SessionRateLimitError", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockRejectedValue(
        new authGuardModule.SessionRateLimitError(42),
      );

      const page = await DashboardPage({
        params: Promise.resolve({ hash: mockDashboard.hash }),
      });
      renderWithTheme(page);

      expect(screen.getByText(/429 — Too Many Requests/i)).toBeInTheDocument();
      expect(screen.getByText(/42 seconds/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /retry now/i }),
      ).toBeInTheDocument();
    });

    it("re-throws unexpected errors that are not SessionRateLimitError", async () => {
      vi.spyOn(authGuardModule, "verifyDashboardSession").mockRejectedValue(
        new Error("Unexpected system failure"),
      );

      await expect(
        DashboardPage({
          params: Promise.resolve({ hash: mockDashboard.hash }),
        }),
      ).rejects.toThrow("Unexpected system failure");
    });
  });
});
