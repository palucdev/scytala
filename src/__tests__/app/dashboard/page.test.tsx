import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import DashboardPage from "@/app/dashboard/[hash]/page";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";
import * as dbClientModule from "@/client/db-client";
import * as sessionModule from "@/lib/session";
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
      expect(
        screen.getByRole("button", { name: /new note/i }),
      ).toBeDisabled();
    });
  });
});
