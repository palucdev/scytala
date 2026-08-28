import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("Dashboard Subcomponents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("LogoutButton Client Component", () => {
    it("renders logout form with correct action, method, and button", () => {
      const { container } = renderWithTheme(<LogoutButton />);

      const form = container.querySelector("form");
      expect(form).toBeInTheDocument();
      expect(form).toHaveAttribute("action", "/api/auth/logout");
      expect(form).toHaveAttribute("method", "POST");

      const button = screen.getByRole("button", { name: /log out/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("type", "submit");
      expect(button).toHaveTextContent("Log out");
      expect(button).not.toBeDisabled();
    });

    it("renders hidden input for dashboardHash when provided", () => {
      const { container } = renderWithTheme(
        <LogoutButton dashboardHash="test-hash-123" />,
      );

      const hashInput = container.querySelector('input[name="dashboardHash"]');
      expect(hashInput).toBeInTheDocument();
      expect(hashInput).toHaveAttribute("type", "hidden");
      expect(hashInput).toHaveAttribute("value", "test-hash-123");

      const redirectInput = container.querySelector('input[name="redirectTo"]');
      expect(redirectInput).toBeNull();
    });

    it("renders hidden input for redirectTo when provided", () => {
      const { container } = renderWithTheme(
        <LogoutButton redirectTo="/custom-redirect" />,
      );

      const redirectInput = container.querySelector('input[name="redirectTo"]');
      expect(redirectInput).toBeInTheDocument();
      expect(redirectInput).toHaveAttribute("type", "hidden");
      expect(redirectInput).toHaveAttribute("value", "/custom-redirect");

      const hashInput = container.querySelector('input[name="dashboardHash"]');
      expect(hashInput).toBeNull();
    });

    it("renders both hidden inputs when both props are provided", () => {
      const { container } = renderWithTheme(
        <LogoutButton dashboardHash="hash-abc" redirectTo="/custom-login" />,
      );

      const hashInput = container.querySelector('input[name="dashboardHash"]');
      const redirectInput = container.querySelector('input[name="redirectTo"]');

      expect(hashInput).toHaveAttribute("value", "hash-abc");
      expect(redirectInput).toHaveAttribute("value", "/custom-login");
    });

    it("updates button state to submitting when form is submitted", () => {
      const { container } = renderWithTheme(
        <LogoutButton dashboardHash="test-hash" />,
      );

      const form = container.querySelector("form");
      expect(form).toBeInTheDocument();

      const button = screen.getByRole("button", { name: /log out/i });
      expect(button).not.toBeDisabled();

      fireEvent.submit(form!);

      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("Logging out...");
    });

    it("renders with custom variant and size props", () => {
      renderWithTheme(
        <LogoutButton variant="contained" size="large" />,
      );

      const button = screen.getByRole("button", { name: /log out/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("MuiButton-contained");
      expect(button).toHaveClass("MuiButton-sizeLarge");
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
