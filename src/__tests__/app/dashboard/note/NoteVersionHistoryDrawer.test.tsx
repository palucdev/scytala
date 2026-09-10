import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import {
  NoteVersionHistoryDrawer,
  computeVersionDelta,
  type NoteVersionHistoryDrawerProps,
} from "@/app/dashboard/[hash]/note/[noteId]/components/NoteVersionHistoryDrawer";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";
import type { HydratedNoteVersion } from "@/schemas/notes";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

const mockVersions: HydratedNoteVersion[] = [
  {
    id: "v-3",
    note_id: "note-1",
    version: 3,
    title: "Version Three",
    content: "Line 1\nLine 2 updated\nLine 3 added",
    author_id: "user-1",
    author_alias: "Alice_Commander",
    created_at: "2026-09-10T15:00:00Z",
  },
  {
    id: "v-2",
    note_id: "note-1",
    version: 2,
    title: "Version Two",
    content: "Line 1\nLine 2",
    author_id: "user-2",
    author_alias: "Bob_Operator",
    created_at: "2026-09-10T14:00:00Z",
  },
  {
    id: "v-1",
    note_id: "note-1",
    version: 1,
    title: "Version One",
    content: "Line 1",
    author_id: null,
    author_alias: "Unnamed collaborator",
    created_at: "2026-09-10T13:00:00Z",
  },
];

