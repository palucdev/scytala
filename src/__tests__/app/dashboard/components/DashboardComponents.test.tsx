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
      renderWithTheme(<LogoutButton variant="contained" size="large" />);

      const button = screen.getByRole("button", { name: /log out/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass("MuiButton-contained");
      expect(button).toHaveClass("MuiButton-sizeLarge");
    });

    it("renders with custom sx styling prop", () => {
      renderWithTheme(<LogoutButton sx={{ height: 40, px: 2 }} />);

      const button = screen.getByRole("button", { name: /log out/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveStyle({ height: "40px" });
    });
  });

  describe("DashboardHeader Component", () => {
    it("renders 3 layers: user bar, dashboard title/description, and action buttons", () => {
      renderWithTheme(
        <DashboardHeader
          title="Operation Spartan"
          description="Top secret encrypted strategic notes."
          userAlias="Alice_Commander"
          dashboardHash="secret-hash-16c"
        />,
      );

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Operation Spartan",
      );
      expect(
        screen.getByText("Top secret encrypted strategic notes."),
      ).toBeInTheDocument();
      expect(screen.getByText("Alice_Commander")).toBeInTheDocument();

      // Layer 1: Dashboard settings, Sync, Logout
      const settingsBtn = screen.getByRole("button", {
        name: /dashboard settings/i,
      });
      expect(settingsBtn).toBeInTheDocument();
      expect(settingsBtn).toBeDisabled();

      const syncBtn = screen.getByRole("button", {
        name: /sync \(up to date\)/i,
      });
      expect(syncBtn).toBeInTheDocument();
      expect(syncBtn).toBeDisabled();

      expect(
        screen.getByRole("button", { name: /log out/i }),
      ).toBeInTheDocument();

      // Layer 3: Dashboard actions label and action buttons
      expect(screen.getByText("Dashboard Actions")).toBeInTheDocument();

      const createNoteBtn = screen.getByRole("link", { name: /create note/i });
      expect(createNoteBtn).toBeInTheDocument();
      expect(createNoteBtn).toHaveAttribute(
        "href",
        "/dashboard/secret-hash-16c/note/new",
      );

      expect(
        screen.getByRole("button", { name: /add directory/i }),
      ).toBeDisabled();
      expect(screen.getByRole("button", { name: /add file/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /add image/i })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /add survey/i }),
      ).toBeDisabled();
    });

    it("renders without description when description is null or omitted", () => {
      renderWithTheme(
        <DashboardHeader
          title="Minimal Dashboard"
          userAlias="Bob_Operator"
          dashboardHash="min-hash-123"
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

    it("renders note title, content, version badge, formatted timestamp, and links to editor", () => {
      renderWithTheme(
        <NoteTile note={sampleNote} dashboardHash="secret-hash-16c" />,
      );

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
        "Reconnaissance Alpha",
      );
      expect(
        screen.getByText(
          "All perimeter points secure. Proceed to checkpoint Bravo.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("v3")).toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "/dashboard/secret-hash-16c/note/note-1",
      );
      // dayjs formatting for 2026-08-26 12:34 UTC or local depending on timezone
      expect(
        screen.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/),
      ).toBeInTheDocument();
    });

    it("falls back to 'Untitled Note' when title is empty or whitespace", () => {
      const untitledNote: NoteDto = {
        ...sampleNote,
        title: "   ",
      };

      renderWithTheme(
        <NoteTile note={untitledNote} dashboardHash="secret-hash-16c" />,
      );

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
        "Untitled Note",
      );
    });

    it("falls back to 'v1' badge when version is falsy", () => {
      const unversionedNote: NoteDto = {
        ...sampleNote,
        version: 0,
      };

      renderWithTheme(
        <NoteTile note={unversionedNote} dashboardHash="secret-hash-16c" />,
      );

      expect(screen.getByText("v1")).toBeInTheDocument();
    });

    it("renders overflowing note content and does not render click prompt", () => {
      const longNote: NoteDto = {
        ...sampleNote,
        content:
          "Alpha unit has established the perimeter at waypoint seven. Proceed with caution towards sector nine. Multiple encrypted transmissions intercepted from unidentified repeaters in the northern corridor.",
      };

      renderWithTheme(
        <NoteTile note={longNote} dashboardHash="secret-hash-16c" />,
      );

      const paragraph = screen.getByText(
        /alpha unit has established the perimeter/i,
      );
      expect(paragraph).toBeInTheDocument();
      expect(paragraph.tagName).toBe("P");

      expect(
        screen.queryByText(/click to see whole note/i),
      ).not.toBeInTheDocument();
    });

    it("does not render click prompt and renders short content cleanly", () => {
      const shortNote: NoteDto = {
        ...sampleNote,
        content: "Mission accomplished.",
      };

      renderWithTheme(
        <NoteTile note={shortNote} dashboardHash="secret-hash-16c" />,
      );

      expect(screen.getByText("Mission accomplished.")).toBeInTheDocument();
      expect(
        screen.queryByText(/click to see whole note/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("FormattedDate Client Component", () => {
    it("renders formatted date string on mount", () => {
      renderWithTheme(
        <FormattedDate
          date="2026-08-26T14:30:00.000Z"
          format="YYYY-MM-DD HH:mm"
        />,
      );

      expect(
        screen.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/),
      ).toBeInTheDocument();
    });

    it("handles empty date gracefully", () => {
      const { container } = renderWithTheme(<FormattedDate date="" />);
      expect(
        container.querySelector("span") || container.firstChild,
      ).toHaveTextContent("");
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

    it("renders all notes inside a grid container and passes dashboardHash", () => {
      renderWithTheme(
        <NoteGrid notes={notes} dashboardHash="secret-hash-16c" />,
      );

      expect(screen.getByText("First Note")).toBeInTheDocument();
      expect(screen.getByText("Content 1")).toBeInTheDocument();
      expect(screen.getByText("Second Note")).toBeInTheDocument();
      expect(screen.getByText("Content 2")).toBeInTheDocument();
      expect(screen.getAllByRole("article")).toHaveLength(2);

      const links = screen.getAllByRole("link");
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute(
        "href",
        "/dashboard/secret-hash-16c/note/note-1",
      );
      expect(links[1]).toHaveAttribute(
        "href",
        "/dashboard/secret-hash-16c/note/note-2",
      );
    });
  });

  describe("EmptyNotesState Component", () => {
    it("renders empty state card with icon, message, and enabled new note CTA linking to note editor", () => {
      renderWithTheme(<EmptyNotesState dashboardHash="secret-hash-16c" />);

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
        "No notes yet",
      );
      expect(
        screen.getByText(
          "Notes created by participants on this dashboard will appear here as tiles.",
        ),
      ).toBeInTheDocument();

      const newNoteBtn = screen.getByRole("link", { name: /new note/i });
      expect(newNoteBtn).toBeInTheDocument();
      expect(newNoteBtn).not.toBeDisabled();
      expect(newNoteBtn).toHaveAttribute(
        "href",
        "/dashboard/secret-hash-16c/note/new",
      );
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

      const links = screen.getAllByRole("link");
      // One for "+ New Note" in header, one for the NoteTile
      expect(links.length).toBeGreaterThanOrEqual(2);
      expect(
        links.some(
          (l) =>
            l.getAttribute("href") === "/dashboard/secret-hash-16c/note/note-1",
        ),
      ).toBe(true);
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
      const createNoteBtn = screen.getByRole("link", { name: /create note/i });
      expect(createNoteBtn).toBeInTheDocument();
      expect(createNoteBtn).toHaveAttribute(
        "href",
        "/dashboard/secret-hash-16c/note/new",
      );
      const newNoteBtn = screen.getByRole("link", { name: /new note/i });
      expect(newNoteBtn).toBeInTheDocument();
      expect(newNoteBtn).toHaveAttribute(
        "href",
        "/dashboard/secret-hash-16c/note/new",
      );
    });
  });
});
