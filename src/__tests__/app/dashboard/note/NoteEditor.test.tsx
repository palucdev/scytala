import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import {
  NoteEditor,
  MAX_NOTE_CONTENT_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
} from "@/app/dashboard/[hash]/note/[noteId]/components/NoteEditor";
import { PapyrusThemeLight } from "@/theme/papyrus-theme-light";
import * as noteActionsModule from "@/actions/notes";
import type { Note } from "@/client/db-client";
import type { CreateNoteActionResult } from "@/schemas/notes";

function createMockNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    dashboard_id: "dash-123",
    title: "Test Note",
    content: "Test Content",
    version: 1,
    created_at: "2026-08-28T12:00:00Z",
    updated_at: "2026-08-28T12:00:00Z",
    ...overrides,
  };
}

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

vi.mock("@/actions/notes", () => ({
  createNoteAction: vi.fn(),
  updateNoteAction: vi.fn(),
}));

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={PapyrusThemeLight}>{ui}</ThemeProvider>);
}

describe("NoteEditor Client Component", () => {
  const mockCreateNoteAction = vi.mocked(noteActionsModule.createNoteAction);
  const mockUpdateNoteAction = vi.mocked(noteActionsModule.updateNoteAction);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Triage cases & constraints", () => {
    it("exports length constants matching Zod validation schema (F3)", () => {
      expect(MAX_NOTE_CONTENT_LENGTH).toBe(10000);
      expect(MAX_NOTE_TITLE_LENGTH).toBe(200);
    });

    it("enforces maxLength and wrap='off' attributes on inputs (F1, F3)", () => {
      renderWithTheme(
        <NoteEditor
          mode="create"
          dashboardHash="dash-123"
          userAlias="Alice"
        />,
      );

      const titleInput = screen.getByLabelText("Note title");
      expect(titleInput).toHaveAttribute("maxLength", "200");

      const contentTextarea = screen.getByLabelText("Note content");
      expect(contentTextarea).toHaveAttribute("maxLength", "10000");
      expect(contentTextarea).toHaveAttribute("wrap", "off");
    });

    it("renders NoteEditorHeader with user alias, Note history and Contributors buttons", () => {
      renderWithTheme(
        <NoteEditor
          mode="create"
          dashboardHash="dash-123"
          userAlias="Alice_Commander"
        />,
      );

      expect(screen.getByText("Alice_Commander")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /note history/i }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /contributors/i }),
      ).toBeDisabled();
    });

    it("displays content fieldErrors with FormHelperText (F9)", async () => {
      mockCreateNoteAction.mockResolvedValueOnce({
        success: false,
        error: "Validation failed",
        fieldErrors: {
          content: ["Content is required and cannot be empty."],
          title: ["Title is too long."],
        },
      });

      renderWithTheme(
        <NoteEditor
          mode="create"
          dashboardHash="dash-123"
          userAlias="Alice"
        />,
      );

      const titleInput = screen.getByLabelText("Note title");
      fireEvent.change(titleInput, { target: { value: "New Title" } });

      const saveBtn = screen.getByRole("button", { name: /save/i });
      fireEvent.click(saveBtn);

      expect(
        await screen.findByText("Content is required and cannot be empty."),
      ).toBeInTheDocument();
      expect(screen.getByText("Title is too long.")).toBeInTheDocument();
    });

    it("catches network or promise rejection errors during save (F5)", async () => {
      mockCreateNoteAction.mockRejectedValueOnce(
        new Error("Network connection dropped"),
      );

      renderWithTheme(
        <NoteEditor
          mode="create"
          dashboardHash="dash-123"
          userAlias="Alice"
        />,
      );

      const contentTextarea = screen.getByLabelText("Note content");
      fireEvent.change(contentTextarea, { target: { value: "Some notes" } });

      const saveBtn = screen.getByRole("button", { name: /save/i });
      fireEvent.click(saveBtn);

      expect(
        await screen.findByText(
          "Network error. Please check your connection and try again.",
        ),
      ).toBeInTheDocument();
    });

    it("prevents double-submits by disabling save button while route transition is running (F4)", async () => {
      let resolveAction!: (value: CreateNoteActionResult) => void;
      const actionPromise = new Promise<CreateNoteActionResult>((resolve) => {
        resolveAction = resolve;
      });
      mockCreateNoteAction.mockReturnValueOnce(actionPromise);

      renderWithTheme(
        <NoteEditor
          mode="create"
          dashboardHash="dash-123"
          userAlias="Alice"
        />,
      );

      const contentTextarea = screen.getByLabelText("Note content");
      fireEvent.change(contentTextarea, { target: { value: "New draft" } });

      const saveBtn = screen.getByRole("button", { name: /save/i });
      fireEvent.click(saveBtn);

      // In flight
      expect(saveBtn).toBeDisabled();

      // Resolve action with success
      resolveAction!({
        success: true,
        note: createMockNote({ id: "note-1", version: 1 }),
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/dashboard/dash-123");
      });

      // Still disabled because isSaved is true
      expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    });

    it("attaches beforeunload listener and warns on unsaved changes, then unregisters on save (F6)", async () => {
      mockCreateNoteAction.mockResolvedValueOnce({
        success: true,
        note: createMockNote({ id: "note-1", version: 1 }),
      });

      renderWithTheme(
        <NoteEditor
          mode="create"
          dashboardHash="dash-123"
          userAlias="Alice"
        />,
      );

      // Clean state: beforeunload should NOT call preventDefault
      const eventClean = new Event("beforeunload", { cancelable: true });
      const preventDefaultCleanSpy = vi.spyOn(eventClean, "preventDefault");
      window.dispatchEvent(eventClean);
      expect(preventDefaultCleanSpy).not.toHaveBeenCalled();

      // Make dirty by typing in content
      const contentTextarea = screen.getByLabelText("Note content");
      fireEvent.change(contentTextarea, { target: { value: "Draft content" } });

      // Dirty state: beforeunload SHOULD call preventDefault
      const eventDirty = new Event("beforeunload", { cancelable: true });
      const preventDefaultDirtySpy = vi.spyOn(eventDirty, "preventDefault");
      window.dispatchEvent(eventDirty);
      expect(preventDefaultDirtySpy).toHaveBeenCalled();

      // Save the note
      const saveBtn = screen.getByRole("button", { name: /save/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled();
      });

      // Saved state: beforeunload should NOT prompt
      await waitFor(() => {
        const eventSaved = new Event("beforeunload", { cancelable: true });
        const preventDefaultSavedSpy = vi.spyOn(eventSaved, "preventDefault");
        window.dispatchEvent(eventSaved);
        expect(preventDefaultSavedSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe("Create mode workflow", () => {
    it("renders empty editor with 'New Note' title and disabled save button", () => {
      renderWithTheme(
        <NoteEditor
          mode="create"
          dashboardHash="dash-123"
          userAlias="Alice"
        />,
      );

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Text note",
      );
      const titleInput = screen.getByLabelText("Note title");
      const contentTextarea = screen.getByLabelText("Note content");
      expect(titleInput).toHaveValue("");
      expect(contentTextarea).toHaveValue("");
      expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    });

    it("enables save button when title or content changes and saves note successfully", async () => {
      mockCreateNoteAction.mockResolvedValueOnce({
        success: true,
        note: createMockNote({ id: "note-created-1", version: 1 }),
      });

      renderWithTheme(
        <NoteEditor
          mode="create"
          dashboardHash="dash-123"
          userAlias="Alice"
        />,
      );

      const titleInput = screen.getByLabelText("Note title");
      const contentTextarea = screen.getByLabelText("Note content");

      fireEvent.change(titleInput, { target: { value: "Project Kickoff" } });
      fireEvent.change(contentTextarea, {
        target: { value: "Discussion points\n1. Scope\n2. Milestones" },
      });

      const saveBtn = screen.getByRole("button", { name: /save/i });
      expect(saveBtn).toBeEnabled();

      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockCreateNoteAction).toHaveBeenCalledWith({
          dashboardHash: "dash-123",
          title: "Project Kickoff",
          content: "Discussion points\n1. Scope\n2. Milestones",
        });
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/dashboard/dash-123");
      });
    });

    it("trims whitespace from title and passes undefined if title is blank", async () => {
      mockCreateNoteAction.mockResolvedValueOnce({
        success: true,
        note: createMockNote({ id: "note-created-2", version: 1 }),
      });

      renderWithTheme(
        <NoteEditor
          mode="create"
          dashboardHash="dash-123"
          userAlias="Alice"
        />,
      );

      const titleInput = screen.getByLabelText("Note title");
      const contentTextarea = screen.getByLabelText("Note content");

      fireEvent.change(titleInput, { target: { value: "   " } });
      fireEvent.change(contentTextarea, {
        target: { value: "Content without title" },
      });

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => {
        expect(mockCreateNoteAction).toHaveBeenCalledWith({
          dashboardHash: "dash-123",
          title: undefined,
          content: "Content without title",
        });
      });
    });

    it("displays error alert when createNoteAction fails", async () => {
      mockCreateNoteAction.mockResolvedValueOnce({
        success: false,
        error: "Database error creating note.",
      });

      renderWithTheme(
        <NoteEditor
          mode="create"
          dashboardHash="dash-123"
          userAlias="Alice"
        />,
      );

      const contentTextarea = screen.getByLabelText("Note content");
      fireEvent.change(contentTextarea, { target: { value: "Some text" } });

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Database error creating note.");
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("Edit mode workflow", () => {
    it("renders existing note content, title, and version chip", () => {
      renderWithTheme(
        <NoteEditor
          mode="edit"
          dashboardHash="dash-123"
          noteId="note-uuid-99"
          initialTitle="Architecture Plan"
          initialContent={"Line 1\nLine 2"}
          initialVersion={4}
          userAlias="Alice"
        />,
      );

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Text note",
      );
      expect(screen.getByText("v4")).toBeInTheDocument();
      expect(screen.getByLabelText("Note title")).toHaveValue(
        "Architecture Plan",
      );
      expect(screen.getByLabelText("Note content")).toHaveValue(
        "Line 1\nLine 2",
      );
      expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    });

    it("submits updateNoteAction with expectedVersion on save", async () => {
      mockUpdateNoteAction.mockResolvedValueOnce({
        success: true,
        note: createMockNote({ id: "note-uuid-99", version: 5 }),
      });

      renderWithTheme(
        <NoteEditor
          mode="edit"
          dashboardHash="dash-123"
          noteId="note-uuid-99"
          initialTitle="Architecture Plan"
          initialContent="Old content"
          initialVersion={4}
          userAlias="Alice"
        />,
      );

      const contentTextarea = screen.getByLabelText("Note content");
      fireEvent.change(contentTextarea, { target: { value: "Updated content" } });

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => {
        expect(mockUpdateNoteAction).toHaveBeenCalledWith({
          dashboardHash: "dash-123",
          noteId: "note-uuid-99",
          title: "Architecture Plan",
          content: "Updated content",
          expectedVersion: 4,
        });
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/dashboard/dash-123");
      });
    });

    it("handles version conflict error with warning alert and Reload button", async () => {
      mockUpdateNoteAction.mockResolvedValueOnce({
        success: false,
        error: "Version conflict: note was modified by another user.",
        versionConflict: true,
      });

      renderWithTheme(
        <NoteEditor
          mode="edit"
          dashboardHash="dash-123"
          noteId="note-uuid-99"
          initialTitle="Shared Note"
          initialContent="Original text"
          initialVersion={2}
          userAlias="Alice"
        />,
      );

      const contentTextarea = screen.getByLabelText("Note content");
      fireEvent.change(contentTextarea, {
        target: { value: "Conflicting edit" },
      });

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        "Version conflict: note was modified by another user.",
      );

      const reloadBtn = screen.getByRole("button", { name: /reload/i });
      expect(reloadBtn).toBeInTheDocument();

      fireEvent.click(reloadBtn);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it("displays error if noteId or initialVersion is missing in edit mode", async () => {
      renderWithTheme(
        <NoteEditor
          mode="edit"
          dashboardHash="dash-123"
          initialTitle="Missing ID Note"
          initialContent="Content"
          userAlias="Alice"
        />,
      );

      // Force dirty so save button is enabled
      const contentTextarea = screen.getByLabelText("Note content");
      fireEvent.change(contentTextarea, { target: { value: "New content" } });

      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Note metadata missing.");
      expect(mockUpdateNoteAction).not.toHaveBeenCalled();
    });
  });

  describe("Scroll synchronization", () => {
    it("synchronizes scroll between textarea and line number gutter", () => {
      renderWithTheme(
        <NoteEditor
          mode="create"
          dashboardHash="dash-123"
          userAlias="Alice"
        />,
      );

      const contentTextarea = screen.getByLabelText("Note content");

      // Fire scroll event on textarea
      fireEvent.scroll(contentTextarea, { target: { scrollTop: 120 } });

      // Gutter pre element scrollTop should be synced
      const gutterPre = document.querySelector("pre");
      expect(gutterPre?.scrollTop).toBe(120);
    });
  });

  describe("Delete confirmation dialog integration", () => {
    it("opens delete confirmation dialog when Delete button is clicked in edit mode", async () => {
      renderWithTheme(
        <NoteEditor
          mode="edit"
          dashboardHash="dash-123"
          noteId="note-uuid-1"
          initialTitle="Test Note"
          initialContent="Line 1"
          initialVersion={1}
          userAlias="Alice"
        />,
      );

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      const deleteBtn = screen.getByRole("button", { name: "Delete note" });
      fireEvent.click(deleteBtn);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Delete Note")).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to delete “Test Note”?/),
      ).toBeInTheDocument();

      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("does not render Delete button in create mode", () => {
      renderWithTheme(
        <NoteEditor
          mode="create"
          dashboardHash="dash-123"
          userAlias="Alice"
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Delete note" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