describe("NoteVersionHistoryDrawer Component", () => {
  const defaultProps: NoteVersionHistoryDrawerProps = {
    open: true,
    onClose: vi.fn(),
    versions: mockVersions,
    isLoading: false,
    error: null,
    selectedVersionId: null,
    onSelectVersion: vi.fn(),
    currentVersionNumber: 3,
    onRefresh: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("computeVersionDelta", () => {
    it("returns initial content length for version 1 or when predecessor is missing", () => {
      const v1 = mockVersions[2];
      expect(computeVersionDelta(v1)).toBe(`+${v1.content.length}`);
    });

    it("computes added and removed char deltas relative to predecessor", () => {
      const predecessor: HydratedNoteVersion = {
        ...mockVersions[1],
        content: "Original text",
      };
      const current: HydratedNoteVersion = {
        ...mockVersions[0],
        content: "Original modified text",
      };
      // " modified" added (9 chars)
      const delta = computeVersionDelta(current, predecessor);
      expect(delta).toBe("+9 / -0");
    });

    it("computes added and removed char deltas relative to currentContent string", () => {
      const version: HydratedNoteVersion = {
        ...mockVersions[1],
        content: "Hello world\nThis is version 1",
      };
      const currentContent = "Hello brave world\nThis is version";
      const delta = computeVersionDelta(version, currentContent);
      expect(delta).toBe("+6 / -2");

      const vWithDiff: HydratedNoteVersion = {
        ...mockVersions[1],
        content: "Short text",
      };
      // "Short" (5 chars removed), "Super long" (10 chars added)
      const modifiedContent = "Super long text";
      expect(computeVersionDelta(vWithDiff, modifiedContent)).toBe("+10 / -5");
    });
  });

  describe("Drawer rendering and controls", () => {
    it("renders drawer header with title, refresh button, and close button", () => {
      renderWithTheme(<NoteVersionHistoryDrawer {...defaultProps} />);

      expect(screen.getByRole("heading", { name: "Version History" })).toBeInTheDocument();

      const refreshBtn = screen.getByRole("button", { name: /refresh version history/i });
      expect(refreshBtn).toBeInTheDocument();
      fireEvent.click(refreshBtn);
      expect(defaultProps.onRefresh).toHaveBeenCalledTimes(1);

      const closeBtn = screen.getByRole("button", { name: /close version history/i });
      expect(closeBtn).toBeInTheDocument();
      fireEvent.click(closeBtn);
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it("displays loading spinner when isLoading is true", () => {
      renderWithTheme(
        <NoteVersionHistoryDrawer
          {...defaultProps}
          isLoading={true}
        />,
      );

      expect(screen.getByRole("progressbar")).toBeInTheDocument();
      expect(screen.queryByText("Version Two")).not.toBeInTheDocument();
    });

    it("displays error alert when error is provided", () => {
      renderWithTheme(
        <NoteVersionHistoryDrawer
          {...defaultProps}
          error="Failed to load versions from server."
        />,
      );

      expect(screen.getByRole("alert")).toHaveTextContent("Failed to load versions from server.");
    });
  });

  describe("Version rows and selection", () => {
    it("renders synthetic Current version row with active badge and handles selection", () => {
      renderWithTheme(<NoteVersionHistoryDrawer {...defaultProps} />);

      expect(screen.getByText("Current version")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("v3")).toBeInTheDocument();
      expect(screen.getByText("by Alice_Commander")).toBeInTheDocument();

      const currentBtn = screen.getByRole("button", { name: /current version/i });
      fireEvent.click(currentBtn);
      expect(defaultProps.onSelectVersion).toHaveBeenCalledWith(null);
    });

    it("renders historical versions with author aliases and computed deltas", () => {
      renderWithTheme(<NoteVersionHistoryDrawer {...defaultProps} />);

      // Historical items are v-2 and v-1
      expect(screen.getByText("by Bob_Operator")).toBeInTheDocument();
      expect(screen.getByText("by Unnamed collaborator")).toBeInTheDocument();

      // Check v2 button click
      const v2Btn = screen.getByRole("button", { name: /by Bob_Operator/i });
      fireEvent.click(v2Btn);
      expect(defaultProps.onSelectVersion).toHaveBeenCalledWith(mockVersions[1]);

      // Check v1 button click
      const v1Btn = screen.getByRole("button", { name: /by Unnamed collaborator/i });
      fireEvent.click(v1Btn);
      expect(defaultProps.onSelectVersion).toHaveBeenCalledWith(mockVersions[2]);
    });

    it("indicates selected version item when selectedVersionId matches", () => {
      renderWithTheme(
        <NoteVersionHistoryDrawer
          {...defaultProps}
          selectedVersionId="v-2"
        />,
      );

      const v2Btn = screen.getByRole("button", { name: /by Bob_Operator/i });
      expect(v2Btn).toHaveClass("Mui-selected");
    });

    it("renders empty state message when versions has only 1 version", () => {
      renderWithTheme(
        <NoteVersionHistoryDrawer
          {...defaultProps}
          versions={[mockVersions[0]]}
        />,
      );

      expect(screen.getByText("Current version")).toBeInTheDocument();
      expect(screen.getByText("No previous versions yet.")).toBeInTheDocument();
    });

    it("renders deltas relative to currentContent on historical version cards when provided", () => {
      // mockVersions[1] has content: "Line 1\nLine 2"
      // currentContent: "Line 1\nLine 2 updated\nLine 3 added" (+28 / -5)
      renderWithTheme(
        <NoteVersionHistoryDrawer
          {...defaultProps}
          currentContent="Line 1\nLine 2 updated\nLine 3 added"
        />,
      );

      expect(screen.getByText("+28 / -5")).toBeInTheDocument();
    });
  });

  describe("Mobile viewport behavior", () => {
    it("automatically closes the drawer on mobile when a version is selected", () => {
      renderWithTheme(<NoteVersionHistoryDrawer {...defaultProps} isMobile={true} />);

      const v2Btn = screen.getByRole("button", { name: /by Bob_Operator/i });
      fireEvent.click(v2Btn);

      expect(defaultProps.onSelectVersion).toHaveBeenCalledWith(mockVersions[1]);
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it("automatically closes the drawer on mobile when the current version is selected", () => {
      renderWithTheme(<NoteVersionHistoryDrawer {...defaultProps} isMobile={true} />);

      const currentBtn = screen.getByRole("button", { name: /current version/i });
      fireEvent.click(currentBtn);

      expect(defaultProps.onSelectVersion).toHaveBeenCalledWith(null);
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Desktop vs Mobile variant and visibility", () => {
    it("returns null and does not render when open is false", () => {
      renderWithTheme(<NoteVersionHistoryDrawer {...defaultProps} open={false} />);

      expect(screen.queryByRole("heading", { name: "Version History" })).not.toBeInTheDocument();
    });

    it("renders persistent desktop drawer without backdrop dimming", () => {
      renderWithTheme(<NoteVersionHistoryDrawer {...defaultProps} isMobile={false} />);

      expect(screen.getByRole("heading", { name: "Version History" })).toBeInTheDocument();
      // On desktop persistent drawer, MUI does not render a backdrop modal
      expect(document.querySelector(".MuiBackdrop-root")).not.toBeInTheDocument();
    });
  });
});
