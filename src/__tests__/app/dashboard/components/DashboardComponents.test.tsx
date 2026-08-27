import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import {
  DashboardHeader,
  NoteTile,
  NoteGrid,
  EmptyNotesState,
  LogoutButton,
  DashboardView,
  FormattedDate,
  type DashboardDto,
  type NoteDto,
} from "@/app/dashboard/[hash]/components";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";
import * as authActionModule from "@/actions/auth";

const mockRefresh = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    push: mockPush,
  }),
}));

vi.mock("@/actions/auth", () => ({
  logoutFromDashboardAction: vi.fn(),
  loginToDashboardAction: vi.fn(),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("Dashboard Subcomponents", () => {
  const mockLogoutAction = vi.mocked(
    authActionModule.logoutFromDashboardAction,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("LogoutButton Client Component", () => {
    it("renders logout button with icon and text", () => {
      renderWithTheme(<LogoutButton />);

      const button = screen.getByRole("button", { name: /log out/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent("Log out");
      expect(button).not.toBeDisabled();
    });

    it("triggers logoutFromDashboardAction and calls window.location.replace on click", async () => {
      const originalLocation = window.location;
      const replaceMock = vi.fn();
      // @ts-expect-error - mock window.location
      delete window.location;
      window.location = { ...originalLocation, replace: replaceMock, pathname: "/dashboard/test-hash" } as Location;

      mockLogoutAction.mockResolvedValueOnce({ success: true });

      renderWithTheme(<LogoutButton dashboardHash="test-hash" />);

      const button = screen.getByRole("button", { name: /log out/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockLogoutAction).toHaveBeenCalledWith({ dashboardHash: "test-hash" });
      });

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/dashboard/test-hash");
      });

      window.location = originalLocation;
    });

    it("redirects to custom redirectTo URL via window.location.replace when specified", async () => {
      const originalLocation = window.location;
      const replaceMock = vi.fn();
      // @ts-expect-error - mock window.location
      delete window.location;
      window.location = { ...originalLocation, replace: replaceMock, pathname: "/dashboard/test-hash" } as Location;

      mockLogoutAction.mockResolvedValueOnce({ success: true });

      renderWithTheme(<LogoutButton redirectTo="/goodbye" />);

      const button = screen.getByRole("button", { name: /log out/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockLogoutAction).toHaveBeenCalledWith(undefined);
      });

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/goodbye");
      });

      window.location = originalLocation;
    });

    it("handles logout action failure without redirecting", async () => {
      const originalLocation = window.location;
      const replaceMock = vi.fn();
      // @ts-expect-error - mock window.location
      delete window.location;
      window.location = { ...originalLocation, replace: replaceMock, pathname: "/dashboard/test-hash" } as Location;

      mockLogoutAction.mockResolvedValueOnce({ success: false, error: "Network error" });

      renderWithTheme(<LogoutButton dashboardHash="test-hash" />);

      const button = screen.getByRole("button", { name: /log out/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockLogoutAction).toHaveBeenCalledWith({ dashboardHash: "test-hash" });
      });

      expect(replaceMock).not.toHaveBeenCalled();
      expect(button).not.toBeDisabled();

      window.location = originalLocation;
    });

    it("handles logout action exception gracefully", async () => {
      const originalLocation = window.location;
      const replaceMock = vi.fn();
      // @ts-expect-error - mock window.location
      delete window.location;
      window.location = { ...originalLocation, replace: replaceMock, pathname: "/dashboard/test-hash" } as Location;

      mockLogoutAction.mockRejectedValueOnce(new Error("Fatal connection failure"));

      renderWithTheme(<LogoutButton dashboardHash="test-hash" />);

      const button = screen.getByRole("button", { name: /log out/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockLogoutAction).toHaveBeenCalledWith({ dashboardHash: "test-hash" });
      });

      expect(replaceMock).not.toHaveBeenCalled();
      expect(button).not.toBeDisabled();

      window.location = originalLocation;
    });
  });

  describe("DashboardHeader Component", () => {
    it("renders dashboard title, description, participant chip, and sync button", () => {
      renderWithTheme(
        <DashboardHeader
          title="Operation Spartan"
          description="Top secret encrypted strategic notes."
          userAlias="Alice_Commander"
        />,
      );

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Operation Spartan",
      );
      expect(
        screen.getByText("Top secret encrypted strategic notes."),
      ).toBeInTheDocument();
      expect(screen.getByText("Alice_Commander")).toBeInTheDocument();

      const syncBtn = screen.getByRole("button", {
        name: /sync \(up to date\)/i,
      });
      expect(syncBtn).toBeInTheDocument();
      expect(syncBtn).toBeDisabled();

      expect(
        screen.getByRole("button", { name: /log out/i }),
      ).toBeInTheDocument();
    });

    it("renders without description when description is null or omitted", () => {
      renderWithTheme(
        <DashboardHeader
          title="Minimal Dashboard"
          userAlias="Bob_Operator"
        />,
      );

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Minimal Dashboard",
      );
      expect(screen.getByText("Bob_Operator")).toBeInTheDocument();
    });
  });

  describe("NoteTile Component", () => {
    const sampleNote: NoteDto = {
      id: "note-1",
      title: "Reconnaissance Alpha",
      content: "All perimeter points secure. Proceed to checkpoint Bravo.",
      version: 3,
      updated_at: "2026-08-26T12:34:56.000Z",
    };

    it("renders note title, content, version badge, and formatted timestamp", () => {
      renderWithTheme(<NoteTile note={sampleNote} />);

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
        "Reconnaissance Alpha",
      );
      expect(
        screen.getByText(
          "All perimeter points secure. Proceed to checkpoint Bravo.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("v3")).toBeInTheDocument();
      // dayjs formatting for 2026-08-26 12:34 UTC or local depending on timezone
      expect(screen.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)).toBeInTheDocument();
    });

    it("falls back to 'Untitled Note' when title is empty or whitespace", () => {
      const untitledNote: NoteDto = {
        ...sampleNote,
        title: "   ",
      };

      renderWithTheme(<NoteTile note={untitledNote} />);

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
        "Untitled Note",
      );
    });

    it("falls back to 'v1' badge when version is falsy", () => {
      const unversionedNote: NoteDto = {
        ...sampleNote,
        version: 0,
      };

      renderWithTheme(<NoteTile note={unversionedNote} />);

      expect(screen.getByText("v1")).toBeInTheDocument();
    });
  });

  describe("FormattedDate Client Component", () => {
    it("renders formatted date string on mount", () => {
      renderWithTheme(
        <FormattedDate date="2026-08-26T14:30:00.000Z" format="YYYY-MM-DD HH:mm" />,
      );

      expect(screen.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)).toBeInTheDocument();
    });

    it("handles empty date gracefully", () => {
      const { container } = renderWithTheme(<FormattedDate date="" />);
      expect(container.querySelector("span") || container.firstChild).toHaveTextContent("");
    });
  });

  describe("NoteGrid Component", () => {
    const notes: NoteDto[] = [
      {
        id: "note-1",
        title: "First Note",
        content: "Content 1",
        version: 1,
        updated_at: "2026-08-26T10:00:00.000Z",
      },
      {
        id: "note-2",
        title: "Second Note",
        content: "Content 2",
        version: 2,
        updated_at: "2026-08-26T11:00:00.000Z",
      },
    ];

    it("renders all notes inside a grid container", () => {
      renderWithTheme(<NoteGrid notes={notes} />);

      expect(screen.getByText("First Note")).toBeInTheDocument();
      expect(screen.getByText("Content 1")).toBeInTheDocument();
      expect(screen.getByText("Second Note")).toBeInTheDocument();
      expect(screen.getByText("Content 2")).toBeInTheDocument();
      expect(screen.getAllByRole("article")).toHaveLength(2);
    });
  });

  describe("EmptyNotesState Component", () => {
    it("renders empty state card with icon, message, and disabled new note CTA", () => {
      renderWithTheme(<EmptyNotesState />);

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
        "No notes yet",
      );
      expect(
        screen.getByText(
          "Notes created by participants on this dashboard will appear here as tiles.",
        ),
      ).toBeInTheDocument();

      const newNoteBtn = screen.getByRole("button", { name: /new note/i });
      expect(newNoteBtn).toBeInTheDocument();
      expect(newNoteBtn).toBeDisabled();
    });
  });

  describe("DashboardView Container Component", () => {
    const mockDashboardDto: DashboardDto = {
      title: "Mission Andromeda",
      description: "Galactic operations dashboard.",
    };

    it("renders header and NoteGrid when notes are present", () => {
      const notes: NoteDto[] = [
        {
          id: "note-1",
          title: "Stargate Coordinates",
          content: "Glyphs: 1-4-9-16-25-36-7",
          version: 1,
          updated_at: "2026-08-26T02:00:00.000Z",
        },
      ];

      renderWithTheme(
        <DashboardView
          dashboard={mockDashboardDto}
          dashboardHash="secret-hash-16c"
          userAlias="Commander_Shepard"
          notes={notes}
        />,
      );

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Mission Andromeda",
      );
      expect(screen.getByText("Commander_Shepard")).toBeInTheDocument();
      expect(screen.getByText("Stargate Coordinates")).toBeInTheDocument();
      expect(screen.queryByText("No notes yet")).not.toBeInTheDocument();
    });

    it("renders header and EmptyNotesState when notes array is empty", () => {
      renderWithTheme(
        <DashboardView
          dashboard={mockDashboardDto}
          dashboardHash="secret-hash-16c"
          userAlias="Commander_Shepard"
          notes={[]}
        />,
      );

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Mission Andromeda",
      );
      expect(screen.getByText("Commander_Shepard")).toBeInTheDocument();
      expect(screen.getByText("No notes yet")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /new note/i }),
      ).toBeDisabled();
    });
  });
});
